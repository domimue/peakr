import { parseIsoDate, toIsoDate } from './dates';
import { workoutDistances } from './distance';
import type { Plan, PlanWeek, UserProfile, WeekKind } from './types';

/**
 * Figures every week carries for the Plan screen (CLAUDE.md "UI patterns" → Plan): its number
 * ("Week 3 of 12"), planned distance and what kind of week it is. Derived from the week's
 * workouts, so they are recomputed after every edit and when a stored plan is loaded.
 */

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Race week > travel week > recovery week > normal week. */
export function weekKind(
  week: Pick<PlanWeek, 'startDate' | 'isRecovery' | 'notes' | 'workouts'>,
  targetDate: string | null,
): WeekKind {
  if (targetDate !== null) {
    const start = parseIsoDate(week.startDate) as number;
    const end = toIsoDate(start + 6);
    if (week.startDate <= targetDate && targetDate <= end) return 'race';
  }
  if (week.workouts.some((w) => w.travel) || week.notes.some((n) => n.key === 'notes.travelWeek')) {
    return 'travel';
  }
  return week.isRecovery ? 'recovery' : 'normal';
}

/** Sets `number`, `distanceKm` and `kind` on every week of the plan. */
export function annotateWeeks(plan: Plan, profile: UserProfile): Plan {
  return {
    ...plan,
    weeks: plan.weeks.map((week) => ({
      ...week,
      number: week.index + 1,
      distanceKm: round1(
        week.workouts.reduce(
          (sum, w) => sum + Object.values(workoutDistances(w, profile)).reduce((a, b) => a + b, 0),
          0,
        ),
      ),
      kind: weekKind(week, plan.targetDate),
    })),
  };
}
