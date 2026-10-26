import type { ActivitySport } from '../plan/types';

/**
 * Neutral, optional fuelling hints for long sessions from the plan (sports nutrition guidance in
 * broad ranges, no prescriptions): carbohydrates before and during long endurance sessions,
 * protein and carbohydrates afterwards.
 */

export interface FuellingSession {
  date: string;
  sport: ActivitySport;
  durationMin: number;
}

export interface FuellingHint {
  date: string;
  sport: ActivitySport;
  durationMin: number;
  /** Keys of the hints that apply; the app turns them into text. */
  hints: ('before' | 'during' | 'after')[];
  /** Carbohydrates per hour during the session (g/h). */
  duringCarbsPerHour: { min: number; max: number } | null;
}

export const FUELLING = {
  /** Endurance sessions from this long get "before" and "after" hints. */
  longMin: 90,
  /** From this long, carbohydrates during the session too. */
  duringMin: 120,
  duringCarbsPerHour: { min: 30, max: 60 },
  /** Sports the hints apply to (strength and walks are not "long endurance"). */
  sports: [
    'run',
    'bike',
    'swim',
    'brick',
    'xcski',
    'skitour',
    'snowshoe',
  ] as readonly ActivitySport[],
} as const;

export function fuellingHints(sessions: readonly FuellingSession[]): FuellingHint[] {
  return sessions
    .filter((s) => FUELLING.sports.includes(s.sport) && s.durationMin >= FUELLING.longMin)
    .map((s) => {
      const during = s.durationMin >= FUELLING.duringMin;
      return {
        date: s.date,
        sport: s.sport,
        durationMin: s.durationMin,
        hints: during ? ['before', 'during', 'after'] : ['before', 'after'],
        duringCarbsPerHour: during ? { ...FUELLING.duringCarbsPerHour } : null,
      };
    });
}
