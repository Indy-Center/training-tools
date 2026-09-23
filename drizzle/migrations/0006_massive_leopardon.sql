CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`cursor_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `enrollments` ADD `teacher` text;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `jira_status_synced_at` integer;