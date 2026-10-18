import { describe, expect, it } from 'vitest';

import {
  composeWeek,
  goalFamily,
  requiredSports,
  sportShares,
  type CompositionContext,
} from './composition';
import { getTemplate } from './library';
import { flattenSteps } from './load';
import {
  adaptBlockToPool,
  athleteFor,
  materialize,
  materializeStrength,
  runPaceSecPerKm,
} from './materialize';
import { planStrengthWeek, routineSession, strengthPriority } from './strength-plan';
import {
  elevationAt,
  estimateBikeDurationSec,
  estimateRunDurationSec,
  gradeAdjustedPaceFactor,
  minettiCost,
  perKmPacePlan,
  planSessionTerrain,
  routeSegments,
} from './terrain';
import type { GoalKind, Phase, Routine, UserProfile, WorkoutTemplate } from './types';
import { winterVariantFor } from './winter';

const profile: UserProfile = {
  age: 35,
  experience: 'intermediate',
  sports: ['run'],
  terrain: 'rolling',
  strength: { mode: 'none' },
};

describe('terrain intelligence', () => {
  it('uses the Minetti cost of running on gradients', () => {
    expect(minettiCost(0)).toBeCloseTo(3.6);
    expect(minettiCost(0.1)).toBeCloseTo(5.968, 3);
    expect(minettiCost(1)).toBe(minettiCost(0.45));
    expect(gradeAdjustedPaceFactor(0)).toBe(1);
    expect(gradeAdjustedPaceFactor(0.05)).toBeGreaterThan(1.2);
  });

  it('caps downhill pace at ~5 % faster than flat', () => {
    expect(gradeAdjustedPaceFactor(-0.1)).toBe(0.95);
    expect(gradeAdjustedPaceFactor(-0.01)).toBeLessThan(1);
  });

  it('interpolates the elevation profile', () => {
    const pts = [
      { distanceM: 0, elevationM: 100 },
      { distanceM: 1000, elevationM: 150 },
      { distanceM: 1000, elevationM: 150 },
    ];
    expect(elevationAt([], 10)).toBe(0);
    expect(elevationAt(pts, 500)).toBe(125);
    expect(elevationAt(pts, 0)).toBe(100);
    expect(elevationAt(pts, 5000)).toBe(150);
  });

  it('splits routes into 1 km segments and steep kilometres into 250 m', () => {
    const route = [
      { distanceM: 0, elevationM: 0 },
      { distanceM: 1000, elevationM: 20 }, // 2 %
      { distanceM: 2000, elevationM: 120 }, // 10 % → 4 × 250 m
      { distanceM: 2500, elevationM: 110 },
    ];
    const segments = routeSegments(route);
    expect(segments.map((s) => s.endM - s.startM)).toEqual([1000, 250, 250, 250, 250, 500]);
    expect(segments[0]?.gradient).toBeCloseTo(0.02);
    expect(routeSegments([])).toEqual([]);

    const plan = perKmPacePlan(route, 300, true);
    expect(plan[0]?.targetSecPerKm).toBeGreaterThan(300);
    expect(plan.at(-1)?.targetSecPerKm).toBe(285); // downhill cap
    expect(plan[0]?.fastestSecPerKm).toBeLessThan(plan[0]?.slowestSecPerKm as number);
    expect(plan.every((s) => s.pacePrimary)).toBe(true);
  });

  it('estimates run (grade-adjusted) and bike durations', () => {
    const flat = [
      { distanceM: 0, elevationM: 0 },
      { distanceM: 10000, elevationM: 0 },
    ];
    expect(estimateRunDurationSec(flat, 300)).toBeCloseTo(3000);
    expect(estimateBikeDurationSec(30, 300, 30)).toBe(3600 + 1800);
  });

  it('plans the hilliness of sessions from the home terrain', () => {
    const t = (id: string) => getTemplate(id);
    const mountain = { ...profile, terrain: 'mountainous' as const };
    expect(planSessionTerrain(t('swim.aerobic'), 'easy', 40, profile, 390)).toBeNull();
    expect(planSessionTerrain(t('run.vo2_intervals'), 'key', 60, mountain, 390)?.gainPerKm).toBe(2);
    expect(planSessionTerrain(t('run.long'), 'long', 90, mountain, 390)).toMatchObject({
      gainPerKm: 35,
      eccentric: true,
    });
    expect(planSessionTerrain(t('run.long'), 'long', 50, mountain, 390)?.eccentric).toBe(false);
    expect(planSessionTerrain(t('run.easy'), 'easy', 60, mountain, 390)?.gainPerKm).toBe(12);
    expect(planSessionTerrain(t('run.hills_short'), 'key', 50, mountain, 390)?.gainPerKm).toBe(35);
    const bike = planSessionTerrain(
      t('bike.long'),
      'long',
      120,
      { ...profile, terrain: 'hilly' },
      390,
    );
    expect(bike).toMatchObject({ gainPerKm: 12, eccentric: false });
    expect(bike?.distanceKm).toBeGreaterThan(30);
  });
});

describe('materialize', () => {
  const athlete = athleteFor(profile, 'half');

  it('uses defaults for paces and pools', () => {
    expect(athlete).toMatchObject({ thresholdPaceSecPerKm: 315, cssPacePer100mSec: 120, pool: 25 });
    expect(runPaceSecPerKm(athlete, 'I')).toBeCloseTo(289.8);
    expect(runPaceSecPerKm(athlete, 'unknown')).toBe(315);
  });

  it('converts distance reps to time via pace and fills warm-up/cool-down', () => {
    const m = materialize(getTemplate('run.vo2_intervals'), 1, 0, 'key', athlete);
    const rep = m.main[0]?.steps[0];
    expect(rep).toMatchObject({ distanceM: 400, durationSec: Math.round(0.4 * 315 * 0.92) });
    expect(m.durationMin).toBe(15 + 10 + Math.round((6 * (116 + 90)) / 60));
    expect(m.target).toEqual({ kind: 'paceZone', value: 'I' });
    expect(m.terrain?.gainPerKm).toBe(2);
  });

  it('scales duration-only sessions and fills levelled ones before the main set', () => {
    const easy = materialize(getTemplate('run.easy'), null, 200, 'easy', athlete);
    expect(easy.durationMin).toBe(75); // template maximum
    expect(materialize(getTemplate('run.easy'), null, 10, 'easy', athlete).durationMin).toBe(25);
    expect(materialize(getTemplate('run.easy'), null, 10, 'easy', athlete, 20).durationMin).toBe(
      20,
    );
    const strides = materialize(getTemplate('run.easy_strides'), 2, 45, 'easy', athlete);
    expect(strides.durationMin).toBe(45);
    expect(strides.warmup[0]?.zone).toBe(2);
    expect(strides.target).toEqual({ kind: 'paceZone', value: 'R' });
    // Fixed part longer than requested: no fill.
    const race = materialize(getTemplate('run.race_pace_m'), 6, 60, 'long', athlete);
    expect(race.warmup).toEqual([]);
  });

  it('adapts swim sets to the pool and converts open water to time', () => {
    const block = {
      repeat: 12,
      steps: [
        { distanceM: 25, zone: 2 as const, target: { kind: 'cssOffset' as const, value: '+15' } },
      ],
    };
    expect(adaptBlockToPool(block, 25)).toEqual(block);
    expect(adaptBlockToPool(block, 50)).toMatchObject({ repeat: 6, steps: [{ distanceM: 50 }] });
    expect(adaptBlockToPool({ ...block, repeat: 1 }, 50).repeat).toBe(1);

    const pool50 = athleteFor({ ...profile, poolLength: 50 }, 'swim');
    const technique = materialize(getTemplate('swim.technique'), 1, 0, 'technique', pool50);
    expect(technique.main[0]).toMatchObject({ repeat: 6 });
    expect(technique.warmup[0]?.distanceM).toBe(100);

    const ow = athleteFor({ ...profile, poolLength: 'openwater', cssPacePer100mSec: 100 }, 'swim');
    const css = materialize(getTemplate('swim.css'), 2, 0, 'key', ow);
    const rep = css.main[0]?.steps[0];
    expect(rep?.distanceM).toBeUndefined();
    expect(rep?.durationSec).toBe(100);
    const speed = materialize(getTemplate('swim.speed'), 1, 0, 'quality', athlete);
    expect(speed.main[0]?.steps[0]?.durationSec).toBe(Math.round(0.25 * (120 - 8)));
  });

  it('leads with power when the user has a power meter', () => {
    const hrOnly = materialize(getTemplate('bike.threshold'), 1, 0, 'key', athlete);
    expect(hrOnly.target.kind).toBe('hrZone');
    const withPower = athleteFor({ ...profile, hasPowerMeter: true }, 'granfondo');
    const m = materialize(getTemplate('bike.threshold'), 1, 0, 'key', withPower);
    expect(m.target).toEqual({ kind: 'powerZone', value: '95–105 % FTP' });
    expect(m.main[0]?.steps[0]?.hint?.kind).toBe('hrZone');
  });

  it('builds the brick race simulation for the goal', () => {
    const tri = athleteFor({ ...profile, sports: ['swim', 'bike', 'run'] }, 'tri_sprint');
    const sim = materialize(getTemplate('brick'), 5, 0, 'brick', tri);
    expect(sim.durationMin).toBe(30 + 10);
    expect(flattenSteps(sim.warmup, sim.main, sim.cooldown).map((s) => s.sport)).toEqual([
      'bike',
      'bike',
      'run',
    ]);
  });

  it('scales strength volume by phase (§8.3)', () => {
    const def = getTemplate('strength.peakr_build_gym').strength as NonNullable<
      WorkoutTemplate['strength']
    >;
    const full = materializeStrength(def, 'heavy', 1, 1, 1);
    expect(full).toMatchObject({ durationMin: 50, legLoad: 'heavy', load: 200 });
    const peak = materializeStrength(def, 'heavy', 0.4, 1, 1);
    expect(peak.legLoad).toBe('light');
    expect(peak.exercises.find((e) => e.exerciseId === 'back_squat')?.sets).toBe(2);
    const taper = materializeStrength(def, 'heavy', 0, 0.3, 0.8);
    expect(taper.legLoad).toBe('none');
    expect(taper.exercises.map((e) => e.exerciseId)).toEqual(['overhead_press', 'pull_up']);
    expect(taper.durationMin).toBe(20);
    const custom = materializeStrength(
      { rpe: 7, durationMin: 30, exercises: [{ exerciseId: 'custom:x', sets: 3, reps: '10' }] },
      'light',
      1,
      0,
      1,
    );
    expect(custom.exercises).toHaveLength(1);
  });
});

describe('composition (WORKOUTS.md §9)', () => {
  const ctx = (
    goal: GoalKind,
    phase: Phase,
    extra: Partial<CompositionContext> = {},
    p: Partial<UserProfile> = {},
  ) => ({
    goal,
    profile: { ...profile, ...p },
    phase,
    weekIndex: 5,
    isRecovery: false,
    raceWeek: false,
    trainingDays: 6,
    cssAllowed: true,
    benchmark: false,
    buildWeekIndex: 0,
    ...extra,
  });
  const ids = (c: CompositionContext) => composeWeek(c, true).map((s) => s.templateId);

  it('maps goals to families and required sports', () => {
    expect(goalFamily('marathon')).toBe('run');
    expect(goalFamily('weightloss')).toBe('fitness');
    expect(requiredSports('tri_70_3')).toEqual(['swim', 'bike', 'run']);
    expect(requiredSports('duathlon')).toEqual(['bike', 'run']);
    expect(requiredSports('granfondo')).toEqual(['bike']);
    expect(requiredSports('fitness')).toEqual([]);
  });

  it('splits time by goal and weakest discipline', () => {
    const tri = { ...profile, sports: ['swim', 'bike', 'run'] as UserProfile['sports'] };
    expect(sportShares('tri_olympic', tri)).toEqual({ swim: 0.2, bike: 0.45, run: 0.35 });
    const weakSwim = sportShares('tri_olympic', { ...tri, weakestSport: 'swim' });
    expect(weakSwim.swim).toBeCloseTo(0.25);
    expect(weakSwim.bike).toBeCloseTo(0.4);
    expect(sportShares('tri_olympic', { ...tri, weakestSport: 'bike' }).bike).toBe(0.45);
    expect(sportShares('half', { ...profile, sports: ['run', 'bike'] })).toEqual({
      run: 0.75,
      bike: 0.25,
      swim: 0,
    });
    expect(sportShares('half', { ...profile, weakestSport: 'swim' })).toEqual({
      run: 1,
      bike: 0,
      swim: 0,
    });
    expect(sportShares('fitness', { ...profile, sports: ['run', 'swim'] })).toEqual({
      run: 0.5,
      bike: 0,
      swim: 0.5,
    });
    expect(
      sportShares('duathlon', { ...profile, sports: ['run', 'bike', 'swim'] }).swim,
    ).toBeCloseTo(0.25);
  });

  it('running goals follow the phase tables', () => {
    expect(ids(ctx('10k', 'base', { weekIndex: 0 }))).toEqual([
      'run.long',
      'run.fartlek',
      'run.easy',
      'run.easy',
    ]);
    expect(ids(ctx('10k', 'base', { weekIndex: 1 }, { terrain: 'flat' }))[1]).toBe('run.fartlek');
    expect(ids(ctx('10k', 'base', { weekIndex: 1 }))[1]).toBe('run.hills_short');
    expect(ids(ctx('10k', 'build', { trainingDays: 3 }))).toEqual([
      'run.long',
      'run.hills_long',
      'run.easy',
    ]);
    expect(ids(ctx('10k', 'build', { weekIndex: 4 }))).toEqual([
      'run.long',
      'run.tempo',
      'run.easy',
      'run.easy_strides',
    ]);
    expect(ids(ctx('10k', 'build', {}, { experience: 'advanced' }))).toEqual([
      'run.long',
      'run.hills_long',
      'run.vo2_intervals',
      'run.easy_strides',
      'run.easy',
    ]);
    expect(
      ids(
        ctx('marathon', 'build', { weekIndex: 2 }, { experience: 'advanced', terrain: 'hilly' }),
      )[2],
    ).toBe('run.progression');
    expect(
      ids(ctx('10k', 'build', { weekIndex: 4 }, { experience: 'advanced', terrain: 'hilly' }))[2],
    ).toBe('run.vo2_intervals_time');
    expect(ids(ctx('10k', 'build', { weekIndex: 2 }, { experience: 'advanced' }))[2]).toBe(
      'run.tempo',
    );
    expect(ids(ctx('half', 'peak', { trainingDays: 3 }))[0]).toBe('run.race_pace_hm');
    expect(ids(ctx('5k', 'peak', { trainingDays: 3 }))[0]).toBe('run.long');
    expect(ids(ctx('marathon', 'peak'))).toEqual([
      'run.long',
      'run.tempo',
      'run.race_pace_m',
      'run.easy',
    ]);
    expect(ids(ctx('5k', 'peak'))[2]).toBe('run.vo2_intervals');
    expect(ids(ctx('half', 'taper'))).toEqual([
      'run.long',
      'run.tempo',
      'run.easy_strides',
      'run.easy',
    ]);
    expect(ids(ctx('10k', 'taper', { raceWeek: true }))).toEqual([
      'run.vo2_intervals',
      'run.easy_strides',
      'run.easy',
    ]);
    expect(composeWeek(ctx('10k', 'taper'), true)[1]?.levelDrop).toBe(2);
    // Cross-training for other selected sports.
    expect(ids(ctx('10k', 'base', {}, { sports: ['run', 'bike', 'swim'] })).slice(-2)).toEqual([
      'bike.endurance',
      'swim.technique',
    ]);
  });

  it('cycling goals', () => {
    const p = { sports: ['bike'] as UserProfile['sports'] };
    expect(ids(ctx('granfondo', 'base', { weekIndex: 0 }, p))).toEqual([
      'bike.long',
      'bike.sweetspot',
      'bike.cadence',
      'bike.endurance',
    ]);
    expect(ids(ctx('granfondo', 'base', {}, p))[1]).toBe('bike.tempo');
    expect(ids(ctx('granfondo', 'build', {}, p))[2]).toBe('bike.climb');
    expect(ids(ctx('granfondo', 'build', {}, { ...p, terrain: 'flat' }))[2]).toBe('bike.vo2');
    expect(ids(ctx('granfondo', 'peak', {}, p))).toEqual([
      'bike.long',
      'bike.climb',
      'bike.vo2',
      'bike.recovery',
    ]);
    expect(ids(ctx('granfondo', 'peak', { weekIndex: 4 }, p))[1]).toBe('bike.threshold');
    expect(ids(ctx('granfondo', 'taper', {}, p))).toEqual([
      'bike.long',
      'bike.vo2',
      'bike.endurance',
      'bike.endurance',
    ]);
    expect(ids(ctx('granfondo', 'taper', { raceWeek: true }, p))).toEqual([
      'bike.vo2',
      'bike.endurance',
    ]);
  });

  it('swim goals, technique first without CSS', () => {
    const p = { sports: ['swim'] as UserProfile['sports'] };
    expect(ids(ctx('swim', 'base', { cssAllowed: false }, p))[0]).toBe('swim.technique');
    expect(ids(ctx('swim', 'build', {}, p))).toEqual([
      'swim.css',
      'swim.speed',
      'swim.aerobic',
      'swim.technique',
    ]);
    expect(ids(ctx('swim', 'peak', {}, p))[2]).toBe('swim.aerobic');
    expect(ids(ctx('swim', 'peak', {}, { ...p, poolLength: 'openwater' }))[2]).toBe(
      'swim.openwater',
    );
    expect(ids(ctx('swim', 'taper', {}, p))).toEqual([
      'swim.speed',
      'swim.technique',
      'swim.aerobic',
      'swim.aerobic',
    ]);
  });

  it('triathlon: each sport gets a key session, bricks in build/peak', () => {
    const p = { sports: ['swim', 'bike', 'run'] as UserProfile['sports'] };
    const base = ids(ctx('tri_olympic', 'base', {}, p));
    expect(base.slice(0, 5)).toEqual([
      'bike.long',
      'run.long',
      'swim.css',
      'bike.sweetspot',
      'run.hills_short',
    ]);
    expect(base).not.toContain('brick');
    const build = ids(ctx('tri_olympic', 'build', {}, p));
    expect(build[0]).toBe('brick');
    expect(ids(ctx('tri_olympic', 'build', { isRecovery: true }, p))).not.toContain('brick');
    expect(ids(ctx('tri_sprint', 'build', { buildWeekIndex: 1 }, p))).not.toContain('brick');
    expect(ids(ctx('tri_sprint', 'peak', { buildWeekIndex: 2 }, p))).toContain('brick');
    const taper = ids(ctx('tri_70_3', 'taper', { raceWeek: true }, p));
    expect(taper.slice(0, 3)).toEqual(['swim.speed', 'bike.vo2', 'run.tempo']);
    expect(ids(ctx('duathlon', 'base', {}, { sports: ['run', 'bike'] }))).not.toContain('swim.css');
    expect(ids(ctx('tri_full', 'build', { cssAllowed: false }, p))).toContain('swim.technique');
  });

  it('fitness goals: long session, light quality from week 4, round-robin easy', () => {
    const p = { sports: ['bike', 'swim'] as UserProfile['sports'] };
    expect(ids(ctx('fitness', 'base', { weekIndex: 1 }, p))).toEqual([
      'bike.long',
      'swim.aerobic',
      'bike.endurance',
      'swim.aerobic',
    ]);
    expect(
      ids(ctx('fitness', 'base', { weekIndex: 1 }, { ...p, longSessionSport: 'swim' })),
    ).toEqual(['swim.aerobic', 'bike.endurance', 'swim.technique', 'bike.endurance']);
    expect(ids(ctx('fitness', 'base', { weekIndex: 4 }, p))[1]).toBe('bike.sweetspot');
    expect(ids(ctx('fitness', 'base', { weekIndex: 5 }, p))[1]).toBe('swim.css');
    expect(ids(ctx('fitness', 'base', { weekIndex: 5, cssAllowed: false }, p))[1]).toBe(
      'swim.technique',
    );
    expect(composeWeek(ctx('weightloss', 'base', { weekIndex: 4 }), true)[1]).toMatchObject({
      templateId: 'run.fartlek',
      maxLevel: 3,
    });
    expect(ids(ctx('weightloss', 'base', { weekIndex: 3 }))[1]).toBe('run.tempo');
    expect(ids(ctx('fitness', 'base', {}, { sports: ['swim'], longSessionSport: 'run' }))[0]).toBe(
      'swim.aerobic',
    );
    expect(
      ids(ctx('fitness', 'base', {}, { sports: ['run', 'bike'], longSessionSport: 'bike' }))[0],
    ).toBe('bike.long');
  });

  it('benchmarks replace one key session per tested discipline', () => {
    const tri = { sports: ['swim', 'bike', 'run'] as UserProfile['sports'], hasPowerMeter: true };
    const slots = composeWeek(ctx('tri_olympic', 'base', { benchmark: true }, tri), true);
    expect(slots.filter((s) => s.role === 'benchmark').map((s) => s.templateId)).toEqual([
      'bench.swim_css',
      'bench.bike_ftp20',
      'bench.run_5k',
    ]);
    expect(slots.find((s) => s.role === 'benchmark')?.fallback?.templateId).toBe('swim.css');
    const fit = composeWeek(ctx('fitness', 'base', { benchmark: true, weekIndex: 4 }), false);
    expect(fit.find((s) => s.role === 'benchmark')?.templateId).toBe('bench.run_30min');
    const brickWeek = composeWeek(
      ctx('tri_olympic', 'build', { benchmark: true, cssAllowed: false }, { sports: tri.sports }),
      true,
    );
    expect(brickWeek.filter((s) => s.role === 'benchmark').map((s) => s.templateId)).toEqual([
      'bench.run_5k',
    ]);
  });
});

describe('strength plan (WORKOUTS.md §8)', () => {
  const week = (phase: Phase, extra: Partial<Parameters<typeof planStrengthWeek>[1]> = {}) => ({
    phase,
    isRecovery: false,
    raceGoal: true,
    maxSessions: 3,
    rotation: 0,
    ...extra,
  });

  it('defaults the priority by goal', () => {
    expect(strengthPriority({ mode: 'peakr' }, true)).toBe('enduranceFirst');
    expect(strengthPriority({ mode: 'peakr' }, false)).toBe('balanced');
    expect(strengthPriority({ mode: 'peakr', priority: 'strengthFirst' }, true)).toBe(
      'strengthFirst',
    );
  });

  it('Peakr programme follows the phases', () => {
    const base = planStrengthWeek({ mode: 'peakr', equipment: 'gym' }, week('base'));
    expect(base.slots.map((s) => s.templateId)).toEqual([
      'strength.peakr_base_gym',
      'strength.peakr_base_gym',
    ]);
    expect(base.slots[0]?.durationFactor).toBe(1);
    const peak = planStrengthWeek({ mode: 'peakr' }, week('peak', { isRecovery: true }));
    expect(peak.slots.map((s) => s.templateId)).toEqual(['strength.peakr_peak_home']);
    expect(peak.slots[0]?.legScale).toBeCloseTo(0.3);
    expect(planStrengthWeek({ mode: 'peakr' }, week('taper')).slots[0]?.templateId).toBe(
      'strength.core_mobility',
    );
    expect(
      planStrengthWeek({ mode: 'peakr' }, week('build', { raceGoal: false })).slots[0]?.templateId,
    ).toBe('strength.peakr_base_home');
    expect(
      planStrengthWeek({ mode: 'peakr', daysPerWeek: 3 }, week('base', { maxSessions: 1 })).slots,
    ).toHaveLength(1);
    expect(planStrengthWeek({ mode: 'peakr' }, week('base', { maxSessions: 0 })).notes).toEqual([
      { key: 'notes.strengthNoDay' },
    ]);
  });

  it('splits rotate across weeks and merge when days are missing', () => {
    const setup = { mode: 'split' as const, split: 'pushPullLegs' as const, daysPerWeek: 3 };
    const w1 = planStrengthWeek({ ...setup, daysPerWeek: 4 }, week('base', { maxSessions: 4 }));
    expect(w1.slots.map((s) => s.type)).toEqual(['push', 'pull', 'legs', 'push']);
    const two = planStrengthWeek(setup, week('base', { maxSessions: 2 }));
    expect(two.slots.map((s) => s.type)).toEqual(['upper', 'legs']);
    expect(two.notes[0]?.key).toBe('notes.strengthMerged');
    const full = planStrengthWeek(
      { mode: 'split', split: 'fullBody', daysPerWeek: 2 },
      week('base', { rotation: 2 }),
    );
    expect(full.slots.map((s) => s.type)).toEqual(['full_c', 'full_a']);
    expect(full.rotation).toBe(1);
    const noMerge = planStrengthWeek(
      { mode: 'split', split: 'glutesLegs', daysPerWeek: 3 },
      week('base', { maxSessions: 1 }),
    );
    expect(noMerge.slots.map((s) => s.type)).toEqual(['glutes_a']);
    expect(planStrengthWeek(setup, week('taper')).slots).toHaveLength(1);
    expect(
      planStrengthWeek({ ...setup, priority: 'strengthFirst' }, week('taper')).slots,
    ).toHaveLength(3);
    expect(planStrengthWeek({ mode: 'split' }, week('base')).slots).toEqual([]);
  });

  it('own routines: leg load from the exercises, untagged custom exercises count as light', () => {
    const routines = [
      {
        id: 'a',
        name: 'A',
        durationMin: 40,
        exercises: [{ exerciseId: 'bench_press', sets: 3, reps: '8' }],
      },
      { id: 'b', name: 'B', durationMin: 40, exercises: [{ name: 'Sled', sets: 3, reps: '20 m' }] },
      {
        id: 'c',
        name: 'C',
        durationMin: 40,
        exercises: [{ name: 'Squat', sets: 3, reps: '5', legLoad: 'heavy' as const }],
      },
    ];
    expect(routines.map((r) => routineSession(r).legLoad)).toEqual(['none', 'light', 'heavy']);
    expect(routineSession(routines[1] as Routine).def.exercises[0]?.exerciseId).toBe('custom:b:0');
    expect(
      routineSession({
        ...(routines[0] as Routine),
        exercises: [{ exerciseId: 'not_in_library', sets: 1, reps: '1' }],
      }).legLoad,
    ).toBe('light');
    const w = planStrengthWeek(
      { mode: 'routines', routines, daysPerWeek: 2 },
      week('base', { rotation: 2 }),
    );
    expect(w.slots.map((s) => s.templateId)).toEqual(['routine:c', 'routine:a']);
    expect(w.rotation).toBe(1);
    expect(planStrengthWeek({ mode: 'routines', routines }, week('base')).slots).toHaveLength(3);
    expect(planStrengthWeek({ mode: 'routines', routines: [] }, week('base')).slots).toEqual([]);
    expect(planStrengthWeek({ mode: 'log' }, week('base', { maxSessions: 0 })).notes).toEqual([]);
  });
});

describe('winter variants', () => {
  const athlete = athleteFor({ ...profile, winterSports: ['snowshoe', 'xcski'] }, 'fitness');
  const easy = { sport: 'run' as const, role: 'easy' as const, load: 100, level: null };

  it('offers an equivalent-load winter session in the winter months only', () => {
    const v = winterVariantFor(easy, athlete, 1, false);
    expect(v).toMatchObject({ templateId: 'snowshoe.easy', sport: 'snowshoe' });
    expect(v?.durationMin).toBe(55);
    expect(winterVariantFor(easy, athlete, 6, false)).toBeNull();
    expect(winterVariantFor(easy, athleteFor(profile, 'fitness'), 1, false)).toBeNull();
    expect(winterVariantFor({ ...easy, sport: 'swim' }, athlete, 1, false)).toBeNull();
    expect(winterVariantFor({ ...easy, role: 'strength' }, athlete, 1, false)).toBeNull();
    const custom = athleteFor(
      { ...profile, winterSports: ['skitour'], winterMonths: [6] },
      'fitness',
    );
    expect(
      winterVariantFor({ ...easy, role: 'long', load: 300 }, custom, 6, false)?.templateId,
    ).toBe('skitour.ascent');
  });

  it('quality sessions get XC-ski intervals for non-race goals only', () => {
    const key = { ...easy, role: 'key' as const, level: 6 };
    expect(winterVariantFor(key, athlete, 2, false)).toMatchObject({
      templateId: 'xcski.intervals',
    });
    expect(winterVariantFor({ ...key, level: null }, athlete, 2, false)?.durationMin).toBe(50);
    expect(winterVariantFor(key, athlete, 2, true)).toBeNull();
    expect(
      winterVariantFor(
        key,
        athleteFor({ ...profile, winterSports: ['snowshoe'] }, 'fitness'),
        2,
        false,
      ),
    ).toBeNull();
  });
});
