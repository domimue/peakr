import { describe, expect, it } from 'vitest';

import { classifyDays, isHardEndurance, isHardOnItsOwn } from './classify';
import { monthOf, parseIsoDate, toIsoDate, weekdayOf } from './dates';
import {
  clampLevel,
  deloadSets,
  levelAfterPause,
  nextLevel,
  progressStrength,
  recoveryWeekLevel,
  resumeWeightKg,
  startLevel,
} from './levels';
import {
  exercises,
  getExercise,
  getTemplate,
  raceSimulationLevel,
  splits,
  workoutLibrary,
} from './library';
import { css, cssZone, pyramid } from './library/helpers';
import {
  climbMultiplier,
  flattenSteps,
  hardShare,
  stepLoad,
  strengthLoad,
  totalDurationSec,
} from './load';
import { buildSkeleton, isRaceGoal, recoveryEvery, weekTargetLoad } from './periodisation';
import type { Workout } from './types';

describe('dates', () => {
  it('parses real ISO dates only', () => {
    expect(parseIsoDate('1970-01-02')).toBe(1);
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026-2-3')).toBeNull();
    expect(parseIsoDate('tomorrow')).toBeNull();
  });

  it('round-trips and knows weekdays and months', () => {
    const day = parseIsoDate('2026-10-19') as number; // a Monday
    expect(toIsoDate(day)).toBe('2026-10-19');
    expect(weekdayOf(day)).toBe(0);
    expect(weekdayOf(day + 6)).toBe(6);
    expect(weekdayOf(-1)).toBe(2); // 1969-12-31 was a Wednesday
    expect(monthOf(day)).toBe(10);
  });
});

describe('load model', () => {
  it('weights minutes by zone and sport (CLAUDE.md "Unified load")', () => {
    expect(stepLoad({ durationSec: 600, zone: 2, target: css(0) }, 'run')).toBe(20);
    expect(stepLoad({ durationSec: 600, zone: 4, target: css(0) }, 'bike')).toBe(30);
    expect(stepLoad({ durationSec: 600, zone: 2, target: css(0) }, 'swim')).toBeCloseTo(14);
    // Brick steps use the factor of their own discipline.
    expect(stepLoad({ durationSec: 600, zone: 2, target: css(0), sport: 'bike' }, 'brick')).toBe(
      15,
    );
    expect(stepLoad({ distanceM: 100, zone: 2, target: css(0) }, 'swim')).toBe(0);
  });

  it('strength = duration × RPE / 2', () => {
    expect(strengthLoad(40, 8)).toBe(160);
  });

  it('adds load for climbing on run and bike only', () => {
    expect(climbMultiplier('run', 20)).toBeCloseTo(1.12);
    expect(climbMultiplier('bike', 10)).toBeCloseTo(1.04);
    expect(climbMultiplier('swim', 20)).toBe(1);
  });

  it('expands repeats and sums durations', () => {
    const steps = flattenSteps(
      [{ durationSec: 60, zone: 2, target: css(0) }],
      [{ repeat: 3, steps: [{ durationSec: 30, zone: 5, target: css(0) }] }],
      [{ zone: 1, target: css(0) }],
    );
    expect(steps).toHaveLength(5);
    expect(totalDurationSec(steps)).toBe(150);
  });

  it('measures the Z3+ share of endurance time and ignores strength', () => {
    const w = (sport: Workout['sport'], zone: 2 | 4, sec: number) =>
      ({
        sport,
        warmup: [],
        main: [{ repeat: 1, steps: [{ durationSec: sec, zone, target: css(0) }] }],
        cooldown: [],
      }) as unknown as Workout;
    expect(hardShare([])).toBe(0);
    expect(hardShare([w('run', 2, 300), w('run', 4, 100), w('strength', 4, 1000)])).toBe(0.25);
    expect(
      hardShare([
        w('run', 2, 0),
        { ...w('run', 2, 0), main: [{ repeat: 1, steps: [{ zone: 4, target: css(0) }] }] },
      ]),
    ).toBe(0);
  });
});

describe('workout library', () => {
  it('has unique ids, ordered levels, valid zones and ranges', () => {
    const ids = workoutLibrary.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of workoutLibrary) {
      t.levels.forEach((l, i) => expect(l.level, t.id).toBe(i + 1));
      for (const l of t.levels) {
        for (const s of flattenSteps(l.warmup, l.main, l.cooldown)) {
          expect([1, 2, 3, 4, 5]).toContain(s.zone);
          expect(s.durationSec !== undefined || s.distanceM !== undefined, t.id).toBe(true);
        }
      }
      if (t.durationScaled)
        expect(t.durationScaled.minMin).toBeLessThanOrEqual(t.durationScaled.maxMin);
      expect(t.levels.length > 0 || t.durationScaled !== undefined, t.id).toBe(true);
      expect(t.whyKey).toMatch(/^why\./);
    }
  });

  it('contains every template family of WORKOUTS.md with all levels', () => {
    const levelsOf = (id: string) => getTemplate(id).levels.length;
    expect(levelsOf('run.tempo')).toBe(8);
    expect(levelsOf('run.vo2_intervals')).toBe(8);
    expect(levelsOf('run.fartlek')).toBe(6);
    expect(levelsOf('bike.sweetspot')).toBe(7);
    expect(levelsOf('bike.threshold')).toBe(7);
    expect(levelsOf('swim.css')).toBe(7);
    expect(levelsOf('swim.technique')).toBe(4);
    expect(levelsOf('brick')).toBe(5);
    expect(levelsOf('xcski.intervals')).toBe(4);
    for (const id of [
      'bench.run_5k',
      'bench.run_30min',
      'bench.swim_css',
      'bench.bike_ftp20',
      'snowshoe.easy',
      'skitour.ascent',
    ]) {
      expect(getTemplate(id).id).toBe(id);
    }
    expect(() => getTemplate('run.unknown')).toThrow(/unknown workout template/);
  });

  it('strength templates only use library exercises; splits only existing sessions', () => {
    for (const t of workoutLibrary.filter((x) => x.strength)) {
      for (const e of t.strength?.exercises ?? [])
        expect(getExercise(e.exerciseId), e.exerciseId).toBeDefined();
    }
    for (const split of Object.values(splits)) {
      for (const id of [...split.rotation, ...Object.values(split.reduced ?? {}).flat()]) {
        expect(getTemplate(`strength.${id}`).sport).toBe('strength');
      }
    }
    expect(exercises.length).toBeGreaterThan(60);
    expect(getExercise('nope')).toBeUndefined();
  });

  it('builds the brick race simulation from the race durations', () => {
    const sim = raceSimulationLevel('tri_70_3');
    expect(sim.main[0]?.steps.map((s) => s.durationSec)).toEqual([600, 6600]); // 120 min bike
    expect(sim.main[1]?.steps[0]?.durationSec).toBe(3000); // 40 % of 120 min, rounded to 5 min
    expect(raceSimulationLevel('half')).toEqual(raceSimulationLevel('tri_olympic'));
  });

  it('maps CSS offsets to zones and builds pyramids', () => {
    expect([15, 5, 0, -5].map(cssZone)).toEqual([2, 3, 4, 5]);
    expect(pyramid([1, 2, 1], 4)[0]?.steps).toHaveLength(5);
  });
});

describe('levels (WORKOUTS.md §10)', () => {
  const tempo = getTemplate('run.tempo');

  it('starts by experience and stays inside template and phase limits', () => {
    expect(startLevel('beginner', tempo)).toBe(1);
    expect(startLevel('intermediate', tempo)).toBe(3);
    expect(startLevel('advanced', getTemplate('swim.technique'))).toBe(4);
    expect(clampLevel(tempo, 6, 'base')).toBe(3);
    expect(clampLevel(tempo, 9, 'build')).toBe(8);
    expect(clampLevel(tempo, 0, 'build')).toBe(1);
  });

  it('+1 when targets are met, hold when missed, −1 after two misses', () => {
    expect(nextLevel(3, 'targetsMet', 8)).toBe(4);
    expect(nextLevel(8, 'targetsMet', 8)).toBe(8);
    expect(nextLevel(3, 'targetsMissed', 8)).toBe(3);
    expect(nextLevel(3, 'missedTwice', 8)).toBe(2);
    expect(nextLevel(1, 'missedTwice', 8)).toBe(1);
  });

  it('drops levels for recovery weeks and pauses', () => {
    expect(recoveryWeekLevel(1)).toBe(1);
    expect(recoveryWeekLevel(4)).toBe(3);
    expect(levelAfterPause(5, 5)).toBe(4);
    expect(levelAfterPause(5, 14)).toBe(3);
    expect(levelAfterPause(5, 30)).toBe(2);
    expect(levelAfterPause(2, 30)).toBe(1);
  });

  it('double progression for strength (§8.5)', () => {
    const base = { weightKg: 100, repRange: { min: 8, max: 12 }, sessionRpe: 8, lowerBody: true };
    expect(progressStrength({ ...base, repsPerSet: [12, 12, 12] })).toEqual({
      weightKg: 105,
      targetReps: 8,
    });
    expect(progressStrength({ ...base, lowerBody: false, repsPerSet: [12, 12] })).toEqual({
      weightKg: 102.5,
      targetReps: 8,
    });
    expect(progressStrength({ ...base, sessionRpe: 9, repsPerSet: [12, 12] })).toEqual({
      weightKg: 100,
      targetReps: 12,
    });
    expect(progressStrength({ ...base, repsPerSet: [10, 9, 8] })).toEqual({
      weightKg: 100,
      targetReps: 9,
    });
    expect(progressStrength({ ...base, repsPerSet: [] })).toEqual({ weightKg: 100, targetReps: 8 });
    expect(deloadSets(4)).toBe(2);
    expect(deloadSets(1)).toBe(1);
    expect(resumeWeightKg(100)).toBe(85);
  });
});

describe('classification (WORKOUTS.md §11)', () => {
  const base = {
    sport: 'run',
    type: 'easy',
    intensity: 'easy',
    durationMin: 45,
    legLoad: 'none',
    terrain: null,
  } as const;

  it('knows what is hard on its own', () => {
    expect(isHardOnItsOwn(base)).toBe(false);
    expect(isHardOnItsOwn({ ...base, intensity: 'hard' })).toBe(true);
    expect(isHardOnItsOwn({ ...base, sport: 'brick' })).toBe(true);
    expect(isHardOnItsOwn({ ...base, type: 'long', durationMin: 90 })).toBe(true);
    expect(isHardOnItsOwn({ ...base, type: 'long', durationMin: 85 })).toBe(false);
    expect(isHardOnItsOwn({ ...base, sport: 'bike', type: 'long', durationMin: 180 })).toBe(true);
    expect(isHardOnItsOwn({ ...base, sport: 'bike', type: 'long', durationMin: 170 })).toBe(false);
    const hilly = { gainPerKm: 25, distanceKm: 8, expectedGainM: 200, eccentric: false };
    expect(isHardOnItsOwn({ ...base, terrain: hilly })).toBe(true);
    expect(isHardOnItsOwn({ ...base, terrain: { ...hilly, gainPerKm: 10 } })).toBe(false);
    expect(isHardOnItsOwn({ ...base, sport: 'swim', terrain: hilly })).toBe(false);
    expect(
      isHardOnItsOwn({ ...base, sport: 'strength', intensity: 'hard', legLoad: 'light' }),
    ).toBe(false);
    expect(isHardOnItsOwn({ ...base, sport: 'strength', legLoad: 'heavy' })).toBe(true);
    expect(isHardEndurance({ sport: 'strength', hard: true })).toBe(false);
    expect(isHardEndurance({ sport: 'run', hard: true })).toBe(true);
  });

  it('moderate sessions next to a hard day are hard for beginners only', () => {
    const w = (intensity: string) => ({ ...base, intensity, hard: false }) as unknown as Workout;
    const days = [[w('hard')], [w('moderate')], [], [w('moderate')]];
    expect(classifyDays(days, 'beginner').map((d) => d.map((x) => x.hard))).toEqual([
      [true],
      [true],
      [],
      [false],
    ]);
    expect(classifyDays(days, 'advanced').map((d) => d.map((x) => x.hard))).toEqual([
      [true],
      [false],
      [],
      [false],
    ]);
  });
});

describe('periodisation', () => {
  it('race goals: base → build → peak → taper with recovery weeks', () => {
    const weeks = buildSkeleton(16, 'marathon', 35);
    const phases = weeks.map((w) => w.phase);
    expect(phases.slice(-2)).toEqual(['taper', 'taper']);
    expect(phases.indexOf('build')).toBeLessThan(phases.indexOf('peak'));
    expect(weeks.filter((w) => w.isRecovery).map((w) => w.index)).toEqual([3, 7, 11]);
    expect(weeks[14]?.taperIndex).toBe(0);
  });

  it('never puts a recovery week right before the taper; age ≥ 50 recovers every 3rd week', () => {
    const weeks = buildSkeleton(9, '10k', 55);
    expect(weeks.filter((w) => w.isRecovery).map((w) => w.index)).toEqual([2, 5]);
    expect(recoveryEvery(49)).toBe(4);
    expect(
      buildSkeleton(9, '10k', 30)
        .filter((w) => w.isRecovery)
        .map((w) => w.index),
    ).toEqual([3]);
  });

  it('handles very short race plans', () => {
    expect(buildSkeleton(1, 'half', 30).map((w) => w.phase)).toEqual(['base']);
    expect(buildSkeleton(2, 'half', 30).map((w) => w.phase)).toEqual(['base', 'taper']);
    expect(buildSkeleton(3, 'half', 30).map((w) => w.phase)).toEqual(['base', 'build', 'taper']);
  });

  it('non-race goals loop base/build blocks', () => {
    const weeks = buildSkeleton(12, 'fitness', 30);
    expect(weeks.map((w) => w.phase[1]).join('')).toBe('aaaauuuuaaaa');
    expect(weeks.filter((w) => w.isRecovery).map((w) => w.index)).toEqual([3, 7, 11]);
    expect(isRaceGoal('fitness')).toBe(false);
    expect(isRaceGoal('tri_full')).toBe(true);
  });

  it('targets grow by ~7 %, drop to ~70 % in recovery weeks and step down in the taper', () => {
    const [load, rec, taper0, taper5] = [
      { index: 1, phase: 'base', isRecovery: false, taperIndex: null },
      { index: 3, phase: 'base', isRecovery: true, taperIndex: null },
      { index: 9, phase: 'taper', isRecovery: false, taperIndex: 0 },
      { index: 9, phase: 'taper', isRecovery: false, taperIndex: 5 },
    ] as const;
    expect(weekTargetLoad(load, null, 300)).toBe(300);
    expect(weekTargetLoad(load, 400, 300)).toBeCloseTo(428);
    expect(weekTargetLoad(rec, 400, 300)).toBeCloseTo(280);
    expect(weekTargetLoad(rec, null, 300)).toBeCloseTo(210);
    expect(weekTargetLoad(taper0, 400, 300)).toBeCloseTo(240);
    expect(weekTargetLoad(taper5, 400, 300)).toBeCloseTo(140);
  });
});
