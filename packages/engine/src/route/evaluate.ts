import type { HrZone } from '../hr';
import { planConfig } from '../plan/config';
import { elevationAt, gradeAdjustedPaceFactor } from '../plan/terrain';
import type { ZoneNumber } from '../zones';
import type { RouteSport } from './pace-plan';
import { elevationStats, profileFromStreams } from './profile';

/**
 * Grade-adjusted evaluation of a synced activity (CLAUDE.md "Terrain intelligence" §8): per km
 * the actual pace, the gradient, the grade-adjusted pace (GAP, Minetti) and how it compares with
 * the plan; plus elevation and time in the target heart-rate zone.
 */

const cfg = planConfig.routes;

/** Recorded streams, same length, ordered by distance (downsampled by the import). */
export interface ActivityStream {
  distanceM: number[];
  timeS: number[];
  altitudeM: number[];
  heartrate: number[] | null;
}

export type KmVerdict = 'inRange' | 'faster' | 'slower';

export interface KmEvaluation {
  /** 1-based km number. */
  km: number;
  startM: number;
  endM: number;
  gradient: number;
  durationSec: number;
  /** Actual pace (s/km); bike: speed in `speedKmh`. */
  paceSecPerKm: number;
  speedKmh: number;
  /** Runs only: pace on the flat at the same effort. */
  gapSecPerKm: number | null;
  /** Runs with a plan: the planned pace on this gradient. */
  plannedSecPerKm: number | null;
  avgHr: number | null;
  verdict: KmVerdict | null;
}

export interface ActivityEvaluation {
  km: KmEvaluation[];
  distanceM: number;
  durationSec: number;
  gainM: number;
  lossM: number;
  /** Runs only: grade-adjusted pace of the whole activity. */
  gapSecPerKm: number | null;
  /** With heart rate and a target zone: time inside it. */
  timeInZoneSec: number | null;
  timeInZoneShare: number | null;
}

export interface EvaluationPlan {
  /** Session's flat target pace (s/km), runs only. */
  flatPaceSecPerKm: number;
  /** Pace is the target (tempo, intervals, races); otherwise it is a "no faster than" limit. */
  pacePrimary: boolean;
}

export interface EvaluationOptions {
  plan?: EvaluationPlan | null;
  targetZone?: ZoneNumber | null;
  hrZones?: readonly HrZone[];
}

function verdictOf(gap: number, plan: EvaluationPlan): KmVerdict {
  const tol = cfg.evaluationTolerance;
  if (gap < plan.flatPaceSecPerKm * (1 - tol)) return 'faster';
  if (plan.pacePrimary && gap > plan.flatPaceSecPerKm * (1 + tol)) return 'slower';
  return 'inRange';
}

const inZone = (hr: number, zone: HrZone) =>
  (zone.minBpm === null || hr >= zone.minBpm) && (zone.maxBpm === null || hr <= zone.maxBpm);

/** Kilometres shorter than this at the end are left out of the table. */
const MIN_LAST_KM_M = 100;

export function evaluateActivity(
  sport: RouteSport,
  stream: ActivityStream,
  options: EvaluationOptions = {},
): ActivityEvaluation | null {
  const n = Math.min(stream.distanceM.length, stream.timeS.length, stream.altitudeM.length);
  if (n < 2) return null;
  const profile = profileFromStreams(stream.distanceM.slice(0, n), stream.altitudeM.slice(0, n));
  const zone =
    options.targetZone && options.hrZones
      ? options.hrZones.find((z) => z.zone === options.targetZone)
      : undefined;
  const isRun = sport === 'run';

  interface Acc {
    startM: number;
    endM: number;
    sec: number;
    flatM: number;
    hrSum: number;
    hrSec: number;
  }
  const kms: Acc[] = [];
  let flatTotal = 0;
  let zoneSec = 0;
  let hrSec = 0;
  for (let i = 1; i < n; i++) {
    const d0 = stream.distanceM[i - 1] as number;
    const d1 = stream.distanceM[i] as number;
    const dt = (stream.timeS[i] as number) - (stream.timeS[i - 1] as number);
    const dd = d1 - d0;
    if (dd <= 0 || dt <= 0) continue;
    const grade = (elevationAt(profile, d1) - elevationAt(profile, d0)) / dd;
    const flat = dd * gradeAdjustedPaceFactor(grade);
    flatTotal += flat;
    const index = Math.floor((d1 - 1e-6) / 1000);
    const acc = (kms[index] ??= {
      startM: index * 1000,
      endM: index * 1000,
      sec: 0,
      flatM: 0,
      hrSum: 0,
      hrSec: 0,
    });
    acc.endM = d1;
    acc.sec += dt;
    acc.flatM += flat;
    const hr = stream.heartrate?.[i];
    if (hr !== undefined && hr > 0) {
      acc.hrSum += hr * dt;
      acc.hrSec += dt;
      hrSec += dt;
      if (zone && inZone(hr, zone)) zoneSec += dt;
    }
  }

  const plan = isRun ? (options.plan ?? null) : null;
  const rows: KmEvaluation[] = [];
  kms.forEach((k, i) => {
    const len = k.endM - k.startM;
    if (len < MIN_LAST_KM_M) return;
    const gradient = (elevationAt(profile, k.endM) - elevationAt(profile, k.startM)) / len;
    const pace = k.sec / (len / 1000);
    const gap = isRun ? Math.round(k.sec / (k.flatM / 1000)) : null;
    rows.push({
      km: i + 1,
      startM: Math.round(k.startM),
      endM: Math.round(k.endM),
      gradient: Math.round(gradient * 1000) / 1000,
      durationSec: Math.round(k.sec),
      paceSecPerKm: Math.round(pace),
      speedKmh: Math.round((len / 1000 / (k.sec / 3600)) * 10) / 10,
      gapSecPerKm: gap,
      plannedSecPerKm: plan
        ? Math.round(plan.flatPaceSecPerKm * gradeAdjustedPaceFactor(gradient))
        : null,
      avgHr: k.hrSec > 0 ? Math.round(k.hrSum / k.hrSec) : null,
      verdict: plan && gap !== null ? verdictOf(gap, plan) : null,
    });
  });

  const stats = elevationStats(profile);
  const durationSec = (stream.timeS[n - 1] as number) - (stream.timeS[0] as number);
  return {
    km: rows,
    distanceM: stats.distanceM,
    durationSec: Math.round(durationSec),
    gainM: stats.gainM,
    lossM: stats.lossM,
    gapSecPerKm: isRun && flatTotal > 0 ? Math.round(durationSec / (flatTotal / 1000)) : null,
    timeInZoneSec: zone && hrSec > 0 ? Math.round(zoneSec) : null,
    timeInZoneShare: zone && hrSec > 0 ? Math.round((zoneSec / hrSec) * 100) / 100 : null,
  };
}
