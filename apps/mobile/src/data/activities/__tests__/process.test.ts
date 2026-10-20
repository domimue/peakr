import { generatePlan, statusOf, type SourceActivity } from '@peakr/engine';

import type { StoredPlanInput } from '@/data/db/schema';
import * as activityRepo from '@/data/repositories/activity-repository';
import * as planRepo from '@/data/repositories/plan-repository';
import i18n from '@/i18n';

import { noticeText } from '../../../features/activities/activity-notice';
import type { ActivityNotice } from '../apply';
import { onActivities } from '../events';
import { processNewActivities } from '../process';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/activity-repository');

const plans = planRepo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');
const activities =
  activityRepo as unknown as typeof import('@/data/repositories/__mocks__/activity-repository');

/**
 * Activities reaching the plan (CLAUDE.md "After import"). Plan: half marathon, intermediate, from
 * Monday 2026-10-19; week 2: Mon easy 50' · Tue strength · Wed easy 45' · Sat long · Sun fartlek.
 */
const input: StoredPlanInput = {
  profile: {
    age: 35,
    experience: 'intermediate',
    sports: ['run'],
    terrain: 'flat',
    strength: { mode: 'peakr', equipment: 'gym' },
  },
  goal: { kind: 'half' },
  availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
  targetDate: '2027-02-14',
  hrZones: { age: 35 },
};

function storePlan(): void {
  const r = generatePlan(input.profile, input.goal, input.availability, '2026-10-19', '2027-02-14');
  if (!r.ok) throw new Error('plan');
  plans.store.plan = {
    id: 'plan-1',
    input,
    state: { plan: r.value, status: {}, pauses: [], revision: 0 },
  };
}

function receive(over: Partial<SourceActivity>): void {
  activities.applyActivities(
    [
      {
        source: 'strava',
        externalId: '1',
        sport: 'run',
        startTime: '2026-10-26T06:00:00Z',
        date: '2026-10-26',
        durationSec: 3000,
        distanceM: 10_000,
        elevationGainM: 20,
        avgHr: null,
        maxHr: null,
        swimPaceSecPer100m: null,
        polyline: null,
        name: null,
        indoor: false,
        commute: false,
        summary: false,
        rpe: null,
        ...over,
      },
    ],
    [],
  );
}

const state = () => {
  if (!plans.store.plan) throw new Error('no plan');
  return plans.store.plan.state;
};

let heard: ActivityNotice[][] = [];
let stop: () => void;

beforeEach(() => {
  plans.resetStore();
  activities.resetStore();
  heard = [];
  stop = onActivities((n) => heard.push([...n]));
});
afterEach(() => stop());

describe('processNewActivities', () => {
  it('marks the planned session done, links it and announces it once', async () => {
    storePlan();
    receive({});
    const notices = await processNewActivities('2026-10-26');
    expect(notices).toEqual([
      {
        kind: 'matched',
        sport: 'run',
        source: 'strava',
        date: '2026-10-26',
        workoutId: '2026-10-26-1',
        adjusted: 0,
      },
    ]);
    expect(statusOf(state(), '2026-10-26-1')).toBe('done');
    expect(activities.store.links).toEqual([
      { activityKey: 'strava:1', workoutId: '2026-10-26-1', planId: 'plan-1' },
    ]);
    expect(heard).toHaveLength(1);

    // Handled once: the next sync (or an edited title) changes nothing.
    receive({ name: 'Renamed' });
    expect(await processNewActivities('2026-10-26')).toEqual([]);
    expect(plans.savePlanState).toHaveBeenCalledTimes(1);
  });

  it('does not count the same run again when the watch delivers it later', async () => {
    storePlan();
    receive({});
    await processNewActivities('2026-10-26');
    receive({ source: 'garmin', externalId: 'g', startTime: '2026-10-26T06:02:00Z' });
    expect(await processNewActivities('2026-10-26')).toEqual([]);
    expect(activities.store.activities.every((a) => a.handled)).toBe(true);
  });

  it('a Strava strength summary marks the planned strength session done', async () => {
    storePlan();
    const planned = state()
      .plan.weeks.flatMap((w) => w.workouts)
      .find((w) => w.date === '2026-10-27' && w.sport === 'strength');
    expect(planned).toBeDefined();
    receive({
      sport: 'strength',
      startTime: '2026-10-27T17:00:00Z',
      date: '2026-10-27',
      durationSec: 3600,
      distanceM: null,
      elevationGainM: null,
      indoor: true,
      summary: true,
      rpe: 7,
    });
    const [notice] = await processNewActivities('2026-10-27');
    expect(notice).toMatchObject({ kind: 'matched', sport: 'strength', workoutId: planned?.id });
    expect(statusOf(state(), planned?.id as string)).toBe('done');
  });

  it('counts an unplanned ride and makes the rest of the week easier', async () => {
    storePlan();
    receive({ sport: 'bike', durationSec: 3600 });
    const before = state().plan.weeks[1]?.load ?? 0;
    const [notice] = await processNewActivities('2026-10-26');
    expect(notice).toMatchObject({ kind: 'unplanned', sport: 'bike', adjusted: 1 });
    expect(state().plan.weeks[1]?.load).toBeLessThan(before);
    expect(statusOf(state(), '2026-10-26-1')).toBe('planned');
  });

  it('waits without a plan and ignores activities outside the plan', async () => {
    receive({ date: '2026-10-01', startTime: '2026-10-01T06:00:00Z' });
    expect(await processNewActivities('2026-10-26')).toEqual([]);
    expect(activities.store.activities[0]?.handled).toBe(false);

    storePlan();
    expect(await processNewActivities('2026-10-26')).toEqual([]);
    expect(activities.store.activities[0]?.handled).toBe(true);
    expect(heard).toEqual([]);
  });
});

describe('noticeText', () => {
  const t = i18n.t.bind(i18n);
  const matched: ActivityNotice = {
    kind: 'matched',
    sport: 'run',
    source: 'strava',
    date: '2026-10-29',
    workoutId: 'w',
    adjusted: 0,
  };

  it('names the sport, the source and the day', () => {
    expect(noticeText(t, [matched], 'en', '2026-10-30')).toBe(
      "Run synced from Strava – Thursday's session marked as done",
    );
    expect(noticeText(t, [matched], 'en', '2026-10-29')).toBe(
      "Run synced from Strava – today's session marked as done",
    );
    expect(
      noticeText(t, [{ ...matched, kind: 'unplanned', sport: 'bike', adjusted: 2 }], 'en'),
    ).toBe(
      'Ride synced from Strava – counted as extra training, the rest of the week is a little easier',
    );
    expect(noticeText(t, [{ ...matched, kind: 'unplanned', adjusted: 0 }], 'en')).toBe(
      "Run synced from Strava – counted towards this week's load",
    );
    expect(noticeText(t, [matched, matched, matched], 'en')).toBe(
      '3 activities synced from Strava',
    );
    expect(noticeText(t, [], 'en')).toBe('');
  });
});
