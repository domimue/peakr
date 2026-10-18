import {
  analyzeRaceResult,
  formatDuration,
  RACE_DISTANCE_IDS,
  type Phase,
  type Plan,
  type PlanNote,
  type RaceDistanceId,
} from '@peakr/engine';

import type { QuizAnswers } from './model';
import {
  cssPaceOf,
  MAX_LOSS_PER_WEEK,
  QUESTION_IDS as Q,
  sportsOf,
  thresholdPaceOf,
  type OnboardingResult,
} from './onboarding';

/**
 * Everything the forecast screen shows, derived from the generated plan and the answers – never
 * invented. Texts are i18n keys with formatted params.
 */

export interface PhaseSegment {
  phase: Phase;
  /** 0-based index of the first week. */
  startWeek: number;
  weeks: number;
}

export interface ForecastWeek {
  index: number;
  phase: Phase;
  isRecovery: boolean;
  load: number;
  minutes: number;
}

export interface ForecastLine {
  key: string;
  params?: Readonly<Record<string, string | number>>;
}

export interface Forecast {
  weeks: number;
  startDate: string;
  /** Race day, or the last day of the plan for open goals. */
  endDate: string;
  phases: PhaseSegment[];
  loads: ForecastWeek[];
  maxLoad: number;
  sessions: number;
  recoveryWeeks: number;
  /** Expected outcome, in display order. */
  outcome: ForecastLine[];
  /** Plan-level notes from the engine (e.g. short preparation). */
  notes: PlanNote[];
}

const hours = (minutes: number) => Math.round(minutes / 6) / 10;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function phaseSegments(plan: Plan): PhaseSegment[] {
  const segments: PhaseSegment[] = [];
  for (const week of plan.weeks) {
    const last = segments[segments.length - 1];
    if (last && last.phase === week.phase) last.weeks++;
    else segments.push({ phase: week.phase, startWeek: week.index, weeks: 1 });
  }
  return segments;
}

/** Race time the current form predicts for a run race goal (Riegel, from the entered race). */
function racePrediction(answers: QuizAnswers, goal: string): ForecastLine | null {
  if (!(RACE_DISTANCE_IDS as readonly string[]).includes(goal)) return null;
  const reference = answers[Q.runReference];
  const time = answers[Q.runRaceTime];
  if (
    (reference !== '5k' && reference !== '10k' && reference !== 'half') ||
    typeof time !== 'number'
  ) {
    return null;
  }
  const r = analyzeRaceResult({ distance: reference, timeSec: time });
  const prediction = r.ok
    ? r.value.predictions.find((p) => p.distance === (goal as RaceDistanceId))
    : undefined;
  if (!prediction) return null;
  return {
    key: prediction.isInput
      ? 'quiz.forecast.outcome.raceCurrent'
      : 'quiz.forecast.outcome.racePrediction',
    params: { time: formatDuration(prediction.timeSec), reference, distance: goal },
  };
}

export function buildForecast(plan: Plan, input: OnboardingResult, answers: QuizAnswers): Forecast {
  const weeks = plan.weeks;
  const full = weeks.filter((w) => !w.isPartial);
  const first = full[0] ?? weeks[0];
  const peak = first && weeks.reduce((a, b) => (b.minutes > a.minutes ? b : a), first);
  const lastWeek = weeks[weeks.length - 1];
  const endDate = plan.targetDate ?? (lastWeek ? addDays(lastWeek.startDate, 6) : plan.startDate);

  const enduranceMinutes = weeks.reduce((sum, w) => sum + w.minutes, 0);
  const hardMinutes = weeks.reduce((sum, w) => sum + w.minutes * w.hardShare, 0);

  const outcome: ForecastLine[] = [];
  if (first && peak) {
    outcome.push({
      key: 'quiz.forecast.outcome.volume',
      params: { from: hours(first.minutes), to: hours(peak.minutes), weeks: weeks.length },
    });
  }
  const race = racePrediction(answers, input.goal.kind);
  if (race) outcome.push(race);
  const threshold = thresholdPaceOf(answers);
  if (threshold !== undefined && !race) {
    outcome.push({
      key: 'quiz.forecast.outcome.threshold',
      params: { pace: formatDuration(threshold) },
    });
  }
  const css = cssPaceOf(answers);
  if (css !== undefined) {
    outcome.push({ key: 'quiz.forecast.outcome.css', params: { pace: formatDuration(css) } });
  }
  if (enduranceMinutes > 0) {
    outcome.push({
      key: 'quiz.forecast.outcome.easyShare',
      params: { percent: Math.round((1 - hardMinutes / enduranceMinutes) * 100) },
    });
  }
  if (sportsOf(answers).length > 1) {
    outcome.push({ key: 'quiz.forecast.outcome.oneLoad' });
  }
  if (input.goal.kind === 'weightloss') {
    outcome.push({
      key: 'quiz.forecast.outcome.weightloss',
      params: { kg: Math.round(input.body.weightKg * MAX_LOSS_PER_WEEK * 10) / 10 },
    });
  }
  if (input.strengthRoutinesPending) {
    outcome.push({ key: 'quiz.forecast.outcome.routinesPending' });
  }

  return {
    weeks: weeks.length,
    startDate: plan.startDate,
    endDate,
    phases: phaseSegments(plan),
    loads: weeks.map((w) => ({
      index: w.index,
      phase: w.phase,
      isRecovery: w.isRecovery,
      load: w.load,
      minutes: w.minutes,
    })),
    maxLoad: Math.max(0, ...weeks.map((w) => w.load)),
    sessions: weeks.reduce((sum, w) => sum + w.workouts.length, 0),
    recoveryWeeks: weeks.filter((w) => w.isRecovery).length,
    outcome,
    notes: plan.notes,
  };
}
