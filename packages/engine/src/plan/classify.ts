import { planConfig } from './config';
import type { Experience, Workout } from './types';

type Classifiable = Pick<
  Workout,
  'sport' | 'type' | 'intensity' | 'durationMin' | 'legLoad' | 'terrain'
>;

/**
 * Hard on its own, regardless of neighbouring days (WORKOUTS.md §11): intensity `hard`, long run
 * ≥ 90 min, long ride ≥ 3 h, long/steep hilly sessions, heavy-leg strength, bricks.
 */
export function isHardOnItsOwn(w: Classifiable): boolean {
  // Strength is hard only with heavy legs (after phase scaling); upper/core/mobility is easy.
  if (w.sport === 'strength') return w.legLoad === 'heavy';
  if (w.intensity === 'hard' || w.sport === 'brick') return true;
  if (w.sport === 'run' && w.type === 'long' && w.durationMin >= 90) return true;
  if (w.sport === 'bike' && w.type === 'long' && w.durationMin >= 180) return true;
  if (w.terrain && (w.sport === 'run' || w.sport === 'bike')) {
    return w.terrain.gainPerKm >= planConfig.terrain.hardGainPerKm[w.sport];
  }
  return false;
}

/** For the per-day rule: endurance sessions and bricks (heavy legs may join a hard day, §8.3). */
export function isHardEndurance(w: Pick<Workout, 'sport' | 'hard'>): boolean {
  return w.hard && w.sport !== 'strength';
}

/**
 * Final classification over consecutive days (oldest first). `moderate` sessions count as hard
 * when the day before or after already has a hard session and the user is a beginner.
 */
export function classifyDays(days: readonly Workout[][], experience: Experience): Workout[][] {
  const dayHard = days.map((day) => day.some(isHardOnItsOwn));
  return days.map((day, i) =>
    day.map((w) => {
      const neighbourHard = dayHard[i - 1] === true || dayHard[i + 1] === true;
      const hard =
        isHardOnItsOwn(w) ||
        (experience === 'beginner' && w.intensity === 'moderate' && neighbourHard);
      return hard === w.hard ? w : { ...w, hard };
    }),
  );
}
