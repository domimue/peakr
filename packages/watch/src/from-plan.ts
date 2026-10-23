import {
  athleteFor,
  routePacePlan,
  runPaceSecPerKm,
  type ElevationPoint,
  type HrZone,
  type PaceSegment,
  type Step,
  type UserProfile,
  type Workout,
} from '@peakr/engine';

import type {
  WatchIntensity,
  WatchNode,
  WatchSport,
  WatchStep,
  WatchTarget,
  WatchWorkout,
} from '../../../supabase/functions/_shared/watch/model.ts';

/**
 * Plan workout → provider-neutral watch workouts (CLAUDE.md "Watch integrations"). Zones are
 * resolved to absolute numbers here, so a watch shows the same targets as the Peakr workout screen:
 * run and bike by heart-rate zone (pace as the target only where the plan says pace leads), swims by
 * pace per 100 m from CSS, and, when a route is chosen, one step per route segment with its pace
 * range.
 */

export interface WatchContext {
  profile: UserProfile;
  /** Heart-rate zones of the plan (bpm). Empty without heart-rate input: steps become open. */
  hrZones: readonly HrZone[];
  /** Elevation profile of the chosen route; steady runs then get one step per segment. */
  routeProfile?: readonly ElevationPoint[];
}

export type NotExportable = 'strength' | 'winter' | 'walk' | 'empty';

export type ExportResult =
  | { ok: true; workouts: WatchWorkout[] }
  | { ok: false; reason: NotExportable };

/** Pace range around a target: ±3 %, wide enough not to beep on every wobble. */
const PACE_TOLERANCE = 0.03;
/** Merge route segments whose pace ranges are within this many seconds per km. */
const MERGE_SEC_PER_KM = 5;
/** Garmin Connect allows at most 50 steps; leave room for warm-up and cool-down. */
const MAX_ROUTE_STEPS = 40;

const SPORTS: Partial<Record<Workout['sport'], WatchSport>> = {
  run: 'run',
  bike: 'bike',
  swim: 'swim',
};

function zoneRange(zones: readonly HrZone[], zone: number): WatchTarget {
  const z = zones.find((c) => c.zone === zone);
  if (!z || (z.minBpm === null && z.maxBpm === null)) return { type: 'open' };
  const low = z.minBpm ?? (z.maxBpm as number) - 25;
  const high = z.maxBpm ?? low + 20;
  return { type: 'heartRate', lowBpm: low, highBpm: high };
}

function paceRange(secPerKm: number): WatchTarget {
  return {
    type: 'pace',
    fastestSecPerKm: Math.round(secPerKm * (1 - PACE_TOLERANCE)),
    slowestSecPerKm: Math.round(secPerKm * (1 + PACE_TOLERANCE)),
  };
}

function stepTarget(
  step: Step,
  sport: WatchSport,
  w: Workout,
  ctx: WatchContext,
  warmCool: boolean,
): WatchTarget {
  if (step.rest) return { type: 'open' };
  if (sport === 'swim') {
    if (!step.distanceM || !step.durationSec) return { type: 'open' };
    const per100 = (step.durationSec / step.distanceM) * 100;
    return {
      type: 'swimPace',
      fastestSecPer100m: Math.round(per100 * (1 - PACE_TOLERANCE)),
      slowestSecPer100m: Math.round(per100 * (1 + PACE_TOLERANCE)),
    };
  }
  const paceLabel =
    step.target.kind === 'paceZone'
      ? step.target.value
      : step.hint?.kind === 'paceZone'
        ? step.hint.value
        : null;
  // Pace leads on tempo, intervals and races; everywhere else heart rate is the target.
  if (sport === 'run' && w.paceMode === 'target' && !warmCool && paceLabel) {
    return paceRange(runPaceSecPerKm(athleteFor(ctx.profile, 'fitness'), paceLabel));
  }
  return zoneRange(ctx.hrZones, step.zone);
}

function intensityOf(step: Step, phase: 'warmup' | 'main' | 'cooldown'): WatchIntensity {
  if (phase === 'warmup') return 'warmup';
  if (phase === 'cooldown') return 'cooldown';
  if (step.rest) return 'rest';
  return step.zone >= 3 ? 'interval' : 'active';
}

function toStep(
  step: Step,
  sport: WatchSport,
  w: Workout,
  ctx: WatchContext,
  phase: 'warmup' | 'main' | 'cooldown',
): WatchStep {
  // Distance steps stay distance steps (pool lengths, run reps); the rest is by time.
  const byDistance = step.distanceM !== undefined && step.distanceM > 0;
  return {
    kind: 'step',
    intensity: intensityOf(step, phase),
    ...(byDistance
      ? { distanceM: step.distanceM }
      : step.durationSec
        ? { durationSec: step.durationSec }
        : {}),
    target: stepTarget(step, sport, w, ctx, phase !== 'main'),
  };
}

/** Segments of a route with similar pace ranges become one step; at most `MAX_ROUTE_STEPS`. */
export function mergeSegments(segments: readonly PaceSegment[]): PaceSegment[] {
  let merged: PaceSegment[] = [];
  for (const s of segments) {
    const last = merged[merged.length - 1];
    if (
      last &&
      Math.abs(last.fastestSecPerKm - s.fastestSecPerKm) <= MERGE_SEC_PER_KM &&
      Math.abs(last.slowestSecPerKm - s.slowestSecPerKm) <= MERGE_SEC_PER_KM
    ) {
      last.endM = s.endM;
    } else {
      merged.push({ ...s });
    }
  }
  while (merged.length > MAX_ROUTE_STEPS) {
    const next: PaceSegment[] = [];
    for (let i = 0; i < merged.length; i += 2) {
      const a = merged[i] as PaceSegment;
      const b = merged[i + 1];
      next.push(
        b
          ? {
              ...a,
              endM: b.endM,
              fastestSecPerKm: Math.min(a.fastestSecPerKm, b.fastestSecPerKm),
              slowestSecPerKm: Math.max(a.slowestSecPerKm, b.slowestSecPerKm),
            }
          : a,
      );
    }
    merged = next;
  }
  return merged;
}

const isSteady = (w: Workout): boolean => w.main.every((b) => b.repeat === 1);

function routeSteps(w: Workout, ctx: WatchContext): WatchStep[] | null {
  if (!ctx.routeProfile || w.sport !== 'run' || !isSteady(w)) return null;
  const segments = mergeSegments(routePacePlan(w, ctx.routeProfile, ctx.profile));
  if (segments.length === 0) return null;
  return segments.map((s): WatchStep => {
    const km = Math.round(s.startM / 100) / 10;
    return {
      kind: 'step',
      intensity: 'active',
      distanceM: Math.max(10, Math.round(s.endM - s.startM)),
      name: `km ${km}`,
      // Easy and Zone 2: HR leads and the pace is a guide, so the target stays heart rate.
      target: s.pacePrimary
        ? {
            type: 'pace',
            fastestSecPerKm: Math.round(s.fastestSecPerKm),
            slowestSecPerKm: Math.round(s.slowestSecPerKm),
          }
        : zoneRange(ctx.hrZones, 2),
    };
  });
}

/**
 * Converts a planned workout. Strength and winter sports are shown in the app only; a brick (bike →
 * run) becomes one workout per leg, because a FIT workout has a single sport.
 */
export function toWatchWorkouts(w: Workout, ctx: WatchContext): ExportResult {
  if (w.sport === 'strength') return { ok: false, reason: 'strength' };
  if (w.sport === 'walk') return { ok: false, reason: 'walk' };
  if (w.sport === 'xcski' || w.sport === 'skitour' || w.sport === 'snowshoe') {
    return { ok: false, reason: 'winter' };
  }

  const name = w.templateType ? `${w.templateType} · ${w.durationMin} min` : `${w.durationMin} min`;
  const pool = ctx.profile.poolLength;
  const sportOf = (s: Step) => (s.sport ?? SPORTS[w.sport]) as WatchSport | undefined;
  // Consecutive steps of one sport form a leg (a brick has two).
  const legs: WatchSport[] = [];
  for (const s of [...w.warmup, ...w.main.flatMap((b) => b.steps), ...w.cooldown]) {
    const sport = sportOf(s);
    if (sport && legs[legs.length - 1] !== sport) legs.push(sport);
  }
  if (legs.length === 0) return { ok: false, reason: 'empty' };

  const workouts = legs.map((leg, i): WatchWorkout => {
    const nodes: WatchNode[] = [];
    for (const s of w.warmup) {
      if (sportOf(s) === leg) nodes.push(toStep(s, leg, w, ctx, 'warmup'));
    }
    const route = legs.length === 1 ? routeSteps(w, ctx) : null;
    if (route) {
      nodes.push(...route);
    } else {
      for (const b of w.main) {
        const steps = b.steps
          .filter((s) => sportOf(s) === leg)
          .map((s) => toStep(s, leg, w, ctx, 'main'));
        if (steps.length === 0) continue;
        if (b.repeat > 1) nodes.push({ kind: 'repeat', count: b.repeat, steps });
        else nodes.push(...steps);
      }
    }
    for (const s of w.cooldown) {
      if (sportOf(s) === leg) nodes.push(toStep(s, leg, w, ctx, 'cooldown'));
    }
    return {
      id: legs.length > 1 ? `${w.id}:${i + 1}` : w.id,
      date: w.date,
      name: legs.length > 1 ? `${name} (${i + 1}/${legs.length})` : name,
      sport: leg,
      ...(leg === 'swim' && (pool === 25 || pool === 50) ? { poolLengthM: pool } : {}),
      steps: nodes,
    };
  });
  return { ok: true, workouts };
}
