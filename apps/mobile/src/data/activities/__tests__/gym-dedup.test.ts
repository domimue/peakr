import { dedupeActivities, type GymSession, type SourceActivity } from '@peakr/engine';

import { isLoggedGymSession } from '../apply';

/**
 * A gym session that went to Strava and to Health Connect must be counted once: the detailed
 * session already fed the load, so neither copy may count again (CLAUDE.md "Deduplication").
 */

const start = Date.UTC(2026, 9, 21, 17, 0);
const session: GymSession = {
  id: 's1',
  date: '2026-10-21',
  startedAt: start,
  endedAt: start + 50 * 60_000,
  title: 'Push',
  kind: 'detailed',
  source: 'app',
};

function strength(source: SourceActivity['source'], offsetMin: number, minutes: number) {
  return {
    source,
    externalId: `${source}-1`,
    sport: 'strength',
    startTime: new Date(start + offsetMin * 60_000).toISOString(),
    date: '2026-10-21',
    durationSec: minutes * 60,
    distanceM: null,
    elevationGainM: null,
    avgHr: null,
    maxHr: null,
    swimPaceSecPer100m: null,
    polyline: null,
    name: 'Push',
    indoor: true,
    commute: false,
    summary: true,
    rpe: null,
  } satisfies SourceActivity;
}

describe('a gym session shared to Strava and Health Connect', () => {
  it('is one activity across the two copies, and not a new one next to the logged session', () => {
    const merged = dedupeActivities([strength('strava', 0, 50), strength('healthconnect', 1, 49)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.sources.map((s) => s.source)).toEqual(['strava', 'healthconnect']);
    expect(isLoggedGymSession(merged[0]!, [session])).toBe(true);
  });

  it('still imports a different strength activity from the same day', () => {
    const [other] = dedupeActivities([strength('healthconnect', 180, 40)]);
    expect(isLoggedGymSession(other!, [session])).toBe(false);
  });
});
