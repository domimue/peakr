CREATE TABLE `plan_pauses` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`reason` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text
);
--> statement-breakpoint
CREATE TABLE `plan_weeks` (
	`plan_id` text NOT NULL,
	`week_index` integer NOT NULL,
	`start_date` text NOT NULL,
	`phase` text NOT NULL,
	`is_recovery` integer NOT NULL,
	`is_partial` integer NOT NULL,
	`target_load` real NOT NULL,
	`load` real NOT NULL,
	`minutes` integer NOT NULL,
	`hard_share` real NOT NULL,
	`notes` text NOT NULL,
	PRIMARY KEY(`plan_id`, `week_index`)
);
--> statement-breakpoint
CREATE TABLE `plan_workouts` (
	`plan_id` text NOT NULL,
	`id` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`plan_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `plan_workouts_date` ON `plan_workouts` (`plan_id`,`date`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`input` text NOT NULL,
	`goal` text NOT NULL,
	`start_date` text NOT NULL,
	`target_date` text,
	`notes` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
