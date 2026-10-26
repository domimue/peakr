CREATE TABLE `body_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`kind` text NOT NULL,
	`start_weight_kg` real NOT NULL,
	`target_weight_kg` real,
	`rate_per_week_kg` real NOT NULL,
	`eat_back_pct` integer NOT NULL,
	`weekly_mode` integer NOT NULL,
	`adjustment_kcal` integer DEFAULT 0 NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`reason` text NOT NULL,
	`dirty` integer DEFAULT true NOT NULL
);
