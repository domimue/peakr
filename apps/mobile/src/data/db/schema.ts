import type { CustomExercise, RoutineExercise, StrengthLog } from '@peakr/engine';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
