CREATE TABLE `enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`cid` text NOT NULL,
	`course` text NOT NULL,
	`status` text DEFAULT 'waitlist' NOT NULL,
	`availability` text,
	`notification_preference` text,
	`submitted_name` text NOT NULL,
	`submitted_rating` text,
	`jira_issue_key` text,
	`jira_synced_at` integer,
	`jira_sync_error` text,
	`jira_sync_attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`withdrawn_at` integer
);
--> statement-breakpoint
CREATE INDEX `enrollments_cid_idx` ON `enrollments` (`cid`);--> statement-breakpoint
CREATE INDEX `enrollments_status_idx` ON `enrollments` (`status`);--> statement-breakpoint
CREATE INDEX `enrollments_jira_issue_key_idx` ON `enrollments` (`jira_issue_key`);