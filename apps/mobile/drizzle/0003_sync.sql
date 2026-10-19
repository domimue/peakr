CREATE TABLE `sync_tombstones` (
	`entity` text NOT NULL,
	`plan_id` text NOT NULL,
	`id` text NOT NULL,
	`deleted_at` integer NOT NULL,
	PRIMARY KEY(`entity`, `plan_id`, `id`)
);
--> statement-breakpoint
ALTER TABLE `plan_workouts` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `plan_workouts` ADD `dirty` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` ADD `dirty` integer DEFAULT true NOT NULL;--> statement-breakpoint
-- Workouts stored before sync started take the plan's last edit as their version.
UPDATE `plan_workouts` SET `updated_at` = COALESCE((SELECT `updated_at` FROM `plans` WHERE `plans`.`id` = `plan_workouts`.`plan_id`), 0);
