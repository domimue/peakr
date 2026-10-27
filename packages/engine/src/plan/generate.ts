import { zoneConfig } from '../config';
import { assertDefined, checkRange, type Result, type ValidationIssue } from '../result';
import { classifyDays } from './classify';
import { commuteMinutes, commutesOn, commutesValid } from './commute';
import { requiredSports, sportShares } from './composition';
import { planConfig } from './config';
import { difficultyFactor, difficultyGrowth } from './difficulty';
import { checkStartFloors, sportMinutes, startFloors } from './floors';
import { parseIsoDate, toIsoDate, weekdayOf } from './dates';
import { hardShare } from './load';
import { athleteFor } from './materialize';
import { buildSkeleton, isRaceGoal, weekTargetLoad } from './periodisation';
import { describeWorkout } from './workout-type';
import { RESTED, scheduleWeek, type NextDay, type PrevDay, type ScheduleDay } from './scheduler';
import { travelOn } from './travel';
import { annotateWeeks } from './week-facts';
import {
  SPORTS,
  type Availability,
  type Experience,
  type Goal,
  type Plan,
  type PlanNote,
  type PlanWeek,
  type Sport,
  type UserProfile,
  type Workout,
} from './types';

export type PlanField =
  | 'baseline'
  | 'startDate'
  | 'targetDate'
  | 'sports'
  | 'availability'
  | 'age'
  | 'strength'
  | 'commutes'
  | 'weekOverrides'
  | 'travel';

/**
 * Continues an existing plan from `startDate` (new availability, resume after a pause): week
 * indices and phases follow the original plan, progression continues from the given state.
 */
export interface PlanContinuation {
  /** Start date of the original plan. */
  planStartDate: string;
  /**
   * Load of the last full loading week before `startDate` as the engine computed it at difficulty
   * 5 (actual load ÷ its difficulty factor): the progression continues from here.
   */
  referenceLoad: number | null;
  /** That week's actual load – the +10 % cap is always measured against what was planned. */
  referenceActualLoad?: number | null;
  /** The first regenerated week gets `referenceLoad × firstWeekFactor` (resume rules). */
  firstWeekFactor?: number;
  /** Phases restart at Base over the remaining weeks (long pause). */
  restartPhases?: boolean;
  /** Level per template id reached so far. */
  levels?: Readonly<Record<string, number>>;
  /** Next long session duration per sport. */
  longMin?: Readonly<Partial<Record<Sport, number>>>;
  /** The day before `startDate`. */
  prev?: PrevDay;
  /** Week index of the last benchmark test before `startDate`, if any. */
  lastBenchmarkWeek?: number | null;
  /** Prefix for the new workout ids, so they never collide with kept ones. */
  idPrefix?: string;
  /** Only this many weeks from `startDate` (rebuild of single weeks); default: to the end. */
  weeks?: number;
  /** The day after the last generated week, when it stays as planned. */
  next?: NextDay;
}

const cfg = planConfig;

function validate(
  profile: UserProfile,
  goal: Goal,
  availability: Availability,
  startDate: string,
  targetDate: string | undefined,
  planStartDate: string,
): {
  issues: ValidationIssue<PlanField>[];
  start: number;
  planStart: number;
  target: number | null;
} {
  const issues: ValidationIssue<PlanField>[] = [];
  const start = parseIsoDate(startDate);
  const planStart = parseIsoDate(planStartDate);
  if (start === null || planStart === null || planStart > start)
    issues.push({ field: 'startDate', code: 'invalidDate' });
  let target: number | null = null;
  if (targetDate !== undefined) {
    target = parseIsoDate(targetDate);
    if (target === null) issues.push({ field: 'targetDate', code: 'invalidDate' });
    else if (start !== null && target <= start)
      issues.push({ field: 'targetDate', code: 'targetNotAfterStart' });
    else if (
      planStart !== null &&
      target - (planStart - weekdayOf(planStart)) >= cfg.plan.maxWeeks * 7
    ) {
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

  if (!commutesValid(profile.commutes ?? [])) {
    issues.push({ field: 'commutes', code: 'outOfRange', params: planConfig.commute.oneWayMin });
  }
  const validDate = (iso: string) => parseIsoDate(iso) !== null;
  const overrides = availability.weekOverrides ?? [];
  if (
    new Set(overrides.map((o) => o.weekStart)).size !== overrides.length ||
    overrides.some((o) => {
      const monday = parseIsoDate(o.weekStart);
      return (
        monday === null ||
        weekdayOf(monday) !== 0 ||
        (o.minutesPerDay !== undefined &&
          (o.minutesPerDay.length !== 7 ||
            o.minutesPerDay.some((m) => checkRange([], 'availability', m, limit) === undefined))) ||
        (o.blockedDates ?? []).some((d) => !validDate(d))
      );
    })
  ) {
    issues.push({ field: 'weekOverrides', code: 'invalidDate' });
  }
  if (
    (availability.travel ?? []).some(
      (t) => !validDate(t.startDate) || !validDate(t.endDate) || t.endDate < t.startDate,
    )
  ) {
    issues.push({ field: 'travel', code: 'invalidDate' });
  }
  return { issues, start: start ?? 0, planStart: planStart ?? 0, target };
}

/**
 * Generates a periodised plan (CLAUDE.md "Training engine rules", WORKOUTS.md §9–11).
 * Weeks run Monday–Sunday from the week of `startDate`; days before the start are empty. With
 * `targetDate` the plan ends there (race goals: race day, no training on it); without it the plan
 * runs `planConfig.plan.defaultWeeks` weeks – race goals the recommended preparation
 * (`minRaceWeeks`) if longer, ending with the taper. Deterministic: same input → same plan.
 *
 * The +10 % rule compares each week with the previous full loading week (recovery and taper weeks
 * and partial weeks are not used as reference, so returning to normal after a recovery week is fine).
 *
 * With `continuation` only the weeks from `startDate` on are returned (see `regeneratePlan`).
 */
export function generatePlan(
  profile: UserProfile,
  goal: Goal,
  availability: Availability,
  startDate: string,
  targetDate?: string,
  continuation?: PlanContinuation,
): Result<Plan, PlanField> {
  const { issues, start, planStart, target } = validate(
    profile,
    goal,
    availability,
    startDate,
    targetDate,
    continuation?.planStartDate ?? startDate,
  );
  if (issues.length > 0) return { ok: false, issues };

  const raceGoal = isRaceGoal(goal.kind);
  const minWeeks = isRaceGoal(goal.kind) ? cfg.plan.minRaceWeeks[goal.kind] : 0;
  // A race goal without a date gets the recommended preparation (at least the default length).
  const openWeeks = Math.max(cfg.plan.defaultWeeks, minWeeks);
  const monday = planStart - weekdayOf(planStart);
  const lastDay = target === null ? monday + openWeeks * 7 - 1 : raceGoal ? target - 1 : target;
  if (lastDay < start) return { ok: false, issues: [{ field: 'startDate', code: 'invalidDate' }] };
  const weekCount = Math.floor((lastDay - monday) / 7) + 1;
  const firstIndex = Math.floor((start - monday) / 7);
  let skeleton = buildSkeleton(weekCount, goal.kind, profile.age);
  if (continuation?.restartPhases) {
    const rest = buildSkeleton(weekCount - firstIndex, goal.kind, profile.age);
    skeleton = [
      ...skeleton.slice(0, firstIndex),
      ...rest.map((w) => ({ ...w, index: w.index + firstIndex })),
    ];
  }

  const athlete = athleteFor(profile, goal.kind);
  const shares = sportShares(goal.kind, profile);
  const capacity = capacityLoad(availability, shares);
  const startLoad = initialLoad(profile, capacity);

  const notes: PlanNote[] = [];
  if (raceGoal && target === null && !continuation) {
    notes.push({ key: 'notes.noRaceDate', params: { weeks: weekCount } });
  }
  if (weekCount < minWeeks && !continuation)
    notes.push({
      key: 'notes.shortPreparation',
      params: { weeks: weekCount, recommended: minWeeks },
    });

  let levels = new Map<string, number>(Object.entries(continuation?.levels ?? {}));
  let longMin: Partial<Record<Sport, number>> = { ...continuation?.longMin };
  let rotation = 0;
  let prev: PrevDay = continuation?.prev ?? RESTED;
  // The slider scales every target; `reference` is kept at difficulty 5 so a lower setting
  // does not shrink the plan week after week, while the cap uses the actual load.
  const difficulty = difficultyFactor(profile.difficulty);
  const scale = Math.max(1, difficulty);
  const growth = difficultyGrowth(profile.difficulty);
  let reference: number | null = continuation?.referenceLoad ?? null;
  let actualReference: number | null =
    continuation?.referenceActualLoad ?? continuation?.referenceLoad ?? null;
  // Resume after a pause: the first week is a fixed share of the last loading week.
  let firstWeekLoad =
    continuation?.firstWeekFactor === undefined
      ? null
      : (reference ?? startLoad) * continuation.firstWeekFactor;
  let buildWeekIndex = skeleton
    .slice(0, firstIndex)
    .filter((w) => w.phase === 'build' || w.phase === 'peak').length;
  let qualityIndex = skeleton
    .slice(0, firstIndex)
    .filter((w) => (w.phase === 'build' || w.phase === 'peak') && !w.isRecovery).length;
  let lastBenchmark: number | null = continuation?.lastBenchmarkWeek ?? null;
  const weeks: PlanWeek[] = [];

  const generated = skeleton.slice(
    firstIndex,
    continuation?.weeks === undefined ? undefined : firstIndex + continuation.weeks,
  );
  // Week of the volume floor check (`checkStartFloors`): the first one, or the second when the
  // plan starts with fewer than four days. Only a new plan has floors.
  const floors = startFloors(profile);
  const floorWeek =
    continuation || Object.keys(floors.weeklyMin).length === 0
      ? undefined
      : generated[7 - weekdayOf(start) >= 4 ? 0 : 1];
  for (const week of generated) {
    const weekStart = toIsoDate(monday + week.index * 7);
    const override = availability.weekOverrides?.find((o) => o.weekStart === weekStart);
    const minutesPerDay = override?.minutesPerDay ?? availability.minutesPerDay;
    const days: ScheduleDay[] = Array.from({ length: 7 }, (_, d) => {
      const day = monday + week.index * 7 + d;
      const iso = toIsoDate(day);
      const inPlan = day >= start && day <= lastDay;
      const away = override?.blockedDates?.includes(iso) === true;
      return {
        day: inPlan ? day : null,
        weekday: weekdayOf(day),
        minutes: inPlan && !away ? assertDefined(minutesPerDay[d], 'minutes') : 0,
        away,
        travel: inPlan ? travelOn(availability.travel, iso) : null,
      };
    });
    // Minutes left for training after the commutes (they are placed first).
    const trainingMinutes = (d: ScheduleDay) =>
      d.away || d.travel
        ? d.minutes
        : d.minutes - commutesOn(profile, d.weekday).reduce((s, c) => s + commuteMinutes(c), 0);
    const planDays = days.filter((d) => d.day !== null).length;
    const isPartial = planDays < 7;
    // Sessions per sport the floors need: the fewest of this week's days (longest first) whose
    // minutes hold that sport's floor. Three 45-minute days cannot hold 150 minutes – four can.
    const weekMinutes = days.filter((d) => d.day !== null).map(trainingMinutes);
    const floorSessions = Object.fromEntries(
      Object.entries(floors.weeklyMin).map(([sport, min]) => [
        sport,
        sessionsToHold((min * planDays) / 7, weekMinutes),
      ]),
    ) as Partial<Record<Sport, number>>;
    const loading = !week.isRecovery && week.taperIndex === null;
    const benchmark =
      profile.benchmarks !== false &&
      loading &&
      !isPartial &&
      (week.phase === 'base' || week.phase === 'build') &&
      (lastBenchmark === null || week.index - lastBenchmark >= cfg.benchmarks.everyWeeks);
    if (benchmark) lastBenchmark = week.index;

    // Harder settings scale every target up (the +10 % cap below still limits it); easier ones
    // slow the growth of the loading weeks (`difficultyGrowth`), so start, recovery and taper
    // weeks keep the structure the rules require.
    const fullTarget =
      (firstWeekLoad ?? weekTargetLoad(week, reference, startLoad, growth)) * scale;
    const targetLoad = (fullTarget * planDays) / 7;
    const cap =
      actualReference === null ? null : actualReference * cfg.progression.maxWeeklyIncrease;
    // Recovery, taper and resume weeks must really come down: their target is also their cap.
    const capLoad =
      firstWeekLoad !== null
        ? targetLoad
        : loading || cap === null
          ? cap
          : Math.min(cap, targetLoad);
    const lastIsRaceEve = raceGoal && target !== null && lastDay - (monday + week.index * 7) < 7;
    const scheduleAt = (load: number) =>
      scheduleWeek({
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
          trainingDays: days.filter((d) => trainingMinutes(d) >= cfg.plan.minSessionMin).length,
          floorSessions,
          cssAllowed: cssAllowed(profile, levels),
          benchmark,
          buildWeekIndex,
          qualityIndex,
        },
        shares,
        days,
        doubles: availability.doublesAllowed,
        targetLoad: load,
        capLoad,
        raceDayIndex: lastIsRaceEve ? lastDay - (monday + week.index * 7) + 1 : null,
        ...(continuation?.next && week === generated[generated.length - 1]
          ? { next: continuation.next }
          : {}),
        prev,
        levels,
        longMin,
        strengthRotation: rotation,
        ...(continuation?.idPrefix ? { idPrefix: continuation.idPrefix } : {}),
      });
    let out = scheduleAt(targetLoad);
    // The week the start floors are checked on holds what the athlete already does per sport: a
    // week that reaches its load with fewer minutes (a benchmark or quality session packs more
    // load per minute) is rebuilt with a higher target – as far as the availability allows.
    if (week === floorWeek) {
      for (let tries = 0, load = targetLoad; tries < cfg.floors.retries; tries++) {
        const short = volumeShortfall(out.workouts, floors.weeklyMin, planDays);
        if (short <= 1) break;
        // From what the week already carries: strength and the minimum sessions can put it above
        // its target, and a higher target below that would build the same week again. At least
        // one step that survives the 5-minute rounding of the sessions.
        load = Math.max(load, out.load) * Math.max(short, cfg.floors.minStep);
        const next = scheduleAt(load);
        if (next.load > out.load) out = next;
      }
    }

    levels = out.levels;
    longMin = out.longMin;
    rotation = out.strengthRotation;
    prev = out.last;
    if (firstWeekLoad !== null) {
      // The reduced week is the new reference (scaled up when it was partial).
      actualReference = (out.load * 7) / planDays;
      reference = actualReference / scale;
      firstWeekLoad = null;
    } else if (loading && !isPartial && !override && !days.some((d) => d.travel)) {
      // Irregular and travel weeks are no reference: the weeks after continue the normal progression.
      actualReference = out.load;
      reference = out.load / scale;
    }
    if (week.phase === 'build' || week.phase === 'peak') {
      buildWeekIndex++;
      // Benchmark weeks replace the key session, so they do not use up a rotation turn either.
      // (also when the 80/20 balance turned the test into an easy run – the turn is still gone).
      const tested = out.workouts.some((w) => w.notes.some((n) => n.key === 'notes.benchmark'));
      if (!week.isRecovery && !tested) qualityIndex++;
    }

    const weekNotes: PlanNote[] = [...out.notes];
    if (week.isRecovery) weekNotes.unshift({ key: 'notes.recoveryWeek' });
    if (week.taperIndex !== null) weekNotes.unshift({ key: 'notes.taperWeek' });
    if (override) weekNotes.push({ key: 'notes.weekOverride' });
    if (days.some((d) => d.travel)) weekNotes.push({ key: 'notes.travelWeek' });
    weeks.push({
      index: week.index,
      // Number, distance and kind are filled in by `annotateWeeks` below.
      number: week.index + 1,
      distanceKm: 0,
      kind: 'normal',
      startDate: weekStart,
      phase: week.phase,
      isRecovery: week.isRecovery,
      isPartial,
      targetLoad: Math.round(targetLoad),
      load: out.load,
      difficultyFactor: scale,
      minutes: out.minutes,
      hardShare: 0,
      workouts: out.workouts,
      notes: weekNotes,
    });
  }

  const plan = annotateWeeks(
    {
      goal,
      startDate: continuation?.planStartDate ?? startDate,
      targetDate: targetDate ?? null,
      weeks: classifyPlan(weeks, profile.experience),
      notes,
    },
    profile,
  );
  // A new plan never starts below what the athlete already does (CLAUDE.md "Baseline"). If the
  // availability cannot hold it, that is an error to show – not a beginner plan to ship. A plan
  // continued after a pause starts lower on purpose (resume rules) and is not checked.
  if (!continuation) {
    const breaches = checkStartFloors(plan, floors);
    if (breaches.length > 0) {
      return {
        ok: false,
        issues: breaches.map((b) => ({
          field: 'baseline' as const,
          code:
            b.kind === 'long' ? ('belowBaselineLong' as const) : ('belowBaselineVolume' as const),
          // `sport` is the index in `SPORTS` (issue params are numbers).
          params: {
            sport: SPORTS.indexOf(b.sport),
            plannedMin: b.plannedMin,
            floorMin: b.floorMin,
          },
        })),
      };
    }
  }
  return { ok: true, value: plan };
}

/**
 * Week-1 target load: the quiz share of the capacity, or the current weekly load from the
 * baseline – never below the beginner share and never above the capacity.
 */
function initialLoad(profile: UserProfile, capacity: number): number {
  const fractions = cfg.progression.startFraction;
  const own = profile.baseline?.startLoad;
  if (own === undefined) return capacity * fractions[profile.experience];
  return Math.min(capacity, Math.max(capacity * fractions.beginner, own));
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
export function classifyPlan(weeks: PlanWeek[], experience: Experience): PlanWeek[] {
  const byDay: Workout[][] = [];
  const index: { week: number; day: number }[] = [];
  weeks.forEach((w, wi) => {
    for (let d = 0; d < 7; d++) {
      byDay.push(w.workouts.filter((x) => x.weekday === d));
      index.push({ week: wi, day: d });
    }
  });
  const classified = classifyDays(byDay, experience);
  return weeks.map((w, wi) => {
    const workouts = classified
      .filter((_, i) => index[i]?.week === wi)
      .flat()
      .map(describeWorkout);
    return { ...w, workouts, hardShare: Math.round(hardShare(workouts) * 1000) / 1000 };
  });
}

/** The fewest days (longest first) whose minutes add up to `minutes`; all of them if never. */
function sessionsToHold(minutes: number, minutesPerDay: readonly number[]): number {
  const usable = minutesPerDay.filter((m) => m >= cfg.plan.minSessionMin).sort((a, b) => b - a);
  let sum = 0;
  for (let n = 0; n < usable.length; n++) {
    sum += usable[n] as number;
    if (sum >= minutes) return n + 1;
  }
  return usable.length;
}

/**
 * How far the week's minutes fall short of the volume floors: the largest needed / planned ratio
 * over the sports (≤ 1: nothing missing). A sport without any session cannot be scaled up.
 */
function volumeShortfall(
  workouts: readonly Workout[],
  weeklyMin: Partial<Record<Sport, number>>,
  planDays: number,
): number {
  let ratio = 1;
  for (const [sport, floor] of Object.entries(weeklyMin) as [Sport, number][]) {
    const planned = sportMinutes(workouts, sport);
    const needed = (floor * planDays) / 7;
    if (planned > 0 && planned < needed) ratio = Math.max(ratio, needed / planned);
  }
  return ratio;
}
