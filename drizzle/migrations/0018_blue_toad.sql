ALTER TABLE `enrollments` ADD `vatusa_reminder` text;--> statement-breakpoint
-- Anyone whose course is already assigned counts as having had the reminders up
-- to today. Without this the first run after deploy would message every one of
-- them at once, some about an assignment they heard of weeks ago. They still
-- get the reminders that are yet to come.
UPDATE `enrollments` SET `vatusa_reminder` = CASE
	WHEN julianday('now') - julianday(`vatusa_assigned_on`) >= 30 THEN 'expired'
	WHEN julianday('now') - julianday(`vatusa_assigned_on`) >= 14 THEN '16-days-left'
	WHEN julianday('now') - julianday(`vatusa_assigned_on`) >= 8 THEN '22-days-left'
	ELSE 'assigned'
END
WHERE `vatusa_assigned_on` IS NOT NULL;
