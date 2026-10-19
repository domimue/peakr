import type { Block, Step, Workout } from './types';

/**
 * Indoor version of an outdoor session with the same steps and load (CLAUDE.md "Weather check"):
 * run → treadmill (incline matched to the planned terrain), bike → indoor trainer, open water →
 * pool. Hill reps on the treadmill become incline reps.
 */

export type IndoorKind = 'treadmill' | 'trainer' | 'pool';

export interface IndoorVersion {
  kind: IndoorKind;
  /** Treadmill incline in % (1 % replaces air resistance on the flat). */
  inclinePct: number | null;
  warmup: Step[];
  main: Block[];
  cooldown: Step[];
  load: number;
}

const KIND_BY_ALTERNATIVE: Record<string, IndoorKind> = {
  'indoor.treadmill': 'treadmill',
  'indoor.treadmill_incline': 'treadmill',
  'indoor.trainer': 'trainer',
  'indoor.pool': 'pool',
};

const FLAT_INCLINE_PCT = 1;
const HILL_REP_INCLINE_PCT = 6;
const MAX_INCLINE_PCT = 8;

/** Average incline of the planned terrain: gain per km in m ÷ 10 = %. */
function terrainIncline(w: Workout): number {
  const pct = w.terrain ? Math.round(w.terrain.gainPerKm / 10) : 0;
  return Math.min(MAX_INCLINE_PCT, Math.max(FLAT_INCLINE_PCT, pct));
}

/** `null` when the session has no indoor alternative (strength, commutes, bricks). */
export function indoorVersion(w: Workout): IndoorVersion | null {
  const kind = w.indoorAlternativeId ? KIND_BY_ALTERNATIVE[w.indoorAlternativeId] : undefined;
  if (!kind || w.role === 'commute') return null;
  const hills = w.type === 'hills';
  const main =
    kind === 'treadmill' && hills
      ? w.main.map((b) => ({
          repeat: b.repeat,
          steps: b.steps.map((s) => (s.rest ? s : { ...s, noteKey: 'steps.indoor.inclineRep' })),
        }))
      : w.main;
  return {
    kind,
    inclinePct: kind === 'treadmill' ? (hills ? HILL_REP_INCLINE_PCT : terrainIncline(w)) : null,
    warmup: w.warmup,
    main,
    cooldown: w.cooldown,
    load: w.load,
  };
}
