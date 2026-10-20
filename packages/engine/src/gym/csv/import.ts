import { CUSTOM_PREFIX, type CustomExercise, type Equipment } from '../../plan/library';
import type {
  GymRoutine,
  GymRoutineExercise,
  GymSession,
  GymSessionSource,
  GymSet,
  SetTarget,
  SetType,
} from '../types';
import { toKg, toMetres, type DistanceUnit, type WeightUnit } from '../units';
import { guessLegLoad, guessPattern, guessTrackingMode } from './match';
import type { CsvTable } from './parse';
import {
  dateKey,
  parseDateTime,
  parseDuration,
  parseNumber,
  secondsBetween,
  type DateParts,
} from './values';

/**
 * CSV import of workout history from another gym app (CLAUDE.md "Migrating from another gym app"):
 * column mapping (auto-detected for Hevy and Strong), rows → sessions and sets, unit conversion,
 * duplicate protection on repeated imports.
 */

export const CSV_FIELDS = [
  'sessionTitle',
  'startTime',
  'endTime',
  'sessionDuration',
  'exerciseName',
  'setOrder',
  'setType',
  'weight',
  'reps',
  'distance',
  'duration',
  'rpe',
  'setNotes',
  'sessionNotes',
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

/** Fields an import cannot do without. */
export const REQUIRED_CSV_FIELDS: readonly CsvField[] = ['startTime', 'exerciseName'];

export type CsvPreset = 'hevy' | 'strong';

export interface CsvMapping {
  /** Column index per field. */
  columns: Partial<Record<CsvField, number>>;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  /** Slashed dates are read day-first (`18/01/2024`). */
  dayFirst: boolean;
}

export interface DetectedMapping {
  preset: CsvPreset | null;
  mapping: CsvMapping;
}

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Header names per field, normalised (lowercase, letters and digits only). */
const HEADER_NAMES: Record<CsvField, string[]> = {
  sessionTitle: ['title', 'workoutname', 'workout', 'name', 'routine', 'routinename'],
  startTime: ['starttime', 'date', 'start', 'datetime', 'workoutdate', 'startdate'],
  endTime: ['endtime', 'end', 'enddate'],
  sessionDuration: ['duration', 'workoutduration', 'durationmin'],
  exerciseName: ['exercisetitle', 'exercisename', 'exercise', 'movement'],
  setOrder: ['setindex', 'setorder', 'set', 'setnumber', 'setno'],
  setType: ['settype', 'type'],
  weight: ['weightkg', 'weightlbs', 'weightlb', 'weight', 'load'],
  reps: ['reps', 'repetitions', 'rep'],
  distance: ['distancekm', 'distancemiles', 'distancemi', 'distancem', 'distance'],
  duration: ['durationseconds', 'seconds', 'time', 'durationsec', 'setduration'],
  rpe: ['rpe'],
  setNotes: ['exercisenotes', 'notes', 'setnotes'],
  sessionNotes: ['description', 'workoutnotes', 'sessionnotes'],
};

/** Hevy writes the unit into the header; Strong uses the user's unit setting. */
function unitsFromHeaders(headers: readonly string[]): {
  weightUnit?: WeightUnit;
  distanceUnit?: DistanceUnit;
} {
  const keys = headers.map(key);
  return {
    ...(keys.includes('weightlbs') || keys.includes('weightlb')
      ? { weightUnit: 'lb' as const }
      : keys.includes('weightkg')
        ? { weightUnit: 'kg' as const }
        : {}),
    ...(keys.includes('distancemiles') || keys.includes('distancemi')
      ? { distanceUnit: 'mi' as const }
      : keys.includes('distancekm')
        ? { distanceUnit: 'km' as const }
        : keys.includes('distancem')
          ? { distanceUnit: 'm' as const }
          : {}),
  };
}

export function detectPreset(headers: readonly string[]): CsvPreset | null {
  const keys = new Set(headers.map(key));
  if (keys.has('exercisetitle') && keys.has('starttime') && keys.has('setindex')) return 'hevy';
  if (keys.has('exercisename') && keys.has('workoutname') && keys.has('setorder')) return 'strong';
  return null;
}

/**
 * Proposes a mapping from the headers: each field takes the first column whose header matches
 * one of its known names. The user can change everything before importing.
 */
export function detectMapping(headers: readonly string[]): DetectedMapping {
  const keys = headers.map(key);
  const used = new Set<number>();
  const columns: Partial<Record<CsvField, number>> = {};
  for (const field of CSV_FIELDS) {
    for (const name of HEADER_NAMES[field]) {
      const i = keys.findIndex((k, idx) => k === name && !used.has(idx));
      if (i >= 0) {
        columns[field] = i;
        used.add(i);
        break;
      }
    }
  }
  const units = unitsFromHeaders(headers);
  return {
    preset: detectPreset(headers),
    mapping: {
      columns,
      weightUnit: units.weightUnit ?? 'kg',
      // Strong writes distance in the user's unit; km is the metric default.
      distanceUnit: units.distanceUnit ?? 'km',
      dayFirst: false,
    },
  };
}

export type CsvIssueCode = 'missingExercise' | 'badDate' | 'badNumber';

export interface CsvIssue {
  line: number;
  code: CsvIssueCode;
  column?: CsvField;
}

/** One set row after mapping, in the export's order. */
export interface ImportRow {
  line: number;
  sessionKey: string;
  title: string;
  start: DateParts;
  startText: string;
  end?: DateParts;
  sessionDurationSec?: number;
  exerciseName: string;
  setType: SetType;
  weightKg?: number;
  reps?: number;
  distanceM?: number;
  durationSec?: number;
  rpe?: number;
  notes?: string;
  sessionNotes?: string;
}

/** Hevy: normal / warmup / dropset / failure. Strong: set order "W", "D", "F" or a number. */
export function parseSetType(type: string | undefined, order: string | undefined): SetType {
  const t = (type ?? '').toLowerCase();
  const o = (order ?? '').trim().toLowerCase();
  if (t.includes('warm') || o.startsWith('w')) return 'warmup';
  if (t.includes('drop') || o.startsWith('d')) return 'drop';
  if (t.includes('fail') || o.startsWith('f')) return 'failure';
  return 'working';
}

export function readRows(
  table: CsvTable,
  mapping: CsvMapping,
): { rows: ImportRow[]; issues: CsvIssue[] } {
  const rows: ImportRow[] = [];
  const issues: CsvIssue[] = [];
  const col = (r: readonly string[], f: CsvField): string | undefined => {
    const i = mapping.columns[f];
    return i === undefined ? undefined : r[i];
  };
  table.rows.forEach((r, idx) => {
    const line = Number(table.lineNumbers[idx]);
    const exerciseName = col(r, 'exerciseName')?.trim() ?? '';
    if (exerciseName === '') {
      issues.push({ line, code: 'missingExercise', column: 'exerciseName' });
      return;
    }
    const startText = col(r, 'startTime') ?? '';
    const start = parseDateTime(startText, mapping.dayFirst);
    if (!start) {
      issues.push({ line, code: 'badDate', column: 'startTime' });
      return;
    }
    const endText = col(r, 'endTime');
    const end = endText ? (parseDateTime(endText, mapping.dayFirst) ?? undefined) : undefined;
    const number = (f: CsvField): number | undefined => {
      const text = col(r, f);
      const n = parseNumber(text);
      if (text && text.trim() !== '' && n === undefined)
        issues.push({ line, code: 'badNumber', column: f });
      return n !== undefined && n > 0 ? n : undefined;
    };
    const weight = number('weight');
    const distance = number('distance');
    const durationText = col(r, 'duration');
    const duration = durationText ? (parseDuration(durationText) ?? undefined) : undefined;
    const sessionDurationText = col(r, 'sessionDuration');
    const sessionDurationSec = sessionDurationText
      ? (parseDuration(sessionDurationText) ?? undefined)
      : undefined;
    const reps = number('reps');
    const rpe = number('rpe');
    const title = col(r, 'sessionTitle')?.trim() ?? '';
    const notes = col(r, 'setNotes')?.trim();
    const sessionNotes = col(r, 'sessionNotes')?.trim();
    rows.push({
      line,
      sessionKey: `${title}|${startText.trim()}`,
      title,
      start,
      startText: startText.trim(),
      ...(end ? { end } : {}),
      ...(sessionDurationSec ? { sessionDurationSec } : {}),
      exerciseName,
      setType: parseSetType(col(r, 'setType'), col(r, 'setOrder')),
      ...(weight !== undefined ? { weightKg: toKg(weight, mapping.weightUnit) } : {}),
      ...(reps !== undefined ? { reps: Math.round(reps) } : {}),
      ...(distance !== undefined ? { distanceM: toMetres(distance, mapping.distanceUnit) } : {}),
      ...(duration ? { durationSec: duration } : {}),
      ...(rpe !== undefined && rpe <= 10 ? { rpe } : {}),
      ...(notes ? { notes } : {}),
      ...(sessionNotes ? { sessionNotes } : {}),
    });
  });
  return { rows, issues };
}

export interface ImportedSessionDraft {
  key: string;
  title: string;
  start: DateParts;
  startText: string;
  durationMin?: number;
  notes?: string;
  rows: ImportRow[];
}

/** Groups rows into sessions (same title and start), oldest session first, row order kept. */
export function groupSessions(rows: readonly ImportRow[]): ImportedSessionDraft[] {
  const map = new Map<string, ImportedSessionDraft>();
  for (const row of rows) {
    let s = map.get(row.sessionKey);
    if (!s) {
      s = {
        key: row.sessionKey,
        title: row.title,
        start: row.start,
        startText: row.startText,
        rows: [],
      };
      map.set(row.sessionKey, s);
    }
    s.rows.push(row);
    const sec = row.end ? secondsBetween(row.start, row.end) : row.sessionDurationSec;
    if (sec !== undefined && sec > 0 && s.durationMin === undefined)
      s.durationMin = Math.round(sec / 60);
    if (row.sessionNotes && !s.notes) s.notes = row.sessionNotes;
  }
  return [...map.values()].sort(
    (a, b) => secondsBetween(b.start, a.start) || a.key.localeCompare(b.key),
  );
}

/** Distinct exercise names with what data the export has for them (for new custom exercises). */
export function exerciseNamesOf(rows: readonly ImportRow[]): {
  name: string;
  sets: number;
  data: { weight: boolean; reps: boolean; duration: boolean; distance: boolean };
}[] {
  const map = new Map<
    string,
    {
      name: string;
      sets: number;
      data: { weight: boolean; reps: boolean; duration: boolean; distance: boolean };
    }
  >();
  for (const r of rows) {
    const e = map.get(r.exerciseName) ?? {
      name: r.exerciseName,
      sets: 0,
      data: { weight: false, reps: false, duration: false, distance: false },
    };
    e.sets++;
    e.data.weight ||= r.weightKg !== undefined;
    e.data.reps ||= r.reps !== undefined;
    e.data.duration ||= r.durationSec !== undefined;
    e.data.distance ||= r.distanceM !== undefined;
    map.set(r.exerciseName, e);
  }
  return [...map.values()];
}

/** A custom exercise for an export name nothing in the library matched. */
export function customFromImport(
  name: string,
  data: { weight: boolean; reps: boolean; duration: boolean; distance: boolean },
  id: string,
  equipmentHint?: Equipment,
): CustomExercise {
  const pattern = guessPattern(name);
  const clean = name.trim().slice(0, 60);
  return {
    id: id.startsWith(CUSTOM_PREFIX) ? id : `${CUSTOM_PREFIX}${id}`,
    name: clean,
    pattern,
    primaryMuscles: [],
    secondaryMuscles: [],
    muscles: [],
    equipment: [equipmentHint ?? (data.weight ? 'machine' : 'bodyweight')],
    legLoad: guessLegLoad(pattern),
    unilateral: false,
    trackingMode: guessTrackingMode(data),
  };
}

export interface BuildImportOptions {
  source: Extract<GymSessionSource, `import:${string}`>;
  /** Export name → exercise id (library or custom), from matching and the user's choices. */
  exerciseIds: Readonly<Record<string, string>>;
  newId: () => string;
  /** External ids of sessions imported before; those sessions are skipped. */
  existingExternalIds?: ReadonlySet<string>;
  /** Epoch ms of a wall-clock time; defaults to the device's local time zone. */
  toEpoch?: (p: DateParts) => number;
}

export interface BuiltImport {
  sessions: GymSession[];
  sets: GymSet[];
  /** Sessions already imported earlier. */
  skipped: number;
}

const localEpoch = (p: DateParts) =>
  new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second).getTime();

export function buildImport(
  drafts: readonly ImportedSessionDraft[],
  options: BuildImportOptions,
): BuiltImport {
  const toEpoch = options.toEpoch ?? localEpoch;
  const sessions: GymSession[] = [];
  const sets: GymSet[] = [];
  let skipped = 0;
  for (const d of drafts) {
    const externalId = `${options.source}:${d.key}`;
    if (options.existingExternalIds?.has(externalId)) {
      skipped++;
      continue;
    }
    const id = options.newId();
    const startedAt = toEpoch(d.start);
    // Rows of exercises the user left unresolved are not imported.
    const resolved = d.rows.flatMap((row) => {
      const exerciseId = options.exerciseIds[row.exerciseName];
      return exerciseId ? [{ row: row, exerciseId }] : [];
    });
    sessions.push({
      id,
      date: dateKey(d.start),
      startedAt,
      ...(d.durationMin !== undefined
        ? { endedAt: startedAt + d.durationMin * 60000, durationMin: d.durationMin }
        : {}),
      title: d.title,
      kind: 'detailed',
      source: options.source,
      externalId,
      ...(d.notes ? { notes: d.notes } : {}),
    });
    resolved.forEach(({ row: r, exerciseId }, setIndex) => {
      sets.push({
        id: options.newId(),
        sessionId: id,
        exerciseId,
        setIndex,
        setType: r.setType,
        completed: true,
        loggedAt: startedAt,
        ...(r.weightKg !== undefined ? { weightKg: r.weightKg } : {}),
        ...(r.reps !== undefined ? { reps: r.reps } : {}),
        ...(r.rpe !== undefined ? { rpe: r.rpe } : {}),
        ...(r.durationSec !== undefined ? { durationSec: r.durationSec } : {}),
        ...(r.distanceM !== undefined ? { distanceM: r.distanceM } : {}),
        ...(r.notes ? { notes: r.notes } : {}),
      });
    });
  }
  return { sessions, sets, skipped };
}

/**
 * A routine built from one imported session ("create routines from workout titles"): one entry per
 * exercise in order, with its working-set count and the rep range that was done.
 */
export function routineFromImport(
  draft: ImportedSessionDraft,
  exerciseIds: Readonly<Record<string, string>>,
  newId: () => string,
  position: number,
): GymRoutine {
  const entries: GymRoutineExercise[] = [];
  for (const name of [...new Set(draft.rows.map((r) => r.exerciseName))]) {
    const exerciseId = exerciseIds[name];
    if (!exerciseId) continue;
    const work = draft.rows.filter((r) => r.exerciseName === name && r.setType !== 'warmup');
    const reps = work.flatMap((r) => (r.reps ? [r.reps] : []));
    const times = work.flatMap((r) => (r.durationSec ? [r.durationSec] : []));
    const weights = work.flatMap((r) => (r.weightKg ? [r.weightKg] : []));
    const target: SetTarget =
      reps.length > 0
        ? { kind: 'reps', min: Math.min(...reps), max: Math.max(...reps) }
        : times.length > 0
          ? { kind: 'time', minSec: Math.min(...times), maxSec: Math.max(...times) }
          : { kind: 'reps', min: 8, max: 12 };
    entries.push({
      id: newId(),
      exerciseId,
      targetSets: Math.max(1, work.length),
      target,
      restSec: 90,
      ...(weights.length > 0 ? { weightKg: Math.max(...weights) } : {}),
    });
  }
  return {
    id: newId(),
    name: draft.title.trim().slice(0, 60) || draft.startText,
    position,
    exercises: entries,
  };
}
