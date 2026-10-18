import type { ZoneNumber } from '../../zones';
import type { Block, Phase, Step, Target, WorkoutLevel } from '../types';

/** Authoring helpers for the template data – keep the tables readable. */

export const ALL_PHASES: Phase[] = ['base', 'build', 'peak', 'taper', 'maintain'];

export const hr = (zone: ZoneNumber): Target => ({ kind: 'hrZone', value: `Z${zone}` });
export const pace = (label: string): Target => ({ kind: 'paceZone', value: label });
export const power = (range: string): Target => ({ kind: 'powerZone', value: range });
export const rpe = (value: number): Target => ({ kind: 'rpe', value: String(value) });
export const css = (offsetSec: number): Target => ({
  kind: 'cssOffset',
  value: offsetSec > 0 ? `+${offsetSec}` : String(offsetSec),
});

/** CSS offset (s/100 m) → load zone, per WORKOUTS.md §2. */
export function cssZone(offsetSec: number): ZoneNumber {
  if (offsetSec >= 10) return 2;
  if (offsetSec >= 3) return 3;
  if (offsetSec >= -3) return 4;
  return 5;
}

type Extra = Partial<Omit<Step, 'zone' | 'target'>>;

export function time(min: number, zone: ZoneNumber, target = hr(zone), extra: Extra = {}): Step {
  return { durationSec: Math.round(min * 60), zone, target, ...extra };
}

export function secs(sec: number, zone: ZoneNumber, target = hr(zone), extra: Extra = {}): Step {
  return { durationSec: sec, zone, target, ...extra };
}

export function dist(m: number, zone: ZoneNumber, target: Target, extra: Extra = {}): Step {
  return { distanceM: m, zone, target, ...extra };
}

/** Recovery between reps (jog / easy spin / rest at the wall). */
export function rest(sec: number, extra: Extra = {}): Step {
  return { durationSec: sec, zone: 1, target: hr(1), rest: true, ...extra };
}

/** Swim distance at a CSS offset. */
export function swim(m: number, offsetSec: number, extra: Extra = {}): Step {
  return dist(m, cssZone(offsetSec), css(offsetSec), extra);
}

export function reps(repeat: number, ...steps: Step[]): Block {
  return { repeat, steps };
}

export function once(...steps: Step[]): Block {
  return { repeat: 1, steps };
}

/** Builds `levels` from main sets that share warm-up and cool-down. */
export function levels(warmup: Step[], cooldown: Step[], mains: Block[][]): WorkoutLevel[] {
  return mains.map((main, i) => ({ level: i + 1, warmup, main, cooldown }));
}

/** `n × work / recovery` as one block. */
export function intervals(n: number, work: Step, recovery: Step): Block[] {
  return [reps(n, work, recovery)];
}

/** Pyramid of on-minutes with half recoveries (fartlek L5/L6). */
export function pyramid(minutes: number[], zone: ZoneNumber): Block[] {
  const steps: Step[] = [];
  minutes.forEach((m, i) => {
    steps.push(time(m, zone));
    if (i < minutes.length - 1) steps.push(rest(m * 30));
  });
  return [once(...steps)];
}
