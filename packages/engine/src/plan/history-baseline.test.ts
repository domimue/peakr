import { describe, expect, it } from 'vitest';

import type { PlanState } from './edit';
import { startFloors } from './floors';
import { generatePlan } from './generate';
import { historyBaseline, withHistoryBaseline } from './history-baseline';
import type { Availability, UserProfile, Workout } from './types';

const profile: UserProfile = {
  age: 35,
  experience: 'intermediate',
  sports: ['run', 'bike'],
  terrain: 'rolling',
  strength: { mode: 'none' },
};
const availability: Availability = {
  minutesPerDay: [60, 60, 45, 60, 0, 150, 90],
  doublesAllowed: false,
};
const TODAY = '2026-12-16'; // a Wednesday

function previous(done: (w: Workout) => boolean = () => true): PlanState {
  const r = generatePlan(profile, { kind: 'half' }, availability, '2026-10-05', '2027-03-14');
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  const all = r.value.weeks.flatMap((w) => w.workouts).filter((w) => w.date < TODAY && done(w));
  return {
    plan: r.value,
    status: Object.fromEntries(all.map((w) => [w.id, 'done' as const])),
    pauses: [],
    revision: 0,
  };
}
const workouts = (s: PlanState) => s.plan.weeks.flatMap((w) => w.workouts);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

describe('start values from the previous plan', () => {
  it('typical long run, weekly minutes per sport, start load and levels', () => {
    const s = previous();
    const b = historyBaseline(s, profile, TODAY);
    const longs = workouts(s).filter(
      (w) => w.role === 'long' && w.sport === 'run' && w.date >= '2026-11-04' && w.date < TODAY,
    );
    expect(b.longMin?.run).toBe(Math.round(median(longs.map((w) => w.durationMin))));
    expect(b.longKm?.run).toBeGreaterThan(5);
    // Last four full weeks: Nov 16 – Dec 13.
    const window = workouts(s).filter((w) => w.date >= '2026-11-16' && w.date < '2026-12-14');
    const runMin = window.filter((w) => w.sport === 'run').reduce((a, w) => a + w.durationMin, 0);
    expect(b.weeklyMin?.run).toBe(Math.round(runMin / 4));
    expect(b.weeklyMin?.bike).toBeGreaterThan(0);
    expect(b.startLoad).toBe(Math.round(window.reduce((a, w) => a + w.load, 0) / 4));
    const tempo = workouts(s)
      .filter((w) => w.templateId === 'run.tempo' && w.date < TODAY)
      .at(-1);
    expect(b.levels?.['run.tempo']).toBe(tempo?.level);
  });

  it('weeks with nothing done count as zero; nothing done at all says nothing', () => {
    const lazy = previous((w) => w.date < '2026-11-30');
    const b = historyBaseline(lazy, profile, TODAY);
    const full = historyBaseline(previous(), profile, TODAY);
    expect(b.weeklyMin?.run).toBeLessThan(full.weeklyMin?.run as number);
    expect(
      historyBaseline(
        previous(() => false),
        profile,
        TODAY,
      ),
    ).toEqual({});
    // Only sessions long ago: no volume, no long run – the levels still carry over.
    const old = historyBaseline(
      previous((w) => w.date < '2026-10-20'),
      profile,
      TODAY,
    );
    expect(Object.keys(old)).toEqual(['levels']);
  });

  it('a young plan averages over the weeks it covered; bricks count half ride, half run', () => {
    const s = previous();
    const young: PlanState = {
      ...s,
      plan: { ...s.plan, startDate: '2026-11-30' },
      status: Object.fromEntries(Object.entries(s.status).filter(([id]) => id >= '2026-11-30')),
    };
    const b = historyBaseline(young, profile, TODAY);
    const lastTwo = workouts(s).filter(
      (w) => w.sport === 'run' && w.date >= '2026-11-30' && w.date < '2026-12-14',
    );
    expect(b.weeklyMin?.run).toBe(Math.round(lastTwo.reduce((a, w) => a + w.durationMin, 0) / 2));
    const week = s.plan.weeks[10] as PlanState['plan']['weeks'][number];
    const brick = {
      ...(week.workouts[0] as Workout),
      sport: 'brick' as const,
      durationMin: 60,
      id: 'b',
      date: '2026-12-08',
      role: 'brick' as const,
      level: null,
    };
    const bricked = {
      ...s,
      plan: { ...s.plan, weeks: [{ ...week, workouts: [brick] }] },
      status: { b: 'done' as const },
    };
    const bb = historyBaseline(bricked, profile, TODAY);
    expect(bb.weeklyMin).toEqual({ bike: Math.round(30 / 4), run: Math.round(30 / 4) });
    expect(bb.longMin).toBeUndefined();
    expect(bb.levels).toBeUndefined();
  });

  it('merges with the Strava baseline: the higher value per sport, paces from Strava', () => {
    const history = {
      longMin: { run: 90 },
      longKm: { run: 15 },
      weeklyMin: { run: 200 },
      startLoad: 500,
      levels: { 'run.tempo': 4 },
    };
    const strava = {
      ...profile,
      baseline: {
        longMin: { run: 100, bike: 120 },
        longKm: { run: 17, bike: 50 },
        weeklyMin: { run: 150 },
        startLoad: 400,
        thresholdPaceSecPerKm: 280,
      },
    };
    const merged = withHistoryBaseline(strava, history).baseline;
    expect(merged).toEqual({
      longMin: { run: 100, bike: 120 },
      longKm: { run: 17, bike: 50 },
      weeklyMin: { run: 200 },
      startLoad: 500,
      thresholdPaceSecPerKm: 280,
      levels: { 'run.tempo': 4 },
    });
    // History longer: its distance is shown.
    const longer = withHistoryBaseline(strava, { ...history, longMin: { run: 110 } }).baseline;
    expect(longer?.longKm?.run).toBe(15);
    // Without history the Strava baseline stays as it is.
    expect(withHistoryBaseline(strava, {}).baseline).toEqual(strava.baseline);
    // Nothing on either side stays nothing.
    expect(withHistoryBaseline(profile, {}).baseline).toEqual({});
    expect(withHistoryBaseline(profile, { longKm: { run: 5 } }).baseline).toEqual({});
  });

  it('the new plan starts from it: long-run floor and the reached levels', () => {
    const s = previous();
    const next = withHistoryBaseline(profile, historyBaseline(s, profile, TODAY));
    const floor = startFloors(next).longMin.run as number;
    expect(floor).toBeGreaterThan(0);
    const roomy: Availability = { ...availability, minutesPerDay: [75, 75, 60, 75, 0, 180, 120] };
    const r = generatePlan(next, { kind: 'half' }, roomy, '2026-12-21', '2027-04-25');
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const first = r.value.weeks.slice(0, 2).flatMap((w) => w.workouts);
    expect(
      first.find((w) => w.role === 'long' && w.sport === 'run')?.durationMin,
    ).toBeGreaterThanOrEqual(floor);
    const fresh = generatePlan(profile, { kind: 'half' }, roomy, '2026-12-21', '2027-04-25');
    if (!fresh.ok) throw new Error('fresh');
    const lvl = (p: typeof r.value) =>
      p.weeks.flatMap((w) => w.workouts).find((w) => w.templateId === 'run.fartlek')?.level ?? 0;
    expect(lvl(r.value)).toBeGreaterThan(lvl(fresh.value));
  });
});
