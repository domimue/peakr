import type {
  ActivitySource,
  ActivityStream,
  Climb,
  CustomExercise,
  ElevationPoint,
  Goal,
  HrZoneInput,
  ImportedSport,
  PauseReason,
  Phase,
  PlanInput,
  PlanNote,
  RoutineExercise,
  RouteSport,
  StrengthLog,
  Workout,
  WorkoutStatus,
} from '@peakr/engine';
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { StoredZoneSettings } from '../../features/training-zones/settings';

/** What a plan was generated from, plus the zone input for bpm targets. */
export interface StoredPlanInput extends PlanInput {
  hrZones?: HrZoneInput;
  /** Profile → Training zones: manual zones and the tests behind the pace zones. */
  zones?: StoredZoneSettings;
}

/** Simple key/value store for local app settings (e.g. the strength setup as JSON). */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Strength routines the user built ("My own routines", WORKOUTS.md §8.1). */
export const routines = sqliteTable('routines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  durationMin: integer('duration_min').notNull(),
  exercises: text('exercises', { mode: 'json' }).$type<RoutineExercise[]>().notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** Exercises the user added to the library (§8.6). */
export const customExercises = sqliteTable('custom_exercises', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).$type<CustomExercise>().notNull(),
  createdAt: integer('created_at').notNull(),
});

/** Logged strength sessions – detailed (sets) or quick (§8.7). */
export const strengthLogs = sqliteTable('strength_logs', {
  id: text('id').primaryKey(),
  /** Local ISO date of the session. */
  date: text('date').notNull(),
  /** Display name: routine / template name, or empty for a quick log. */
  title: text('title').notNull(),
  /** `routine:<id>`, a template id, or null. */
  sourceId: text('source_id'),
  log: text('log', { mode: 'json' }).$type<StrengthLog>().notNull(),
  createdAt: integer('created_at').notNull(),
});

// ---------------------------------------------------------------------------------------------
// Training plan (Phase 5). One active plan; the engine works on the assembled `PlanState`.

/** The user's plan and what it was generated from. */
export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  /** `generatePlan` input plus the heart-rate zone input (`StoredPlanInput`). */
  input: text('input', { mode: 'json' }).$type<StoredPlanInput>().notNull(),
  goal: text('goal', { mode: 'json' }).$type<Goal>().notNull(),
  startDate: text('start_date').notNull(),
  targetDate: text('target_date'),
  notes: text('notes', { mode: 'json' }).$type<PlanNote[]>().notNull(),
  /** Regenerations so far (prefix of new workout ids). */
  revision: integer('revision').notNull(),
  createdAt: integer('created_at').notNull(),
  /** Last edit on this device or the synced server version (decides sync conflicts). */
  updatedAt: integer('updated_at').notNull(),
  /** Plan, weeks or pauses changed since the last push (Phase 6 sync). */
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
});

export const planWeeks = sqliteTable(
  'plan_weeks',
  {
    planId: text('plan_id').notNull(),
    weekIndex: integer('week_index').notNull(),
    startDate: text('start_date').notNull(),
    phase: text('phase').$type<Phase>().notNull(),
    isRecovery: integer('is_recovery', { mode: 'boolean' }).notNull(),
    isPartial: integer('is_partial', { mode: 'boolean' }).notNull(),
    targetLoad: real('target_load').notNull(),
    load: real('load').notNull(),
    minutes: integer('minutes').notNull(),
    hardShare: real('hard_share').notNull(),
    notes: text('notes', { mode: 'json' }).$type<PlanNote[]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.weekIndex] })],
);

/** Planned workouts with their status; the full engine `Workout` is kept as JSON. */
export const planWorkouts = sqliteTable(
  'plan_workouts',
  {
    planId: text('plan_id').notNull(),
    id: text('id').notNull(),
    date: text('date').notNull(),
    status: text('status').$type<WorkoutStatus>().notNull(),
    data: text('data', { mode: 'json' }).$type<Workout>().notNull(),
    /** Last change of this workout, epoch ms – "last write wins" per workout when syncing. */
    updatedAt: integer('updated_at').notNull().default(0),
    /** Changed since the last push. */
    dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.planId, t.id] }),
    index('plan_workouts_date').on(t.planId, t.date),
  ],
);

/** Illness / injury / holiday pauses; `end_date` is null while the pause runs. */
export const planPauses = sqliteTable('plan_pauses', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull(),
  reason: text('reason').$type<PauseReason>().notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
});

// ---------------------------------------------------------------------------------------------
// Sync (Phase 6)

/** Locally deleted plans / workouts that still have to be deleted on the server. */
export const syncTombstones = sqliteTable(
  'sync_tombstones',
  {
    entity: text('entity').$type<'plan' | 'workout'>().notNull(),
    planId: text('plan_id').notNull(),
    /** Workout id; the plan id again for plans. */
    id: text('id').notNull(),
    deletedAt: integer('deleted_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.entity, t.planId, t.id] })],
);

// ---------------------------------------------------------------------------------------------
// Imported activities (Phase 7). One row per source record (Strava now; watch providers and the
// phone's health data later). `@peakr/engine` merges records of the same workout on read.

export const activities = sqliteTable(
  'activities',
  {
    source: text('source').$type<ActivitySource>().notNull(),
    externalId: text('external_id').notNull(),
    sport: text('sport').$type<ImportedSport>().notNull(),
    /** ISO timestamp (UTC). */
    startTime: text('start_time').notNull(),
    /** Local calendar date of the start. */
    date: text('date').notNull(),
    durationSec: integer('duration_sec').notNull(),
    distanceM: real('distance_m'),
    elevationGainM: real('elevation_gain_m'),
    avgHr: real('avg_hr'),
    maxHr: real('max_hr'),
    swimPaceSecPer100m: real('swim_pace_sec_per_100m'),
    /** Encoded GPS polyline for the route thumbnail (Progress history). */
    polyline: text('polyline'),
    name: text('name'),
    indoor: integer('indoor', { mode: 'boolean' }).notNull(),
    commute: integer('commute', { mode: 'boolean' }).notNull(),
    /** Summary only (Strava weight training: no sets) – a detailed record of it always wins. */
    summary: integer('summary', { mode: 'boolean' }).notNull().default(false),
    /** Session RPE 1–10 from the source, if any. */
    rpe: real('rpe'),
    /** When this device received it, epoch ms ("synced …"). */
    importedAt: integer('imported_at').notNull(),
    /** Matched to the plan or absorbed as unplanned – happens once per activity. */
    handled: integer('handled', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.source, t.externalId] }), index('activities_date').on(t.date)],
);

/** Which activity fulfilled which planned workout (by any of the activity's source keys). */
export const activityLinks = sqliteTable('activity_links', {
  /** `<source>:<externalId>`. */
  activityKey: text('activity_key').primaryKey(),
  planId: text('plan_id').notNull(),
  workoutId: text('workout_id').notNull(),
  linkedAt: integer('linked_at').notNull(),
});

// ---------------------------------------------------------------------------------------------
// Routes (Phase 8, CLAUDE.md "Terrain intelligence"). The user's route library – imported GPX
// files and routes recognised from past activities – and the recorded streams of activities
// (distance, time, altitude, heart rate) for the grade-adjusted evaluation.

export type RouteSource = 'gpx' | 'strava' | 'strava_route' | 'komoot';

export const routes = sqliteTable('routes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sport: text('sport').$type<RouteSport>().notNull(),
  source: text('source').$type<RouteSource>().notNull(),
  distanceM: real('distance_m').notNull(),
  gainM: real('gain_m').notNull(),
  lossM: real('loss_m').notNull(),
  startLat: real('start_lat').notNull(),
  startLon: real('start_lon').notNull(),
  /** Simplified track as an encoded polyline (map, thumbnail). */
  polyline: text('polyline').notNull(),
  /** Smoothed elevation every 25 m. */
  profile: text('profile', { mode: 'json' }).$type<ElevationPoint[]>().notNull(),
  climbs: text('climbs', { mode: 'json' }).$type<Climb[]>().notNull(),
  /** Recognised routes: the activity keys it was recognised from (not suggested again). */
  sourceKeys: text('source_keys', { mode: 'json' }).$type<string[]>().notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  /** Changed since the last push. */
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
  /** Deleted locally; removed for good once the deletion is pushed. */
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
});

/** Recorded streams of an imported activity (one per source record, read-only). */
export const activityStreams = sqliteTable(
  'activity_streams',
  {
    source: text('source').$type<ActivitySource>().notNull(),
    externalId: text('external_id').notNull(),
    data: text('data', { mode: 'json' }).$type<ActivityStream>().notNull(),
    /** GPS track at stream resolution (encoded polyline), if any. */
    latlng: text('latlng'),
  },
  (t) => [primaryKey({ columns: [t.source, t.externalId] })],
);
