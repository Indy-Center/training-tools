ALTER TABLE `enrollments` ADD `announced_teacher` text;--> statement-breakpoint
-- Everyone already paired counts as told. Without this the first run after
-- deploy would post a "you've been paired" message for every student in
-- training at once.
UPDATE `enrollments` SET `announced_teacher` = `teacher`;
