import { describe, expect, it } from 'vitest';

import {
  completedWorkoutKcal,
  customRate,
  detectPlateau,
  energyBasis,
  goalForecast,
  goalSnapshot,
  trainingDeviation,
  goalTargets,
  proteinForGoal,
  reverseDiet,
  targetReached,
  trainingInteraction,
  weeklyCheckIn,
  weekLoadContext,
  type ActiveEnergy,
  type EnergyDay,
  type TrendPoint,
} from '.';
import { macroTargets } from '../nutrition';

const TODAY = '2026-10-26';
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** A trend moving `kgPerWeek` over the last `days` days, ending today at `endKg`. */
const trend = (days: number, kgPerWeek: number, endKg = 80): TrendPoint[] =>
  Array.from({ length: days + 1 }, (_, i) => {
    const kg = endKg + (kgPerWeek * (days - i)) / 7;
    return {
      date: addDays(TODAY, i - days),
      weightKg: kg,
      trendKg: Math.round(kg * 100) / 100,
      outlier: false,
    };
  });

const male = { sex: 'male' as const, bmrKcal: 1750, weightKg: 85 };

describe('custom rate', () => {
  it('snaps to 0.05 kg steps and never to zero', () => {
    expect(customRate(0.33)).toBe(0.35);
    expect(customRate(0.31)).toBe(0.3);
    expect(customRate(0)).toBe(0.05);
  });
});

describe('daily target', () => {
  it('fixed: maintenance without sport + planned training per day − rate × 7,700 / 7', () => {
    const t = goalTargets({
      ...male,
      kind: 'lose',
      ratePerWeekKg: 0.5,
      nonExerciseTdeeKcal: 2400,
      plannedDailyKcal: 400,
    });
    expect(t).toMatchObject({ deficitKcal: 550, dailyKcal: 2250, baseKcal: 1850, reason: 'user' });
  });

  it('a surplus for gaining', () => {
    const t = goalTargets({
      ...male,
      kind: 'gain',
      ratePerWeekKg: 0.25,
      nonExerciseTdeeKcal: 2400,
      plannedDailyKcal: 400,
    });
    expect(t).toMatchObject({ deficitKcal: -275, dailyKcal: 3075, baseKcal: 2675 });
  });

  it('never clamps silently: below the floor it says so and proposes the fastest safe rate', () => {
    // No plan: non-exercise 2,400 kcal, floor 1,750 (BMR): 0.85 kg/week (−935/day) gives 1,465.
    const t = goalTargets({ ...male, kind: 'lose', ratePerWeekKg: 1, nonExerciseTdeeKcal: 2400 });
    expect(t).toMatchObject({
      status: 'belowFloor',
      // 1 kg is above the max rate for 85 kg (0.85); (2,400 − 1,750) / 1,100 = 0.59 → 0.55.
      requestedRatePerWeekKg: 0.85,
      proposedRatePerWeekKg: 0.55,
      ratePerWeekKg: 0.55,
      floorApplied: true,
      reason: 'safety_clamp',
    });
    expect(t.dailyKcal).toBeGreaterThanOrEqual(t.floorKcal);
  });

  it('planned sport counts: the floor is checked on the day with the training in it', () => {
    // 2,400 + 400 planned − 935 = 1,865 ≥ 1,750: the max rate is fine.
    const t = goalTargets({
      ...male,
      kind: 'lose',
      ratePerWeekKg: 0.85,
      nonExerciseTdeeKcal: 2400,
      plannedDailyKcal: 400,
    });
    expect(t).toMatchObject({ status: 'ok', ratePerWeekKg: 0.85, dailyKcal: 1865 });
  });

  it('a very small maintenance is lifted to the floor', () => {
    const t = goalTargets({
      ...male,
      kind: 'maintain',
      ratePerWeekKg: 0,
      nonExerciseTdeeKcal: 1600,
    });
    expect(t).toMatchObject({ dailyKcal: 1750, deficitKcal: -150 });
  });
});

describe('protein', () => {
  it('1.9 g/kg by default, configurable within 1.6–2.2', () => {
    expect(proteinForGoal({ weightKg: 80 })).toEqual({ gPerKg: 1.9, grams: 152 });
    expect(proteinForGoal({ weightKg: 80, gPerKg: 1.8 })).toEqual({ gPerKg: 1.8, grams: 144 });
    expect(proteinForGoal({ weightKg: 80, gPerKg: 3 })).toEqual({ gPerKg: 2.2, grams: 176 });
    expect(proteinForGoal({ weightKg: 80, gPerKg: 1 }).gPerKg).toBe(1.6);
  });
});

describe('forecast', () => {
  it('shows the date of the chosen rate and the date at the real pace of the trend', () => {
    const f = goalForecast({
      kind: 'lose',
      startKg: 80,
      targetKg: 75,
      ratePerWeekKg: 0.5,
      trend: trend(21, 0.25),
      today: TODAY,
    });
    expect(f.plannedDate).toBe(addDays(TODAY, 70));
    expect(f.realPaceKgPerWeek).toBeCloseTo(0.25, 2);
    expect(f.realDate).toBe(addDays(TODAY, 140));
  });

  it('no real pace with less than two weeks of trend, or when it goes the wrong way', () => {
    expect(
      goalForecast({
        kind: 'lose',
        startKg: 80,
        targetKg: 75,
        ratePerWeekKg: 0.5,
        trend: trend(10, 0.5),
        today: TODAY,
      }).realDate,
    ).toBeNull();
    expect(
      goalForecast({
        kind: 'lose',
        startKg: 80,
        targetKg: 75,
        ratePerWeekKg: 0.5,
        trend: trend(21, -0.2),
        today: TODAY,
      }).realDate,
    ).toBeNull();
  });
});

describe('weekly check-in', () => {
  const base = { kind: 'lose' as const, plannedRatePerWeekKg: 0.5, today: TODAY };
  it('on track within the tolerance', () => {
    expect(weeklyCheckIn({ ...base, trend: trend(14, 0.48) })).toMatchObject({
      status: 'onTrack',
      adjustmentKcal: 0,
    });
  });
  it('too fast → eat more, at most +150 kcal/day', () => {
    expect(weeklyCheckIn({ ...base, trend: trend(14, 1.0) })).toMatchObject({
      status: 'tooFast',
      adjustmentKcal: 150,
    });
  });
  it('too slow → eat less, at most −150 kcal/day', () => {
    const r = weeklyCheckIn({ ...base, trend: trend(14, 0.4) });
    expect(r.status).toBe('tooSlow');
    expect(r.adjustmentKcal).toBe(-110);
  });
  it('needs at least a week of trend', () => {
    expect(weeklyCheckIn({ ...base, trend: trend(3, 0.5) }).status).toBe('notEnoughData');
  });
  it('gaining: too slow means a little more food', () => {
    expect(
      weeklyCheckIn({
        kind: 'gain',
        plannedRatePerWeekKg: 0.25,
        today: TODAY,
        trend: trend(14, 0),
      }),
    ).toMatchObject({
      status: 'tooSlow',
      adjustmentKcal: 150,
    });
  });
});

describe('plateau', () => {
  const days = (n: number, intake: number): EnergyDay[] =>
    Array.from({ length: n }, (_, i) => ({
      day: addDays(TODAY, i - n),
      intakeKcal: intake,
      complete: true,
      restingKcal: 1700,
      activeKcal: 700,
    }));

  it('flat trend for 21 days despite a logged deficit → check logging or take a diet break', () => {
    const r = detectPlateau({ trend: trend(24, 0.02), days: days(24, 1900), today: TODAY });
    expect(r).toMatchObject({ plateau: true, suggestions: ['checkLogging', 'dietBreak'] });
    expect(r.dietBreakWeeks).toEqual([1, 2]);
  });

  it('no plateau while the trend moves, without a deficit, or with too little logging', () => {
    expect(
      detectPlateau({ trend: trend(24, 0.4), days: days(24, 1900), today: TODAY }).plateau,
    ).toBe(false);
    expect(
      detectPlateau({ trend: trend(24, 0.02), days: days(24, 2400), today: TODAY }).plateau,
    ).toBe(false);
    expect(
      detectPlateau({ trend: trend(24, 0.02), days: days(5, 1900), today: TODAY }).plateau,
    ).toBe(false);
    expect(detectPlateau({ trend: trend(10, 0), days: days(24, 1900), today: TODAY }).plateau).toBe(
      false,
    );
  });
});

describe('target reached', () => {
  it('is reached when the trend crosses the target', () => {
    expect(targetReached({ kind: 'lose', targetKg: 75, trendKg: 74.9 })).toBe(true);
    expect(targetReached({ kind: 'lose', targetKg: 75, trendKg: 75.4 })).toBe(false);
    expect(targetReached({ kind: 'gain', targetKg: 75, trendKg: 75 })).toBe(true);
    expect(targetReached({ kind: 'maintain', targetKg: 75, trendKg: 70 })).toBe(false);
  });

  it('reverse diet: +100 kcal per week up to maintenance', () => {
    expect(reverseDiet({ currentKcal: 2000, maintenanceKcal: 2350, today: TODAY })).toEqual([
      { from: TODAY, intakeKcal: 2100 },
      { from: addDays(TODAY, 7), intakeKcal: 2200 },
      { from: addDays(TODAY, 14), intakeKcal: 2300 },
      { from: addDays(TODAY, 21), intakeKcal: 2350 },
    ]);
    expect(reverseDiet({ currentKcal: 2400, maintenanceKcal: 2350, today: TODAY })).toEqual([]);
  });
});

describe('training interaction', () => {
  it('suggests a smaller deficit in heavy, race and taper weeks', () => {
    expect(
      trainingInteraction({
        deficitKcal: 700,
        weekLoad: 900,
        typicalWeekLoad: 600,
        raceWeek: false,
        taper: false,
        keyDays: [],
      }),
    ).toMatchObject({
      suggestedDeficitKcal: 350,
      reason: 'highLoad',
    });
    expect(
      trainingInteraction({
        deficitKcal: 500,
        weekLoad: 300,
        typicalWeekLoad: 600,
        raceWeek: true,
        taper: false,
        keyDays: [],
      }).reason,
    ).toBe('raceWeek');
    expect(
      trainingInteraction({
        deficitKcal: 500,
        weekLoad: 400,
        typicalWeekLoad: 600,
        raceWeek: false,
        taper: true,
        keyDays: [],
      }).reason,
    ).toBe('taper');
    expect(
      trainingInteraction({
        deficitKcal: 200,
        weekLoad: 900,
        typicalWeekLoad: 600,
        raceWeek: false,
        taper: false,
        keyDays: [],
      }).suggestedDeficitKcal,
    ).toBeNull();
  });

  it('warns about a large deficit on key workout days', () => {
    const r = trainingInteraction({
      deficitKcal: 600,
      weekLoad: 600,
      typicalWeekLoad: 600,
      raceWeek: false,
      taper: false,
      keyDays: ['2026-10-28', '2026-11-01'],
    });
    expect(r).toMatchObject({
      suggestedDeficitKcal: null,
      keyDayWarnings: ['2026-10-28', '2026-11-01'],
    });
    expect(
      trainingInteraction({
        deficitKcal: 300,
        weekLoad: 600,
        typicalWeekLoad: 600,
        raceWeek: false,
        taper: false,
        keyDays: ['2026-10-28'],
      }).keyDayWarnings,
    ).toEqual([]);
  });
});

describe('goal edges', () => {
  it('maintain has no rate, no deficit and no dates', () => {
    const t = goalTargets({
      ...male,
      kind: 'maintain',
      ratePerWeekKg: 0.5,
      nonExerciseTdeeKcal: 2400,
      plannedDailyKcal: 400,
    });
    expect(t).toMatchObject({
      ratePerWeekKg: 0,
      deficitKcal: 0,
      dailyKcal: 2800,
      reason: 'user',
    });
    expect(
      goalForecast({
        kind: 'maintain',
        startKg: 80,
        targetKg: 80,
        ratePerWeekKg: 0,
        trend: [],
        today: TODAY,
      }),
    ).toEqual({
      plannedDate: null,
      realPaceKgPerWeek: null,
      realDate: null,
    });
  });

  it('gaining forecast and a gain that runs too fast', () => {
    const up = trend(21, -0.5);
    const f = goalForecast({
      kind: 'gain',
      startKg: 80,
      targetKg: 82,
      ratePerWeekKg: 0,
      trend: up,
      today: TODAY,
    });
    expect(f).toMatchObject({
      plannedDate: null,
      realPaceKgPerWeek: 0.5,
      realDate: addDays(TODAY, 28),
    });
    expect(
      weeklyCheckIn({ kind: 'gain', plannedRatePerWeekKg: 0.25, today: TODAY, trend: up }),
    ).toMatchObject({
      status: 'tooFast',
      adjustmentKcal: -150,
    });
  });
});

describe('helpers for the app', () => {
  it('week load against the median week', () => {
    const weeks = [
      { startDate: '2026-10-12', load: 400 },
      { startDate: '2026-10-19', load: 600 },
      { startDate: '2026-10-26', load: 900 },
    ];
    expect(weekLoadContext(weeks, '2026-10-26')).toEqual({ weekLoad: 900, typicalWeekLoad: 600 });
    expect(weekLoadContext(weeks.slice(0, 2), '2026-10-26')).toEqual({
      weekLoad: 0,
      typicalWeekLoad: 500,
    });
    expect(weekLoadContext([], TODAY)).toEqual({ weekLoad: 0, typicalWeekLoad: 0 });
  });

  it('workout energy to eat back', () => {
    const active = (over: Partial<ActiveEnergy>): ActiveEnergy => ({
      kcal: 800,
      workoutKcal: 500,
      neatKcal: 300,
      workoutSource: 'completed',
      neatSource: 'steps',
      ...over,
    });
    expect(completedWorkoutKcal(active({}), 1500)).toBe(500);
    expect(completedWorkoutKcal(active({ workoutSource: 'planned' }), 1500)).toBe(0);
    expect(completedWorkoutKcal(active({ workoutSource: 'wearable', workoutKcal: 0 }), 1500)).toBe(
      500,
    );
    expect(completedWorkoutKcal(active({ workoutSource: 'wearable', kcal: 100 }), 1500)).toBe(0);
  });
});

describe('energy basis and snapshot', () => {
  const day = (
    d: string,
    over: Partial<{ restingKcal: number; activeKcal: number; neat: number }> = {},
  ) => ({
    day: d,
    restingKcal: over.restingKcal ?? 1700,
    activeKcal: over.activeKcal ?? 900,
    active: {
      kcal: over.activeKcal ?? 900,
      workoutKcal: (over.activeKcal ?? 900) - (over.neat ?? 400),
      neatKcal: over.neat ?? 400,
      workoutSource: 'completed' as const,
      neatSource: 'steps' as const,
    },
  });

  it('formula from the last 14 days, adaptive once there is an estimate', () => {
    const days = [
      day('2026-10-24'),
      day('2026-10-25', { activeKcal: 500, neat: 500 }),
      day(TODAY, { activeKcal: 3000 }),
    ];
    const formula = energyBasis({
      days,
      today: TODAY,
      adaptive: { status: 'notEnoughData', usedDays: 2, neededDays: 14 },
    });
    // Resting 1,700 × the desk-job factor 1.3: the base does not follow steps or wearables.
    expect(formula).toEqual({
      tdeeKcal: 2400,
      nonExerciseKcal: 2210,
      restingKcal: 1700,
      bmrKcal: 1700,
      everydayFactor: 1.3,
      everydaySource: 'factor',
      wearableDays: 0,
      source: 'formula',
    });
    expect(
      energyBasis({
        days,
        today: TODAY,
        adaptive: { status: 'notEnoughData', usedDays: 2, neededDays: 14 },
        everydayActivity: 'onFeet',
      }),
    ).toMatchObject({ nonExerciseKcal: 2720, tdeeKcal: 2720, everydayFactor: 1.6 });
    const adaptive = energyBasis({
      days,
      today: TODAY,
      adaptive: {
        status: 'ok',
        estimate: {
          date: TODAY,
          tdeeKcal: 2600,
          rawKcal: 2600,
          formulaKcal: 2400,
          correctionKcal: 200,
          clamped: false,
          basis: {
            from: '',
            to: '',
            intakeDays: 14,
            excludedDays: 0,
            avgIntakeKcal: 0,
            trendStartKg: 0,
            trendEndKg: 0,
            spanDays: 14,
          },
        },
      },
    });
    expect(adaptive).toEqual({
      tdeeKcal: 2600,
      nonExerciseKcal: 2410,
      restingKcal: 1700,
      bmrKcal: 1700,
      everydayFactor: 1.3,
      everydaySource: 'factor',
      wearableDays: 0,
      source: 'adaptive',
    });
    expect(
      energyBasis({
        days: [day(TODAY)],
        today: TODAY,
        adaptive: { status: 'notEnoughData', usedDays: 0, neededDays: 14 },
      })?.source,
    ).toBe('formula');
    expect(
      energyBasis({
        days: [],
        today: TODAY,
        adaptive: { status: 'notEnoughData', usedDays: 0, neededDays: 14 },
      }),
    ).toBeNull();
  });

  it('with a wearable: a day without sport is what the watch measured on such days', () => {
    const watch = (d: string, activeKcal: number) => ({
      ...day(d, { restingKcal: 2520, activeKcal }),
      active: {
        kcal: activeKcal,
        workoutKcal: 0,
        neatKcal: 0,
        workoutSource: 'wearable' as const,
        neatSource: 'wearable' as const,
      },
    });
    const days = [
      watch('2026-10-20', 100),
      watch('2026-10-21', 900),
      watch('2026-10-22', 120),
      watch('2026-10-23', 140),
      day('2026-10-24'),
      watch(TODAY, 50),
    ];
    const basis = energyBasis({
      days,
      today: TODAY,
      adaptive: { status: 'notEnoughData', usedDays: 2, neededDays: 14 },
      everydayActivity: 'desk',
      trainingDays: ['2026-10-21'],
      formulaBmrKcal: 2050,
    });
    // Mean of the three watch days without training: 2,520 + 120 × 0.5 / 0.75 = 2,600 – not
    // 2,520 × 1.3. The floor uses the formula BMR.
    expect(basis).toMatchObject({
      nonExerciseKcal: 2600,
      everydaySource: 'wearable',
      wearableDays: 3,
      bmrKcal: 2050,
    });
    // Too few watch days: the factor again.
    expect(
      energyBasis({
        days: days.slice(3),
        today: TODAY,
        adaptive: { status: 'notEnoughData', usedDays: 2, neededDays: 14 },
      }),
    ).toMatchObject({ everydaySource: 'factor', wearableDays: 0 });
  });

  const basis = {
    tdeeKcal: 2800,
    nonExerciseKcal: 2400,
    restingKcal: 1750,
    bmrKcal: 1750,
    everydayFactor: 1.37,
    everydaySource: 'factor' as const,
    wearableDays: 0,
    source: 'formula' as const,
  };
  const week = { weekLoad: 600, typicalWeekLoad: 600, raceWeek: false, taper: false, keyDays: [] };
  const goal = {
    kind: 'lose' as const,
    targetWeightKg: 75,
    ratePerWeekKg: 0.5,
    adjustmentKcal: 0,
  };

  it('the same target every day: the planned training ÷ 7 is in it; the breakdown adds up', () => {
    const s = goalSnapshot({
      goal: { ...goal, adjustmentKcal: 100 },
      basis,
      sex: 'male',
      trendKg: 80,
      plannedWeekKcal: [600, 0, 0, 0, 0, 0, 0],
      actualWeekKcalSoFar: 1200,
      weekdayIndex: 0,
      trend: trend(21, 0.5),
      days: [],
      today: TODAY,
      week,
    });
    // 2,400 + 600 × 0.5 / 7 − 550 + 100 = 1,993 every day (training at 50 %).
    expect(s.todayKcal).toBe(1993);
    expect(s.weekly).toEqual({ totalKcal: 7 * 1993, days: Array(7).fill(1993) });
    expect(s.targets.baseKcal).toBe(1950);
    expect(s.addedBackKcal).toBe(43);
    expect(s.breakdown).toEqual({
      restingKcal: 1750,
      everydayKcal: 650,
      trainingKcal: 43,
      deficitKcal: 450,
      totalKcal: 1993,
    });
    // Twice the planned training so far: a hint, the target stays.
    expect(s.deviation).toEqual({ hint: 'more', differenceKcal: 600 });
    expect(s.forecast.plannedDate).toBe(addDays(TODAY, 70));
    expect(s.checkIn?.status).toBe('onTrack');
    expect(s.reached).toBe(false);
    const noActual = goalSnapshot({
      ...{ goal, basis, sex: 'male' as const, trendKg: 80 },
      plannedWeekKcal: [0, 0, 0, 0, 0, 0, 0],
      weekdayIndex: 0,
      trend: [],
      days: [],
      today: TODAY,
      week,
      proteinGPerKg: 2,
    });
    expect(noActual.deviation.hint).toBeNull();
    expect(noActual.targets.protein).toEqual({ gPerKg: 2, grams: 160 });
  });

  it('a training deviation needs ±25 % and at least 200 kcal', () => {
    expect(trainingDeviation({ plannedSoFarKcal: 1000, actualSoFarKcal: 600 })).toEqual({
      hint: 'less',
      differenceKcal: -400,
    });
    expect(trainingDeviation({ plannedSoFarKcal: 1000, actualSoFarKcal: 1200 }).hint).toBeNull();
    expect(trainingDeviation({ plannedSoFarKcal: 100, actualSoFarKcal: 250 }).hint).toBeNull();
  });

  it('the rate is checked on the lowest planned week; target reached gives the reverse diet; maintain has no check-in', () => {
    // This week 1,500 kcal of training (107/day at 50 %), the next weeks as low as 35/day: 0.85 kg
    // would need 2,400 + 35 − 935 = 1,500 < 1,750 – so the rate is checked on the low week.
    const low = goalSnapshot({
      goal: { ...goal, ratePerWeekKg: 0.85 },
      basis,
      sex: 'male',
      trendKg: 85,
      plannedWeekKcal: [600, 0, 0, 0, 0, 900, 0],
      ratePlannedDailyKcal: 70,
      weekdayIndex: 5,
      trend: [],
      days: [],
      today: TODAY,
      week,
    });
    expect(low.targets).toMatchObject({ status: 'belowFloor', proposedRatePerWeekKg: 0.6 });
    // This week's own training is in the target on top: 2,400 + 107 − 660.
    expect(low.todayKcal).toBe(1847);
    const reached = goalSnapshot({
      goal: { ...goal, targetWeightKg: 81 },
      basis,
      sex: 'male',
      trendKg: 80,
      plannedWeekKcal: [0, 0, 0, 0, 0, 0, 0],
      weekdayIndex: 0,
      trend: [],
      days: [],
      today: TODAY,
      week,
    });
    expect(reached.reached).toBe(true);
    expect(reached.reverseDiet.at(-1)?.intakeKcal).toBe(2800);
    const maintain = goalSnapshot({
      goal: { ...goal, kind: 'maintain', targetWeightKg: null },
      basis,
      sex: 'male',
      trendKg: 80,
      plannedWeekKcal: [0, 0, 0, 0, 0, 0, 0],
      weekdayIndex: 0,
      trend: [],
      days: [],
      today: TODAY,
      week,
    });
    expect(maintain.checkIn).toBeNull();
    expect(maintain.plateau.plateau).toBe(false);
  });
});

describe('reported case: 80 kg athlete, 0.75 kg per week', () => {
  // Mifflin-St Jeor, man, 80 kg, 180 cm, 35 years: 800 + 1,125 − 175 + 5 = 1,755 kcal.
  const bmr = 1755;
  const days = (factorKey: string) =>
    energyBasis({
      days: [{ day: '2026-10-25', restingKcal: bmr, activeKcal: 600 }],
      today: TODAY,
      adaptive: { status: 'notEnoughData', usedDays: 1, neededDays: 14 },
      everydayActivity: factorKey,
    }) as NonNullable<ReturnType<typeof energyBasis>>;
  // Zone 2 runs and a long ride: ~3,200 kcal of planned training this week.
  const planned = [450, 0, 500, 0, 450, 1300, 500];
  const snap = (factorKey: string, rate: number) =>
    goalSnapshot({
      goal: { kind: 'lose', targetWeightKg: 74, ratePerWeekKg: rate, adjustmentKcal: 0 },
      basis: days(factorKey),
      sex: 'male',
      trendKg: 80,
      plannedWeekKcal: planned,
      weekdayIndex: 5,
      trend: [],
      days: [],
      today: TODAY,
      week: { weekLoad: 0, typicalWeekLoad: 0, raceWeek: false, taper: false, keyDays: [] },
    });

  it('the planned training counts for the floor at 50 %: it raises the safe pace', () => {
    // Desk job: 1,755 × 1.3 = 2,282 without sport, + 3,200 × 0.5 / 7 = 229 planned per day = 2,511.
    // 0.75 kg/week (−825/day) would be 1,686 < the floor (BMR 1,755): 0.65 kg/week instead of 0.45.
    const desk = snap('desk', 0.75);
    expect(desk.targets).toMatchObject({ status: 'belowFloor', ratePerWeekKg: 0.65 });
    expect(desk.todayKcal).toBe(1796);
    expect(desk.weekly.days.every((d) => d === 1796)).toBe(true);
  });

  it('macros are the same every day', () => {
    const desk = snap('desk', 0.75);
    const day = macroTargets({ kcal: desk.todayKcal, weightKg: 80 });
    expect([day.proteinG, day.fatG]).toEqual([152, 72]);
    expect(day.carbsG).toBeGreaterThan(100);
  });
});
