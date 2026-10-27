import { describe, expect, it } from 'vitest';

import { applyCurrentTraining, currentTrainingEstimate, currentWeeklyMinutes } from './current';
import { generatePlan } from './generate';
import type { UserProfile } from './types';

const athlete = (over: Partial<UserProfile> = {}): UserProfile => ({
  age: 35,
  experience: 'intermediate',
  sports: ['run', 'bike', 'swim'],
  terrain: 'flat',
  strength: { mode: 'none' },
  ...over,
});

describe('current training', () => {
  it('Peakr estimates a typical week per level, only for the selected sports', () => {
    expect(currentTrainingEstimate('beginner', ['run'])).toEqual({ runKmPerWeek: 10 });
    expect(currentTrainingEstimate('beginner', ['bike'])).toEqual({ bikeHoursPerWeek: 1.5 });
    expect(currentTrainingEstimate('advanced', ['run', 'bike', 'swim'])).toEqual({
      runKmPerWeek: 35,
      bikeHoursPerWeek: 5,
      swimMPerWeek: 5000,
    });
  });

  it('turns km, hours and metres into minutes – runs at the own easy pace', () => {
    // No pace known: 10 km/h runs, 2.5 km/h swims.
    expect(
      currentWeeklyMinutes(athlete(), {
        runKmPerWeek: 30,
        bikeHoursPerWeek: 2,
        swimMPerWeek: 2000,
      }),
    ).toEqual({ run: 180, bike: 120, swim: 48 });
    // Threshold 4:50 /km: easy runs slower than threshold, so 30 km take longer than at 4:50.
    const paced = currentWeeklyMinutes(athlete({ thresholdPaceSecPerKm: 290 }), {
      runKmPerWeek: 30,
    });
    expect(paced.run).toBeGreaterThan(145);
    // Sports not selected and zero values are left out.
    expect(
      currentWeeklyMinutes(athlete({ sports: ['run'] }), { runKmPerWeek: 0, bikeHoursPerWeek: 3 }),
    ).toEqual({});
  });

  it('the entry is the start: week 1 holds it, nothing entered changes nothing', () => {
    const profile = applyCurrentTraining(athlete({ sports: ['run'] }), { runKmPerWeek: 30 });
    expect(profile.baseline).toEqual({ weeklyMin: { run: 180 }, startLoad: 360 });
    expect(applyCurrentTraining(athlete(), {})).toEqual(athlete());
    const r = generatePlan(
      profile,
      { kind: 'fitness' },
      { minutesPerDay: [60, 60, 60, 60, 60, 120, 90], doublesAllowed: false },
      '2026-11-02',
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const runMin = (r.value.weeks[0]?.workouts ?? []).reduce((s, w) => s + w.durationMin, 0);
    expect(runMin).toBeGreaterThanOrEqual(171);
  });

  it('keeps what a calibration or the last plan already knows, the entry wins per sport', () => {
    const profile = applyCurrentTraining(
      athlete({ baseline: { weeklyMin: { run: 100, bike: 90 }, longMin: { run: 70 } } }),
      { runKmPerWeek: 30 },
    );
    expect(profile.baseline?.weeklyMin).toEqual({ run: 180, bike: 90 });
    expect(profile.baseline?.longMin).toEqual({ run: 70 });
  });
});
