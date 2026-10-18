import { planConfig } from './config';
import { getExercise, raceSimulationLevel } from './library';
import {
  climbMultiplier,
  enduranceLoad,
  flattenSteps,
  round1,
  strengthLoad,
  totalDurationSec,
} from './load';
import { defaultRestSec } from './strength-reps';
import { planSessionTerrain } from './terrain';
import type {
  Block,
  ExercisePrescription,
  GoalKind,
  LegLoad,
  PoolLength,
  SlotRole,
  Step,
  StrengthSessionDef,
  Target,
  UserProfile,
  WorkoutLevel,
  WorkoutTemplate,
  WorkoutTerrain,
} from './types';

/** Run pace label used for distance steps whose target is not a pace (by load zone). */
const ZONE_PACE_LABEL = { 1: 'E', 2: 'E', 3: 'MP', 4: 'T', 5: 'I' } as const;
/** CSS offset for swim distance steps whose target is not a CSS offset (by load zone). */
const ZONE_CSS_OFFSET = { 1: 15, 2: 10, 3: 5, 4: 0, 5: -8 } as const;

export interface Athlete {
  profile: UserProfile;
  goal: GoalKind;
  thresholdPaceSecPerKm: number;
  cssPacePer100mSec: number;
  pool: PoolLength;
}

export function athleteFor(profile: UserProfile, goal: GoalKind): Athlete {
  return {
    profile,
    goal,
    thresholdPaceSecPerKm:
      profile.thresholdPaceSecPerKm ?? planConfig.paces.thresholdSecPerKm[profile.experience],
    cssPacePer100mSec:
      profile.cssPacePer100mSec ?? planConfig.paces.cssSecPer100m[profile.experience],
    pool: profile.poolLength ?? 25,
  };
}

export function runPaceSecPerKm(athlete: Athlete, label: string): number {
  const factor = planConfig.paces.runPaceFactors[label] ?? 1;
  return athlete.thresholdPaceSecPerKm * factor;
}

export interface Materialized {
  level: number | null;
  warmup: Step[];
  main: Block[];
  cooldown: Step[];
  durationMin: number;
  load: number;
  target: Target;
  terrain: WorkoutTerrain | null;
}

function adaptStepToPool(s: Step, pool: PoolLength): Step {
  if (pool !== 50 || s.distanceM === undefined || s.distanceM % 50 === 0) return s;
  return { ...s, distanceM: Math.ceil(s.distanceM / 50) * 50 };
}

/** Rounds swim distances up to whole pool lengths; sub-length reps get doubled, repeats halved. */
export function adaptBlockToPool(block: Block, pool: PoolLength): Block {
  const steps = block.steps.map((s) => adaptStepToPool(s, pool));
  const doubled = steps.some(
    (s, i) => (s.distanceM ?? 0) >= 2 * (block.steps[i]?.distanceM ?? Infinity),
  );
  const repeat = doubled && block.repeat > 1 ? Math.ceil(block.repeat / 2) : block.repeat;
  return { repeat, steps };
}

function resolveStep(step: Step, sport: string, athlete: Athlete, power: boolean): Step {
  let s = step;
  if (power && s.hint?.kind === 'powerZone') s = { ...s, target: s.hint, hint: s.target };
  if (s.distanceM === undefined) return s;
  const stepSport = s.sport ?? sport;
  let durationSec: number;
  if (stepSport === 'swim') {
    const offset = s.target.kind === 'cssOffset' ? Number(s.target.value) : ZONE_CSS_OFFSET[s.zone];
    durationSec = (s.distanceM / 100) * (athlete.cssPacePer100mSec + offset);
  } else {
    const label = s.target.kind === 'paceZone' ? s.target.value : ZONE_PACE_LABEL[s.zone];
    durationSec = (s.distanceM / 1000) * runPaceSecPerKm(athlete, label);
  }
  const resolved: Step = { ...s, durationSec: Math.round(durationSec) };
  // Open water is swum by time, not by distance.
  if (stepSport === 'swim' && athlete.pool === 'openwater') delete resolved.distanceM;
  return resolved;
}

/** The main-set target shown on the workout card: the hardest non-rest step. */
function primaryTarget(main: Block[]): Target {
  const steps = main.flatMap((b) => b.steps).filter((s) => !s.rest);
  const hardest = steps.reduce((a, b) => (b.zone > a.zone ? b : a));
  return hardest.target;
}

function levelFor(template: WorkoutTemplate, level: number, athlete: Athlete): WorkoutLevel {
  if (template.id === 'brick' && level === 5) return raceSimulationLevel(athlete.goal);
  const found = template.levels[Math.min(level, template.levels.length) - 1];
  /* v8 ignore next -- callers clamp levels to the template */
  if (!found) throw new Error(`level ${level} missing in ${template.id}`);
  return found;
}

/**
 * Turns a template into a concrete workout for this athlete: level steps (or a duration-scaled
 * fill of `targetMin`), distances converted to time via pace/CSS, pool adaptation, power targets
 * with a power meter, terrain and load.
 */
export function materialize(
  template: WorkoutTemplate,
  level: number | null,
  targetMin: number,
  role: SlotRole,
  athlete: Athlete,
  /** Lower bound for duration-scaled sessions instead of the template minimum (tight weeks). */
  floorMin?: number,
): Materialized {
  const power = template.sport === 'bike' && athlete.profile.hasPowerMeter === true;
  const resolve = (s: Step) => resolveStep(s, template.sport, athlete, power);
  const isSwim = template.sport === 'swim';

  let warmup: Step[] = [];
  let main: Block[] = [];
  let cooldown: Step[] = [];
  if (level !== null) {
    const l = levelFor(template, level, athlete);
    const pool = isSwim ? athlete.pool : 25;
    warmup = l.warmup.map((s) => resolve(adaptStepToPool(s, pool)));
    main = l.main
      .map((b) => adaptBlockToPool(b, pool))
      .map((b) => ({ repeat: b.repeat, steps: b.steps.map(resolve) }));
    cooldown = l.cooldown.map((s) => resolve(adaptStepToPool(s, pool)));
  }

  const scaled = template.durationScaled;
  if (scaled) {
    const fixedSec = totalDurationSec(flattenSteps(warmup, main, cooldown));
    const wantSec = Math.min(scaled.maxMin, Math.max(floorMin ?? scaled.minMin, targetMin)) * 60;
    const fillSec = Math.max(0, wantSec - fixedSec);
    if (fillSec > 0) {
      const fill = resolve({ ...scaled.fill, durationSec: fillSec });
      if (level === null) main = [{ repeat: 1, steps: [fill] }];
      else warmup = [fill, ...warmup];
    }
  }

  const steps = flattenSteps(warmup, main, cooldown);
  const durationMin = Math.round(totalDurationSec(steps) / 60);
  const easyPace = runPaceSecPerKm(athlete, 'E');
  const terrain = planSessionTerrain(template, role, durationMin, athlete.profile, easyPace);
  const multiplier = terrain ? climbMultiplier(template.sport, terrain.gainPerKm) : 1;
  return {
    level,
    warmup,
    main,
    cooldown,
    durationMin,
    load: round1(enduranceLoad(steps, template.sport, multiplier)),
    target: primaryTarget(main),
    terrain,
  };
}

export interface MaterializedStrength {
  durationMin: number;
  load: number;
  legLoad: LegLoad;
  exercises: ExercisePrescription[];
}

function exerciseLegLoad(exerciseId: string): LegLoad {
  return getExercise(exerciseId)?.legLoad ?? 'light';
}

/**
 * Strength session with phase scaling (§8.3): leg exercises × `legScale`, upper body × `upperScale`.
 * A heavy-leg session scaled below `heavyMinScaling` is prescribed as light; with no leg volume left
 * the leg exercises are dropped.
 */
export function materializeStrength(
  def: StrengthSessionDef,
  legLoad: LegLoad,
  legScale: number,
  upperScale: number,
  durationFactor: number,
): MaterializedStrength {
  const baseSets = def.exercises.reduce((sum, e) => sum + e.sets, 0);
  const exercises: ExercisePrescription[] = [];
  for (const e of def.exercises) {
    const scale = (e.legLoad ?? exerciseLegLoad(e.exerciseId)) === 'none' ? upperScale : legScale;
    if (scale <= 0) continue;
    exercises.push({
      exerciseId: e.exerciseId,
      reps: e.reps,
      sets: Math.max(1, Math.round(e.sets * scale)),
      rpe: def.rpe,
      restSec: e.restSec ?? defaultRestSec(e.exerciseId, e.reps),
      ...(e.weightKg === undefined ? {} : { weightKg: e.weightKg }),
    });
  }
  const sets = exercises.reduce((sum, e) => sum + e.sets, 0);
  const durationMin = Math.max(
    planConfig.plan.minSessionMin,
    Math.round((def.durationMin * durationFactor * sets) / baseSets / 5) * 5,
  );
  const scaledLegLoad: LegLoad =
    legLoad === 'heavy' && legScale < planConfig.strength.heavyMinScaling
      ? legScale > 0
        ? 'light'
        : 'none'
      : legLoad;
  return {
    durationMin,
    load: round1(strengthLoad(durationMin, def.rpe)),
    legLoad: scaledLegLoad,
    exercises,
  };
}
