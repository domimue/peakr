import { planConfig } from './config';
import { getTemplate } from './library';
import { hr, time } from './library/helpers';
import { enduranceLoad, flattenSteps, round1, totalDurationSec } from './load';
import {
  COMMUTE_SPORTS,
  type Block,
  type Commute,
  type Target,
  type UserProfile,
  type Weekday,
  type WorkoutTemplate,
} from './types';

/**
 * Commutes (CLAUDE.md "Commuting"): fixed easy sessions on the user's commute days. The scheduler
 * places them before everything else; they count towards the weekly load, are never moved, shrunk
 * or dropped by the load rules, and do not count as one of the day's training sessions.
 */

export interface CommuteSession {
  commute: Commute;
  template: WorkoutTemplate;
  main: Block[];
  durationMin: number;
  load: number;
  target: Target;
}

/** Walking stays in Z1, riding and running to work in Z2 (easy). */
const ZONE = { bike: 2, run: 2, walk: 1 } as const;

export function commuteMinutes(c: Commute): number {
  return c.oneWayMin * (c.bothWays ? 2 : 1);
}

/** Commutes on this weekday, in the order the user entered them. */
export function commutesOn(profile: UserProfile, weekday: Weekday): Commute[] {
  return (profile.commutes ?? []).filter((c) => c.weekdays.includes(weekday));
}

/** The commute as a session: one step per leg (there and back = a block repeated twice). */
export function commuteSession(c: Commute): CommuteSession {
  const zone = ZONE[c.sport];
  const template = getTemplate(`${c.sport}.commute`);
  const main: Block[] = [
    { repeat: c.bothWays ? 2 : 1, steps: [time(c.oneWayMin, zone, hr(zone))] },
  ];
  const steps = flattenSteps([], main, []);
  return {
    commute: c,
    template,
    main,
    durationMin: Math.round(totalDurationSec(steps) / 60),
    load: round1(enduranceLoad(steps, template.sport)),
    target: hr(zone),
  };
}

/** True if every commute has a known sport, a sensible duration and at least one valid weekday. */
export function commutesValid(commutes: readonly Commute[]): boolean {
  const { min, max } = planConfig.commute.oneWayMin;
  const ids = new Set(commutes.map((c) => c.id));
  return (
    ids.size === commutes.length &&
    commutes.every(
      (c) =>
        COMMUTE_SPORTS.includes(c.sport) &&
        Number.isFinite(c.oneWayMin) &&
        c.oneWayMin >= min &&
        c.oneWayMin <= max &&
        c.weekdays.length > 0 &&
        new Set(c.weekdays).size === c.weekdays.length &&
        c.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    )
  );
}
