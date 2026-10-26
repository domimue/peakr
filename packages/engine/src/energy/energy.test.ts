import { describe, expect, it } from 'vitest';

import {
  ageOn,
  countedWorkoutKcal,
  energyConfig,
  energyToday,
  estimateWorkoutKcal,
  intakeFloorKcal,
  restingEnergy,
  trendWeightKg,
  validateBodyProfile,
  weightTrend,
  type BodyProfile,
} from '.';

const TODAY = '2026-10-26';
const woman: BodyProfile = { sex: 'female', birthDate: '1991-03-14', heightCm: 168, weightKg: 61 };
const man: BodyProfile = { sex: 'male', birthDate: '1986-11-01', heightCm: 182, weightKg: 80 };

describe('ageOn', () => {
  it('counts full years and the birthday itself', () => {
    expect(ageOn('1991-03-14', TODAY)).toBe(35);
    expect(ageOn('1986-11-01', TODAY)).toBe(39);
    expect(ageOn('1986-10-26', TODAY)).toBe(40);
  });
});

describe('validateBodyProfile', () => {
  it('names every missing value, so the add-on can ask for exactly those', () => {
    const r = validateBodyProfile({ heightCm: 170 }, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.field).sort()).toEqual(['birthDate', 'sex', 'weightKg']);
  });

  it('rejects values out of range', () => {
    const r = validateBodyProfile({ ...woman, heightCm: 300, birthDate: '2020-01-01' }, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => [i.field, i.code])).toEqual([
      ['birthDate', 'outOfRange'],
      ['heightCm', 'outOfRange'],
    ]);
  });

  it('accepts a complete profile', () => {
    expect(validateBodyProfile(woman, TODAY)).toEqual({ ok: true, value: woman });
  });
});

describe('restingEnergy', () => {
  it('uses Mifflin-St Jeor without body fat', () => {
    // 10 × 61 + 6.25 × 168 − 5 × 35 − 161 = 1324
    expect(restingEnergy(woman, TODAY)).toEqual({ kcal: 1324, method: 'mifflin' });
    // 10 × 80 + 6.25 × 182 − 5 × 39 + 5 = 1747.5
    expect(restingEnergy(man, TODAY).kcal).toBe(1748);
  });

  it('uses Katch-McArdle with body fat', () => {
    // 370 + 21.6 × 80 × 0.8 = 1752.4
    expect(restingEnergy(man, TODAY, { day: '2026-10-20', value: 20 })).toEqual({
      kcal: 1752,
      method: 'katch',
    });
  });
});

describe('intake floor', () => {
  it('is max(BMR, 1,200 women / 1,500 men)', () => {
    expect(intakeFloorKcal('female', 1100)).toBe(1200);
    expect(intakeFloorKcal('male', 1400)).toBe(1500);
    expect(intakeFloorKcal('male', 1748)).toBe(1748);
  });
});

describe('workout energy', () => {
  it('estimates from MET, weight and duration', () => {
    // 8 MET × 61 kg × 50/60 h
    expect(estimateWorkoutKcal({ sport: 'run', intensity: 'easy', durationMin: 50 }, 61)).toBe(407);
    expect(estimateWorkoutKcal({ sport: 'bike', intensity: 'hard', durationMin: 0 }, 61)).toBe(0);
  });

  it('falls back to the default weight and uses the Gym estimate for strength', () => {
    expect(estimateWorkoutKcal({ sport: 'swim', intensity: 'moderate', durationMin: 60 })).toBe(
      8 * energyConfig.defaultBodyWeightKg,
    );
    expect(
      estimateWorkoutKcal(
        { sport: 'strength', intensity: 'moderate', durationMin: 60, rpe: 6 },
        80,
      ),
    ).toBe(400);
  });

  it('counts device-reported energy at the correction factor (0.8)', () => {
    expect(countedWorkoutKcal({ kcal: 600, source: 'device' })).toBe(480);
    expect(countedWorkoutKcal({ kcal: 600, source: 'estimate' })).toBe(600);
  });
});

describe('energyToday', () => {
  it('adds today’s workouts to the target and subtracts what was eaten', () => {
    const e = energyToday({
      profile: woman,
      today: TODAY,
      workouts: [{ kcal: 400, source: 'estimate' }],
      intakeKcal: 1200,
    });
    // base 1324 × 1.2 = 1589, + 400
    expect(e).toEqual({
      restingKcal: 1324,
      baseKcal: 1589,
      workoutKcal: 400,
      targetKcal: 1989,
      intakeKcal: 1200,
      remainingKcal: 789,
      floorApplied: false,
    });
  });

  it('never sets a target below the safety floor, whatever the deficit', () => {
    const e = energyToday({
      profile: woman,
      today: TODAY,
      workouts: [],
      intakeKcal: 1500,
      deficitKcal: 900,
    });
    expect(e.targetKcal).toBe(1324);
    expect(e.floorApplied).toBe(true);
    expect(e.remainingKcal).toBe(-176);
  });
});

describe('weight trend', () => {
  it('smooths weigh-ins and averages several on one day', () => {
    const points = weightTrend([
      { date: '2026-10-02', weightKg: 80.5 },
      { date: '2026-10-01', weightKg: 81 },
      { date: '2026-10-02', weightKg: 77.5 },
      { date: '2026-10-03', weightKg: 0 },
    ]);
    expect(points).toEqual([
      { date: '2026-10-01', weightKg: 81, trendKg: 81, outlier: false },
      { date: '2026-10-02', weightKg: 79, trendKg: 80.8, outlier: false },
    ]);
    expect(trendWeightKg([])).toBeNull();
    expect(trendWeightKg([{ date: '2026-10-01', weightKg: 70 }])).toBe(70);
  });
});
