CREATE TABLE `body_foods` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`barcode` text,
	`basis` text NOT NULL,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`piece_amount` real,
	`portions` text NOT NULL,
	`recipe` text,
	`favourite` integer DEFAULT false NOT NULL,
	`last_used_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`dirty` integer DEFAULT true NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `body_foods_barcode` ON `body_foods` (`barcode`);--> statement-breakpoint
CREATE INDEX `body_foods_name` ON `body_foods` (`name`);--> statement-breakpoint
ALTER TABLE `body_food_entries` ADD `carbs_g` real;--> statement-breakpoint
ALTER TABLE `body_food_entries` ADD `fat_g` real;--> statement-breakpoint
ALTER TABLE `body_food_entries` ADD `food_id` text;--> statement-breakpoint
ALTER TABLE `body_food_entries` ADD `amount` real;--> statement-breakpoint
ALTER TABLE `body_food_entries` ADD `unit` text;--> statement-breakpoint
ALTER TABLE `body_food_entries` ADD `portion_label` text;