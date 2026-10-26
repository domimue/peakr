import { describe, expect, it } from 'vitest';

import { goalTargets, ratePresets, rapidLossWarning, validateWeightGoal, type TrendPoint } from '.';

/** Phase 13 safety rules (CLAUDE.md "Weight goal rules") – written before the goal module. */

const TODAY = '2026-10-26';
const point = (date: string, trendKg: number): TrendPoint => ({
  date,
  weightKg: trendKg,
  trendKg,
  outlier: false,
});

describe('rate presets', () => {
  it('shows presets above the max loss rate disabled, with the reason', () => {
    const presets = ratePresets({
      kind: 'lose',
      weightKg: 80,
      tdeeKcal: 2600,
      bmrKcal: 1700,
      sex: 'male',
    });
    expect(presets.map((p) => [p.key, p.rate, p.enabled])).toEqual([
      ['gentle', 0.25, true],
      ['recommended', 0.5, true],
      ['ambitious', 0.75, true],
      ['aggressive', 1, false],
    ]);
    expect(presets[3]).toMatchObject({ disabledReason: 'aboveMaxRate', maxRate: 0.8 });
  });

  it('a heavier person may choose 1.0 kg/week – never more', () => {
    const presets = ratePresets({
      kind: 'lose',
      weightKg: 130,
      tdeeKcal: 3400,
      bmrKcal: 2100,
      sex: 'male',
    });
    expect(presets.every((p) => p.enabled)).toBe(true);
  });

  it('gain presets are 0.1 / 0.25 / 0.5 kg per week', () => {
    const presets = ratePresets({
      kind: 'gain',
      weightKg: 70,
      tdeeKcal: 2500,
      bmrKcal: 1600,
      sex: 'male',
    });
    expect(presets.map((p) => p.rate)).toEqual([0.1, 0.25, 0.5]);
  });

  it('a preset that would need intake below the floor stays selectable with its realistic rate', () => {
    const presets = ratePresets({
      kind: 'lose',
      weightKg: 62,
      tdeeKcal: 1800,
      bmrKcal: 1300,
      sex: 'female',
    });
    const recommended = presets.find((p) => p.key === 'recommended');
    expect(recommended).toMatchObject({ enabled: true, floorApplied: true, effectiveRate: 0.45 });
  });
});

describe('goal targets', () => {
  it('clamps the deficit at the intake floor and reports the resulting rate', () => {
    const t = goalTargets({
      kind: 'lose',
      ratePerWeekKg: 0.5,
      tdeeKcal: 1800,
      nonExerciseTdeeKcal: 1800,
      bmrKcal: 1300,
      sex: 'female',
      weightKg: 62,
    });
    expect(t).toMatchObject({
      baseKcal: 1300,
      floorApplied: true,
      effectiveRatePerWeekKg: 0.45,
      reason: 'safety_clamp',
    });
  });

  it('never uses a rate above the max, even if one is passed in', () => {
    const t = goalTargets({
      kind: 'lose',
      ratePerWeekKg: 1.5,
      tdeeKcal: 3000,
      nonExerciseTdeeKcal: 3000,
      bmrKcal: 1800,
      sex: 'male',
      weightKg: 90,
    });
    // max 0.9 kg/week → 990 kcal/day
    expect(t).toMatchObject({ deficitKcal: 990, ratePerWeekKg: 0.9, reason: 'safety_clamp' });
  });
});

describe('BMI and age limits', () => {
  const adult = { sex: 'female' as const, birthDate: '1991-03-14', heightCm: 168, today: TODAY };
  it('no loss goal at BMI < 18.5 now or at the target, only maintain under 18', () => {
    expect(
      validateWeightGoal({
        ...adult,
        trendWeightKg: 51,
        kind: 'lose',
        targetWeightKg: 49,
        ratePerWeekKg: 0.25,
      }).ok,
    ).toBe(false);
    expect(
      validateWeightGoal({
        ...adult,
        trendWeightKg: 60,
        kind: 'lose',
        targetWeightKg: 51,
        ratePerWeekKg: 0.25,
      }).ok,
    ).toBe(false);
    expect(
      validateWeightGoal({
        ...adult,
        birthDate: '2010-05-01',
        trendWeightKg: 60,
        kind: 'lose',
        targetWeightKg: 57,
        ratePerWeekKg: 0.25,
      }).ok,
    ).toBe(false);
  });
});

describe('rapid loss', () => {
  it('warns after two consecutive weeks of trend loss above 1.5 % of body weight', () => {
    const fast = [point('2026-10-12', 80), point('2026-10-19', 78.6), point(TODAY, 77.3)];
    expect(rapidLossWarning(fast, TODAY)).toMatchObject({ warning: true, suggestion: 'eatMore' });
  });

  it('one fast week alone is not enough', () => {
    const once = [point('2026-10-12', 80), point('2026-10-19', 78.6), point(TODAY, 77.9)];
    expect(rapidLossWarning(once, TODAY).warning).toBe(false);
    expect(rapidLossWarning([], TODAY).warning).toBe(false);
  });
});
