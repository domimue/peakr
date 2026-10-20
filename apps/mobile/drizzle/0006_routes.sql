CREATE TABLE `activity_streams` (
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`data` text NOT NULL,
	`latlng` text,
	PRIMARY KEY(`source`, `external_id`)
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sport` text NOT NULL,
	`source` text NOT NULL,
	`distance_m` real NOT NULL,
	`gain_m` real NOT NULL,
	`loss_m` real NOT NULL,
	`start_lat` real NOT NULL,
	`start_lon` real NOT NULL,
	`polyline` text NOT NULL,
	`profile` text NOT NULL,
	`climbs` text NOT NULL,
	`source_keys` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`dirty` integer DEFAULT true NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
