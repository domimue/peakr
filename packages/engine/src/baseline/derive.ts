import { zoneConfig } from '../config';
import { estimateHrMax, type HrZone } from '../hr';
import { activityLoad } from '../plan/activities';
import { planConfig } from '../plan/config';
import { parseIsoDate, weekdayOf } from '../plan/dates';
import { gainPaceFactor } from '../plan/terrain';
import { SPORTS, type Experience, type Sport } from '../plan/types';
import { classifyTerrain } from '../route/terrain-profile';
import { median, theilSen, trimmedMean } from '../stats';
import type {
  BaselineActivity,
  BaselineResult,
  Derived,
  PaceHrRelation,
  SportBaseline,
  SportVolume,
} from './types';

const cfg = planConfig.baseline;

export interface DeriveOptions {
  /** Local date (YYYY-MM-DD); only activities of the last `windowDays` before it count. */
  today: string;
  age: number;
  /** Provisional HR zones from the quiz (may be empty). */
  hrZones: readonly HrZone[];
  /** Zones the user set on Strava themselves; they take precedence over the provisional ones. */
  stravaHrZones?: readonly HrZone[] | null;
}

/**
 * Derives the plan calibration from the selected baseline activities. Robust statistics only
 * (median, trimmed mean, Theil–Sen); every value needs a minimum number of usable activities and
 * otherwise reports "not enough data" instead of a bad number.
 *
 * Which activities count per value:
 *
 * | Value                          | Counts                                   | Left out                       |
 * |--------------------------------|------------------------------------------|--------------------------------|
 * | Volume, frequency, longest     | all, incl. indoor, manual, without HR    | –                              |
 * | Terrain (gain per km)          | outdoor run/bike with distance and gain  | indoor, manual                 |
 * | Easy pace                      | outdoor runs ≥ 1 km; easy = avg HR ≤ Z2 top, without zones/HR the slowest third | treadmill, manual, races |
 * | Pace–HR relation               | outdoor runs ≥ 1 km with HR              | treadmill, manual, races       |
 * | HRmax                          | activities with a max HR                 | manual                         |
 * | LTHR                           | hard runs (else rides) with HR: 95 % of the best 20 min, or avg HR of 20–60 min efforts | manual, no HR, swims (wrist HR) |
 * | CSS                            | swims ≥ 400 m                            | manual                         |
 * | Weekly load                    | all (unified load model; no HR → Zone 2) | –                              |
 * | Resting HR                     | not available from Strava                | –                              |
 *
 * Paces are grade-adjusted with the Minetti model so hilly runs do not look slower.
 */
export function deriveBaseline(
  selected: readonly BaselineActivity[],
  options: DeriveOptions,
): BaselineResult {
  const today = parseIsoDate(options.today);
  if (today === null) throw new RangeError(`invalid date: ${options.today}`);
  const windowStart = today - cfg.windowDays + 1;
  const acts = selected.filter((a) => {
    const day = parseIsoDate(a.date);
    return day !== null && day >= windowStart && day <= today && a.durationSec > 0;
  });
  const zones = options.stravaHrZones ?? options.hrZones;
  const weeks = coveredWeeks(acts, windowStart, today);
  const hrMax = deriveHrMax(acts);

  return {
    activities: acts.length,
    weeks: weeks.length,
    sports: SPORTS.map((sport) => sportBaseline(sport, acts, weeks)),
    easyPaceSecPerKm: deriveEasyPace(acts, zones),
    paceHr: derivePaceHr(acts, zones),
    hrMax,
    lthr: deriveLthr(acts, hrMax.status === 'ok' ? hrMax.value : estimateHrMax(options.age)),
    cssPacePer100mSec: deriveCss(acts),
    weeklyLoad: deriveWeeklyLoad(acts, weeks, zones),
    stravaHrZones: options.stravaHrZones ? [...options.stravaHrZones] : null,
  };
}

function ok<T>(value: T, count: number): Derived<T> {
  return { status: 'ok', value, count };
}

function notEnough<T>(count: number, needed: number): Derived<T> {
  return { status: 'notEnoughData', count, needed };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------------------------------------
// Weeks and volume

/** Mondays (day numbers) of the full weeks inside the window, from the first activity's week. */
function coveredWeeks(acts: readonly BaselineActivity[], windowStart: number, today: number) {
  const days = acts.map((a) => parseIsoDate(a.date) as number);
  if (days.length === 0) return [];
  const mondayOf = (d: number) => d - weekdayOf(d);
  let first = Math.max(mondayOf(Math.min(...days)), mondayOf(windowStart));
  if (first < windowStart) first += 7; // the window starts mid-week: that week is partial
  const weeks: number[] = [];
  for (let monday = first; monday + 6 <= today; monday += 7) weeks.push(monday);
  return weeks;
}

function inWeek(a: BaselineActivity, monday: number): boolean {
  const day = parseIsoDate(a.date) as number;
  return day >= monday && day <= monday + 6;
}

function sportBaseline(
  sport: Sport,
  acts: readonly BaselineActivity[],
  weeks: readonly number[],
): SportBaseline {
  const own = acts.filter((a) => a.sport === sport);
  const volume = deriveVolume(own, weeks);
  return {
    sport,
    activities: own.length,
    volume,
    experience:
      volume.status === 'ok'
        ? ok(levelClass(sport, volume.value), volume.count)
        : notEnough(volume.count, volume.needed),
    terrain: sport === 'swim' ? null : deriveTerrain(sport, own),
  };
}

function deriveVolume(
  own: readonly BaselineActivity[],
  weeks: readonly number[],
): Derived<SportVolume> {
  if (own.length < cfg.min.volume || weeks.length < cfg.minWeeks)
    return notEnough(own.length, cfg.min.volume);
  const perWeek = weeks.map((monday) => own.filter((a) => inWeek(a, monday)));
  const minutes = perWeek.map((w) => w.reduce((s, a) => s + a.durationSec / 60, 0));
  const km = perWeek.map((w) => w.reduce((s, a) => s + (a.distanceM ?? 0) / 1000, 0));
  const longestPerWeek = perWeek
    .filter((w) => w.length > 0)
    .map((w) => Math.max(...w.map((a) => a.durationSec / 60)));
  return ok(
    {
      weeklyMin: Math.round(trimmedMean(minutes, cfg.trim) as number),
      weeklyKm: round1(trimmedMean(km, cfg.trim) as number),
      sessionsPerWeek: round1(
        trimmedMean(
          perWeek.map((w) => w.length),
          cfg.trim,
        ) as number,
      ),
      longestMin: Math.round(Math.max(...own.map((a) => a.durationSec / 60))),
      longMin: Math.round((median(longestPerWeek) ?? 0) / 5) * 5,
    },
    own.length,
  );
}

/** §10: beginner / intermediate / advanced from frequency, weekly volume and longest session. */
function levelClass(sport: Sport, v: SportVolume): Experience {
  const t = cfg.levels[sport];
  const meets = (x: { sessions: number; weeklyMin: number; longestMin: number }) =>
    v.sessionsPerWeek >= x.sessions && v.weeklyMin >= x.weeklyMin && v.longestMin >= x.longestMin;
  if (meets(t.advanced)) return 'advanced';
  if (meets(t.intermediate)) return 'intermediate';
  return 'beginner';
}

function deriveTerrain(
  sport: 'run' | 'bike',
  own: readonly BaselineActivity[],
): SportBaseline['terrain'] {
  const usable = own.filter(
    (a) => !a.indoor && !a.manual && (a.distanceM ?? 0) > 0 && a.elevationGainM !== null,
  );
  if (usable.length < cfg.min.terrain) return notEnough(usable.length, cfg.min.terrain);
  const km = usable.reduce((s, a) => s + (a.distanceM as number) / 1000, 0);
  const gain = usable.reduce((s, a) => s + (a.elevationGainM as number), 0);
  const gainPerKm = round1(gain / km);
  return ok({ gainPerKm, terrain: classifyTerrain(sport, gainPerKm) }, usable.length);
}

// ---------------------------------------------------------------------------------------------
// Paces and heart rate

interface PacedRun {
  activity: BaselineActivity;
  /** Grade-adjusted pace (s/km). */
  gap: number;
}

function pacedRuns(acts: readonly BaselineActivity[]): PacedRun[] {
  return acts
    .filter(
      (a) =>
        a.sport === 'run' &&
        !a.indoor &&
        !a.manual &&
        !a.race &&
        (a.distanceM ?? 0) >= cfg.minRunDistanceM,
    )
    .map((a) => {
      const km = (a.distanceM as number) / 1000;
      const gap = a.durationSec / km / gainPaceFactor((a.elevationGainM ?? 0) / km);
      return { activity: a, gap };
    });
}

function z2Top(zones: readonly HrZone[]): number | null {
  return zones.find((z) => z.zone === 2)?.maxBpm ?? null;
}

function deriveEasyPace(
  acts: readonly BaselineActivity[],
  zones: readonly HrZone[],
): Derived<number> {
  const runs = pacedRuns(acts);
  if (runs.length < cfg.min.easyRuns) return notEnough(runs.length, cfg.min.easyRuns);
  const top = z2Top(zones);
  const byHr =
    top === null ? [] : runs.filter((r) => r.activity.avgHr !== null && r.activity.avgHr <= top);
  if (byHr.length >= cfg.min.easySubset)
    return ok(Math.round(median(byHr.map((r) => r.gap)) as number), byHr.length);
  // No zones or too few runs with HR: the slowest third of the runs are the easy ones.
  const n = Math.max(cfg.min.easySubset, Math.ceil(runs.length / 3));
  const slowest = runs
    .map((r) => r.gap)
    .sort((a, b) => b - a)
    .slice(0, n);
  return ok(Math.round(median(slowest) as number), slowest.length);
}

function derivePaceHr(
  acts: readonly BaselineActivity[],
  zones: readonly HrZone[],
): Derived<PaceHrRelation> {
  const runs = pacedRuns(acts).filter((r) => r.activity.avgHr !== null);
  if (runs.length < cfg.min.paceHr) return notEnough(runs.length, cfg.min.paceHr);
  const fit = theilSen(runs.map((r) => ({ x: r.activity.avgHr as number, y: r.gap })));
  // Pace must get faster with a higher HR; anything else is noise, not a relation.
  if (fit === null || fit.slope >= 0) return notEnough(runs.length, cfg.min.paceHr);
  const referenceHr =
    z2Top(zones) ?? Math.round(median(runs.map((r) => r.activity.avgHr as number)) as number);
  return ok(
    {
      slopeSecPerKmPerBpm: round1(fit.slope),
      referenceHr,
      paceAtReferenceSecPerKm: Math.round(fit.intercept + fit.slope * referenceHr),
    },
    runs.length,
  );
}

function deriveHrMax(acts: readonly BaselineActivity[]): Derived<number> {
  const limits = zoneConfig.hr.limits.hrMax;
  const values = acts
    .filter((a) => !a.manual && a.maxHr !== null && a.maxHr <= limits.max)
    .map((a) => a.maxHr as number)
    .sort((a, b) => b - a);
  if (values.length < cfg.min.hrMax) return notEnough(values.length, cfg.min.hrMax);
  const value = values[cfg.hrMaxRank - 1] as number;
  return value < limits.min ? notEnough(values.length, cfg.min.hrMax) : ok(value, values.length);
}

function deriveLthr(acts: readonly BaselineActivity[], hrMax: number): Derived<number> {
  const hardFrom = hrMax * cfg.lthrEffort.minShareOfHrMax;
  const estimates = (sport: Sport) =>
    acts.flatMap((a) => {
      if (a.sport !== sport || a.manual) return [];
      if (a.best20MinHr !== null && a.best20MinHr >= hardFrom)
        return [a.best20MinHr * cfg.lthrFrom20MinFactor];
      const effort =
        a.avgHr !== null &&
        a.durationSec >= cfg.lthrEffort.minSec &&
        a.durationSec <= cfg.lthrEffort.maxSec &&
        a.avgHr >= hardFrom;
      return effort ? [a.avgHr as number] : [];
    });
  // LTHR is sport-specific: running first, rides only when there are not enough hard runs.
  let found = estimates('run');
  if (found.length < cfg.min.lthrEfforts) found = estimates('bike');
  if (found.length < cfg.min.lthrEfforts) return notEnough(found.length, cfg.min.lthrEfforts);
  const top = found.sort((a, b) => b - a).slice(0, cfg.min.lthrEfforts);
  const limits = zoneConfig.hr.limits.lthr;
  const value = Math.round(Math.min(median(top) as number, hrMax - 1));
  if (value < limits.min || value > limits.max) return notEnough(found.length, cfg.min.lthrEfforts);
  return ok(value, found.length);
}

function deriveCss(acts: readonly BaselineActivity[]): Derived<number> {
  const paces = acts
    .filter((a) => a.sport === 'swim' && !a.manual && (a.distanceM ?? 0) >= cfg.cssMinSwimM)
    .map((a) => a.durationSec / ((a.distanceM as number) / 100))
    .sort((a, b) => a - b);
  if (paces.length < cfg.min.swims) return notEnough(paces.length, cfg.min.swims);
  const fastest = paces.slice(0, Math.max(1, Math.ceil(paces.length / 3)));
  return ok(Math.round((median(fastest) as number) * cfg.cssFactor), paces.length);
}

function deriveWeeklyLoad(
  acts: readonly BaselineActivity[],
  weeks: readonly number[],
  zones: readonly HrZone[],
): Derived<number> {
  if (acts.length < cfg.min.volume || weeks.length < cfg.minWeeks)
    return notEnough(acts.length, cfg.min.volume);
  const recent = weeks.slice(-cfg.recentWeeks);
  const loads = recent.map((monday) =>
    acts.filter((a) => inWeek(a, monday)).reduce((s, a) => s + activityLoad(a, zones), 0),
  );
  return ok(Math.round(trimmedMean(loads, cfg.trim) as number), acts.length);
}
