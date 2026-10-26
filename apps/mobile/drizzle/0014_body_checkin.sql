CREATE TABLE `body_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`values` text NOT NULL,
	`body_fat_pct` real,
	`body_fat_source` text,
	`note` text,
	`photos` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`dirty` integer DEFAULT true NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `body_measurements_day` ON `body_measurements` (`day`);--> statement-breakpoint
ALTER TABLE `body_checkins` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `body_days` ADD `intake_kcal` integer;--> statement-breakpoint
ALTER TABLE `body_days` ADD `active_kcal` integer;