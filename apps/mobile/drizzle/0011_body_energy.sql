CREATE TABLE `body_days` (
	`day` text PRIMARY KEY NOT NULL,
	`incomplete` integer NOT NULL,
	`updated_at` text NOT NULL,
	`dirty` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `body_device_daily` (
	`metric` text NOT NULL,
	`day` text NOT NULL,
	`source` text NOT NULL,
	`value` real NOT NULL,
	`recorded_at` text NOT NULL,
	PRIMARY KEY(`metric`, `day`, `source`)
);
--> statement-breakpoint
CREATE TABLE `body_target_changes` (
	`date` text PRIMARY KEY NOT NULL,
	`intake_kcal` integer NOT NULL,
	`reason` text NOT NULL,
	`dirty` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `body_tdee_estimates` (
	`date` text PRIMARY KEY NOT NULL,
	`tdee_kcal` integer NOT NULL,
	`raw_kcal` integer NOT NULL,
	`formula_kcal` integer NOT NULL,
	`correction_kcal` integer NOT NULL,
	`clamped` integer NOT NULL,
	`basis` text NOT NULL,
	`dirty` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE `body_checkins` ADD `body_fat_pct` real;