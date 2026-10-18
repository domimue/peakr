import { planConfig } from './config';
import type { ActivitySport, Block, Step, Workout } from './types';

const cfg = planConfig.load;

/** Steps in execution order, with each block's repeats expanded. */
export function flattenSteps(warmup: Step[], main: Block[], cooldown: Step[]): Step[] {
  const mainSteps = main.flatMap((b) => Array.from({ length: b.repeat }, () => b.steps).flat());
  return [...warmup, ...mainSteps, ...cooldown];
}

export function totalDurationSec(steps: Step[]): number {
  return steps.reduce((sum, s) => sum + (s.durationSec ?? 0), 0);
}

/** One step: duration_min × zone weight × sport factor (CLAUDE.md "Unified load"). */
export function stepLoad(step: Step, sport: ActivitySport): number {
  const minutes = (step.durationSec ?? 0) / 60;
  return minutes * cfg.zoneWeights[step.zone] * cfg.sportFactors[step.sport ?? sport];
}

/** Strength: duration_min × session RPE / 2. */
export function strengthLoad(durationMin: number, sessionRpe: number): number {
  return (durationMin * sessionRpe) / cfg.strengthRpeDivisor;
}

/** Climbing increases the load of run and bike sessions. */
export function climbMultiplier(sport: ActivitySport, gainPerKm: number): number {
  if (sport !== 'run' && sport !== 'bike') return 1;
  return 1 + gainPerKm * cfg.climbLoadPerGainPerKm[sport];
}

/** Endurance load of concrete (time-resolved) steps. */
export function enduranceLoad(steps: Step[], sport: ActivitySport, multiplier = 1): number {
  return steps.reduce((sum, s) => sum + stepLoad(s, sport), 0) * multiplier;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Share of endurance time in Z3 and above (80/20 rule); strength is ignored. */
export function hardShare(workouts: readonly Workout[]): number {
  let total = 0;
  let hard = 0;
  for (const w of workouts) {
    if (w.sport === 'strength') continue;
    for (const s of flattenSteps(w.warmup, w.main, w.cooldown)) {
      const sec = s.durationSec ?? 0;
      total += sec;
      if (s.zone >= 3) hard += sec;
    }
  }
  return total === 0 ? 0 : hard / total;
}
