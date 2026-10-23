CREATE TABLE `health_daily` (
	`metric` text NOT NULL,
	`day` text NOT NULL,
	`source` text NOT NULL,
	`value` real NOT NULL,
	`detail` text,
	`recorded_at` text NOT NULL,
	`source_ids` text NOT NULL,
	PRIMARY KEY(`metric`, `day`, `source`)
);
--> statement-breakpoint
CREATE INDEX `health_daily_day` ON `health_daily` (`day`);