import { planConfig } from './config';
import {
  exercises,
  getExercise,
  hasEquipmentFor,
  type Equipment,
  type Exercise,
  type ExercisePattern,
} from './library';
import type { LegLoad, StrengthEquipment, StrengthSessionDef } from './types';

/** Patterns to borrow from when nothing of the same pattern fits the equipment. */
const FALLBACK_PATTERNS: Partial<Record<ExercisePattern, ExercisePattern[]>> = {
  arms: ['pushHorizontal', 'pullHorizontal'],
  pushVertical: ['pushHorizontal'],
  pullVertical: ['pullHorizontal'],
  pullHorizontal: ['pullVertical'],
  calf: ['plyometrics'],
  fly: ['pushHorizontal'],
  carry: ['core'],
  legIsolation: ['lunge', 'squat'],
};

const LEG_ORDER: readonly LegLoad[] = ['none', 'light', 'heavy'];

export function equipmentFor(setting: StrengthEquipment): readonly Equipment[] {
  return planConfig.strength.equipment[setting];
}

function overlap(a: readonly string[], b: readonly string[]): number {
  return a.filter((x) => b.includes(x)).length;
}

/** Best available replacement: same leg load, most shared muscles, same (bi/uni)lateral. */
function substitute(
  original: Exercise,
  available: readonly Equipment[],
  used: ReadonlySet<string>,
): Exercise | undefined {
  for (const pattern of [original.pattern, ...(FALLBACK_PATTERNS[original.pattern] ?? [])]) {
    const candidates = exercises.filter(
      (e) => e.pattern === pattern && !used.has(e.id) && hasEquipmentFor(e, available),
    );
    let best: Exercise | undefined;
    let bestScore = -Infinity;
    for (const c of candidates) {
      const score =
        (c.legLoad === original.legLoad ? 10 : 0) +
        overlap(c.muscles, original.muscles) * 2 +
        (c.unilateral === original.unilateral ? 1 : 0);
      if (score > bestScore) [best, bestScore] = [c, score];
    }
    if (best) return best;
  }
  return undefined;
}

export interface AdaptedSession {
  def: StrengthSessionDef;
  legLoad: LegLoad;
  /** At least one exercise was swapped or dropped. */
  changed: boolean;
}

/**
 * Swaps every exercise the user's equipment does not allow for one of the same movement pattern
 * (home / hotel users never get barbell, machine or cable work). Exercises without any fitting
 * replacement are dropped. The session's leg load follows the exercises that remain.
 */
export function adaptToEquipment(
  def: StrengthSessionDef,
  legLoad: LegLoad,
  setting: StrengthEquipment,
): AdaptedSession {
  const available = equipmentFor(setting);
  const used = new Set(def.exercises.map((e) => e.exerciseId));
  let changed = false;
  const adapted: StrengthSessionDef['exercises'] = [];
  for (const e of def.exercises) {
    const exercise = getExercise(e.exerciseId);
    if (!exercise || hasEquipmentFor(exercise, available)) {
      adapted.push(e);
      continue;
    }
    changed = true;
    const replacement = substitute(exercise, available, used);
    if (!replacement) continue;
    used.add(replacement.id);
    // Weights and leg-load overrides do not transfer between exercises.
    adapted.push({ ...e, exerciseId: replacement.id, weightKg: undefined, legLoad: undefined });
  }
  if (!changed) return { def, legLoad, changed };
  const maxLoad = adapted.reduce<LegLoad>((max, e) => {
    const l = e.legLoad ?? getExercise(e.exerciseId)?.legLoad ?? 'light';
    return LEG_ORDER.indexOf(l) > LEG_ORDER.indexOf(max) ? l : max;
  }, 'none');
  return {
    def: { ...def, exercises: adapted },
    // Never heavier than the template promised (its spacing was planned for that).
    legLoad: LEG_ORDER.indexOf(maxLoad) < LEG_ORDER.indexOf(legLoad) ? maxLoad : legLoad,
    changed,
  };
}
