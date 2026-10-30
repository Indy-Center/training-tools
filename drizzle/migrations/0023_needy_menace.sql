ALTER TABLE `roster_members` ADD `left_home_at` integer;--> statement-breakpoint
UPDATE `roster_members` SET `left_home_at` = `removed_at` WHERE `membership` = 'home' AND `removed_at` IS NOT NULL;
