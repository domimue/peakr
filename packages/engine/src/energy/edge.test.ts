import { describe, expect, it } from 'vitest';

import {
  activeEnergyDay,
  intakeTarget,
  adaptiveTdee,
  calculationVsScale,
  pickBySource,
  recentBodyFat,
  trendOn,
  validateWeightGoal,
  weekBalance,
  weightTrend,
  type BodyProfile,
  type EnergyDay,
  type TrendPoint,
} from '.';

const TODAY = '2026-10-26';
const man: BodyProfile = { sex: 'male', birthDate: '1986-11-01', heightCm: 182, weightKg: 80 };
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const base = { profile: man, day: TODAY, today: TODAY, restingKcal: 1748 };

describe('active energy edges', () => {
  it('strength, walks, per-workout device energy and implausible heart rates', () => {
    const a = activeEnergyDay({
      ...base,
      steps: 9000,
      completed: [
        { sport: 'strength', durationMin: 60 },
        { sport: 'walk', durationMin: 30, avgHr: 300 },
        { sport: 'bike', durationMin: 60, deviceKcal: 500 },
      ],
    });
    // strength 5 MET × 80 + walk 4.3 MET × 80 × 0.5 + 500 × 0.75
    expect(a.workoutKcal).toBe(400 + 172 + 375);
    // 9,000 − 30 × 110 walking steps
    expect(a.neatKcal).toBe(Math.round(5700 * 0.00057 * 80));
    expect(
      activeEnergyDay({ ...base, completed: [{ sport: 'run', durationMin: 10, avgHr: 81 }] })
        .workoutKcal,
    ).toBeGreaterThan(0);
  });
});

describe('balance, trend and source edges', () => {
  it('a week without logged days has no average', () => {
    expect(
      weekBalance([
        { day: TODAY, intakeKcal: null, complete: false, restingKcal: 1, activeKcal: 1 },
      ]).avgDailyKcal,
    ).toBeNull();
  });

  it('trendOn ignores old points; a later better source still wins', () => {
    const t = weightTrend([{ date: '2026-10-01', weightKg: 70 }]);
    expect(trendOn(t, '2026-10-05')?.trendKg).toBe(70);
    expect(trendOn(t, '2026-10-20')).toBeNull();
    expect(
      pickBySource([
        { source: 'manual', value: 1 },
        { source: 'estimate', value: 2 },
      ])?.value,
    ).toBe(1);
  });

  it('the latest of several recent body fat values wins', () => {
    expect(
      recentBodyFat(
        [
          { day: '2026-10-20', value: 21 },
          { day: '2026-10-10', value: 22 },
        ],
        TODAY,
      )?.value,
    ).toBe(21);
  });

  it('body fat out of range or in the future is ignored', () => {
    expect(
      recentBodyFat(
        [
          { day: TODAY, value: 80 },
          { day: '2026-11-01', value: 20 },
        ],
        TODAY,
      ),
    ).toBeNull();
  });
});

describe('goal edges', () => {
  it('a loss without a rate is maintenance', () => {
    expect(
      intakeTarget({ tdeeKcal: 2500, bmrKcal: 1700, sex: 'male', kind: 'lose' }).intakeKcal,
    ).toBe(2500);
  });

  const adult = {
    sex: 'male' as const,
    birthDate: '1986-11-01',
    heightCm: 182,
    trendWeightKg: 80,
    today: TODAY,
  };
  it('needs a target and a rate; a gain target must be above the current weight', () => {
    const noTarget = validateWeightGoal({ ...adult, kind: 'lose', ratePerWeekKg: 0.5 });
    expect(!noTarget.ok && noTarget.issues.map((i) => i.code)).toEqual(['required']);
    const noRate = validateWeightGoal({ ...adult, kind: 'lose', targetWeightKg: 75 });
    expect(!noRate.ok && noRate.issues.map((i) => i.field)).toEqual(['ratePerWeekKg']);
    const gainDown = validateWeightGoal({
      ...adult,
      kind: 'gain',
      targetWeightKg: 78,
      ratePerWeekKg: 0.2,
    });
    expect(!gainDown.ok && gainDown.issues[0]?.code).toBe('targetNotAboveCurrent');
    const gain = validateWeightGoal({
      ...adult,
      kind: 'gain',
      targetWeightKg: 84,
      ratePerWeekKg: 1,
    });
    expect(gain.ok && gain.value).toMatchObject({ ratePerWeekKg: 0.5, reason: 'safety_clamp' });
  });
});

function days(
  n: number,
  start: string,
  intake: number,
): { days: EnergyDay[]; trend: TrendPoint[] } {
  const out: EnergyDay[] = [];
  const trend: TrendPoint[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(start, i);
    out.push({ day: d, intakeKcal: intake, complete: true, restingKcal: 1500, activeKcal: 700 });
    trend.push({ date: d, weightKg: 80, trendKg: 80 - i * 0.02, outlier: false });
  }
  return { days: out, trend };
}

describe('adaptive and scale edges', () => {
  it('a previous estimate above the new one limits the fall too', () => {
    const h = days(28, '2026-09-28', 2000);
    const r = adaptiveTdee({
      ...h,
      today: TODAY,
      previous: { date: '2026-10-19', tdeeKcal: 2600 },
    });
    expect(r.status === 'ok' && r.estimate.tdeeKcal).toBe(2500);
  });

  it('one week with few weigh-ins is low confidence; the running week is not counted', () => {
    const h = days(10, '2026-10-12', 2000);
    const sparse = h.trend.filter((_, i) => i % 2 === 0);
    const r = calculationVsScale({ days: h.days, trend: sparse, today: '2026-10-21' });
    expect(r.status === 'ok' && r.weeks.map((w) => w.week)).toEqual(['2026-10-12']);
    expect(r.status === 'ok' && r.confidence).toBe('low');
    const few = calculationVsScale({ days: h.days, trend: h.trend.slice(0, 2), today: TODAY });
    expect(few.status).toBe('notEnoughData');
  });
});
