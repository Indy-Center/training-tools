ALTER TABLE `enrollments` ADD `announced_status` text;--> statement-breakpoint
-- Every request's current place counts as already announced. Without this the
-- first run after deploy would announce every card on the board at once: each
-- exam waiting, each failed exam, each audit.
UPDATE `enrollments` SET `announced_status` = `status`;
