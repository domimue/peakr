import { planConfig } from './config';
import { getExercise } from './library';

const restCfg = planConfig.strength.rest;

/** A prescribed rep range (`"8–12"`, `"10"`) or time range (`"30–45 s"`). */
export interface RepRange {
  min: number;
  max: number;
  unit: 'reps' | 'sec';
}

/**
 * Parses the `reps` text of a prescription. Accepts an en dash or hyphen between the bounds and an
 * `s` suffix for time. Anything else (e.g. `"20 m"`) is not a rep range.
 */
export function parseReps(text: string): RepRange | null {
  const m = /^\s*(\d+)\s*(?:[–-]\s*(\d+))?\s*(s|sec)?\s*$/i.exec(text);
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] === undefined ? min : Number(m[2]);
  if (min <= 0 || max < min) return null;
  return { min, max, unit: m[3] ? 'sec' : 'reps' };
}

/** Rest between sets: long for heavy low-rep work, short for high reps, timed, core and mobility. */
export function defaultRestSec(exerciseId: string, reps: string): number {
  const pattern = getExercise(exerciseId)?.pattern;
  const range = parseReps(reps);
  if (pattern === 'core' || pattern === 'mobility' || range === null || range.unit === 'sec') {
    return restCfg.timedSec;
  }
  if (range.max <= restCfg.maxRepsLow) return restCfg.lowRepsSec;
  if (range.min >= 15) return restCfg.highRepsSec;
  return restCfg.moderateSec;
}
