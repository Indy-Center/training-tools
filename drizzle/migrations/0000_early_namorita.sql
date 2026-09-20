CREATE TABLE `roster_members` (
	`cid` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`rating` integer NOT NULL,
	`rating_short` text NOT NULL,
	`membership` text NOT NULL,
	`facility` text NOT NULL,
	`is_home_controller` integer DEFAULT false NOT NULL,
	`is_mentor` integer DEFAULT false NOT NULL,
	`is_sup_ins` integer DEFAULT false NOT NULL,
	`discord_id` text,
	`facility_joined_at` text,
	`last_activity_at` text,
	`data` text NOT NULL,
	`synced_at` integer DEFAULT (unixepoch()) NOT NULL,
	`removed_at` integer
);
--> statement-breakpoint
CREATE INDEX `roster_members_removed_at_idx` ON `roster_members` (`removed_at`);--> statement-breakpoint
CREATE INDEX `roster_members_membership_idx` ON `roster_members` (`membership`);