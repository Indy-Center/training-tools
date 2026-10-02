ALTER TABLE `enrollments` ADD `re_instructor` text;--> statement-breakpoint
-- Backfill: the status sweep only re-reads issues updated since its cursor, so
-- requests already at their rating exam would keep a null `re_instructor` until
-- someone next touched the issue. Dropping the cursor makes the next cron run a
-- full read, which is what the sweep does on a first run anyway.
DELETE FROM `sync_state` WHERE `key` = 'jira-status-sweep';
