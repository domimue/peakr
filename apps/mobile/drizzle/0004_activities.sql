CREATE TABLE `activities` (
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`sport` text NOT NULL,
	`start_time` text NOT NULL,
	`date` text NOT NULL,
	`duration_sec` integer NOT NULL,
	`distance_m` real,
	`elevation_gain_m` real,
	`avg_hr` real,
	`max_hr` real,
	`swim_pace_sec_per_100m` real,
	`polyline` text,
	`name` text,
	`indoor` integer NOT NULL,
	`commute` integer NOT NULL,
	`imported_at` integer NOT NULL,
	`handled` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`source`, `external_id`)
);
--> statement-breakpoint
CREATE INDEX `activities_date` ON `activities` (`date`);--> statement-breakpoint
CREATE TABLE `activity_links` (
	`activity_key` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`workout_id` text NOT NULL,
	`linked_at` integer NOT NULL
);
