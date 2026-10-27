import {
  generatePlan,
  historyByMonth,
  newPlanState,
  performance,
  statusOf,
  type SourceActivity,
} from '@peakr/engine';

import type { StoredPlanInput } from '@/data/db/schema';
import * as activityRepo from '@/data/repositories/activity-repository';
import * as baselineRepo from '@/data/repositories/baseline-repository';
import * as planRepo from '@/data/repositories/plan-repository';
import { supabase } from '@/data/supabase';
import { processNewActivities } from '@/data/activities/process';
import { disconnect } from '@/features/integrations/api';
import { planTargetBands } from '@/features/training-zones/resolve';

import { dropRevokedBaseline, importBaseline, stravaZones } from '../api';
import { calibrateOnboarding } from '../calibration';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/activity-repository');
jest.mock('@/data/repositories/baseline-repository');
jest.mock('@/data/repositories/gym-repository');
jest.mock('@/data/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() }, from: jest.fn() },
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

const plans = planRepo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');
const acts =
  activityRepo as unknown as typeof import('@/data/repositories/__mocks__/activity-repository');
const baseline =
  baselineRepo as unknown as typeof import('@/data/repositories/__mocks__/baseline-repository');
const client = supabase as unknown as {
  functions: { invoke: jest.Mock };
  from: jest.Mock;
};

const TODAY = '2026-10-20';
const PLAN_START = '2026-10-26';

/** Three runs a week over the last eight weeks, plus a race (as Strava sends them). */
function stravaRows() {
  const rows = [];
  let id = 0;
  for (let week = 0; week < 8; week++) {
    for (const [day, min] of [
      [0, 50],
      [2, 50],
      [5, 90],
    ] as const) {
      const d = new Date(Date.UTC(2026, 7, 24 + week * 7 + day));
      rows.push({
        external_id: String(++id),
        sport: 'run',
        name: 'Morning Run',
        start_date_local: `${d.toISOString().slice(0, 10)}T07:00:00Z`,
        duration_sec: min * 60,
        distance_m: min * 160,
        elevation_gain_m: min * 2,
        avg_hr: 140,
        max_hr: 175,
        indoor: false,
        manual: false,
        workout_type: null,
        best_20min_hr: null,
      });
    }
  }
  rows.push({ ...rows[0], external_id: 'race', duration_sec: 2400, workout_type: 1 });
  return rows;
}

const input: StoredPlanInput = {
  profile: {
    age: 35,
    experience: 'beginner',
    sports: ['run'],
    terrain: 'flat',
    strength: { mode: 'none' },
  },
  goal: { kind: 'half' },
  availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
  targetDate: '2027-02-14',
  hrZones: { age: 35 },
};

function storePlan(stored: StoredPlanInput): void {
  const r = generatePlan(
    stored.profile,
    stored.goal,
    stored.availability,
    PLAN_START,
    '2027-02-14',
  );
  if (!r.ok) throw new Error('plan');
  plans.store.plan = { id: 'plan-1', input: stored, state: newPlanState(r.value) };
}

function receive(over: Partial<SourceActivity>): void {
  acts.applyActivities(
    [
      {
        source: 'strava',
        externalId: '1',
        sport: 'run',
        startTime: `${PLAN_START}T06:00:00Z`,
        date: PLAN_START,
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

async function importTypical() {
  client.functions.invoke.mockResolvedValueOnce({
    data: { activities: stravaRows(), hrZones: null, zonesScopeMissing: false },
    error: null,
  });
  return importBaseline();
}

beforeEach(() => {
  plans.resetStore();
  acts.resetStore();
  baseline.resetStore();
  jest.clearAllMocks();
});

describe('baseline import', () => {
  it('stores the activities in the baseline only, with outliers unticked', async () => {
    expect(await importTypical()).toEqual({ ok: true, activities: 25 });
    expect(client.functions.invoke).toHaveBeenCalledWith('strava-baseline/import', { body: {} });
    expect(baseline.store.activities).toHaveLength(25);
    expect(baseline.store.activities.find((a) => a.externalId === 'race')).toMatchObject({
      selected: false,
      outlier: 'race',
      race: true,
    });
    expect(baseline.store.activities.filter((a) => a.selected)).toHaveLength(24);
    // Never the activities the plan reads.
    expect(acts.applyActivities).not.toHaveBeenCalled();
    expect(acts.store.activities).toEqual([]);
  });

  it('reports why an import failed', async () => {
    client.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: { context: { json: async () => ({ error: 'not_connected' }) } },
    });
    expect(await importBaseline()).toEqual({ ok: false, reason: 'not_connected' });
    expect(baseline.store.meta).toBeNull();
  });

  it('turns custom Strava zones into engine zones', () => {
    const zones = stravaZones({
      zones: [
        { min: 0, max: 130 },
        { min: 130, max: 150 },
        { min: 150, max: 165 },
        { min: 165, max: 175 },
        { min: 175, max: -1 },
      ],
    });
    expect(zones?.[0]).toEqual({ zone: 1, minBpm: null, maxBpm: 130 });
    expect(zones?.[4]).toEqual({ zone: 5, minBpm: 175, maxBpm: null });
    expect(stravaZones({ zones: [{ min: 0, max: 100 }] })).toBeNull();
    expect(stravaZones(null)).toBeNull();
  });
});

describe('reference only: the baseline never becomes training history', () => {
  it('calibrates the plan without any completed session, history, load or record', async () => {
    await importTypical();
    const calibrated = calibrateOnboarding(input, baseline.store, TODAY);
    expect(calibrated.profile.baseline?.experience).toEqual({ run: 'intermediate' });
    storePlan(calibrated);
    const state = plans.store.plan?.state;
    if (!state) throw new Error('no plan');

    expect(state.status).toEqual({});
    const sources = [{ planId: 'plan-1', state, profile: calibrated.profile }];
    expect(historyByMonth(sources)).toEqual([]);
    const perf = performance(sources, '2026-11-30', 8);
    expect(perf.lifetime).toEqual({ sessions: 0, minutes: 0, km: 0, load: 0 });
    expect(perf.bests).toEqual({ longestSession: null, biggestWeek: null, longestKm: {} });
  });

  it('baseline activities are never matched or absorbed into the plan', async () => {
    await importTypical();
    storePlan(calibrateOnboarding(input, baseline.store, TODAY));
    expect(await processNewActivities(PLAN_START)).toEqual([]);
    expect(acts.store.links).toEqual([]);
    expect(plans.savePlanState).not.toHaveBeenCalled();
  });

  it('an activity recorded after the import still arrives and is matched', async () => {
    await importTypical();
    storePlan(calibrateOnboarding(input, baseline.store, TODAY));
    // Same Strava id space as the baseline: the two stores stay apart.
    receive({ externalId: '1' });
    const notices = await processNewActivities(PLAN_START);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: 'matched', date: PLAN_START });
    expect(statusOf(plans.store.plan!.state, notices[0]!.workoutId as string)).toBe('done');
    expect(baseline.store.activities).toHaveLength(25);
  });

  it('a webhook update of an old baseline activity changes nothing in the plan', async () => {
    await importTypical();
    storePlan(calibrateOnboarding(input, baseline.store, TODAY));
    // An edited title of a run from September reaches the normal pipeline …
    receive({ externalId: '5', date: '2026-09-02', startTime: '2026-09-02T07:00:00Z' });
    // … but it is before the plan: handled without any effect.
    expect(await processNewActivities(PLAN_START)).toEqual([]);
    expect(acts.store.links).toEqual([]);
    expect(plans.store.plan?.state.status).toEqual({});
  });
});

describe('calibration precedence', () => {
  it('the user’s own entries win; session targets do not follow the Strava zones', async () => {
    client.functions.invoke.mockResolvedValueOnce({
      data: {
        activities: stravaRows(),
        hrZones: {
          zones: [
            { min: 0, max: 130 },
            { min: 130, max: 150 },
            { min: 150, max: 165 },
            { min: 165, max: 175 },
            { min: 175, max: -1 },
          ],
        },
        zonesScopeMissing: false,
      },
      error: null,
    });
    await importBaseline();
    if (baseline.store.meta)
      baseline.store.meta.overrides = { experience: { run: 'advanced' }, hrMax: 199 };
    const own = { ...input, hrZones: { age: 35, hrMax: 190 } };
    const calibrated = calibrateOnboarding(own, baseline.store, TODAY);
    expect(calibrated.profile.baseline?.experience).toEqual({ run: 'advanced' });
    expect(calibrated.hrZones?.hrMax).toBe(199);
    // The Strava zones are kept (display), but the easy band comes from HRmax 199: 137–157.
    expect(calibrated.stravaHrZones).toBeDefined();
    expect(planTargetBands(calibrated)[1]).toEqual({ zone: 2, minBpm: 137, maxBpm: 157 });
    const manual = {
      ...calibrated,
      zones: { overrides: { hr: { 2: { minBpm: 120, maxBpm: 140 } }, runPace: {}, swimPace: {} } },
    };
    expect(planTargetBands(manual)[1]).toMatchObject({ zone: 2, minBpm: 120, maxBpm: 140 });
  });

  it('leaves the input untouched without a baseline', () => {
    expect(calibrateOnboarding(input, { activities: [], meta: null }, TODAY)).toBe(input);
  });
});

describe('deleting the baseline', () => {
  it('disconnecting Strava removes it from this device', async () => {
    await importTypical();
    client.functions.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect(await disconnect('strava')).toBe(true);
    expect(baseline.store.activities).toEqual([]);
    expect(baseline.store.meta).toBeNull();
  });

  it('access revoked on Strava’s side removes it on the next sync', async () => {
    await importTypical();
    const query = (data: unknown) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }),
    });
    client.from.mockReturnValueOnce(query({ provider: 'strava' }));
    await dropRevokedBaseline();
    expect(baseline.store.activities).toHaveLength(25);
    client.from.mockReturnValueOnce(query(null));
    await dropRevokedBaseline();
    expect(baseline.store.activities).toEqual([]);
    // Nothing stored: no request at all.
    await dropRevokedBaseline();
    expect(client.from).toHaveBeenCalledTimes(2);
  });
});
