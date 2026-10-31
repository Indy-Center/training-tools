ALTER TABLE `enrollments` ADD `roster_removed_at` integer;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `roster_removed_from` text;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `left_home_at` integer;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `restore_by` integer;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `restore_closed_at` integer;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `restore_closed_reason` text;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `kept_in_line_at` integer;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `kept_in_line_by` text;