import { describe, expect, it } from 'vitest';

import { calculateHrZones, type HrZone } from '../hr';
import { absorbActivity, absorbGymSession } from './absorb';
import {
  activityKeys,
  activityLoad,
  activityZone,
  dedupeActivities,
  isEccentricActivity,
  isHardActivity,
  isSameActivity,
  matchActivities,
  matchScore,
  type Activity,
  type SourceActivity,
} from './activities';
import {
  allWorkouts,
  findWorkout,
  newPlanState,
  pausePlan,
  setWorkoutStatus,
  type PlanInput,
  type PlanState,
} from './edit';
import { generatePlan } from './generate';
import type { Workout } from './types';

/**
 * Imported activities (CLAUDE.md "Automatic activity sync"). The plan: intermediate runner, half
 * marathon, plan from Monday 2026-10-19. Week 2 (index 1):
 *   Mon 10-26 easy 50' · Tue strength · Wed 10-28 easy 45' · Thu strength · Fri rest
 *   Sat 10-31 long 70' · Sun 11-01 fartlek (hard)
 */

const input: PlanInput = {
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
};

function baseState(): PlanState {
  const r = generatePlan(input.profile, input.goal, input.availability, '2026-10-19', '2027-02-14');
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return newPlanState(r.value);
}

function ok<T>(r: { ok: true; value: T } | { ok: false; issues: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

/** HRmax 184 (estimate for 35), %HRmax: Z1 92–110, Z2 110–129, Z3 129–147, Z4 147–166, Z5 166+. */
const zones: HrZone[] = ok(calculateHrZones({ age: 35 })).zones;

let nextId = 1;
function record(over: Partial<SourceActivity> = {}): SourceActivity {
  return {
    source: 'strava',
    externalId: String(nextId++),
    sport: 'run',
    startTime: '2026-10-26T06:00:00Z',
    date: '2026-10-26',
    durationSec: 3000,
    distanceM: 10_000,
    elevationGainM: 40,
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
  };
}

const activity = (over: Partial<SourceActivity> = {}): Activity =>
  dedupeActivities([record(over)])[0] as Activity;

const workoutOn = (state: PlanState, date: string, role?: string): Workout =>
  allWorkouts(state.plan).find((w) => w.date === date && (!role || w.role === role)) as Workout;

describe('isSameActivity', () => {
  const a = record();
  it('matches within 5 min and 10 % duration', () => {
    expect(
      isSameActivity(a, record({ startTime: '2026-10-26T06:05:00Z', durationSec: 2700 })),
    ).toBe(true);
    expect(
      isSameActivity(a, record({ startTime: '2026-10-26T05:55:00Z', durationSec: 3300 })),
    ).toBe(true);
  });
  it('rejects other sports, later starts and other durations', () => {
    expect(isSameActivity(a, record({ sport: 'bike' }))).toBe(false);
    expect(isSameActivity(a, record({ startTime: '2026-10-26T06:05:01Z' }))).toBe(false);
    expect(isSameActivity(a, record({ durationSec: 2699 }))).toBe(false);
    expect(isSameActivity(a, record({ startTime: 'not a date' }))).toBe(false);
  });
});

describe('dedupeActivities', () => {
  it('keeps one record per activity with the source priority watch > Strava > health', () => {
    const strava = record({
      externalId: 's1',
      polyline: 'abc',
      name: 'Morning run',
      avgHr: 140,
      commute: true,
    });
    const garmin = record({
      source: 'garmin',
      externalId: 'g1',
      startTime: '2026-10-26T06:01:00Z',
      durationSec: 3050,
      distanceM: 10_050,
      avgHr: null,
    });
    const health = record({ source: 'healthconnect', externalId: 'h1', durationSec: 2950 });
    const [merged, ...rest] = dedupeActivities([health, strava, garmin]);
    expect(rest).toEqual([]);
    expect(merged).toMatchObject({
      key: 'garmin:g1',
      source: 'garmin',
      durationSec: 3050,
      distanceM: 10_050,
      // Filled from Strava, which has the route, the title and the HR here.
      polyline: 'abc',
      name: 'Morning run',
      avgHr: 140,
      commute: true,
    });
    expect(merged?.sources.map((s) => s.source)).toEqual(['garmin', 'strava', 'healthconnect']);
    expect(activityKeys(merged as Activity)).toEqual([
      'garmin:g1',
      'strava:s1',
      'healthconnect:h1',
    ]);
  });

  it('never merges two records of the same source', () => {
    const list = dedupeActivities([
      record({ externalId: 'a' }),
      record({ externalId: 'b', startTime: '2026-10-26T06:01:00Z' }),
    ]);
    expect(list.map((a) => a.key)).toEqual(['strava:a', 'strava:b']);
  });

  it('orders records with the same start deterministically', () => {
    const list = dedupeActivities([
      record({ externalId: 'b', sport: 'swim' }),
      record({ externalId: 'a', sport: 'bike' }),
      record({ externalId: 'c', sport: 'run', source: 'healthkit' }),
      record({ externalId: 'd', sport: 'run' }),
    ]);
    expect(list.map((a) => a.key)).toEqual(['strava:a', 'strava:b', 'strava:d']);
    expect(list[2]?.sources.map((s) => s.source)).toEqual(['strava', 'healthkit']);
  });

  it('keeps health data as the only source and sorts by start', () => {
    const list = dedupeActivities([
      record({ source: 'healthkit', externalId: 'x', startTime: '2026-10-27T06:00:00Z' }),
      record({ externalId: 'y', sport: 'swim' }),
    ]);
    expect(list.map((a) => a.key)).toEqual(['strava:y', 'healthkit:x']);
  });

  it('fills a gap from the next source in priority order', () => {
    const [merged] = dedupeActivities([
      record({ source: 'coros', externalId: 'c', elevationGainM: null }),
      record({ source: 'healthkit', externalId: 'h', elevationGainM: 12 }),
      record({ source: 'strava', externalId: 's', elevationGainM: 55 }),
    ]);
    expect(merged?.elevationGainM).toBe(55);
  });
});

describe('activity load', () => {
  it('reads the zone from the average heart rate', () => {
    expect(activityZone({ avgHr: null }, zones)).toBe(2);
    expect(activityZone({ avgHr: 140 }, [])).toBe(2);
    expect(activityZone({ avgHr: 60 }, zones)).toBe(1);
    expect(activityZone({ avgHr: 120 }, zones)).toBe(2);
    expect(activityZone({ avgHr: 150 }, zones)).toBe(4);
    expect(activityZone({ avgHr: 199 }, zones)).toBe(5);
  });

  it('places an HR between two rounded boundaries in the upper zone', () => {
    const gap: HrZone[] = [
      { zone: 1, minBpm: 100, maxBpm: 119 },
      { zone: 2, minBpm: 120, maxBpm: 139 },
      { zone: 3, minBpm: 140, maxBpm: 159 },
      { zone: 4, minBpm: 160, maxBpm: 179 },
      { zone: 5, minBpm: 180, maxBpm: 200 },
    ];
    expect(activityZone({ avgHr: 139.5 }, gap)).toBe(3);
    expect(activityZone({ avgHr: 210 }, gap)).toBe(5);
  });

  it('is duration × zone weight × sport factor', () => {
    expect(activityLoad({ sport: 'run', durationSec: 3600, avgHr: null }, zones)).toBe(120);
    expect(activityLoad({ sport: 'bike', durationSec: 3600, avgHr: null }, zones)).toBe(90);
    expect(activityLoad({ sport: 'xcski', durationSec: 3600, avgHr: 150 }, zones)).toBe(192);
  });

  it('calls Z4+, long Z3 and long sessions hard', () => {
    expect(isHardActivity({ sport: 'run', durationSec: 1200, avgHr: 155 }, zones)).toBe(true);
    expect(isHardActivity({ sport: 'run', durationSec: 2400, avgHr: 135 }, zones)).toBe(true);
    expect(isHardActivity({ sport: 'run', durationSec: 1200, avgHr: 135 }, zones)).toBe(false);
    expect(isHardActivity({ sport: 'run', durationSec: 5400, avgHr: null }, zones)).toBe(true);
    expect(isHardActivity({ sport: 'bike', durationSec: 5400, avgHr: null }, zones)).toBe(false);
  });
});

describe('matchActivities (confidence)', () => {
  const state = baseState();
  const none = new Set<string>();
  const monday = () => workoutOn(state, '2026-10-26');

  it('links a confident match: same sport, same day, about the planned duration', () => {
    const a = activity();
    const r = matchActivities(state, [a], none, none);
    expect(r.links).toEqual([{ activityKey: a.key, workoutId: monday().id }]);
    expect(r).toMatchObject({ questions: [], unplanned: [] });
  });

  it('asks when the activity only roughly fits, offering the plausible candidates', () => {
    // 70 minutes instead of 50: plausible, not confident.
    const longer = activity({ durationSec: 70 * 60 });
    const r = matchActivities(state, [longer], none, none);
    expect(r.links).toEqual([]);
    expect(r.questions).toEqual([
      { activityKey: longer.key, candidates: [{ workoutId: monday().id, score: 0.583 }] },
    ]);
    // A run on Tuesday (no run planned) could be Monday's or Wednesday's session: ask.
    const tuesday = activity({ date: '2026-10-27', startTime: '2026-10-27T06:00:00Z' });
    const q = matchActivities(state, [tuesday], none, none).questions[0];
    expect(q?.candidates.map((c) => c.workoutId).sort()).toEqual(
      [monday().id, workoutOn(state, '2026-10-28').id].sort(),
    );
  });

  it('never attaches an activity that fits nothing: it is unplanned and the workout stays open', () => {
    const ride = activity({ sport: 'bike' });
    const restDay = activity({ date: '2026-10-30', startTime: '2026-10-30T06:00:00Z' });
    // 15 minutes are not the planned 50-minute run.
    const jog = activity({ durationSec: 900, startTime: '2026-10-26T18:00:00Z' });
    const r = matchActivities(state, [ride, restDay, jog], none, none);
    expect(r.links).toEqual([]);
    expect(r.questions).toEqual([]);
    expect(r.unplanned).toEqual([ride, restDay, jog]);
  });

  it('uses the planned distance when it is known', () => {
    const short = activity({ distanceM: 4000 });
    // 50 minutes as planned, but 4 km instead of 10: not confident any more.
    const r = matchActivities(state, [short], none, none, () => 10);
    expect(r.links).toEqual([]);
    expect(r.questions[0]?.candidates[0]).toEqual({ workoutId: monday().id, score: 0.7 });
    expect(matchActivities(state, [activity()], none, none, () => 10).links).toHaveLength(1);
  });

  it('gives each workout one activity', () => {
    const first = activity({ startTime: '2026-10-26T06:00:00Z' });
    const second = activity({ startTime: '2026-10-26T18:00:00Z' });
    const r = matchActivities(state, [first, second], none, none);
    expect(r.links).toEqual([{ activityKey: first.key, workoutId: monday().id }]);
    expect(r.links.map((l) => l.activityKey)).not.toContain(second.key);
  });

  it('skips skipped workouts but links workouts already marked done by hand', () => {
    const skipped = ok(setWorkoutStatus(state, monday().id, 'skipped'));
    expect(matchActivities(skipped, [activity()], none, none).links).toEqual([]);
    const done = ok(setWorkoutStatus(state, monday().id, 'done'));
    expect(matchActivities(done, [activity()], none, none).links).toHaveLength(1);
  });

  it('leaves linked activities and workouts alone', () => {
    const a = activity();
    const both: Activity = { ...a, sources: [{ source: 'garmin', externalId: '9' }, ...a.sources] };
    expect(matchActivities(state, [both], new Set([a.key]), none)).toEqual({
      links: [],
      questions: [],
      unplanned: [],
    });
    const r = matchActivities(state, [a], none, new Set([monday().id]));
    expect(r.links).toEqual([]);
    expect(r.questions.flatMap((q) => q.candidates.map((c) => c.workoutId))).not.toContain(
      monday().id,
    );
    expect(activityKeys(both)[0]).toBe('garmin:9');
  });

  /** State with the given workouts on one day (matching only reads dates, sports and roles). */
  function withDay(date: string, workouts: Workout[]): PlanState {
    const weeks = state.plan.weeks.map((w) => ({
      ...w,
      workouts: [...w.workouts.filter((x) => x.date !== date), ...workouts],
    }));
    return { ...state, plan: { ...state.plan, weeks } };
  }

  it('matches winter variants and both halves of a brick', () => {
    const long = workoutOn(state, '2026-10-31', 'long');
    const winter = withDay('2026-10-31', [
      {
        ...long,
        winterVariant: { templateId: 'xcski.long', sport: 'xcski', durationMin: 80, load: 130 },
      },
    ]);
    const ski = activity({
      sport: 'xcski',
      date: '2026-10-31',
      durationSec: long.durationMin * 60,
    });
    expect(matchActivities(winter, [ski], none, none).links).toEqual([
      { activityKey: ski.key, workoutId: long.id },
    ]);

    const brick = withDay('2026-10-31', [{ ...long, sport: 'brick' }]);
    // Each half is about half of the brick.
    const half = (long.durationMin / 2) * 60;
    const ride = activity({ sport: 'bike', date: '2026-10-31', durationSec: half });
    const run = activity({
      date: '2026-10-31',
      startTime: '2026-10-31T07:00:00Z',
      durationSec: half,
    });
    expect(matchActivities(brick, [ride, run], none, none).links.map((l) => l.workoutId)).toEqual([
      long.id,
      long.id,
    ]);
  });

  it('sends commutes to commute sessions', () => {
    const easy = monday();
    const day = withDay('2026-10-26', [
      { ...easy, id: 'ride', sport: 'bike', durationMin: 60 },
      { ...easy, id: 'commute', sport: 'bike', role: 'commute', durationMin: 30 },
    ]);
    const commute = activity({ sport: 'bike', durationSec: 1800, commute: true });
    expect(matchActivities(day, [commute], none, none).links[0]?.workoutId).toBe('commute');
    const ride = activity({ sport: 'bike', durationSec: 3600 });
    expect(matchActivities(day, [ride], none, none).links[0]?.workoutId).toBe('ride');
  });

  it('scores 0 for another sport, a day too far or no planned duration', () => {
    const w = monday();
    expect(matchScore(w, activity({ sport: 'bike' }))).toBe(0);
    expect(matchScore(w, activity({ date: '2026-10-28' }))).toBe(0);
    expect(matchScore({ ...w, durationMin: 0 }, activity())).toBe(0);
    // The next day counts half.
    expect(matchScore(w, activity({ date: '2026-10-27' }))).toBe(0.5);
    // A distance only counts with a planned distance and a recorded one.
    expect(matchScore(w, activity({ distanceM: null }), 10)).toBe(1);
  });
});

describe('strength summaries (detailed beats summary)', () => {
  const stravaStrength = (over: Partial<SourceActivity> = {}) =>
    record({
      source: 'strava',
      sport: 'strength',
      startTime: '2026-10-27T17:00:00Z',
      date: '2026-10-27',
      durationSec: 3600,
      distanceM: null,
      elevationGainM: null,
      summary: true,
      name: 'Gym',
      ...over,
    });

  it('a detailed record wins over a summary one, whatever the source priority', () => {
    // Strava (summary) ranks above the phone's health data, but the detailed record wins.
    const summary = stravaStrength({ avgHr: 120, rpe: 8 });
    const detailed = record({
      source: 'healthconnect',
      sport: 'strength',
      startTime: '2026-10-27T17:02:00Z',
      date: '2026-10-27',
      durationSec: 3500,
      distanceM: null,
      elevationGainM: null,
    });
    for (const records of [
      [summary, detailed],
      [detailed, summary],
    ]) {
      const [a] = dedupeActivities(records);
      expect(a?.source).toBe('healthconnect');
      expect(a?.summary).toBe(false);
      expect(a?.durationSec).toBe(3500);
      // Gaps are still filled from the summary, and both ids are kept.
      expect(a?.avgHr).toBe(120);
      expect(a?.rpe).toBe(8);
      expect(a?.name).toBe('Gym');
      expect(a?.sources.map((x) => x.source)).toEqual(['healthconnect', 'strava']);
    }
  });

  it('between two detailed records the source priority decides', () => {
    const watch = record({ source: 'garmin', startTime: '2026-10-26T06:01:00Z' });
    const [a] = dedupeActivities([record(), watch]);
    expect(a?.source).toBe('garmin');
  });

  it('loads strength as duration × RPE / 2, with a default RPE', () => {
    expect(activityLoad(stravaStrength({ rpe: 6 }), zones)).toBe(180);
    expect(activityLoad(stravaStrength(), zones)).toBe(210);
    expect(isHardActivity(stravaStrength({ rpe: 10, durationSec: 7200 }), zones)).toBe(false);
  });

  it('fulfils the planned strength session of that day', () => {
    const state = baseState();
    const planned = allWorkouts(state.plan).find(
      (w) => w.date === '2026-10-27' && w.sport === 'strength',
    ) as Workout;
    expect(planned).toBeDefined();
    const [a] = dedupeActivities([stravaStrength()]);
    const result = matchActivities(state, [a as Activity], new Set(), new Set());
    expect(result.links).toEqual([{ activityKey: (a as Activity).key, workoutId: planned.id }]);
    expect(result.unplanned).toEqual([]);
  });
});

describe('absorbActivity', () => {
  const state = baseState();
  const weekLoad = (s: PlanState) => s.plan.weeks[1]?.load ?? 0;

  it('takes the extra load off the easy sessions left in that week', () => {
    // A flat 60-minute ride on Monday without HR: load 90.
    const ride = activity({ sport: 'bike', durationSec: 3600, elevationGainM: null });
    const r = absorbActivity(state, input, ride, zones, '2026-10-26');
    expect(r.load).toBe(90);
    expect(r.hard).toBe(false);
    const wed = workoutOn(state, '2026-10-28');
    expect(r.shortened).toEqual([{ workoutId: wed.id, fromMin: 45, toMin: 20 }]);
    const after = findWorkout(r.state.plan, wed.id) as Workout;
    expect(after.durationMin).toBe(20);
    expect(after.notes.at(-1)).toEqual({
      key: 'notes.absorbed',
      params: { sport: 'bike', minutes: 60, load: 90 },
    });
    expect(weekLoad(r.state)).toBeLessThan(weekLoad(state));
    expect(r.state.plan.weeks[1]?.notes.at(-1)?.key).toBe('notes.unplannedActivity');
    // Long, key and strength sessions keep their length.
    for (const w of allWorkouts(state.plan).filter((x) => x.id !== wed.id)) {
      expect(findWorkout(r.state.plan, w.id)?.durationMin).toBe(w.durationMin);
    }
  });

  it('shortens only as much as needed, latest session first', () => {
    const short = activity({ sport: 'swim', durationSec: 900 });
    const r = absorbActivity(state, input, short, zones, '2026-10-26');
    expect(r.shortened).toHaveLength(1);
    expect(r.shortened[0]?.toMin).toBe(35);
  });

  it('spreads the cut over several easy sessions and stops once the load is covered', () => {
    // Week 1: Mon strength · Tue easy 25' · Wed easy 25'.
    const ride = activity({
      sport: 'bike',
      durationSec: 3600,
      date: '2026-10-19',
      startTime: '2026-10-19T06:00:00Z',
    });
    const big = absorbActivity(state, input, ride, zones, '2026-10-19');
    expect(big.shortened.map((c) => c.workoutId)).toEqual(['2026-10-21-1', '2026-10-20-1']);

    const walk = activity({
      sport: 'walk',
      durationSec: 600,
      date: '2026-10-19',
      startTime: '2026-10-19T06:00:00Z',
    });
    const small = absorbActivity(state, input, walk, zones, '2026-10-19');
    expect(small.shortened).toEqual([{ workoutId: '2026-10-21-1', fromMin: 25, toMin: 20 }]);
  });

  it('makes a hard session on the next day easy after a hard activity', () => {
    const race = activity({
      date: '2026-10-31',
      startTime: '2026-10-31T08:00:00Z',
      durationSec: 2400,
      avgHr: 160,
    });
    const r = absorbActivity(state, input, race, zones, '2026-10-30');
    const sunday = workoutOn(state, '2026-11-01');
    expect(r.hard).toBe(true);
    expect(r.eased).toEqual([sunday.id]);
    expect(findWorkout(r.state.plan, sunday.id)?.hard).toBe(false);
  });

  it('changes nothing in the past, during a pause or outside the plan', () => {
    const ride = activity({ sport: 'bike', durationSec: 3600 });
    const late = absorbActivity(state, input, ride, zones, '2026-11-02');
    expect(late.shortened).toEqual([]);
    expect(late.state.plan.weeks[1]?.notes.at(-1)?.key).toBe('notes.unplannedActivity');

    const paused = ok(pausePlan(state, 'illness', '2026-10-26', '2026-10-26'));
    expect(absorbActivity(paused, input, ride, zones, '2026-10-26').state).toBe(paused);

    const before = activity({ date: '2026-10-01', startTime: '2026-10-01T06:00:00Z' });
    expect(absorbActivity(state, input, before, zones, '2026-10-26').state).toBe(state);
  });

  it('leaves sessions done or skipped as they are', () => {
    const wed = workoutOn(state, '2026-10-28');
    const done = ok(setWorkoutStatus(state, wed.id, 'skipped'));
    const r = absorbActivity(done, input, activity({ sport: 'bike' }), zones, '2026-10-26');
    expect(r.shortened).toEqual([]);
  });
});

describe('terrain load of activities (CLAUDE.md "Terrain" §6)', () => {
  it('adds climbing to the load of runs and rides', () => {
    const flat = { sport: 'run', durationSec: 3600, avgHr: null } as const;
    expect(activityLoad(flat, zones)).toBe(120);
    expect(activityLoad({ ...flat, distanceM: 10_000, elevationGainM: 200 }, zones)).toBe(134.4);
    expect(activityLoad({ ...flat, distanceM: 0, elevationGainM: 200 }, zones)).toBe(120);
    expect(
      activityLoad({ ...flat, sport: 'swim', distanceM: 2000, elevationGainM: 5 }, zones),
    ).toBe(84);
  });

  it('recognises long running descents', () => {
    const run = {
      sport: 'run',
      durationSec: 3600,
      distanceM: 10_000,
      elevationGainM: 100,
    } as const;
    expect(isEccentricActivity(run)).toBe(false);
    expect(isEccentricActivity({ ...run, elevationGainM: 250 })).toBe(true);
    expect(isEccentricActivity({ ...run, elevationLossM: 250 })).toBe(true);
    expect(isEccentricActivity({ ...run, elevationGainM: null })).toBe(false);
    expect(isEccentricActivity({ ...run, distanceM: null, elevationGainM: 250 })).toBe(false);
    expect(isEccentricActivity({ ...run, durationSec: 3000, elevationGainM: 250 })).toBe(false);
    expect(isEccentricActivity({ ...run, sport: 'bike', elevationGainM: 250 })).toBe(false);
  });

  it('makes heavy leg strength on the next day light after a long descent', () => {
    const state = baseState();
    const heavy = allWorkouts(state.plan).find(
      (w) => w.sport === 'strength' && w.legLoad === 'heavy' && w.date > '2026-10-27',
    ) as Workout;
    expect(heavy).toBeDefined();
    const dayBefore = new Date(Date.parse(heavy.date) - 86_400_000).toISOString().slice(0, 10);
    const descent = activity({
      date: dayBefore,
      startTime: `${dayBefore}T07:00:00Z`,
      durationSec: 4200,
      distanceM: 12_000,
      elevationGainM: 600,
    });
    const r = absorbActivity(state, input, descent, zones, dayBefore);
    expect(r.eccentric).toBe(true);
    expect(r.eased).toContain(heavy.id);
    expect(findWorkout(r.state.plan, heavy.id)?.legLoad).not.toBe('heavy');
  });
});

describe('absorbGymSession', () => {
  const state = baseState();

  it('an unplanned heavy leg day counts its load and eases the hard session the next day', () => {
    // Saturday 10-31: 60 min heavy legs at RPE 8 → load 240, hard.
    const r = absorbGymSession(
      state,
      input,
      { date: '2026-10-31' },
      { load: 240, hard: true, minutes: 60 },
      '2026-10-30',
    );
    const sunday = workoutOn(state, '2026-11-01');
    expect(r.matched).toBe(false);
    expect(r.eased).toEqual([sunday.id]);
    expect(findWorkout(r.state.plan, sunday.id)?.hard).toBe(false);
    expect(r.state.plan.weeks[1]?.notes.at(-1)).toEqual({
      key: 'notes.unplannedActivity',
      params: { sport: 'strength', minutes: 60, load: 240 },
    });
  });

  it('an unplanned upper-body session only takes load off the easy sessions', () => {
    const r = absorbGymSession(
      state,
      input,
      { date: '2026-10-26' },
      { load: 140, hard: false, minutes: 40 },
      '2026-10-26',
    );
    expect(r.eased).toEqual([]);
    expect(r.shortened.length).toBeGreaterThan(0);
  });

  it('a planned session is marked done; its load was planned, so nothing is shortened', () => {
    const planned = workoutOn(state, '2026-10-27');
    expect(planned.sport).toBe('strength');
    const r = absorbGymSession(
      state,
      input,
      { date: '2026-10-27', plannedWorkoutId: planned.id },
      { load: 150, hard: false, minutes: 50 },
      '2026-10-27',
    );
    expect(r.matched).toBe(true);
    expect(r.state.status[planned.id]).toBe('done');
    expect(r.shortened).toEqual([]);
    expect(r.state.plan.weeks[1]?.notes).toEqual(state.plan.weeks[1]?.notes);
  });

  it('a planned session heavier on the legs than planned eases a hard session the next day', () => {
    // Make the Saturday long run a planned light strength session's next day: plan strength on Sat.
    const sat = workoutOn(state, '2026-10-31');
    const sunday = workoutOn(state, '2026-11-01');
    const planned = {
      ...workoutOn(state, '2026-10-27'),
      id: 'gym-sat',
      date: '2026-10-31',
      hard: false,
    };
    const withStrength: PlanState = {
      ...state,
      plan: {
        ...state.plan,
        weeks: state.plan.weeks.map((w) =>
          w.index === 1
            ? { ...w, workouts: [...w.workouts.filter((x) => x.id !== sat.id), planned] }
            : w,
        ),
      },
    };
    const r = absorbGymSession(
      withStrength,
      input,
      { date: '2026-10-31', plannedWorkoutId: 'gym-sat' },
      { load: 200, hard: true, minutes: 50 },
      '2026-10-30',
    );
    expect(r.matched).toBe(true);
    expect(r.eased).toEqual([sunday.id]);
  });
});
