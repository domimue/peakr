import type { Equipment, ExercisePattern, TrackingMode } from '../../plan/library';
import type { LegLoad } from '../../plan/types';

/**
 * Fuzzy matching of exercise names from another app's export against our library. The names to
 * match against (library names and aliases in the user's language, plus custom exercises) come
 * from the caller, so the engine stays free of i18n.
 */

export interface MatchCandidate {
  id: string;
  /** Display name first, then aliases. */
  names: readonly string[];
  equipment: readonly Equipment[];
}

export interface ScoredMatch {
  id: string;
  score: number;
}

export type MatchStatus = 'matched' | 'suggested' | 'unmatched';

export interface ExerciseMatch {
  name: string;
  status: MatchStatus;
  /** Best candidate (set for `matched` and `suggested`). */
  best?: ScoredMatch;
  /** Up to three candidates, best first, for the user to pick from. */
  suggestions: ScoredMatch[];
  /** Equipment named in the export, e.g. "(Barbell)". */
  equipmentHint?: Equipment;
}

/** From this score a match is taken without asking. */
export const AUTO_MATCH_SCORE = 0.9;
/** From this score the best candidate is suggested; below, the exercise becomes a custom one. */
export const SUGGEST_SCORE = 0.55;

const EQUIPMENT_WORDS: [RegExp, Equipment][] = [
  [/smith/, 'smith'],
  [/\b(ez|ez bar|ez curl bar)\b/, 'ezBar'],
  [/\b(trap|hex) ?bar\b/, 'trapBar'],
  [/\b(barbell|bb)\b/, 'barbell'],
  [/\b(dumbbells?|db)\b/, 'dumbbell'],
  [/\b(kettlebells?|kb)\b/, 'kettlebell'],
  [/\b(cable|cables|pulley)\b/, 'cable'],
  [/\b(machine|plate loaded|selectorized|selectorised|lever)\b/, 'machine'],
  [/\b(band|bands|resistance band)\b/, 'band'],
  [/\b(bodyweight|body weight|bw)\b/, 'bodyweight'],
];

const SYNONYMS: Record<string, string> = {
  db: 'dumbbell',
  dumbbells: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  bicep: 'biceps',
  tricep: 'triceps',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  sldl: 'stiff leg deadlift',
  bw: 'bodyweight',
  pulldowns: 'pulldown',
  pullups: 'pullup',
  chinups: 'chinup',
  pushups: 'pushup',
  situps: 'situp',
  flyes: 'fly',
  flys: 'fly',
  flies: 'fly',
  raises: 'raise',
  curls: 'curl',
  presses: 'press',
  rows: 'row',
  lunges: 'lunge',
  squats: 'squat',
  extensions: 'extension',
  deadlifts: 'deadlift',
  thrusts: 'thrust',
  crunches: 'crunch',
  dips: 'dip',
  shrugs: 'shrug',
  kickbacks: 'kickback',
  hops: 'hop',
  jumps: 'jump',
};

const STOPWORDS = new Set(['the', 'a', 'an', 'with', 'on', 'of', 'and', 'to', 'in']);

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9()]+/g, ' ')
    .trim();
}

export interface NormalisedName {
  /** Name without bracketed parts, folded. */
  base: string;
  tokens: string[];
  /** Tokens joined without spaces ("pull up" and "pull-up" → "pullup"). */
  compact: string;
  equipmentHint?: Equipment;
}

export function normaliseName(name: string): NormalisedName {
  const folded = fold(name);
  const bracket = [...folded.matchAll(/\(([^)]*)\)/g)].map((m) => String(m[1])).join(' ');
  const base = folded
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const hintSource = bracket || base;
  const equipmentHint = EQUIPMENT_WORDS.find(([re]) => re.test(hintSource))?.[1];
  const tokens = base
    .split(' ')
    .flatMap((t) => (SYNONYMS[t] ?? t).split(' '))
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
  return { base, tokens, compact: tokens.join(''), ...(equipmentHint ? { equipmentHint } : {}) };
}

function trigrams(s: string): Map<string, number> {
  const padded = `  ${s} `;
  const out = new Map<string, number>();
  for (let i = 0; i + 3 <= padded.length; i++) {
    const g = padded.slice(i, i + 3);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

function dice<T>(a: Map<T, number>, b: Map<T, number>): number {
  let shared = 0;
  let total = 0;
  for (const [k, n] of a) {
    shared += Math.min(n, b.get(k) ?? 0);
    total += n;
  }
  for (const n of b.values()) total += n;
  return (2 * shared) / Math.max(1, total);
}

const counts = (items: readonly string[]) => {
  const m = new Map<string, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return m;
};

/** Similarity 0–1 of two normalised names (identical token sets score 1). */
export function nameSimilarity(a: NormalisedName, b: NormalisedName): number {
  // Plural and singular are the same exercise ("pull-ups" / "pull-up").
  if (a.compact.replace(/s$/, '') === b.compact.replace(/s$/, '')) return 1;
  const tokenA = [...a.tokens].sort().join('');
  const tokenB = [...b.tokens].sort().join('');
  if (tokenA === tokenB) return 1;
  const tokenScore = dice(counts(a.tokens), counts(b.tokens));
  const charScore = dice(trigrams(a.compact), trigrams(b.compact));
  return Math.max(tokenScore, 0.6 * tokenScore + 0.4 * charScore, charScore * 0.9);
}

interface PreparedCandidate {
  id: string;
  names: NormalisedName[];
  equipment: readonly Equipment[];
}

export interface Matcher {
  match(name: string): ExerciseMatch;
}

/**
 * Builds a matcher over the candidates. `known` maps earlier confirmed export names (normalised by
 * `normaliseName(...).compact`) to exercise ids, so a second import needs no questions.
 */
export function createMatcher(
  candidates: readonly MatchCandidate[],
  known: Readonly<Record<string, string>> = {},
): Matcher {
  const prepared: PreparedCandidate[] = candidates.map((c) => ({
    id: c.id,
    names: c.names.filter((n) => n.trim() !== '').map(normaliseName),
    equipment: c.equipment,
  }));
  return {
    match(name: string): ExerciseMatch {
      const q = normaliseName(name);
      const hint = q.equipmentHint;
      const remembered = known[q.compact];
      if (remembered && prepared.some((c) => c.id === remembered)) {
        return {
          name,
          status: 'matched',
          best: { id: remembered, score: 1 },
          suggestions: [{ id: remembered, score: 1 }],
          ...(hint ? { equipmentHint: hint } : {}),
        };
      }
      // "Bench Press (Barbell)" is also tried as "barbell bench press".
      // Bracketed text that is not equipment ("Back Extension (Hyperextension)") is another name.
      const word = fold(name)
        .match(/\(([^)]*)\)/)?.[1]
        ?.trim();
      const variants = [q];
      if (word && hint) {
        variants.push(normaliseName(`${word} ${q.base}`), normaliseName(`${q.base} ${word}`));
      } else if (word) variants.push(normaliseName(word));
      const scored = prepared.map((c) => {
        // Best similarity per variant; the sum breaks ties between equally good names.
        const perVariant = variants.map((v) =>
          Math.max(0, ...c.names.map((n) => nameSimilarity(v, n))),
        );
        let score = Math.max(...perVariant);
        if (hint) score += c.equipment.includes(hint) ? 0.05 : -0.15;
        const tieBreak = perVariant.reduce((a, b) => a + b, 0);
        return { id: c.id, score: Math.max(0, Math.min(1, score)), tieBreak };
      });
      scored.sort(
        (a, b) => b.score - a.score || b.tieBreak - a.tieBreak || a.id.localeCompare(b.id),
      );
      const top = scored.slice(0, 3).filter((s) => s.score > 0);
      const suggestions: ScoredMatch[] = top.map(({ id, score }) => ({ id, score }));
      const best = suggestions[0];
      // A tie at the top is never taken without asking.
      const tie =
        top[0] !== undefined &&
        top[1]?.score === top[0].score &&
        top[1].tieBreak === top[0].tieBreak;
      const status: MatchStatus =
        best && best.score >= AUTO_MATCH_SCORE && !tie
          ? 'matched'
          : best && best.score >= SUGGEST_SCORE
            ? 'suggested'
            : 'unmatched';
      return {
        name,
        status,
        ...(status !== 'unmatched' && best ? { best } : {}),
        suggestions,
        ...(hint ? { equipmentHint: hint } : {}),
      };
    },
  };
}

const PATTERN_WORDS: [RegExp, ExercisePattern][] = [
  [/calf|calves/, 'calf'],
  [/leg (extension|curl)|hamstring curl|abduct|adduct|kickback|nordic/, 'legIsolation'],
  [
    /deadlift|rdl|good morning|hip thrust|bridge|swing|hyperextension|back extension|pull through/,
    'hinge',
  ],
  [/lunge|step up|split squat/, 'lunge'],
  [/squat|leg press/, 'squat'],
  [/\bfly|flye|pec deck|crossover|reverse fly/, 'fly'],
  [/pulldown|pull ?up|chin ?up|pullover/, 'pullVertical'],
  [/row|face pull|pull apart/, 'pullHorizontal'],
  [/curl|tricep|pushdown|skull|shrug|wrist/, 'arms'],
  [/overhead|shoulder press|military|lateral raise|front raise|upright row|arnold/, 'pushVertical'],
  [/press|push ?up|dip/, 'pushHorizontal'],
  [/plank|crunch|sit ?up|ab |abs|core|twist|leg raise|knee raise|woodchop|rollout|hollow/, 'core'],
  [/carry|farmer|walk/, 'carry'],
  [/jump|hop|bound|plyo/, 'plyometrics'],
  [/stretch|mobility|rotation/, 'mobility'],
];

const LEG_LOAD_BY_PATTERN: Partial<Record<ExercisePattern, LegLoad>> = {
  squat: 'heavy',
  hinge: 'heavy',
  lunge: 'light',
  legIsolation: 'light',
  calf: 'light',
  plyometrics: 'heavy',
  carry: 'light',
};

export function guessPattern(name: string): ExercisePattern {
  const s = ` ${fold(name)} `;
  return PATTERN_WORDS.find(([re]) => re.test(s))?.[1] ?? 'other';
}

export function guessLegLoad(pattern: ExercisePattern): LegLoad {
  return LEG_LOAD_BY_PATTERN[pattern] ?? 'none';
}

/** Tracking mode from the data an export has for an exercise. */
export function guessTrackingMode(data: {
  weight: boolean;
  reps: boolean;
  duration: boolean;
  distance: boolean;
}): TrackingMode {
  if (data.distance && !data.reps) return 'distance';
  if (data.weight && data.duration && !data.reps) return 'weightTime';
  if (data.duration && !data.reps) return 'time';
  if (data.weight) return 'weightReps';
  return 'reps';
}
