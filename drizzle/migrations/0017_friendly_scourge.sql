ALTER TABLE `enrollments` ADD `vatusa_assigned_on` text;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `vatusa_completed_on` text;--> statement-breakpoint
-- Backfill: the status sweep only re-reads issues updated since its cursor, so
-- cards whose VATUSA dates were filled in before this would stay null here until
-- someone next touched them. Dropping the cursor makes the next cron run a full
-- read, as migration 0011 did for `re_instructor`.
DELETE FROM `sync_state` WHERE `key` = 'jira-status-sweep';
