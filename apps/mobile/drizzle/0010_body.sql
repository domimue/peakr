CREATE TABLE `body_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`weight_kg` real NOT NULL,
	`waist_cm` real,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`dirty` integer DEFAULT true NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `body_checkins_day` ON `body_checkins` (`day`);--> statement-breakpoint
CREATE TABLE `body_food_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`meal` text NOT NULL,
	`name` text NOT NULL,
	`kcal` integer NOT NULL,
	`protein_g` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`dirty` integer DEFAULT true NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `body_food_entries_day` ON `body_food_entries` (`day`);