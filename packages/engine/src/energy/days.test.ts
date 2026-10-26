import { describe, expect, it } from 'vitest';

import { energyDays, weighInsOf, type BodyProfile, type EnergyInputs } from '.';

const profile: BodyProfile = {
  sex: 'female',
  birthDate: '1991-03-14',
  heightCm: 168,
  weightKg: 61,
};
const empty: EnergyInputs = {
  profile,
  from: '2026-10-24',
  to: '2026-10-26',
  today: '2026-10-26',
  intake: [],
  restingKcal: [],
  activeKcal: [],
  workoutKcal: [],
  steps: [],
  weight: [],
  bodyFat: [],
  completed: [],
  planned: [],
  incompleteDays: [],
};

describe('energy days', () => {
  it('manual intake wins over the health store; the device resting energy over the formula', () => {
    const { days } = energyDays({
      ...empty,
      intake: [
        { day: '2026-10-24', source: 'healthConnect', value: 2500 },
        { day: '2026-10-24', source: 'manual', value: 1900 },
        { day: '2026-10-25', source: 'healthConnect', value: 2100 },
      ],
      restingKcal: [{ day: '2026-10-25', source: 'garmin', value: 1400 }],
      incompleteDays: ['2026-10-25'],
    });
    expect(days.map((d) => [d.day, d.intakeKcal, d.intakeSource, d.complete])).toEqual([
      ['2026-10-24', 1900, 'manual', true],
      ['2026-10-25', 2100, 'healthConnect', false],
      ['2026-10-26', null, null, false],
    ]);
    expect(days[0]?.restingSource).toBe('estimate');
    expect(days[1]).toMatchObject({ restingKcal: 1400, restingSource: 'garmin' });
  });

  it('uses the trend weight and a recent body fat for the formula', () => {
    const { days, trend } = energyDays({
      ...empty,
      weight: [
        { day: '2026-10-24', source: 'garmin', value: 70 },
        { day: '2026-10-24', source: 'manual', value: 71 },
      ],
      bodyFat: [{ day: '2026-10-24', source: 'manual', value: 30 }],
      completed: [{ day: '2026-10-25', workout: { sport: 'bike', durationMin: 60 } }],
      planned: [
        {
          day: '2026-10-26',
          workout: { sport: 'run', intensity: 'easy', durationMin: 30, status: 'planned' },
        },
      ],
      steps: [{ day: '2026-10-26', source: 'healthConnect', value: 5000 }],
      activeKcal: [{ day: '2026-10-24', source: 'garmin', value: 500 }],
    });
    expect(trend.map((t) => t.weightKg)).toEqual([71]);
    // Katch-McArdle with 71 kg and 30 %: 370 + 21.6 × 49.7
    expect(days[0]?.restingKcal).toBe(1444);
    expect(days.map((d) => d.active.workoutSource)).toEqual(['wearable', 'completed', 'planned']);
    expect(days[2]?.active.neatSource).toBe('steps');
  });

  it('turns sourced weights into one weigh-in per day', () => {
    expect(
      weighInsOf([
        { day: '2026-10-02', source: 'healthConnect', value: 70 },
        { day: '2026-10-01', source: 'manual', value: 71 },
      ]),
    ).toEqual([
      { date: '2026-10-01', weightKg: 71 },
      { date: '2026-10-02', weightKg: 70 },
    ]);
  });
});
