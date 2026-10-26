import { describe, expect, it } from 'vitest';

import {
  activeEnergyDay,
  adaptiveTdee,
  bodyComposition,
  calculationVsScale,
  dayBalance,
  energyConfig,
  pickBySource,
  rapidLossWarning,
  recentBodyFat,
  restingEnergy,
  weekBalance,
  weightTrend,
  type BodyProfile,
  type EnergyDay,
  type TrendPoint,
} from '.';

const TODAY = '2026-10-26';
const woman: BodyProfile = { sex: 'female', birthDate: '1991-03-14', heightCm: 168, weightKg: 61 };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('resting energy', () => {
  it('uses Katch-McArdle only with a body fat % from the last 30 days', () => {
    const fat = recentBodyFat(
      [
        { day: '2026-08-01', value: 30 },
        { day: '2026-10-10', value: 25 },
      ],
      TODAY,
    );
    expect(fat).toEqual({ day: '2026-10-10', value: 25 });
    // 370 + 21.6 × 61 × 0.75
    expect(restingEnergy(woman, TODAY, fat)).toEqual({ kcal: 1358, method: 'katch' });
    const old = recentBodyFat([{ day: '2026-09-01', value: 25 }], TODAY);
    expect(old).toBeNull();
    expect(restingEnergy(woman, TODAY, old)).toEqual({ kcal: 1324, method: 'mifflin' });
  });
});

describe('active energy', () => {
  const base = { profile: woman, day: TODAY, today: TODAY, restingKcal: 1324 };

  it('a wearable day total wins and is counted at the correction factor (0.8)', () => {
    expect(energyConfig.deviceActiveShare).toBe(0.8);
    const a = activeEnergyDay({ ...base, wearableActiveKcal: 700, steps: 12000 });
    expect(a).toMatchObject({ kcal: 560, workoutSource: 'wearable', neatSource: 'wearable' });
    expect(activeEnergyDay({ ...base, wearableActiveKcal: 700, correction: 0.5 }).kcal).toBe(350);
  });

  it('completed workouts: device energy at the factor, else estimated (HR when known)', () => {
    const device = activeEnergyDay({ ...base, deviceWorkoutKcal: 500, steps: 0 });
    expect(device).toMatchObject({ workoutKcal: 400, workoutSource: 'device' });
    const hr = activeEnergyDay({
      ...base,
      completed: [{ sport: 'run', durationMin: 60, avgHr: 150 }],
    });
    expect(hr.workoutSource).toBe('completed');
    // Keytel (women): (−20.4022 + 0.4472×150 − 0.1263×61 + 0.074×35) / 4.184 × 60 ≈ 600
    expect(hr.workoutKcal).toBeGreaterThan(560);
    expect(hr.workoutKcal).toBeLessThan(640);
    const met = activeEnergyDay({ ...base, completed: [{ sport: 'bike', durationMin: 60 }] });
    // moderate cycling 8 MET × 61 kg
    expect(met.workoutKcal).toBe(488);
  });

  it('falls back to planned workouts: done ones, and today’s still planned ones', () => {
    const planned = [
      {
        sport: 'run' as const,
        intensity: 'easy' as const,
        durationMin: 45,
        status: 'planned' as const,
      },
      {
        sport: 'swim' as const,
        intensity: 'easy' as const,
        durationMin: 30,
        status: 'skipped' as const,
      },
    ];
    expect(activeEnergyDay({ ...base, planned }).workoutSource).toBe('planned');
    expect(activeEnergyDay({ ...base, planned }).workoutKcal).toBe(366);
    // A past day: what was never done does not count.
    expect(activeEnergyDay({ ...base, day: '2026-10-20', planned }).workoutKcal).toBe(0);
  });

  it('steps are the everyday movement when no wearable energy exists, minus the steps of runs', () => {
    const steps = activeEnergyDay({ ...base, steps: 10000 });
    // 10,000 × 0.00057 × 61
    expect(steps).toMatchObject({ neatKcal: 348, neatSource: 'steps' });
    const run = activeEnergyDay({
      ...base,
      steps: 10000,
      completed: [{ sport: 'run', durationMin: 30 }],
    });
    expect(run.neatKcal).toBeLessThan(steps.neatKcal);
    // Neither: the everyday-living share of the resting energy.
    expect(activeEnergyDay(base)).toMatchObject({ neatKcal: 265, neatSource: 'default' });
  });
});

describe('energy balance', () => {
  const day = (d: string, intake: number | null, complete = true): EnergyDay => ({
    day: d,
    intakeKcal: intake,
    complete,
    restingKcal: 1400,
    activeKcal: 600,
  });

  it('is intake − resting − active per day', () => {
    expect(dayBalance(day(TODAY, 1500))).toBe(-500);
    expect(dayBalance(day(TODAY, null))).toBeNull();
  });

  it('sums a week over complete days only and turns it into a fat estimate', () => {
    const days = [0, 1, 2, 3, 4, 5].map((i) => day(addDays('2026-10-19', i), 1500));
    days.push(day('2026-10-25', 3000, false));
    const w = weekBalance(days);
    expect(w).toMatchObject({ completeDays: 6, balanceKcal: -3000, avgDailyKcal: -500 });
    expect(w.fatKg).toBeCloseTo(-3000 / 7700, 3);
  });
});

describe('weight trend', () => {
  it('is barely moved by one outlier and flags it', () => {
    const w = [70, 70, 70, 73.5, 70, 70].map((kg, i) => ({
      date: addDays('2026-10-01', i),
      weightKg: kg,
    }));
    const t = weightTrend(w);
    expect(t[3]?.outlier).toBe(true);
    expect(t[3]?.trendKg).toBeLessThanOrEqual(70.2);
    expect(t.at(-1)?.trendKg).toBeLessThan(70.2);
  });

  it('follows a fast steady loss instead of hiding it behind the cap', () => {
    // ~2.2 % a week: two far weigh-ins in a row on the same side count in full.
    const w = Array.from({ length: 43 }, (_, i) => ({
      date: addDays('2026-09-15', i),
      weightKg: Math.round((92 - (i * 2) / 7) * 10) / 10,
    }));
    const t = weightTrend(w);
    // An EWMA lags by about slope / alpha (≈ 2.6 kg here), but it keeps the slope.
    expect(t.at(-1)?.trendKg).toBeLessThan(83);
    expect(rapidLossWarning(t, addDays('2026-09-15', 42)).warning).toBe(true);
  });

  it('keeps capping single spikes that are not repeated', () => {
    const w = [70, 70, 70, 73.5, 70, 73.5, 70].map((kg, i) => ({
      date: addDays('2026-10-01', i),
      weightKg: kg,
    }));
    const t = weightTrend(w);
    expect((t[3]?.trendKg ?? 0) - (t[2]?.trendKg ?? 0)).toBeLessThan(0.25);
    expect((t[5]?.trendKg ?? 0) - (t[4]?.trendKg ?? 0)).toBeLessThan(0.25);
    expect(t[5]?.outlier).toBe(true);
  });

  it('counts the second far weigh-in on the same side in full', () => {
    const w = [70, 70, 73.5, 73.5].map((kg, i) => ({
      date: addDays('2026-10-01', i),
      weightKg: kg,
    }));
    const t = weightTrend(w);
    expect((t[2]?.trendKg ?? 0) - (t[1]?.trendKg ?? 0)).toBeLessThan(0.25);
    expect((t[3]?.trendKg ?? 0) - (t[2]?.trendKg ?? 0)).toBeGreaterThan(0.25);
  });

  it('follows a real change, and a gap of several days counts as several steps', () => {
    const w = Array.from({ length: 30 }, (_, i) => ({
      date: addDays('2026-09-01', i),
      weightKg: 80 - i * 0.1,
    }));
    expect(weightTrend(w).at(-1)?.trendKg).toBeLessThan(78.2);
    const gap = weightTrend([
      { date: '2026-10-01', weightKg: 80 },
      { date: '2026-10-11', weightKg: 79 },
    ]);
    // 1 − 0.9^10 ≈ 0.65 of the (clamped) residual
    expect(gap[1]?.trendKg).toBeCloseTo(79.3, 1);
  });
});

/** 28 logged days with a steady trend, for the adaptive and the scale comparison. */
function history(opts: {
  intake: number;
  kgPerWeek: number;
  days?: number;
  complete?: (i: number) => boolean;
}) {
  const n = opts.days ?? 28;
  const start = '2026-09-28'; // a Monday
  const days: EnergyDay[] = [];
  const trend: TrendPoint[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(start, i);
    days.push({
      day: d,
      intakeKcal: opts.intake,
      complete: opts.complete?.(i) ?? true,
      restingKcal: 1500,
      activeKcal: 700,
    });
    const kg = 80 + (opts.kgPerWeek * i) / 7;
    trend.push({ date: d, weightKg: kg, trendKg: Math.round(kg * 100) / 100, outlier: false });
  }
  return { days, trend, end: addDays(start, n) };
}

describe('adaptive TDEE', () => {
  it('needs at least 14 days with weight and intake', () => {
    const h = history({ intake: 2000, kgPerWeek: -0.5, days: 10 });
    expect(adaptiveTdee({ days: h.days, trend: h.trend, today: h.end })).toMatchObject({
      status: 'notEnoughData',
      usedDays: 10,
      neededDays: 14,
    });
  });

  it('estimates maintenance from logged intake and the trend change, with its data basis', () => {
    // −0.5 kg/week at 2,000 kcal → maintenance ≈ 2,000 + 550 = 2,550
    const h = history({ intake: 2000, kgPerWeek: -0.5 });
    const r = adaptiveTdee({ days: h.days, trend: h.trend, today: h.end });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.estimate.tdeeKcal).toBeGreaterThan(2500);
    expect(r.estimate.tdeeKcal).toBeLessThan(2600);
    expect(r.estimate.basis).toMatchObject({
      intakeDays: 28,
      excludedDays: 0,
      avgIntakeKcal: 2000,
    });
    expect(r.estimate.formulaKcal).toBe(2200);
    expect(r.estimate.correctionKcal).toBe(r.estimate.tdeeKcal - 2200);
  });

  it('leaves incomplete days out', () => {
    const h = history({ intake: 2000, kgPerWeek: -0.5, complete: (i) => i % 7 !== 6 });
    const r = adaptiveTdee({ days: h.days, trend: h.trend, today: h.end });
    expect(r.status === 'ok' && r.estimate.basis.excludedDays).toBe(4);
  });

  it('moves at most 100 kcal per week from the previous estimate', () => {
    const h = history({ intake: 2000, kgPerWeek: -0.5 });
    const previous = { date: addDays(h.end, -7), tdeeKcal: 2200 } as const;
    const r = adaptiveTdee({ days: h.days, trend: h.trend, today: h.end, previous });
    expect(r.status === 'ok' && r.estimate).toMatchObject({ tdeeKcal: 2300, clamped: true });
  });
});

describe('calculation vs. scale', () => {
  it('compares expected fat loss with the trend over complete weeks', () => {
    // Balance 2000 − 2200 = −200/day → −0.18 kg/week expected; the scale says −0.5.
    const h = history({ intake: 2000, kgPerWeek: -0.5 });
    const r = calculationVsScale({ days: h.days, trend: h.trend, today: h.end });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.weeks).toHaveLength(4);
    expect(r.expectedKg).toBeCloseTo((-200 * 28) / 7700, 2);
    expect(r.actualKg).toBeCloseTo(-2, 1);
    expect(r.deviationKg).toBeCloseTo(r.actualKg - r.expectedKg, 5);
    expect(r.confidence).toBe('high');
  });

  it('skips weeks with a gap or an incomplete day, and lowers the confidence', () => {
    const h = history({ intake: 2000, kgPerWeek: -0.5, complete: (i) => i !== 3 && i !== 10 });
    const r = calculationVsScale({ days: h.days, trend: h.trend, today: h.end });
    expect(r.status === 'ok' && r.weeks.length).toBe(2);
    expect(r.status === 'ok' && r.confidence).toBe('medium');
    const none = history({ intake: 2000, kgPerWeek: -0.5, complete: (i) => i % 7 !== 0 });
    expect(calculationVsScale({ days: none.days, trend: none.trend, today: none.end })).toEqual({
      status: 'notEnoughData',
    });
  });
});

describe('fat and lean mass', () => {
  it('splits start and current weight by body fat %', () => {
    const r = bodyComposition({
      start: { day: '2026-09-01', weightKg: 80, bodyFatPct: 25 },
      current: { day: '2026-10-20', weightKg: 77, bodyFatPct: 23 },
    });
    expect(r).toEqual({
      status: 'ok',
      start: { fatKg: 20, leanKg: 60 },
      current: { fatKg: 17.7, leanKg: 59.3 },
      change: { fatKg: -2.3, leanKg: -0.7 },
    });
  });

  it('one measurement gives the current split, none gives "not enough data"', () => {
    expect(bodyComposition({})).toEqual({ status: 'notEnoughData' });
    expect(bodyComposition({ current: { day: TODAY, weightKg: 70, bodyFatPct: 20 } })).toEqual({
      status: 'ok',
      start: null,
      current: { fatKg: 14, leanKg: 56 },
      change: null,
    });
  });
});

describe('source priority', () => {
  it('manual > Garmin > Health Connect / HealthKit > estimate', () => {
    expect(
      pickBySource([
        { source: 'estimate', value: 1 },
        { source: 'healthConnect', value: 2 },
        { source: 'garmin', value: 3 },
      ]),
    ).toEqual({ source: 'garmin', value: 3 });
    expect(
      pickBySource([
        { source: 'garmin', value: 3 },
        { source: 'manual', value: 4 },
      ])?.value,
    ).toBe(4);
    expect(pickBySource([])).toBeNull();
  });
});
