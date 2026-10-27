import { difficultyLevel } from './difficulty';
import { workoutDistances } from './distance';
import {
  allWorkouts,
  regeneratePlan,
  statusOf,
  type EditResult,
  type PlanInput,
  type PlanState,
} from './edit';
import { SPORTS, type Plan, type Sport, type UserProfile } from './types';

/** What the coming weeks hold (shown before and after a difficulty change). */
export interface PlanOutlook {
  /** Weeks looked at (at most `weeks`). */
  weeks: number;
  sessionsPerWeek: number;
  /** Average per week. */
  minutesPerWeek: Partial<Record<Sport, number>>;
  kmPerWeek: Partial<Record<Sport, number>>;
  /** Longest single session per sport in those weeks. */
  longestMin: Partial<Record<Sport, number>>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The planned (not done, not skipped) workouts of the next `weeks` weeks from `fromDate`. */
export function planOutlook(
  state: PlanState,
  profile: UserProfile,
  fromDate: string,
  weeks = 4,
): PlanOutlook {
  const plan: Plan = state.plan;
  const ahead = plan.weeks.filter((w) => w.startDate >= mondayOf(fromDate)).slice(0, weeks);
  const ids = new Set(ahead.flatMap((w) => w.workouts.map((x) => x.id)));
  const workouts = allWorkouts(plan).filter(
    (w) => ids.has(w.id) && w.date >= fromDate && statusOf(state, w.id) === 'planned',
  );
  const n = Math.max(1, ahead.length);
  const minutes: Partial<Record<Sport, number>> = {};
  const km: Partial<Record<Sport, number>> = {};
  const longest: Partial<Record<Sport, number>> = {};
  for (const w of workouts) {
    const sports: Sport[] =
      w.sport === 'brick'
        ? ['bike', 'run']
        : SPORTS.includes(w.sport as Sport)
          ? [w.sport as Sport]
          : [];
    for (const s of sports) {
      const share = w.sport === 'brick' ? w.durationMin / 2 : w.durationMin;
      minutes[s] = (minutes[s] ?? 0) + share;
      longest[s] = Math.max(longest[s] ?? 0, w.durationMin);
    }
    for (const [s, d] of Object.entries(workoutDistances(w, profile)) as [Sport, number][]) {
      km[s] = (km[s] ?? 0) + d;
    }
  }
  const perWeek = (m: Partial<Record<Sport, number>>, f: (x: number) => number) =>
    Object.fromEntries(Object.entries(m).map(([s, v]) => [s, f((v as number) / n)]));
  return {
    weeks: ahead.length,
    sessionsPerWeek: round1(workouts.filter((w) => w.sport !== 'strength').length / n),
    minutesPerWeek: perWeek(minutes, Math.round),
    kmPerWeek: perWeek(km, round1),
    longestMin: longest,
  };
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export interface DifficultyChange {
  level: number;
  before: PlanOutlook;
  after: PlanOutlook;
  /** Apply both to commit the change. Completed weeks and sessions are unchanged. */
  state: PlanState;
  input: PlanInput;
}

/**
 * The plan with another difficulty (1–10), regenerated from `today` – completed weeks and done
 * sessions stay exactly as they are – plus what changes in the next four weeks. Nothing is stored:
 * the caller shows `before`/`after` and commits `state` and `input` on confirmation. All safety
 * rules hold because the regeneration applies them after the slider.
 */
export function previewDifficulty(
  state: PlanState,
  input: PlanInput,
  today: string,
  level: number,
): EditResult<DifficultyChange> {
  const nextInput: PlanInput = {
    ...input,
    profile: { ...input.profile, difficulty: difficultyLevel(level) },
  };
  const result = regeneratePlan(state, nextInput, today);
  if (!result.ok) return result;
  return {
    ok: true,
    value: {
      level: difficultyLevel(level),
      before: planOutlook(state, input.profile, today),
      after: planOutlook(result.value, nextInput.profile, today),
      state: result.value,
      input: nextInput,
    },
  };
}
