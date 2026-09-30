CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`cid` text NOT NULL,
	`event` text NOT NULL,
	`detail` text,
	`actor` text,
	`at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_log_cid_at_idx` ON `activity_log` (`cid`,`at`);--> statement-breakpoint
CREATE TABLE `teacher_qualifications` (
	`id` text PRIMARY KEY NOT NULL,
	`cid` text NOT NULL,
	`code` text NOT NULL,
	`level` text NOT NULL,
	`basis` text NOT NULL,
	`note` text,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`started_by` text,
	`ended_at` integer,
	`ended_by` text,
	`ended_reason` text
);
--> statement-breakpoint
CREATE INDEX `teacher_qualifications_cid_idx` ON `teacher_qualifications` (`cid`);--> statement-breakpoint
CREATE UNIQUE INDEX `teacher_qualifications_current_idx` ON `teacher_qualifications` (`cid`,`code`) WHERE "teacher_qualifications"."ended_at" is null;--> statement-breakpoint
CREATE TABLE `teachers` (
	`cid` text PRIMARY KEY NOT NULL,
	`roles` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`initials` text,
	`availability` text,
	`student_slots` integer,
	`joined_at` integer DEFAULT (unixepoch()) NOT NULL,
	`removed_at` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teachers_initials_unique` ON `teachers` (`initials`);--> statement-breakpoint
CREATE INDEX `teachers_removed_at_idx` ON `teachers` (`removed_at`);--> statement-breakpoint
ALTER TABLE `sync_state` ADD `value` text;