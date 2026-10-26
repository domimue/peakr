import { describe, expect, it } from 'vitest';

import type { EnergyDay } from '../energy/balance';
import type { TrendPoint } from '../energy/trend';
import { weeklyCoach, type CoachInput } from './coach';

// Today is Tuesday 2026-10-27; the coach looks back on Mon 2026-10-19 … Sun 2026-10-25.
const TODAY = '2026-10-27';
const WEEK = ['19', '20', '21', '22', '23', '24', '25'].map((d) => `2026-10-${d}`);

const day = (d: string, intake: number | null): EnergyDay => ({
  day: d,
  intakeKcal: intake,
  complete: intake !== null,
  restingKcal: 1600,
  activeKcal: 600,
});

const point = (date: string, trendKg: number): TrendPoint => ({
  date,
  weightKg: trendKg,
  trendKg,
  outlier: false,
});

const training = (over: Partial<CoachInput['training']> = {}) => ({
  lastWeek: { done: 4, planned: 4, strengthDone: 2, load: 300, typicalLoad: 300 },
  nextWeek: { done: 0, planned: 4, strengthDone: 0, load: 300, typicalLoad: 300 },
  ...over,
});

function input(over: Partial<CoachInput> = {}): CoachInput {
  return {
    today: TODAY,
    goal: { kind: 'lose', startKg: 82, targetKg: 76 },
    trendKg: 80.5,
    trend: [
      point('2026-10-18', 81),
      point('2026-10-20', 80.8),
      point('2026-10-22', 80.7),
      point('2026-10-25', 80.5),
    ],
    days: WEEK.map((d) => day(d, 1700)),
    incompleteDays: [],
    proteinByDay: WEEK.map((d) => ({ day: d, proteinG: 140 })),
    proteinTargetG: 150,
    checkIn: { status: 'onTrack', actualRatePerWeekKg: 0.5, adjustmentKcal: 0 },
    plateau: false,
    tooFastLoss: false,
    training: training(),
    ...over,
  };
}

describe('weeklyCoach', () => {
  it('a good week: numbers, what went well, nothing to change', () => {
    const s = weeklyCoach(input());
    expect(s.week).toBe('2026-10-19');
    expect(s.progressPct).toBe(25);
    expect(s.lastWeek).toEqual({
      trendChangeKg: -0.5,
      avgIntakeKcal: 1700,
      avgBalanceKcal: -500,
      fatKg: -0.45,
      loggedDays: 7,
      weighInDays: 3,
      sessionsDone: 4,
      sessionsPlanned: 4,
    });
    expect(s.wentWell).toEqual([
      { key: 'logging', days: 7 },
      { key: 'onPace', rate: 0.5 },
      { key: 'protein', grams: 140, target: 150 },
      { key: 'training', done: 4, planned: 4 },
      { key: 'strength', sessions: 2 },
    ]);
    expect(s.watch).toEqual([]);
    expect(s.adjustments).toEqual([]);
    expect(s.hints).toEqual([]);
  });

  it('a patchy week: logging first, then protein and strength – three at most', () => {
    const s = weeklyCoach(
      input({
        days: WEEK.map((d, i) => day(d, i < 3 ? 1700 : null)),
        proteinByDay: WEEK.slice(0, 3).map((d) => ({ day: d, proteinG: 100 })),
        checkIn: { status: 'tooSlow', actualRatePerWeekKg: 0.1, adjustmentKcal: -150 },
        training: training({
          lastWeek: { done: 2, planned: 4, strengthDone: 0, load: 200, typicalLoad: 300 },
        }),
        incompleteDays: ['2026-10-21'],
      }),
    );
    expect(s.wentWell).toEqual([]);
    expect(s.watch).toEqual([
      { key: 'fewLogs', days: 3 },
      { key: 'proteinLow', grams: 100, target: 150 },
      { key: 'slowPace', rate: 0.1 },
      { key: 'missedSessions', done: 2, planned: 4 },
    ]);
    expect(s.adjustments).toEqual([
      { kind: 'logging', days: 5 },
      { kind: 'kcal', kcal: -150, reason: 'checkIn' },
      { kind: 'protein', grams: 150 },
    ]);
    expect(s.hints).toEqual(['incompleteData']);
  });

  it('too-fast loss: eat more, and say so gently; plateau hint passes through', () => {
    const s = weeklyCoach(
      input({
        tooFastLoss: true,
        plateau: true,
        checkIn: { status: 'tooFast', actualRatePerWeekKg: 1.3, adjustmentKcal: 100 },
      }),
    );
    expect(s.watch).toContainEqual({ key: 'fastPace', rate: 1.3 });
    expect(s.wentWell.map((p) => p.key)).not.toContain('onPace');
    expect(s.adjustments[0]).toEqual({ kind: 'kcal', kcal: 150, reason: 'tooFast' });
    expect(s.hints).toEqual(['plateau', 'tooFastLoss']);
    // Without a check-in result the too-fast rule still holds.
    const t = weeklyCoach(input({ tooFastLoss: true, checkIn: null }));
    expect(t.watch).toContainEqual({ key: 'fastPace', rate: null });
    expect(t.adjustments[0]).toEqual({ kind: 'kcal', kcal: 150, reason: 'tooFast' });
  });

  it('a hard training week ahead while losing: a little more food', () => {
    const s = weeklyCoach(
      input({
        training: training({
          nextWeek: { done: 0, planned: 6, strengthDone: 0, load: 400, typicalLoad: 300 },
        }),
      }),
    );
    expect(s.watch).toEqual([{ key: 'hardWeekAhead', share: 133 }]);
    expect(s.adjustments).toEqual([{ kind: 'kcal', kcal: 100, reason: 'hardWeek' }]);
  });

  it('five logged days: one more reminder to log, without the "few logs" warning', () => {
    const s = weeklyCoach(input({ days: WEEK.map((d, i) => day(d, i < 5 ? 1700 : null)) }));
    expect(s.watch).toEqual([]);
    expect(s.adjustments).toEqual([]);
    const four = weeklyCoach(input({ days: WEEK.map((d, i) => day(d, i < 4 ? 1700 : null)) }));
    expect(four.adjustments).toEqual([{ kind: 'logging', days: 5 }]);
  });

  it('maintain: stable trend is good news, no progress bar, no strength push', () => {
    const s = weeklyCoach(
      input({
        goal: { kind: 'maintain', startKg: 80, targetKg: null },
        checkIn: null,
        training: training({
          lastWeek: { done: 3, planned: 4, strengthDone: 0, load: 300, typicalLoad: 300 },
          nextWeek: { done: 0, planned: 4, strengthDone: 0, load: 500, typicalLoad: 300 },
        }),
      }),
    );
    expect(s.progressPct).toBeNull();
    expect(s.wentWell.map((p) => p.key)).toEqual(['logging', 'protein']);
    expect(s.wentWell).not.toContainEqual({ key: 'stable' });
    const flat = weeklyCoach(
      input({
        goal: { kind: 'maintain', startKg: 80, targetKg: null },
        checkIn: null,
        trend: [point('2026-10-18', 80), point('2026-10-25', 80.2)],
      }),
    );
    expect(flat.wentWell).toContainEqual({ key: 'stable' });
    expect(flat.hints).toEqual(['incompleteData']);
    expect(s.adjustments).toEqual([]);
  });

  it('without goal, plan, protein target or any data', () => {
    const s = weeklyCoach(
      input({
        goal: null,
        trendKg: null,
        trend: [],
        days: [],
        proteinByDay: [],
        proteinTargetG: null,
        checkIn: null,
        training: null,
      }),
    );
    expect(s.progressPct).toBeNull();
    expect(s.lastWeek).toEqual({
      trendChangeKg: null,
      avgIntakeKcal: null,
      avgBalanceKcal: null,
      fatKg: null,
      loggedDays: 0,
      weighInDays: 0,
      sessionsDone: null,
      sessionsPlanned: null,
    });
    expect(s.watch).toEqual([{ key: 'fewLogs', days: 0 }]);
    expect(s.adjustments).toEqual([{ kind: 'logging', days: 5 }]);
    expect(s.hints).toEqual(['incompleteData']);
  });

  it('a goal without a target weight or trend has no progress bar; gaining gets strength', () => {
    expect(
      weeklyCoach(input({ goal: { kind: 'lose', startKg: 80, targetKg: null } })).progressPct,
    ).toBeNull();
    expect(weeklyCoach(input({ trendKg: null })).progressPct).toBeNull();
    const gain = weeklyCoach(
      input({
        goal: { kind: 'gain', startKg: 60, targetKg: 64 },
        trendKg: 61,
        checkIn: { status: 'onTrack', actualRatePerWeekKg: null, adjustmentKcal: 0 },
        training: training({
          lastWeek: { done: 0, planned: 0, strengthDone: 1, load: 0, typicalLoad: 0 },
          nextWeek: { done: 0, planned: 0, strengthDone: 0, load: 100, typicalLoad: 0 },
        }),
      }),
    );
    expect(gain.progressPct).toBe(25);
    expect(gain.wentWell.map((p) => p.key)).toEqual(['logging', 'protein']);
    expect(gain.adjustments).toEqual([{ kind: 'strength', sessions: 2 }]);
  });

  it('tooSlow without a rate is not reported as slow pace', () => {
    const s = weeklyCoach(
      input({ checkIn: { status: 'tooSlow', actualRatePerWeekKg: null, adjustmentKcal: 0 } }),
    );
    expect(s.watch).toEqual([]);
  });
});
