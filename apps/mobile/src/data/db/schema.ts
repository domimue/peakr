import type {
  ActivitySource,
  ActivityStream,
  Climb,
  CustomExercise,
  ElevationPoint,
  GymRoutineExercise,
  GymSessionSource,
  LegacyCustomExercise,
  SetType,
  Goal,
  HealthMetric,
  HealthSource,
  HrZone,
  HrZoneInput,
  ImportedSport,
  OutlierReason,
  PauseReason,
  Phase,
  PlanInput,
  PlanNote,
  RoutineExercise,
  RouteSport,
  Sport,
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
  /**
   * HR zones the user set on Strava themselves (baseline import). Used while they have no manual
   * zones of their own; the derived baseline values live in `profile.baseline`.
   */
  stravaHrZones?: HrZone[];
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

/** Phase 3 custom exercises; read once by the gym migration (`gym_exercises` replaces it). */
export const customExercises = sqliteTable('custom_exercises', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).$type<LegacyCustomExercise>().notNull(),
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
// Gym workspace (Phase 8d, CLAUDE.md "Gym"). Offline first; ids are UUIDs and rows carry
// `updated_at` / `deleted_at` so they can sync later. Weights in kg, distances in m.

/** Custom exercises and user-edited copies of library exercises. */
export const gymExercises = sqliteTable('gym_exercises', {
  id: text('id').primaryKey(),
  /** Copy of `data.name` for search and sorting. */
  name: text('name').notNull(),
  data: text('data', { mode: 'json' }).$type<CustomExercise>().notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const routineFolders = sqliteTable('routine_folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const gymRoutines = sqliteTable('gym_routines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  notes: text('notes'),
  folderId: text('folder_id'),
  position: integer('position').notNull(),
  archivedAt: integer('archived_at'),
  durationMin: integer('duration_min'),
  exercises: text('exercises', { mode: 'json' }).$type<GymRoutineExercise[]>().notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const gymSessions = sqliteTable(
  'gym_sessions',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    title: text('title').notNull(),
    kind: text('kind').$type<'detailed' | 'quick'>().notNull(),
    durationMin: integer('duration_min'),
    sessionRpe: real('session_rpe'),
    legs: integer('legs', { mode: 'boolean' }),
    notes: text('notes'),
    routineId: text('routine_id'),
    plannedWorkoutId: text('planned_workout_id'),
    sourceId: text('source_id'),
    source: text('source').$type<GymSessionSource>().notNull(),
    externalId: text('external_id'),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [
    index('gym_sessions_started').on(t.startedAt),
    index('gym_sessions_external').on(t.externalId),
  ],
);

/** One row per set, written as soon as it is logged (nothing is lost if the app is killed). */
export const gymSets = sqliteTable(
  'gym_sets',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    exerciseId: text('exercise_id').notNull(),
    setIndex: integer('set_index').notNull(),
    setType: text('set_type').$type<SetType>().notNull(),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    rpe: real('rpe'),
    durationSec: integer('duration_sec'),
    distanceM: real('distance_m'),
    completed: integer('completed', { mode: 'boolean' }).notNull(),
    loggedAt: integer('logged_at').notNull(),
    notes: text('notes'),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [
    index('gym_sets_session').on(t.sessionId, t.setIndex),
    index('gym_sets_exercise').on(t.exerciseId, t.loggedAt),
  ],
);

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

export type RouteSource = 'gpx' | 'strava' | 'strava_route' | 'komoot' | 'generated';

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

// ---------------------------------------------------------------------------------------------
// Baseline (Phase 8a, CLAUDE.md "Baseline from past activities"). Recent Strava activities read
// once to calibrate the plan. Reference data only: deliberately its own table, never read by the
// activity sync, matching, Progress history, load, records or plan completion.

export const baselineActivities = sqliteTable('baseline_activities', {
  externalId: text('external_id').primaryKey(),
  sport: text('sport').$type<Sport>().notNull(),
  name: text('name'),
  /** Local calendar date of the start. */
  date: text('date').notNull(),
  durationSec: integer('duration_sec').notNull(),
  distanceM: real('distance_m'),
  elevationGainM: real('elevation_gain_m'),
  avgHr: real('avg_hr'),
  maxHr: real('max_hr'),
  indoor: integer('indoor', { mode: 'boolean' }).notNull(),
  manual: integer('manual', { mode: 'boolean' }).notNull(),
  race: integer('race', { mode: 'boolean' }).notNull(),
  best20MinHr: real('best_20min_hr'),
  /** Ticked for the calibration (preselection, then the user's choice). */
  selected: integer('selected', { mode: 'boolean' }).notNull(),
  /** Why it was unticked by the preselection, if it was. */
  outlier: text('outlier').$type<OutlierReason>(),
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

// Body and recovery data (CLAUDE.md "Health"): one value per metric, day and source. Garmin rows
// come from the server (`garmin-health/list`), Health Connect / HealthKit rows are read on this
// device and never uploaded. Deduplicated on read with the engine's source priority. Kept apart
// from activities; deletable on its own.
export const healthDaily = sqliteTable(
  'health_daily',
  {
    metric: text('metric').$type<HealthMetric>().notNull(),
    /** Calendar day (`YYYY-MM-DD`). */
    day: text('day').notNull(),
    source: text('source').$type<HealthSource>().notNull(),
    value: real('value').notNull(),
    /** Extra structure for the detail views (sleep stages, bed and wake time …). */
    detail: text('detail', { mode: 'json' }).$type<Record<string, unknown>>(),
    /** When the source recorded it (ISO date-time), shown next to the number. */
    recordedAt: text('recorded_at').notNull(),
    /** The source's own record ids. */
    sourceIds: text('source_ids', { mode: 'json' }).$type<string[]>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.metric, t.day, t.source] }),
    index('health_daily_day').on(t.day),
  ],
);

// Body add-on (CLAUDE.md "Add-on rules"): food diary and check-ins, kept on the device first and
// pushed to Supabase (`body_food_entries`, `body_checkins`, RLS: writes need the add-on). `dirty`
// marks rows not pushed yet; `deleted` keeps a removed row until its delete reached the server.
// The rows stay after a cancelled add-on (read-only history and export).
export const bodyFoodEntries = sqliteTable(
  'body_food_entries',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    meal: text('meal').$type<'breakfast' | 'lunch' | 'dinner' | 'snack'>().notNull(),
    name: text('name').notNull(),
    kcal: integer('kcal').notNull(),
    proteinG: real('protein_g'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
    deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('body_food_entries_day').on(t.day)],
);

export const bodyCheckins = sqliteTable(
  'body_checkins',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    weightKg: real('weight_kg').notNull(),
    waistCm: real('waist_cm'),
    /** Body fat % from a manual reading (scale display, caliper …). */
    bodyFatPct: real('body_fat_pct'),
    note: text('note'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
    deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('body_checkins_day').on(t.day)],
);

// Body add-on, Phase 12. Days the user marked as incomplete (left out of the adaptive TDEE and
// "calculation vs. scale"); synced like the diary.
export const bodyDays = sqliteTable('body_days', {
  day: text('day').primaryKey(),
  incomplete: integer('incomplete', { mode: 'boolean' }).notNull(),
  updatedAt: text('updated_at').notNull(),
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
});

// Every adaptive TDEE estimate with the data it was computed from (CLAUDE.md "Energy & body").
export const bodyTdeeEstimates = sqliteTable('body_tdee_estimates', {
  date: text('date').primaryKey(),
  tdeeKcal: integer('tdee_kcal').notNull(),
  rawKcal: integer('raw_kcal').notNull(),
  formulaKcal: integer('formula_kcal').notNull(),
  correctionKcal: integer('correction_kcal').notNull(),
  clamped: integer('clamped', { mode: 'boolean' }).notNull(),
  basis: text('basis', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
});

// Every change of the daily intake target with its reason (user, adaptive, safety_clamp).
export const bodyTargetChanges = sqliteTable('body_target_changes', {
  date: text('date').primaryKey(),
  intakeKcal: integer('intake_kcal').notNull(),
  reason: text('reason').$type<'user' | 'adaptive' | 'safety_clamp'>().notNull(),
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
});

// Body values from the phone's health store (Health Connect / HealthKit), read only while the
// add-on is active and kept on this device. Separate from `health_daily` (Insights → Health has
// its own consent per data group).
export const bodyDeviceDaily = sqliteTable(
  'body_device_daily',
  {
    metric: text('metric')
      .$type<
        | 'weight'
        | 'body_fat'
        | 'steps'
        | 'active_kcal'
        | 'resting_kcal'
        | 'intake_kcal'
        | 'workout_kcal'
      >()
      .notNull(),
    day: text('day').notNull(),
    source: text('source').$type<'healthConnect' | 'healthKit'>().notNull(),
    value: real('value').notNull(),
    recordedAt: text('recorded_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.metric, t.day, t.source] })],
);
