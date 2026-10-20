CREATE TABLE `gym_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `gym_routines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`folder_id` text,
	`position` integer NOT NULL,
	`archived_at` integer,
	`duration_min` integer,
	`exercises` text NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `gym_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`duration_min` integer,
	`session_rpe` real,
	`legs` integer,
	`notes` text,
	`routine_id` text,
	`planned_workout_id` text,
	`source_id` text,
	`source` text NOT NULL,
	`external_id` text,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `gym_sessions_started` ON `gym_sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `gym_sessions_external` ON `gym_sessions` (`external_id`);--> statement-breakpoint
CREATE TABLE `gym_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`set_type` text NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`rpe` real,
	`duration_sec` integer,
	`distance_m` real,
	`completed` integer NOT NULL,
	`logged_at` integer NOT NULL,
	`notes` text,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `gym_sets_session` ON `gym_sets` (`session_id`,`set_index`);--> statement-breakpoint
CREATE INDEX `gym_sets_exercise` ON `gym_sets` (`exercise_id`,`logged_at`);--> statement-breakpoint
CREATE TABLE `routine_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
