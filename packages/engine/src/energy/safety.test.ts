import { describe, expect, it } from 'vitest';

import {
  bmiOf,
  intakeTarget,
  maxLossRatePerWeekKg,
  nextTargetChange,
  proteinTargetG,
  tooFastLoss,
  validateWeightGoal,
  type WeightGoalInput,
} from '.';

/**
 * CLAUDE.md "Weight goal rules" – written before the implementation. None of these can be
 * switched off: the functions take no option that would relax them.
 */

const TODAY = '2026-10-26';
const adult: Omit<WeightGoalInput, 'kind'> = {
  sex: 'female',
  birthDate: '1991-03-14',
  heightCm: 168,
  trendWeightKg: 70,
  today: TODAY,
};

describe('max loss rate', () => {
  it('is 1 % of body weight per week', () => {
    expect(maxLossRatePerWeekKg(70)).toBe(0.7);
  });
  it('never more than 1.0 kg per week, however heavy', () => {
    expect(maxLossRatePerWeekKg(140)).toBe(1);
  });
});

describe('weight goal', () => {
  it('clamps a too fast loss to the max rate and says so', () => {
    const r = validateWeightGoal({
      ...adult,
      kind: 'lose',
      targetWeightKg: 62,
      ratePerWeekKg: 1.5,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.ratePerWeekKg).toBe(0.7);
    expect(r.value.reason).toBe('safety_clamp');
  });

  it('keeps a safe rate as the user chose it', () => {
    const r = validateWeightGoal({
      ...adult,
      kind: 'lose',
      targetWeightKg: 65,
      ratePerWeekKg: 0.4,
    });
    expect(r.ok && r.value).toMatchObject({ ratePerWeekKg: 0.4, reason: 'user' });
  });

  it('refuses a loss goal when the current BMI is below 18.5', () => {
    // 52 kg at 1.68 m → BMI 18.4
    const r = validateWeightGoal({
      ...adult,
      trendWeightKg: 52,
      kind: 'lose',
      targetWeightKg: 50,
      ratePerWeekKg: 0.3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContainEqual(expect.objectContaining({ code: 'bmiTooLow' }));
  });

  it('refuses a target weight that results in a BMI below 18.5', () => {
    // 51 kg at 1.68 m → BMI 18.1
    const r = validateWeightGoal({
      ...adult,
      kind: 'lose',
      targetWeightKg: 51,
      ratePerWeekKg: 0.3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toEqual([
      expect.objectContaining({ field: 'targetWeightKg', code: 'bmiTooLow' }),
    ]);
  });

  it('allows only "maintain" under 18', () => {
    const teen = { ...adult, birthDate: '2010-01-01' };
    for (const kind of ['lose', 'gain'] as const) {
      const r = validateWeightGoal({ ...teen, kind, targetWeightKg: 60, ratePerWeekKg: 0.2 });
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.issues).toContainEqual(expect.objectContaining({ code: 'underageWeightLoss' }));
    }
    expect(validateWeightGoal({ ...teen, kind: 'maintain' }).ok).toBe(true);
  });

  it('a loss target must be below the current trend weight', () => {
    const r = validateWeightGoal({
      ...adult,
      kind: 'lose',
      targetWeightKg: 72,
      ratePerWeekKg: 0.3,
    });
    expect(r.ok).toBe(false);
  });

  it('computes BMI from the trend weight', () => {
    expect(bmiOf(70, 168)).toBeCloseTo(24.8, 1);
  });
});

describe('intake target', () => {
  it('subtracts the deficit of the chosen rate (7,700 kcal per kg)', () => {
    // 0.5 kg/week → 550 kcal/day
    const t = intakeTarget({
      tdeeKcal: 2400,
      bmrKcal: 1450,
      sex: 'female',
      ratePerWeekKg: 0.5,
      kind: 'lose',
    });
    expect(t).toMatchObject({ intakeKcal: 1850, deficitKcal: 550, floorApplied: false });
  });

  it('never goes below max(BMR, 1,200 women / 1,500 men) – a warning instead', () => {
    const woman = intakeTarget({
      tdeeKcal: 1700,
      bmrKcal: 1150,
      sex: 'female',
      ratePerWeekKg: 0.7,
      kind: 'lose',
    });
    expect(woman.intakeKcal).toBe(1200);
    expect(woman.floorApplied).toBe(true);
    expect(woman.reason).toBe('safety_clamp');
    // The achievable rate is shown honestly, lower than asked.
    expect(woman.effectiveRatePerWeekKg).toBeCloseTo(0.45, 2);
    const man = intakeTarget({
      tdeeKcal: 2000,
      bmrKcal: 1700,
      sex: 'male',
      ratePerWeekKg: 1,
      kind: 'lose',
    });
    expect(man.intakeKcal).toBe(1700);
  });

  it('maintain is the TDEE; gain adds a surplus', () => {
    expect(
      intakeTarget({ tdeeKcal: 2300, bmrKcal: 1500, sex: 'male', kind: 'maintain' }).intakeKcal,
    ).toBe(2300);
    expect(
      intakeTarget({
        tdeeKcal: 2300,
        bmrKcal: 1500,
        sex: 'male',
        kind: 'gain',
        ratePerWeekKg: 0.25,
      }).intakeKcal,
    ).toBe(2575);
  });
});

describe('target changes', () => {
  it('stores every change with its reason, and nothing when nothing changed', () => {
    const first = nextTargetChange(null, { intakeKcal: 1850, reason: 'user' }, TODAY);
    expect(first).toEqual({ date: TODAY, intakeKcal: 1850, reason: 'user' });
    expect(nextTargetChange(first, { intakeKcal: 1850, reason: 'adaptive' }, TODAY)).toBeNull();
    expect(nextTargetChange(first, { intakeKcal: 1900, reason: 'adaptive' }, '2026-11-02')).toEqual(
      {
        date: '2026-11-02',
        intakeKcal: 1900,
        reason: 'adaptive',
      },
    );
  });
});

describe('too fast loss', () => {
  it('warns when the trend falls faster than the max rate over two weeks', () => {
    const trend = [
      { date: '2026-10-12', weightKg: 80, trendKg: 80, outlier: false },
      { date: '2026-10-26', weightKg: 77.5, trendKg: 77.6, outlier: false },
    ];
    expect(tooFastLoss(trend, TODAY)).toMatchObject({ warning: true });
    const slow = [
      { date: '2026-10-12', weightKg: 80, trendKg: 80, outlier: false },
      { date: '2026-10-26', weightKg: 79, trendKg: 79.2, outlier: false },
    ];
    expect(tooFastLoss(slow, TODAY)).toMatchObject({ warning: false });
    expect(tooFastLoss([], TODAY)).toMatchObject({ warning: false });
  });
});

describe('protein', () => {
  it('is 1.6–2.2 g/kg during weight loss', () => {
    expect(proteinTargetG(70, 'lose')).toEqual({ minG: 112, maxG: 154 });
    expect(proteinTargetG(70, 'maintain')).toBeNull();
  });
});
