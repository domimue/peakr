CREATE TABLE `plan_archive` (
	`id` text PRIMARY KEY NOT NULL,
	`input` text NOT NULL,
	`goal` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`archived_at` integer NOT NULL,
	`outcome` text NOT NULL,
	`summary` text NOT NULL,
	`review` text,
	`state` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	`dirty` integer DEFAULT true NOT NULL
);
