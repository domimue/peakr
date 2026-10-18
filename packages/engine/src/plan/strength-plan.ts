import { assertDefined } from '../result';
import { planConfig } from './config';
import { getExercise, getTemplate, splits } from './library';
import type {
  LegLoad,
  Phase,
  PlanNote,
  Routine,
  StrengthPriority,
  StrengthSessionDef,
  StrengthSetup,
} from './types';

const cfg = planConfig.strength;

/** A strength session for this week, before scheduling. */
export interface StrengthSlot {
  /** `strength.<type>` template or `routine:<id>`. */
  templateId: string;
  type: string;
  whyKey: string;
  def: StrengthSessionDef;
  legLoad: LegLoad;
  legScale: number;
  upperScale: number;
  durationFactor: number;
}

export interface StrengthWeek {
  slots: StrengthSlot[];
  notes: PlanNote[];
  /** Position in the split / routine rotation for next week. */
  rotation: number;
}

export interface StrengthWeekContext {
  phase: Phase;
  isRecovery: boolean;
  raceGoal: boolean;
  /** Days the endurance plan leaves for strength. */
  maxSessions: number;
  rotation: number;
}

export function strengthPriority(setup: StrengthSetup, raceGoal: boolean): StrengthPriority {
  return setup.priority ?? (raceGoal ? 'enduranceFirst' : 'balanced');
}

function fromTemplate(
  id: string,
): Omit<StrengthSlot, 'legScale' | 'upperScale' | 'durationFactor'> {
  const t = getTemplate(`strength.${id}`);
  return {
    templateId: t.id,
    type: t.type,
    whyKey: t.whyKey,
    def: assertDefined(t.strength, 'strength'),
    legLoad: t.legLoad,
  };
}

/** User routine → session; untagged custom exercises count as light legs (§8.3). */
export function routineSession(
  routine: Routine,
): Omit<StrengthSlot, 'legScale' | 'upperScale' | 'durationFactor'> {
  const exercises = routine.exercises.map((e, i) => ({
    exerciseId: e.exerciseId ?? `custom:${routine.id}:${i}`,
    sets: e.sets,
    reps: e.reps,
    legLoad:
      e.legLoad ?? (e.exerciseId ? getExercise(e.exerciseId)?.legLoad : undefined) ?? 'light',
  }));
  const loads = exercises.map((e) => e.legLoad);
  const legLoad: LegLoad = loads.includes('heavy')
    ? 'heavy'
    : loads.includes('light')
      ? 'light'
      : 'none';
  return {
    templateId: `routine:${routine.id}`,
    type: 'routine',
    whyKey: 'why.strength.routine',
    def: { rpe: 7.5, durationMin: routine.durationMin, exercises },
    legLoad,
  };
}

/** Takes `count` items from a rotation starting at `start` (wrapping). */
function rotate<T>(items: readonly T[], start: number, count: number): T[] {
  return Array.from({ length: count }, (_, i) =>
    assertDefined(items[(start + i) % items.length], 'rotation'),
  );
}

/**
 * Strength sessions of one week for the chosen mode (WORKOUTS.md §8.1): Peakr programme by phase,
 * the user's split (merged when fewer days are available), own routines, or none for log-only.
 * Leg volume follows the phase scaling of the strength priority.
 */
export function planStrengthWeek(setup: StrengthSetup, ctx: StrengthWeekContext): StrengthWeek {
  const priority = strengthPriority(setup, ctx.raceGoal);
  const phase: Phase = ctx.raceGoal ? ctx.phase : 'maintain';
  const recovery = ctx.isRecovery ? cfg.recoveryFactor : 1;
  const legScale = cfg.legScaling[priority][phase] * recovery;
  const upperScale = (phase === 'taper' ? cfg.taperUpperScaling : 1) * recovery;
  const durationFactor = setup.equipment === 'gym' ? 1 : cfg.homeDurationFactor;
  const notes: PlanNote[] = [];

  let sessions: Omit<StrengthSlot, 'legScale' | 'upperScale' | 'durationFactor'>[] = [];
  let rotation = ctx.rotation;
  if (setup.mode === 'peakr') {
    const wanted = setup.daysPerWeek ?? cfg.peakrPerWeek[phase];
    const equipment = setup.equipment ?? 'home';
    const id =
      phase === 'taper'
        ? 'core_mobility'
        : `peakr_${phase === 'maintain' ? 'base' : phase}_${equipment}`;
    sessions = repeatTimes(Math.min(wanted, ctx.maxSessions), fromTemplate(id));
  } else if (setup.mode === 'split' && setup.split) {
    const def = splits[setup.split];
    const wanted = Math.max(
      def.days.min,
      Math.min(def.days.max, setup.daysPerWeek ?? def.days.min),
    );
    const days = phase === 'taper' && priority !== 'strengthFirst' ? Math.min(1, wanted) : wanted;
    const available = Math.min(days, ctx.maxSessions);
    const reduced = available < days ? def.reduced?.[available] : undefined;
    if (reduced) {
      sessions = reduced.map(fromTemplate);
      notes.push({ key: 'notes.strengthMerged', params: { sessions: available } });
    } else {
      sessions = rotate(def.rotation, rotation, available).map(fromTemplate);
      rotation = (rotation + available) % def.rotation.length;
    }
  } else if (setup.mode === 'routines' && setup.routines && setup.routines.length > 0) {
    const count = Math.min(setup.daysPerWeek ?? setup.routines.length, ctx.maxSessions);
    sessions = rotate(setup.routines, rotation, count).map(routineSession);
    rotation = (rotation + count) % setup.routines.length;
  }

  if (
    sessions.length === 0 &&
    (setup.mode === 'peakr' || setup.mode === 'split' || setup.mode === 'routines') &&
    ctx.maxSessions === 0
  ) {
    notes.push({ key: 'notes.strengthNoDay' });
  }
  return {
    slots: sessions.map((s) => ({ ...s, legScale, upperScale, durationFactor })),
    notes,
    rotation,
  };
}

function repeatTimes<T>(n: number, item: T): T[] {
  return Array.from({ length: Math.max(0, n) }, () => item);
}
