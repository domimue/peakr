import type { ActivitySport, Sport, Step, TravelPeriod } from './types';

/**
 * Travel mode helpers (CLAUDE.md "Irregular weeks & travel"). The scheduler applies them to the
 * sessions on travel days; strength switches to hotel equipment when it is planned.
 */

/** The travel period covering this date, if any. */
export function travelOn(
  travel: readonly TravelPeriod[] | undefined,
  iso: string,
): TravelPeriod | null {
  return travel?.find((t) => iso >= t.startDate && iso <= t.endDate) ?? null;
}

/** Steps by time only: distances (which need a known route or pool) are dropped. */
export function timeBased(steps: readonly Step[]): Step[] {
  return steps.map((s) => {
    if (s.distanceM === undefined) return s;
    const out = { ...s };
    delete out.distanceM;
    return out;
  });
}

/**
 * What a session of `sport` becomes while travelling: the sport itself if the location has what
 * it needs (runs always, rides and bricks with a bike, swims with a pool), else the first possible
 * alternative – a run if the user runs, a ride, a swim – that is not already on that day. Null if
 * nothing is possible (the session is dropped).
 */
export function replacementSport(
  sport: Sport | 'brick',
  travel: TravelPeriod,
  sports: readonly Sport[],
  takenOnDay: readonly ActivitySport[],
): Sport | 'brick' | null {
  const available = (s: Sport | 'brick') =>
    s === 'run' ||
    (s === 'swim' && travel.poolAvailable === true) ||
    ((s === 'bike' || s === 'brick') && travel.bikeAvailable === true);
  if (available(sport)) return sport;
  const candidates: Sport[] = ['run', 'bike', 'swim'];
  return (
    candidates.find(
      (s) => available(s) && (s !== 'run' || sports.includes('run')) && !takenOnDay.includes(s),
    ) ?? null
  );
}
