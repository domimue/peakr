CREATE TABLE `baseline_activities` (
	`external_id` text PRIMARY KEY NOT NULL,
	`sport` text NOT NULL,
	`name` text,
	`date` text NOT NULL,
	`duration_sec` integer NOT NULL,
	`distance_m` real,
	`elevation_gain_m` real,
	`avg_hr` real,
	`max_hr` real,
	`indoor` integer NOT NULL,
	`manual` integer NOT NULL,
	`race` integer NOT NULL,
	`best_20min_hr` real,
	`selected` integer NOT NULL,
	`outlier` text
);
