import {
  buildImport,
  createMatcher,
  customFromImport,
  dateKey,
  detectMapping,
  exerciseNamesOf,
  groupSessions,
  normaliseName,
  parseCsv,
  readRows,
  REQUIRED_CSV_FIELDS,
  routineFromImport,
  type CsvIssue,
  type CsvMapping,
  type CsvPreset,
  type CsvTable,
  type CustomExercise,
  type ExerciseMatch,
  type GymRoutine,
  type ImportedSessionDraft,
  type ImportRow,
  type MatchCandidate,
  type RoutineFolder,
} from '@peakr/engine';

import type { GymImport } from '@/data/repositories/gym-repository';

/**
 * The CSV import from another gym app, step by step (CLAUDE.md "Migrating from another gym app"):
 * read the file, map the columns, match exercise names, then build sessions, sets, new custom
 * exercises and (optionally) routines. Pure functions; the screen holds the state.
 */

export interface ParsedFile {
  table: CsvTable;
  preset: CsvPreset | null;
  mapping: CsvMapping;
}

export function parseFile(text: string): ParsedFile | null {
  const table = parseCsv(text);
  if (table.headers.length === 0 || table.rows.length === 0) return null;
  const { preset, mapping } = detectMapping(table.headers);
  return { table, preset, mapping };
}

export interface Preview {
  rows: ImportRow[];
  issues: CsvIssue[];
  drafts: ImportedSessionDraft[];
  /** Required fields without a column. */
  missing: string[];
  firstDate?: string;
  lastDate?: string;
}

export function preview(file: ParsedFile, mapping: CsvMapping): Preview {
  const missing = REQUIRED_CSV_FIELDS.filter((f) => mapping.columns[f] === undefined);
  if (missing.length > 0) return { rows: [], issues: [], drafts: [], missing };
  const { rows, issues } = readRows(file.table, mapping);
  const drafts = groupSessions(rows);
  const first = drafts[0];
  const last = drafts[drafts.length - 1];
  return {
    rows,
    issues,
    drafts,
    missing,
    ...(first && last ? { firstDate: dateKey(first.start), lastDate: dateKey(last.start) } : {}),
  };
}

/** What happens with one exercise name of the export. */
export type NameChoice = { kind: 'exercise'; id: string } | { kind: 'custom' } | { kind: 'skip' };

export interface NameMatch {
  match: ExerciseMatch;
  sets: number;
  data: { weight: boolean; reps: boolean; duration: boolean; distance: boolean };
  choice: NameChoice;
}

/** Matches every exercise name; matched and suggested names default to their best candidate. */
export function matchNames(
  rows: readonly ImportRow[],
  candidates: readonly MatchCandidate[],
  known: Readonly<Record<string, string>>,
): NameMatch[] {
  const matcher = createMatcher(candidates, known);
  return exerciseNamesOf(rows).map(({ name, sets, data }) => {
    const match = matcher.match(name);
    return {
      match,
      sets,
      data,
      choice: match.best ? { kind: 'exercise', id: match.best.id } : { kind: 'custom' },
    };
  });
}

export interface ImportOptions {
  preset: CsvPreset | null;
  newId: () => string;
  existingExternalIds: ReadonlySet<string>;
  /** Also create one routine per workout title (from its most recent session). */
  createRoutines: boolean;
  routineFolderName: string;
  routinePosition: number;
  folderPosition: number;
}

export interface ImportResult {
  data: GymImport;
  skipped: number;
  /** Export names to remember for the next import (normalised name → exercise id). */
  knownNames: Record<string, string>;
}

export function buildGymImport(
  drafts: readonly ImportedSessionDraft[],
  names: readonly NameMatch[],
  options: ImportOptions,
): ImportResult {
  const exercises: CustomExercise[] = [];
  const exerciseIds: Record<string, string> = {};
  const knownNames: Record<string, string> = {};
  for (const n of names) {
    if (n.choice.kind === 'skip') continue;
    let id: string;
    if (n.choice.kind === 'custom') {
      const custom = customFromImport(n.match.name, n.data, options.newId(), n.match.equipmentHint);
      exercises.push(custom);
      id = custom.id;
    } else id = n.choice.id;
    exerciseIds[n.match.name] = id;
    knownNames[normaliseName(n.match.name).compact] = id;
  }
  const source =
    options.preset === 'hevy'
      ? 'import:hevy'
      : options.preset === 'strong'
        ? 'import:strong'
        : 'import:csv';
  const built = buildImport(drafts, {
    source,
    exerciseIds,
    newId: options.newId,
    existingExternalIds: options.existingExternalIds,
  });

  let folder: RoutineFolder | undefined;
  const routines: GymRoutine[] = [];
  if (options.createRoutines) {
    // Drafts run oldest first, so the last draft per title is the most recent workout.
    const latest = new Map<string, ImportedSessionDraft>();
    for (const d of drafts) if (d.title.trim()) latest.set(d.title.trim(), d);
    if (latest.size > 0) {
      folder = {
        id: options.newId(),
        name: options.routineFolderName,
        position: options.folderPosition,
      };
      let position = options.routinePosition;
      for (const d of latest.values()) {
        const routine = routineFromImport(d, exerciseIds, options.newId, position++);
        if (routine.exercises.length > 0) routines.push({ ...routine, folderId: folder.id });
      }
    }
  }
  return {
    data: {
      exercises,
      routines,
      sessions: built.sessions,
      sets: built.sets,
      ...(folder ? { folder } : {}),
    },
    skipped: built.skipped,
    knownNames,
  };
}
