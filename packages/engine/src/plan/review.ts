import { median } from '../stats';
import { planConfig } from './config';
import { difficultyLevel } from './difficulty';
import { statusOf, type PlanState } from './edit';
import { planSummary, type PlanSummary } from './outcome';
import {
  SPORTS,
  type PlanNote,
  type QualityEmphasis,
  type Sport,
  type StrengthPriority,
  type UserProfile,
  type Workout,
  type WorkoutType,
} from './types';

/**
 * "How was your last plan?" (CLAUDE.md "Plan history"): what the plan measured, what the user
 * says about it, and what that changes in the next plan – always within the safety rules, every
 * change with its reason. Nothing is invented: a value without enough data is null.
 */

const cfg = planConfig.review;

/** A completed activity linked to a session of the plan (for paces and heart rate). */
export interface LinkedActivityFacts {
  workoutId: string;
  durationSec: number;
  distanceM: number | null;
  avgHr: number | null;
}

export interface PlanReview {
  summary: PlanSummary;
  /** Done load / planned load of the sessions so far (0–1+); null without planned load. */
  loadShare: number | null;
  /** Workout types skipped at least `skippedMin` times, most skipped first (max. 3). */
  mostSkipped: { type: WorkoutType; count: number }[];
  /** Quality sessions the plan itself made easy (no hard days in a row, 80/20). */
  qualityDowngraded: number;
  /** Past full weeks with sessions planned and none done. */
  missedWeeks: number;
  pauses: number;
  /** Median pace (s/km) of linked easy runs in the first and the last third; null: too few. */
  easyPace: { first: number; last: number } | null;
  /** Share of linked long runs with an average HR at or below the easy band; null: no data. */
  longEasyShare: number | null;
}

const DOWNGRADE_NOTES = new Set(['notes.downgraded', 'notes.intensityBalance']);

export function planReview(
  state: PlanState,
  profile: UserProfile,
  today: string,
  linked: readonly LinkedActivityFacts[] = [],
  easyMaxBpm?: number,
): PlanReview {
  const summary = planSummary(state, profile, today);
  const sessions = state.plan.weeks
    .flatMap((w) => w.workouts)
    .filter((w) => w.role !== 'commute' && w.date <= summary.coveredUntil);
  const status = (w: Workout) => statusOf(state, w.id);

  const planned = sessions.reduce((s, w) => s + w.load, 0);
  const done = sessions.filter((w) => status(w) === 'done').reduce((s, w) => s + w.load, 0);

  const skips = new Map<WorkoutType, number>();
  for (const w of sessions)
    if (status(w) === 'skipped') skips.set(w.type, (skips.get(w.type) ?? 0) + 1);
  const mostSkipped = [...skips]
    .filter(([, n]) => n >= cfg.skippedMin)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([type, count]) => ({ type, count }));

  const qualityDowngraded = sessions.filter((w) =>
    w.notes.some((n) => DOWNGRADE_NOTES.has(n.key)),
  ).length;

  let missedWeeks = 0;
  for (const week of state.plan.weeks) {
    const inWeek = sessions.filter((w) => week.workouts.includes(w));
    const ended = week.workouts.every((w) => w.date <= summary.coveredUntil);
    if (ended && inWeek.length > 0 && !inWeek.some((w) => status(w) === 'done')) missedWeeks++;
  }

  const byId = new Map(sessions.map((w) => [w.id, w]));
  const facts = linked
    .map((a) => ({ a, w: byId.get(a.workoutId) }))
    .filter((x): x is { a: LinkedActivityFacts; w: Workout } => x.w?.sport === 'run')
    .sort((x, y) => x.w.date.localeCompare(y.w.date));
  const easy = facts
    .filter((x) => x.w.role === 'easy' && x.a.distanceM !== null && x.a.distanceM > 0)
    .map((x) => x.a.durationSec / ((x.a.distanceM as number) / 1000));
  const third = Math.floor(easy.length / 3);
  const easyPace =
    third >= cfg.paceMinPerThird
      ? {
          first: Math.round(median(easy.slice(0, third)) as number),
          last: Math.round(median(easy.slice(-third)) as number),
        }
      : null;
  const longs = facts.filter((x) => x.w.role === 'long' && x.a.avgHr !== null);
  const longEasyShare =
    easyMaxBpm === undefined || longs.length === 0
      ? null
      : Math.round(
          (longs.filter((x) => (x.a.avgHr as number) <= easyMaxBpm).length / longs.length) * 100,
        ) / 100;

  return {
    summary,
    loadShare: planned === 0 ? null : Math.round((done / planned) * 100) / 100,
    mostSkipped,
    qualityDowngraded,
    missedWeeks,
    pauses: state.pauses.length,
    easyPace,
    longEasyShare,
  };
}

// ---------------------------------------------------------------------------------------------
// The user's answers and what they change

export type ReviewWish = 'moreIntervals' | 'moreVolume' | 'moreStrength' | 'fewerDays';

/** Every answer is optional – the review can be skipped as a whole or in part. */
export interface ReviewAnswers {
  overall?: 'tooEasy' | 'right' | 'tooHard';
  long?: 'good' | 'tooLong' | 'tooShort';
  quality?: 'tooLittle' | 'right' | 'tooMuch';
  time?: 'tooMuch' | 'right' | 'tooLittle';
  /** A break was needed because of pain or discomfort (no diagnosis asked). */
  breakForComplaints?: boolean;
  wishes?: ReviewWish[];
}

export interface ReviewChanges {
  /** Start level of every template one up, held or one down. */
  levelShift: -1 | 0 | 1;
  /** Suggested difficulty (the user can turn it off); null: no change. */
  difficulty: number | null;
  qualityEmphasis: QualityEmphasis;
  strengthPriority: StrengthPriority | null;
  long: 'shorter' | 'longer' | null;
  /** Start lower on purpose, as after a pause (resume rules); the start floors do not apply. */
  returnAfterBreak: boolean;
  /** One line per change with its reason (i18n `planReview.lines.<key>`). */
  lines: PlanNote[];
}

export function reviewAdjustments(
  review: PlanReview,
  answers: ReviewAnswers,
  profile: UserProfile,
): ReviewChanges {
  const lines: PlanNote[] = [];
  const percent = Math.round(review.summary.completion * 100);
  const wishes = new Set(answers.wishes ?? []);
  const returnAfterBreak = answers.breakForComplaints === true;

  let levelShift: -1 | 0 | 1 = 0;
  if (returnAfterBreak) {
    levelShift = -1;
    lines.push({ key: 'returnAfterBreak', params: { percent: resumeShare() } });
  } else if (answers.overall === 'tooHard') {
    levelShift = -1;
    lines.push({ key: 'levelsDownHard' });
  } else if (review.summary.sessionsPlanned > 0 && review.summary.completion < cfg.levelDownShare) {
    levelShift = -1;
    lines.push({ key: 'levelsDownDone', params: { percent } });
  } else if (
    review.summary.completion >= cfg.levelUpShare &&
    (answers.overall === 'right' || answers.overall === 'tooEasy')
  ) {
    levelShift = 1;
    lines.push({ key: 'levelsUp', params: { percent } });
  } else if (review.summary.sessionsDone > 0) {
    lines.push({ key: 'levelsHold', params: { percent } });
  }

  const current = difficultyLevel(profile.difficulty);
  let difficulty: number | null = null;
  if (answers.overall === 'tooEasy' && !returnAfterBreak && current < planConfig.difficulty.max)
    difficulty = current + 1;
  if (answers.overall === 'tooHard' && current > planConfig.difficulty.min)
    difficulty = current - 1;
  if (difficulty !== null)
    lines.push({ key: 'difficulty', params: { from: current, to: difficulty } });

  const more = wishes.has('moreIntervals') || answers.quality === 'tooLittle';
  const less = wishes.has('moreVolume') || answers.quality === 'tooMuch';
  const qualityEmphasis: QualityEmphasis = more === less ? 'balanced' : more ? 'more' : 'less';
  if (qualityEmphasis !== 'balanced') lines.push({ key: `quality.${qualityEmphasis}` });

  let strengthPriority: StrengthPriority | null = null;
  if (wishes.has('moreStrength')) {
    if (profile.strength.mode === 'none') lines.push({ key: 'strengthChoose' });
    else {
      strengthPriority = 'strengthFirst';
      lines.push({ key: 'strengthFirst' });
    }
  }

  const long = returnAfterBreak
    ? null
    : answers.long === 'tooLong'
      ? 'shorter'
      : answers.long === 'tooShort'
        ? 'longer'
        : null;
  if (long) lines.push({ key: `long.${long}` });

  if (answers.time === 'tooMuch' || answers.time === 'tooLittle' || wishes.has('fewerDays'))
    lines.push({ key: 'timeHint' });

  return {
    levelShift,
    difficulty,
    qualityEmphasis,
    strengthPriority,
    long,
    returnAfterBreak,
    lines,
  };
}

/** Share of the recent load a return after complaints starts at (the ≤ 7-day resume rule). */
function resumeShare(): number {
  return Math.round((planConfig.edit.resume[0] as { factor: number }).factor * 100);
}

/**
 * The profile of the next plan with the review's changes. `acceptDifficulty` is the user's
 * choice on the suggested difficulty. Safety rules stay with the engine: levels never below 1,
 * the floors still hold – except for a deliberate return after complaints.
 */
export function applyReview(
  profile: UserProfile,
  changes: ReviewChanges,
  acceptDifficulty: boolean,
): UserProfile {
  const baseline = { ...profile.baseline };
  if (baseline.levels) {
    baseline.levels = Object.fromEntries(
      Object.entries(baseline.levels).map(([id, l]) => [id, Math.max(1, l + changes.levelShift)]),
    );
  }
  const next: UserProfile = { ...profile, qualityEmphasis: changes.qualityEmphasis };
  if (changes.difficulty !== null && acceptDifficulty) next.difficulty = changes.difficulty;
  if (changes.strengthPriority)
    next.strength = { ...profile.strength, priority: changes.strengthPriority };

  if (changes.returnAfterBreak) {
    if (baseline.startLoad !== undefined)
      baseline.startLoad = Math.round(baseline.startLoad * (resumeShare() / 100));
    delete baseline.longMin;
    delete baseline.longKm;
    delete baseline.weeklyMin;
    delete next.recentLongest;
  } else if (changes.long && baseline.longMin) {
    const longMin: Partial<Record<Sport, number>> = {};
    const longest = { ...profile.recentLongest };
    for (const sport of SPORTS) {
      const typical = baseline.longMin[sport];
      if (typical === undefined) continue;
      if (changes.long === 'longer') {
        longMin[sport] = Math.round((typical * (1 + cfg.longChange)) / 5) * 5;
      } else {
        // Start at the floor (90 % of the usual long session) – never below it: the floor keeps
        // coming from the usual one.
        longMin[sport] = Math.round(typical * planConfig.floors.longShare);
        longest[sport] = { min: Math.max(typical, longest[sport]?.min ?? 0) };
      }
    }
    baseline.longMin = longMin;
    if (changes.long === 'shorter') next.recentLongest = longest;
  }
  next.baseline = baseline;
  return next;
}
