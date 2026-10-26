import { describe, expect, it } from 'vitest';

import type { EnergyDay } from '../energy/balance';
import type { TrendPoint } from '../energy/trend';
import {
  bodyIndices,
  forecastLines,
  goalProgress,
  measurementTrends,
  scaleReasons,
  trainingWeek,
  trendChange,
  weeklyEnergyBars,
} from './dashboard';

const day = (d: string, intake: number | null, over: Partial<EnergyDay> = {}): EnergyDay => ({
  day: d,
  intakeKcal: intake,
  complete: intake !== null,
  restingKcal: 1600,
  activeKcal: 500,
  ...over,
});

const point = (date: string, trendKg: number): TrendPoint => ({
  date,
  weightKg: trendKg,
  trendKg,
  outlier: false,
});

describe('goalProgress', () => {
  it('is the share of the way from start to target, clamped to 0–100', () => {
    expect(goalProgress({ startKg: 80, targetKg: 70, currentKg: 77.5 })).toBe(25);
    expect(goalProgress({ startKg: 60, targetKg: 65, currentKg: 62 })).toBe(40);
    expect(goalProgress({ startKg: 80, targetKg: 70, currentKg: 81 })).toBe(0);
    expect(goalProgress({ startKg: 80, targetKg: 70, currentKg: 69 })).toBe(100);
    expect(goalProgress({ startKg: 70, targetKg: 70, currentKg: 69 })).toBeNull();
  });
});

describe('bodyIndices', () => {
  it('BMI, waist-to-height and waist-to-hip with the common references', () => {
    expect(
      bodyIndices({ sex: 'male', heightCm: 180, weightKg: 81, waistCm: 85, hipCm: 100 }),
    ).toEqual({
      bmi: 25,
      waistToHeight: 0.47,
      waistToHip: 0.85,
      aboveReference: { bmi: true, waistToHeight: false, waistToHip: false },
    });
    expect(
      bodyIndices({ sex: 'female', heightCm: 165, weightKg: 48, waistCm: 84, hipCm: 96 }),
    ).toEqual({
      bmi: 17.6,
      waistToHeight: 0.51,
      waistToHip: 0.88,
      aboveReference: { bmi: true, waistToHeight: true, waistToHip: true },
    });
  });

  it('leaves out what it cannot compute', () => {
    expect(
      bodyIndices({ sex: 'female', heightCm: 0, weightKg: null, waistCm: null, hipCm: null }),
    ).toEqual({
      bmi: null,
      waistToHeight: null,
      waistToHip: null,
      aboveReference: { bmi: false, waistToHeight: false, waistToHip: false },
    });
    expect(
      bodyIndices({ sex: 'male', heightCm: 0, weightKg: 70, waistCm: 80, hipCm: 0 }),
    ).toMatchObject({ bmi: null, waistToHeight: null, waistToHip: null });
  });
});

describe('weeklyEnergyBars', () => {
  it('averages per logged day, sums the balance, and keeps weeks without logs', () => {
    // 2026-10-26 is a Monday.
    const bars = weeklyEnergyBars(
      [
        day('2026-10-19', 1800),
        day('2026-10-20', 1600),
        day('2026-10-21', null, { restingKcal: 1700, activeKcal: 900 }),
        day('2026-10-26', null),
      ],
      '2026-10-27',
      3,
    );
    expect(bars.map((b) => b.week)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
    expect(bars[0]).toEqual({
      week: '2026-10-12',
      loggedDays: 0,
      restingKcal: 0,
      activeKcal: 0,
      intakeKcal: null,
      balanceKcal: null,
      fatKg: null,
    });
    expect(bars[1]).toEqual({
      week: '2026-10-19',
      loggedDays: 2,
      restingKcal: 1600,
      activeKcal: 500,
      intakeKcal: 1700,
      balanceKcal: -800,
      fatKg: -0.1,
    });
    // Without a log, resting and active still show (averaged over the days there are).
    expect(bars[2]).toMatchObject({ loggedDays: 0, restingKcal: 1600, intakeKcal: null });
  });

  it('defaults to eight weeks', () => {
    expect(weeklyEnergyBars([], '2026-10-26')).toHaveLength(8);
  });
});

describe('forecastLines', () => {
  it('weekly points at the planned rate and at the real pace, ending at the target', () => {
    const lines = forecastLines({
      kind: 'lose',
      fromKg: 80,
      today: '2026-10-26',
      targetKg: 78.6,
      plannedRatePerWeekKg: 0.5,
      realPaceKgPerWeek: 0.7,
    });
    expect(lines.planned).toEqual([
      { date: '2026-10-26', kg: 80 },
      { date: '2026-11-02', kg: 79.5 },
      { date: '2026-11-09', kg: 79 },
      { date: '2026-11-16', kg: 78.6 },
    ]);
    expect(lines.real).toEqual([
      { date: '2026-10-26', kg: 80 },
      { date: '2026-11-02', kg: 79.3 },
      { date: '2026-11-09', kg: 78.6 },
    ]);
  });

  it('gains upwards, caps the number of weeks, and has no line without a pace', () => {
    const lines = forecastLines({
      kind: 'gain',
      fromKg: 60,
      today: '2026-10-26',
      targetKg: 70,
      plannedRatePerWeekKg: 0.25,
      realPaceKgPerWeek: null,
      maxWeeks: 2,
    });
    expect(lines.planned.map((p) => p.kg)).toEqual([60, 60.3, 60.5]);
    expect(lines.real).toEqual([]);
    expect(
      forecastLines({
        kind: 'lose',
        fromKg: 60,
        today: '2026-10-26',
        targetKg: 55,
        plannedRatePerWeekKg: 0,
        realPaceKgPerWeek: -0.2,
      }),
    ).toEqual({ planned: [], real: [] });
  });

  it('has nothing to draw for maintain or without a target', () => {
    const base = {
      fromKg: 70,
      today: '2026-10-26',
      plannedRatePerWeekKg: 0.5,
      realPaceKgPerWeek: 0.5,
    };
    expect(forecastLines({ ...base, kind: 'maintain', targetKg: 70 })).toEqual({
      planned: [],
      real: [],
    });
    expect(forecastLines({ ...base, kind: 'lose', targetKg: null })).toEqual({
      planned: [],
      real: [],
    });
  });
});

describe('scaleReasons', () => {
  const ok = (deviationKg: number, confidence: 'low' | 'medium' | 'high' = 'medium') => ({
    status: 'ok' as const,
    weeks: [],
    expectedKg: -1,
    actualKg: -1 + deviationKg,
    deviationKg,
    confidence,
  });

  it('names the likely reasons by direction', () => {
    expect(scaleReasons({ status: 'notEnoughData' })).toEqual([]);
    expect(scaleReasons(ok(0.1))).toEqual(['matches']);
    expect(scaleReasons(ok(0.8))).toEqual(['underLogged', 'activeOverestimated', 'water']);
    expect(scaleReasons(ok(-0.6, 'low'))).toEqual([
      'water',
      'activeUnderestimated',
      'overLogged',
      'fewWeeks',
    ]);
  });
});

describe('measurementTrends', () => {
  it('first and latest value per field, in field order', () => {
    expect(
      measurementTrends([
        { day: '2026-10-19', values: { waist: 82, neck: 38 } },
        { day: '2026-09-28', values: { waist: 85, hip: 100 } },
        { day: '2026-10-26', values: { waist: 81.5, chest: 'x' as never } },
      ]),
    ).toEqual([
      {
        key: 'neck',
        startDay: '2026-10-19',
        startCm: 38,
        currentDay: '2026-10-19',
        currentCm: 38,
        changeCm: null,
      },
      {
        key: 'waist',
        startDay: '2026-09-28',
        startCm: 85,
        currentDay: '2026-10-26',
        currentCm: 81.5,
        changeCm: -3.5,
      },
      {
        key: 'hip',
        startDay: '2026-09-28',
        startCm: 100,
        currentDay: '2026-09-28',
        currentCm: 100,
        changeCm: null,
      },
    ]);
  });
});

describe('trainingWeek', () => {
  it('counts done and planned sessions by sport, skipped ones left out', () => {
    const week = trainingWeek([
      { sport: 'run', status: 'done', durationMin: 45 },
      { sport: 'run', status: 'planned', durationMin: 60 },
      { sport: 'bike', status: 'done', durationMin: 90.4 },
      { sport: 'strength', status: 'skipped', durationMin: 40 },
      { sport: 'brick', status: 'planned', durationMin: 70 },
    ]);
    expect(week.groups.run).toEqual({ done: 1, planned: 2 });
    expect(week.groups.bike).toEqual({ done: 1, planned: 1 });
    expect(week.groups.strength).toEqual({ done: 0, planned: 0 });
    expect(week.groups.other).toEqual({ done: 0, planned: 1 });
    expect(week).toMatchObject({ done: 2, planned: 4, minutesDone: 135 });
  });
});

describe('trendChange', () => {
  const trend = [point('2026-10-18', 80), point('2026-10-22', 79.6), point('2026-10-25', 79.3)];

  it('is the change between the trend values at both ends', () => {
    expect(trendChange(trend, '2026-10-18', '2026-10-25')).toBe(-0.7);
    expect(trendChange(trend, '2026-10-19', '2026-10-24')).toBe(-0.4);
  });

  it('is null without two different values close enough', () => {
    expect(trendChange(trend, '2026-10-10', '2026-10-25')).toBeNull();
    expect(trendChange(trend, '2026-10-25', '2026-10-26')).toBeNull();
    expect(trendChange(trend, '2026-10-18', '2026-11-20')).toBeNull();
  });
});
