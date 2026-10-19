import type {
  CustomExercise,
  Goal,
  HrZoneInput,
  PauseReason,
  Phase,
  PlanInput,
  PlanNote,
  RoutineExercise,
  StrengthLog,
  Workout,
  WorkoutStatus,
} from '@peakr/engine';
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** What a plan was generated from, plus the zone input for bpm targets. */
export interface StoredPlanInput extends PlanInput {
  hrZones?: HrZoneInput;
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
  updatedAt: integer('updated_at').notNull(),
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
