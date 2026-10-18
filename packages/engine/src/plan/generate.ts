import { zoneConfig } from '../config';
import { assertDefined, checkRange, type Result, type ValidationIssue } from '../result';
import { classifyDays } from './classify';
import { requiredSports, sportShares } from './composition';
import { planConfig } from './config';
import { parseIsoDate, toIsoDate, weekdayOf } from './dates';
import { hardShare } from './load';
import { athleteFor } from './materialize';
import { buildSkeleton, isRaceGoal, weekTargetLoad } from './periodisation';
import { RESTED, scheduleWeek, type PrevDay, type ScheduleDay } from './scheduler';
import {
  SPORTS,
  type Availability,
  type Goal,
  type Plan,
  type PlanNote,
  type PlanWeek,
  type Sport,
  type UserProfile,
  type Workout,
} from './types';

export type PlanField = 'startDate' | 'targetDate' | 'sports' | 'availability' | 'age' | 'strength';

const cfg = planConfig;

function validate(
  profile: UserProfile,
  goal: Goal,
  availability: Availability,
  startDate: string,
  targetDate: string | undefined,
): { issues: ValidationIssue<PlanField>[]; start: number; target: number | null } {
  const issues: ValidationIssue<PlanField>[] = [];
  const start = parseIsoDate(startDate);
  if (start === null) issues.push({ field: 'startDate', code: 'invalidDate' });
  let target: number | null = null;
  if (targetDate !== undefined) {
    target = parseIsoDate(targetDate);
    if (target === null) issues.push({ field: 'targetDate', code: 'invalidDate' });
    else if (start !== null && target <= start)
      issues.push({ field: 'targetDate', code: 'targetNotAfterStart' });
    else if (start !== null && target - (start - weekdayOf(start)) >= cfg.plan.maxWeeks * 7) {
      issues.push({ field: 'targetDate', code: 'planTooLong', params: { max: cfg.plan.maxWeeks } });
    }
  }

  const sports = profile.sports;
  if (
    sports.length === 0 ||
    sports.some((s) => !SPORTS.includes(s)) ||
    new Set(sports).size !== sports.length
  ) {
    issues.push({ field: 'sports', code: 'sportsRequired' });
  } else if (requiredSports(goal.kind).some((s) => !sports.includes(s))) {
    issues.push({ field: 'sports', code: 'goalNeedsSports' });
  }

  const age = checkRange(issues, 'age', profile.age, zoneConfig.hr.limits.age);
  if (age !== undefined && goal.kind === 'weightloss' && age < cfg.plan.weightLossMinAge) {
    issues.push({
      field: 'age',
      code: 'underageWeightLoss',
      params: { min: cfg.plan.weightLossMinAge },
    });
  }

  const minutes = availability.minutesPerDay;
  const limit = { min: 0, max: cfg.plan.maxMinutesPerDay };
  if (
    minutes.length !== 7 ||
    minutes.some((m) => checkRange([], 'availability', m, limit) === undefined)
  ) {
    issues.push({ field: 'availability', code: 'outOfRange', params: limit });
  } else if (minutes.filter((m) => m >= cfg.plan.minSessionMin).length < cfg.plan.minTrainingDays) {
    issues.push({
      field: 'availability',
      code: 'notEnoughAvailability',
      params: { days: cfg.plan.minTrainingDays, minutes: cfg.plan.minSessionMin },
    });
  }

  const strength = profile.strength;
  if (
    (strength.mode === 'split' && !strength.split) ||
    (strength.mode === 'routines' && (strength.routines ?? []).length === 0)
  ) {
    issues.push({ field: 'strength', code: 'required' });
  }
  return { issues, start: start ?? 0, target };
}

/**
 * Generates a periodised plan (CLAUDE.md "Training engine rules", WORKOUTS.md §9–11).
 * Weeks run Monday–Sunday from the week of `startDate`; days before the start are empty. With
 * `targetDate` the plan ends there (race goals: race day, no training on it); without it the plan
 * runs `planConfig.plan.defaultWeeks` weeks. Deterministic: same input → same plan.
 *
 * The +10 % rule compares each week with the previous full loading week (recovery and taper weeks
 * and partial weeks are not used as reference, so returning to normal after a recovery week is fine).
 */
export function generatePlan(
  profile: UserProfile,
  goal: Goal,
  availability: Availability,
  startDate: string,
  targetDate?: string,
): Result<Plan, PlanField> {
  const { issues, start, target } = validate(profile, goal, availability, startDate, targetDate);
  if (issues.length > 0) return { ok: false, issues };

  const raceGoal = isRaceGoal(goal.kind);
  const monday = start - weekdayOf(start);
  const lastDay =
    target === null ? monday + cfg.plan.defaultWeeks * 7 - 1 : raceGoal ? target - 1 : target;
  const weekCount = Math.floor((lastDay - monday) / 7) + 1;
  const skeleton = buildSkeleton(weekCount, goal.kind, profile.age);

  const athlete = athleteFor(profile, goal.kind);
  const shares = sportShares(goal.kind, profile);
  const capacity = capacityLoad(availability, shares);
  const startLoad = capacity * cfg.progression.startFraction[profile.experience];

  const notes: PlanNote[] = [];
  const minWeeks = isRaceGoal(goal.kind) ? cfg.plan.minRaceWeeks[goal.kind] : 0;
  if (weekCount < minWeeks)
    notes.push({
      key: 'notes.shortPreparation',
      params: { weeks: weekCount, recommended: minWeeks },
    });

  let levels = new Map<string, number>();
  let longMin: Partial<Record<Sport, number>> = {};
  let rotation = 0;
  let prev: PrevDay = RESTED;
  let reference: number | null = null;
  let buildWeekIndex = 0;
  let lastBenchmark: number | null = null;
  const weeks: PlanWeek[] = [];

  for (const week of skeleton) {
    const days: ScheduleDay[] = Array.from({ length: 7 }, (_, d) => {
      const day = monday + week.index * 7 + d;
      const inPlan = day >= start && day <= lastDay;
      return {
        day: inPlan ? day : null,
        weekday: weekdayOf(day),
        minutes: inPlan ? assertDefined(availability.minutesPerDay[d], 'minutes') : 0,
      };
    });
    const planDays = days.filter((d) => d.day !== null).length;
    const isPartial = planDays < 7;
    const loading = !week.isRecovery && week.taperIndex === null;
    const benchmark =
      profile.benchmarks !== false &&
      loading &&
      !isPartial &&
      (week.phase === 'base' || week.phase === 'build') &&
      (lastBenchmark === null || week.index - lastBenchmark >= cfg.benchmarks.everyWeeks);
    if (benchmark) lastBenchmark = week.index;

    const targetLoad = (weekTargetLoad(week, reference, startLoad) * planDays) / 7;
    const cap = reference === null ? null : reference * cfg.progression.maxWeeklyIncrease;
    // Recovery and taper weeks must really come down: their target is also their cap.
    const capLoad = loading || cap === null ? cap : Math.min(cap, targetLoad);
    const lastIsRaceEve = raceGoal && target !== null && lastDay - (monday + week.index * 7) < 7;
    const out = scheduleWeek({
      athlete,
      raceGoal,
      skeleton: week,
      composition: {
        goal: goal.kind,
        profile,
        phase: week.phase,
        weekIndex: week.index,
        isRecovery: week.isRecovery,
        raceWeek: week.index === weekCount - 1 && week.taperIndex !== null,
        trainingDays: days.filter((d) => d.minutes >= cfg.plan.minSessionMin).length,
        cssAllowed: cssAllowed(profile, levels),
        benchmark,
        buildWeekIndex,
      },
      shares,
      days,
      doubles: availability.doublesAllowed,
      targetLoad,
      capLoad,
      raceDayIndex: lastIsRaceEve ? lastDay - (monday + week.index * 7) + 1 : null,
      prev,
      levels,
      longMin,
      strengthRotation: rotation,
    });

    levels = out.levels;
    longMin = out.longMin;
    rotation = out.strengthRotation;
    prev = out.last;
    if (loading && !isPartial) reference = out.load;
    if (week.phase === 'build' || week.phase === 'peak') buildWeekIndex++;

    const weekNotes: PlanNote[] = [...out.notes];
    if (week.isRecovery) weekNotes.unshift({ key: 'notes.recoveryWeek' });
    if (week.taperIndex !== null) weekNotes.unshift({ key: 'notes.taperWeek' });
    weeks.push({
      index: week.index,
      startDate: toIsoDate(monday + week.index * 7),
      phase: week.phase,
      isRecovery: week.isRecovery,
      isPartial,
      targetLoad: Math.round(targetLoad),
      load: out.load,
      minutes: out.minutes,
      hardShare: 0,
      workouts: out.workouts,
      notes: weekNotes,
    });
  }

  return {
    ok: true,
    value: {
      goal,
      startDate,
      targetDate: targetDate ?? null,
      weeks: classifyPlan(weeks, profile),
      notes,
    },
  };
}

/** All available minutes (capped per day) at Z2, weighted by the sport mix. */
function capacityLoad(availability: Availability, shares: Record<Sport, number>): number {
  const factor = SPORTS.reduce((sum, s) => sum + shares[s] * cfg.load.sportFactors[s], 0);
  const minutes = availability.minutesPerDay.reduce(
    (sum, m) => sum + Math.min(m, cfg.progression.capacityMinutesPerDayCap),
    0,
  );
  return minutes * cfg.load.zoneWeights[2] * factor;
}

/** CSS sets need 400 m continuous; beginners first work through the technique levels. */
function cssAllowed(profile: UserProfile, levels: ReadonlyMap<string, number>): boolean {
  if (!(profile.canSwim400m ?? profile.experience !== 'beginner')) return false;
  if (profile.experience !== 'beginner') return true;
  return (levels.get('swim.technique') ?? 1) >= cfg.sessions.techniqueLevelBeforeCss;
}

/** Final §11 classification over the whole plan (neighbouring days across weeks) + 80/20 share. */
function classifyPlan(weeks: PlanWeek[], profile: UserProfile): PlanWeek[] {
  const byDay: Workout[][] = [];
  const index: { week: number; day: number }[] = [];
  weeks.forEach((w, wi) => {
    for (let d = 0; d < 7; d++) {
      byDay.push(w.workouts.filter((x) => x.weekday === d));
      index.push({ week: wi, day: d });
    }
  });
  const classified = classifyDays(byDay, profile.experience);
  return weeks.map((w, wi) => {
    const workouts = classified.filter((_, i) => index[i]?.week === wi).flat();
    return { ...w, workouts, hardShare: Math.round(hardShare(workouts) * 1000) / 1000 };
  });
}
