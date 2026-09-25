DROP INDEX `enrollments_jira_issue_key_idx`;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `imported_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `enrollments_jira_issue_key_unique` ON `enrollments` (`jira_issue_key`);