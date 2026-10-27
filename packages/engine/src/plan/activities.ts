import type { HrZone } from '../hr';
import type { ZoneNumber } from '../zones';
import { planConfig } from './config';
import { allWorkouts, statusOf, type PlanState } from './edit';
import { climbMultiplier, strengthLoad } from './load';
import type { Sport, WinterSport, Workout } from './types';

/**
 * Activities recorded on a watch or phone and imported from Strava, a watch provider or the
 * phone's health data (CLAUDE.md "Automatic activity sync"): one record per activity after
 * deduplication, its load in the unified load model, and the planned workout it fulfils.
 */

const cfg = planConfig.activities;

/** Where an activity record came from. Watch providers first (see `sourcePriority`). */
export type ActivitySource = (typeof cfg.sourcePriority)[number];
export const ACTIVITY_SOURCES: readonly ActivitySource[] = cfg.sourcePriority;

/** Sports that are imported (other activity types are ignored). */
export type ImportedSport = Sport | WinterSport | 'walk' | 'strength';
export const IMPORTED_SPORTS: readonly ImportedSport[] = [
  'run',
  'bike',
  'swim',
  'walk',
  'xcski',
  'skitour',
  'snowshoe',
  'strength',
];

/** One activity as one source delivered it. */
export interface SourceActivity {
  source: ActivitySource;
  /** Id at the source (e.g. the Strava activity id). */
  externalId: string;
  sport: ImportedSport;
  /** Start as an ISO timestamp (UTC). */
  startTime: string;
  /** Local calendar date of the start (`YYYY-MM-DD`) – the plan day it belongs to. */
  date: string;
  /** Moving time. */
  durationSec: number;
  distanceM: number | null;
  elevationGainM: number | null;
  /** Total descent, when the source or the stream has it (eccentric load of runs). */
  elevationLossM?: number | null;
  avgHr: number | null;
  maxHr: number | null;
  /** Swims: average pace per 100 m. */
  swimPaceSecPer100m: number | null;
  /** GPS track as an encoded polyline (Google format) for the route thumbnail; null indoors. */
  polyline: string | null;
  /** The user's own title of the activity. */
  name: string | null;
  /** Treadmill, trainer, pool without GPS … */
  indoor: boolean;
  /** Marked as a commute at the source. */
  commute: boolean;
  /**
   * Summary only: the source has the session but not its content (e.g. a Strava weight-training
   * activity without sets). A detailed record of the same activity always wins over it.
   */
  summary: boolean;
  /** Session RPE 1–10 if the source has it (Strava "perceived exertion"); strength load uses it. */
  rpe: number | null;
}

export interface SourceRef {
  source: ActivitySource;
  externalId: string;
}

/** One real activity: the best source's data, gaps filled from the other sources. */
export interface Activity extends Omit<SourceActivity, 'externalId'> {
  /** Key of the primary record (`<source>:<externalId>`). */
  key: string;
  /** Every record of this activity, highest priority first (`source` is the first one's). */
  sources: SourceRef[];
}

export function activityKey(ref: SourceRef): string {
  return `${ref.source}:${ref.externalId}`;
}

/** Every key of an activity – links survive a better source arriving later. */
export function activityKeys(a: Pick<Activity, 'sources'>): string[] {
  return a.sources.map(activityKey);
}

const priority = (s: ActivitySource) => ACTIVITY_SOURCES.indexOf(s);

/**
 * The same workout from two sources: same sport, start times at most 5 min apart and durations
 * within 10 % (CLAUDE.md "Deduplication").
 */
export function isSameActivity(
  a: Pick<SourceActivity, 'sport' | 'startTime' | 'durationSec'>,
  b: Pick<SourceActivity, 'sport' | 'startTime' | 'durationSec'>,
): boolean {
  if (a.sport !== b.sport) return false;
  const startDiffSec = Math.abs(Date.parse(a.startTime) - Date.parse(b.startTime)) / 1000;
  if (!(startDiffSec <= cfg.dedupeStartToleranceSec)) return false;
  const longer = Math.max(a.durationSec, b.durationSec);
  return Math.abs(a.durationSec - b.durationSec) <= longer * cfg.dedupeDurationTolerance;
}

type Fillable = 'distanceM' | 'elevationGainM' | 'avgHr' | 'maxHr' | 'swimPaceSecPer100m' | 'rpe';
const FILLABLE: readonly Fillable[] = [
  'distanceM',
  'elevationGainM',
  'avgHr',
  'maxHr',
  'swimPaceSecPer100m',
  'rpe',
];

/** A detailed record always beats a summary one; then the source priority decides. */
const rank = (a: SourceActivity, b: SourceActivity) =>
  Number(a.summary) - Number(b.summary) || priority(a.source) - priority(b.source);

function merge(records: readonly SourceActivity[]): Activity {
  // A group never holds two records of one source, so detail and priority alone order it.
  const sorted = [...records].sort(rank);
  const [best, ...rest] = sorted as [SourceActivity, ...SourceActivity[]];
  const merged: Activity = {
    source: best.source,
    sport: best.sport,
    startTime: best.startTime,
    date: best.date,
    durationSec: best.durationSec,
    distanceM: best.distanceM,
    elevationGainM: best.elevationGainM,
    avgHr: best.avgHr,
    maxHr: best.maxHr,
    swimPaceSecPer100m: best.swimPaceSecPer100m,
    polyline: best.polyline,
    name: best.name,
    indoor: best.indoor,
    commute: best.commute,
    summary: best.summary,
    rpe: best.rpe,
    key: activityKey(best),
    sources: sorted.map(({ source, externalId }) => ({ source, externalId })),
  };
  for (const field of FILLABLE) {
    if (merged[field] === null)
      merged[field] = rest.find((r) => r[field] !== null)?.[field] ?? null;
  }
  // The route and the title usually live on Strava, not on the watch provider's record.
  merged.polyline ??= rest.find((r) => r.polyline !== null)?.polyline ?? null;
  merged.name ??= rest.find((r) => r.name !== null)?.name ?? null;
  merged.commute ||= rest.some((r) => r.commute);
  return merged;
}

/**
 * Groups records of the same activity from different sources and keeps one record per activity –
 * a detailed record over a summary one, then by the source priority watch provider > Strava >
 * health data – remembering every source id.
 * Two records from the same source are always two activities. Sorted by start time.
 */
export function dedupeActivities(records: readonly SourceActivity[]): Activity[] {
  const sorted = [...records].sort(
    (a, b) =>
      Date.parse(a.startTime) - Date.parse(b.startTime) ||
      priority(a.source) - priority(b.source) ||
      a.externalId.localeCompare(b.externalId),
  );
  const groups: SourceActivity[][] = [];
  for (const record of sorted) {
    const group = groups.find(
      (g) => !g.some((r) => r.source === record.source) && g.some((r) => isSameActivity(r, record)),
    );
    if (group) group.push(record);
    else groups.push([record]);
  }
  return groups
    .map(merge)
    .sort(
      (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || a.key.localeCompare(b.key),
    );
}

// ---------------------------------------------------------------------------------------------
// Load

/** Zone of the average heart rate; the default zone without HR or zones. */
export function activityZone(
  a: Pick<SourceActivity, 'avgHr'>,
  hrZones: readonly HrZone[],
): ZoneNumber {
  if (a.avgHr === null || hrZones.length === 0) return cfg.defaultZone;
  const hr = a.avgHr;
  const zone = hrZones.find(
    (z) => (z.minBpm === null || hr >= z.minBpm) && (z.maxBpm === null || hr <= z.maxBpm),
  );
  if (zone) return zone.zone;
  // Between two rounded boundaries or outside the table.
  const first = hrZones[0] as HrZone;
  if (first.minBpm !== null && hr < first.minBpm) return 1;
  const below = hrZones.filter((z) => z.maxBpm !== null && hr > z.maxBpm);
  return below.length === hrZones.length ? 5 : (Math.min(5, below.length + 1) as ZoneNumber);
}

/**
 * Unified load: duration_min × zone weight × sport factor; strength duration_min × session RPE / 2
 * (CLAUDE.md "Unified load"), with a default RPE when the source has none.
 */
export function activityLoad(
  a: Pick<SourceActivity, 'avgHr' | 'durationSec' | 'sport'> &
    Partial<Pick<SourceActivity, 'rpe' | 'distanceM' | 'elevationGainM'>>,
  hrZones: readonly HrZone[],
): number {
  if (a.sport === 'strength') {
    return Math.round(strengthLoad(a.durationSec / 60, a.rpe ?? cfg.strengthDefaultRpe) * 10) / 10;
  }
  const load =
    (a.durationSec / 60) *
    planConfig.load.zoneWeights[activityZone(a, hrZones)] *
    planConfig.load.sportFactors[a.sport] *
    climbMultiplier(a.sport, gainPerKm(a));
  return Math.round(load * 10) / 10;
}

/** Gain per km of an activity; 0 without distance or elevation. */
function gainPerKm(a: Partial<Pick<SourceActivity, 'distanceM' | 'elevationGainM'>>): number {
  const km = (a.distanceM ?? 0) / 1000;
  return km > 0 && a.elevationGainM ? a.elevationGainM / km : 0;
}

/**
 * Long running descents add eccentric load (CLAUDE.md "Terrain" §6): more recovery afterwards and
 * no heavy leg strength the next day. Without a measured descent the gain stands in for it (most
 * runs end where they started).
 */
export function isEccentricActivity(
  a: Pick<SourceActivity, 'sport' | 'durationSec' | 'distanceM' | 'elevationGainM'> &
    Partial<Pick<SourceActivity, 'elevationLossM'>>,
): boolean {
  const e = planConfig.terrain.eccentric;
  if (a.sport !== 'run' || a.durationSec / 60 < e.minDurationMin) return false;
  const km = (a.distanceM ?? 0) / 1000;
  const loss = a.elevationLossM ?? a.elevationGainM ?? 0;
  return km > 0 && loss / km >= e.minGainPerKm;
}

/**
 * Hard for the spacing rules: Z4+ on average, a long Z3 session, or a long session. Imported
 * strength is never hard: without its exercises the leg load is unknown (heavy legs come from a
 * detailed log).
 */
export function isHardActivity(
  a: Pick<SourceActivity, 'avgHr' | 'durationSec' | 'sport'>,
  hrZones: readonly HrZone[],
): boolean {
  if (a.sport === 'strength') return false;
  const zone = activityZone(a, hrZones);
  const minutes = a.durationSec / 60;
  if (zone >= cfg.hardZone) return true;
  if (zone >= cfg.tempoZone && minutes >= cfg.tempoMinMin) return true;
  return minutes >= cfg.longMin[a.sport];
}

// ---------------------------------------------------------------------------------------------
// Matching to planned workouts

export interface ActivityLink {
  /** Key of the activity (any of its source keys works for lookups). */
  activityKey: string;
  workoutId: string;
}

export interface WorkoutCandidate {
  workoutId: string;
  /** Confidence 0–1. */
  score: number;
}

/** An activity that may belong to one of these planned workouts – the user decides. */
export interface MatchQuestion {
  activityKey: string;
  candidates: WorkoutCandidate[];
}

export interface MatchResult {
  /** New links: the workout is fulfilled by the activity (mark it done). */
  links: ActivityLink[];
  /** Not confident: ask, offering the plausible candidates and "none of these". */
  questions: MatchQuestion[];
  /** Activities without a plausible planned workout: count towards the load and rebalance the week. */
  unplanned: Activity[];
}

function fits(w: Workout, a: Activity): boolean {
  if (w.sport === a.sport) return true;
  // A winter variant (e.g. long run → long XC ski session) is the same planned session.
  if (w.winterVariant?.sport === a.sport) return true;
  // Bricks are recorded as a ride and a run.
  return w.sport === 'brick' && (a.sport === 'bike' || a.sport === 'run');
}

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** 1 within ±`fullWithin` of the plan, falling linearly to 0 at ±`zeroAt`. */
function closeness(actual: number, planned: number): number {
  const m = cfg.match;
  if (!(planned > 0)) return 0;
  const off = Math.abs(actual - planned) / planned;
  if (off <= m.fullWithin) return 1;
  return Math.max(0, 1 - (off - m.fullWithin) / (m.zeroAt - m.fullWithin));
}

/**
 * How sure Peakr is that the activity is this planned workout, 0–1: the sport must fit (winter
 * variants and bricks included), the day counts fully (the next or previous day half), then
 * duration and – when the plan has one – distance. A commute and a training session fit less.
 */
export function matchScore(
  w: Workout,
  a: Activity,
  plannedKm: number | null = null,
): number {
  const m = cfg.match;
  if (!fits(w, a)) return 0;
  const days = Math.abs(dayNumber(w.date) - dayNumber(a.date));
  const date = days === 0 ? m.sameDay : days === 1 ? m.adjacentDay : 0;
  if (date === 0) return 0;
  // A brick's ride or run is about half of the whole session.
  const planned = w.sport === 'brick' ? w.durationMin / 2 : w.durationMin;
  const duration = closeness(a.durationSec / 60, planned);
  const km = plannedKm !== null && plannedKm > 0 && a.distanceM !== null && a.distanceM > 0;
  const shape = km
    ? m.durationWeight * duration +
      m.distanceWeight * closeness((a.distanceM as number) / 1000, plannedKm as number)
    : duration;
  const commute = (w.role === 'commute') === a.commute ? 1 : m.commuteMismatch;
  return Math.round(date * shape * commute * 1000) / 1000;
}

/**
 * Matches each activity to a planned workout with a confidence score (`matchScore`): confident
 * and clearly ahead → linked (mark it done); plausible → a question with the candidates; nothing
 * plausible → unplanned (it counts towards the week's load; the planned workout stays open – an
 * activity is never attached to the nearest workout just because it is there). Skipped workouts
 * are not matched; workouts the user already marked done by hand are. Activities in
 * `alreadyLinked` (by any source key) and workouts in `linkedWorkouts` are left alone. `distance`
 * gives a workout's planned km for its sport, when known. Deterministic: activities in start order.
 */
export function matchActivities(
  state: PlanState,
  activities: readonly Activity[],
  alreadyLinked: ReadonlySet<string>,
  linkedWorkouts: ReadonlySet<string>,
  distance: (w: Workout, a: Activity) => number | null = () => null,
): MatchResult {
  const m = cfg.match;
  const used = new Set(linkedWorkouts);
  // One entry per workout id (a plan lists each workout once; edited states may repeat one).
  const workouts = [
    ...new Map(
      allWorkouts(state.plan)
        .filter((w) => statusOf(state, w.id) !== 'skipped')
        .map((w) => [w.id, w]),
    ).values(),
  ];
  const links: ActivityLink[] = [];
  const questions: MatchQuestion[] = [];
  const unplanned: Activity[] = [];
  for (const a of activities) {
    if (activityKeys(a).some((k) => alreadyLinked.has(k))) continue;
    const scored = workouts
      // A brick takes its ride and its run.
      .filter((w) => w.sport === 'brick' || !used.has(w.id))
      .map((w) => ({ workoutId: w.id, score: matchScore(w, a, distance(w, a)) }))
      .filter((c) => c.score >= m.plausible)
      .sort((x, y) => y.score - x.score || x.workoutId.localeCompare(y.workoutId));
    const [best, next] = scored;
    if (best && best.score >= m.confident && (!next || best.score - next.score >= m.margin)) {
      used.add(best.workoutId);
      links.push({ activityKey: a.key, workoutId: best.workoutId });
    } else if (best) {
      questions.push({ activityKey: a.key, candidates: scored.slice(0, m.maxCandidates) });
    } else {
      unplanned.push(a);
    }
  }
  return { links, questions, unplanned };
}
