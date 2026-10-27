import { describe, expect, it } from 'vitest';

import {
  calibrateProfile,
  classifyBaseline,
  deriveBaseline,
  suggestSelection,
  type BaselineActivity,
} from '../baseline';
import { pausePlan, resumePlan } from './edit';
import { checkStartFloors, startFloors } from './floors';
import { generatePlan } from './generate';
import { SPORTS, type Availability, type Plan, type UserProfile } from './types';

const TODAY = '2026-10-20';
const MONDAYS = ['08-24', '08-31', '09-07', '09-14', '09-21', '09-28', '10-05', '10-12'].map(
  (d) => `2026-${d}`,
);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

let seq = 0;
const run = (date: string, min: number, km: number): BaselineActivity => ({
  externalId: `a${++seq}`,
  sport: 'run',
  date,
  durationSec: min * 60,
  distanceM: km * 1000,
  elevationGainM: 30,
  avgHr: 145,
  maxHr: 170,
  indoor: false,
  manual: false,
  race: false,
  best20MinHr: null,
});

/**
 * The reported case: easy runs of 6.7 km (40 min) three times a week and a 13.5 km Zone 2 long
 * run (80 min) only every third week.
 */
function reportedRunner(): BaselineActivity[] {
  return MONDAYS.flatMap((monday, i) => [
    run(addDays(monday, 1), 40, 6.7),
    run(addDays(monday, 3), 40, 6.7),
    run(addDays(monday, 5), 40, 6.7),
    ...(i % 3 === 1 ? [run(addDays(monday, 6), 80, 13.5)] : []),
  ]);
}

const runner: UserProfile = {
  age: 38,
  experience: 'intermediate',
  sports: ['run'],
  terrain: 'rolling',
  strength: { mode: 'none' },
};
const roomy: Availability = { minutesPerDay: [60, 60, 60, 60, 0, 120, 120], doublesAllowed: false };

const firstLong = (plan: Plan) =>
  plan.weeks
    .slice(0, 2)
    .flatMap((w) => w.workouts)
    .find((w) => w.role === 'long' && w.sport === 'run');

describe('baseline: activity kinds and outliers per kind', () => {
  it('sees the occasional long run as a long run, not as an outlier of the easy runs', () => {
    const acts = reportedRunner();
    const kinds = classifyBaseline(acts);
    expect(acts.filter((a) => kinds.get(a.externalId) === 'long')).toHaveLength(3);
    expect(suggestSelection(acts).every((s) => s.selected)).toBe(true);
  });

  it('still unticks a session far longer than the other long sessions', () => {
    const acts = [...reportedRunner(), run('2026-10-18', 240, 40)];
    const s = suggestSelection(acts);
    expect(s.at(-1)).toMatchObject({ selected: false, reason: 'muchLonger' });
    expect(s.slice(0, -1).every((x) => x.selected)).toBe(true);
  });

  it('races are their own kind and never set the long session', () => {
    const acts = [...reportedRunner(), { ...run('2026-10-18', 95, 21.1), race: true }];
    expect(classifyBaseline(acts).get(acts.at(-1)?.externalId as string)).toBe('other');
    const r = deriveBaseline(acts, { today: TODAY, age: 38, hrZones: [] });
    const v = r.sports.find((s) => s.sport === 'run')?.volume;
    expect(v?.status === 'ok' && v.value.longMin).toBe(80);
  });

  it('the typical long session is the median long run, with its distance', () => {
    const r = deriveBaseline(reportedRunner(), { today: TODAY, age: 38, hrZones: [] });
    const v = r.sports.find((s) => s.sport === 'run')?.volume;
    expect(v?.status).toBe('ok');
    if (v?.status !== 'ok') return;
    expect(v.value).toMatchObject({ longMin: 80, longKm: 13.5, longSessions: 2 });
    // Last four full weeks: 3 × 40 min each, plus a long run in two of them.
    expect(v.value.recentWeeklyMin).toBe(160);
  });
});

describe('plan start floors', () => {
  const calibrated = () =>
    calibrateProfile(
      runner,
      deriveBaseline(reportedRunner(), { today: TODAY, age: 38, hrZones: [] }),
    );

  it('the first long run is at least 90 % of the recent typical long run', () => {
    const profile = calibrated();
    expect(startFloors(profile)).toEqual({ longMin: { run: 70 }, weeklyMin: { run: 152 } });
    const r = generatePlan(profile, { kind: 'half' }, roomy, '2026-10-26', '2027-03-28');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 80 min → never the 40-minute easy-run length; at a 6:00 easy pace that is ≥ 12 km.
    expect(firstLong(r.value)?.durationMin).toBeGreaterThanOrEqual(72);
    expect(checkStartFloors(r.value, startFloors(profile))).toEqual([]);
  });

  it('week 1 per sport holds at least the mean of the last four weeks', () => {
    const profile = calibrated();
    const r = generatePlan(profile, { kind: 'half' }, roomy, '2026-10-26', '2027-03-28');
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const week1 = r.value.weeks[0]?.workouts.reduce((s, w) => s + w.durationMin, 0) ?? 0;
    expect(week1).toBeGreaterThanOrEqual(152);
  });

  it('the quiz answer alone sets the long-run floor (distance turned into minutes)', () => {
    const quiz: UserProfile = {
      ...runner,
      experience: 'beginner',
      recentLongest: { run: { km: 13.5 } },
    };
    // 13.5 km at the default 10 km/h = 81 min → floor 75 min (90 %, 5-minute steps).
    expect(startFloors(quiz).longMin.run).toBe(75);
    const r = generatePlan(quiz, { kind: '10k' }, roomy, '2026-10-26', '2027-01-31');
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(firstLong(r.value)?.durationMin).toBeGreaterThanOrEqual(75);
  });

  it('the higher of Strava and the quiz wins', () => {
    const profile = { ...calibrated(), recentLongest: { run: { min: 120 } } };
    expect(startFloors(profile).longMin.run).toBe(110);
  });

  it('refuses to build a plan the availability cannot hold – it says what is missing', () => {
    const tight: Availability = {
      minutesPerDay: [30, 0, 30, 0, 0, 40, 0],
      doublesAllowed: false,
    };
    const r = generatePlan(calibrated(), { kind: 'half' }, tight, '2026-10-26', '2027-03-28');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        field: 'baseline',
        code: 'belowBaselineLong',
        params: expect.objectContaining({ sport: SPORTS.indexOf('run'), floorMin: 70 }),
      }),
    );
    expect(r.issues.map((i) => i.code)).toContain('belowBaselineVolume');
  });

  it('a return after a pause may start lower on purpose (resume rules)', () => {
    const profile = calibrated();
    const input = { profile, goal: { kind: 'half' as const }, availability: roomy };
    const r = generatePlan(profile, input.goal, roomy, '2026-10-26', '2027-03-28');
    if (!r.ok) throw new Error('plan');
    const state = { plan: r.value, status: {}, pauses: [], revision: 0 };
    const paused = pausePlan(state, 'injury', '2026-11-02', '2026-11-02');
    if (!paused.ok) throw new Error('pause');
    const resumed = resumePlan(
      paused.value,
      '2026-11-30',
      { ...input, targetDate: '2027-03-28' },
      '2026-11-30',
    );
    expect(resumed.ok).toBe(true);
  });

  it('turns quiz distances into minutes with the own paces, else default speeds', () => {
    const multi: UserProfile = {
      ...runner,
      sports: ['run', 'bike', 'swim'],
      thresholdPaceSecPerKm: 300,
      cssPacePer100mSec: 110,
      recentLongest: { run: { km: 10 }, bike: { km: 50 }, swim: { km: 2 } },
    };
    // Run: 10 km at the easy pace (300 × 1.215 s/km) ≈ 61 min → 55; bike 50 km at 25 km/h =
    // 120 min → 110; swim 2 km at CSS + 10 s/100 m = 40 min → 35.
    expect(startFloors(multi).longMin).toEqual({ run: 55, bike: 110, swim: 35 });
    expect(startFloors({ ...multi, thresholdPaceSecPerKm: undefined }).longMin.run).toBe(55);
    const noCss = { ...multi, cssPacePer100mSec: undefined };
    // 2 km at the default 2.5 km/h = 48 min → 45.
    expect(startFloors(noCss).longMin.swim).toBe(45);
  });

  it('checks the second week when the plan starts late in the week; bricks count half', () => {
    const profile = calibrated();
    const r = generatePlan(profile, { kind: 'half' }, roomy, '2026-10-30', '2027-03-28');
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const floors = { longMin: {}, weeklyMin: { run: 10_000 } };
    // Friday start: three plan days, so week 2 (full) is held against the full floor.
    const [breach] = checkStartFloors(r.value, floors);
    const week2 = r.value.weeks[1]?.workouts.reduce((s, w) => s + w.durationMin, 0);
    expect(breach).toEqual({ sport: 'run', kind: 'volume', plannedMin: week2, floorMin: 10_000 });
    // A plan of a single short week is held against its own days.
    const short = { ...r.value, weeks: r.value.weeks.slice(0, 1) };
    expect(checkStartFloors(short, floors)[0]?.floorMin).toBe(Math.round((10_000 * 3) / 7));
    // A brick is half ride, half run.
    const w0 = r.value.weeks[0] as Plan['weeks'][number];
    const brick = { ...(w0.workouts[0] as Plan['weeks'][number]['workouts'][number]) };
    const bricked = {
      ...short,
      weeks: [{ ...w0, workouts: [{ ...brick, sport: 'brick' as const, durationMin: 60 }] }],
    };
    // 30 bike minutes from the brick meet a floor of 30 (70 × 3/7); the swim floor is missed.
    expect(checkStartFloors(bricked, { longMin: {}, weeklyMin: { bike: 70, swim: 70 } })).toEqual([
      { sport: 'swim', kind: 'volume', plannedMin: 0, floorMin: 30 },
    ]);
  });

  it('without a baseline or quiz answer there is no floor', () => {
    expect(startFloors(runner)).toEqual({ longMin: {}, weeklyMin: {} });
  });
});
