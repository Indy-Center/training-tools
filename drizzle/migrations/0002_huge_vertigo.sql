CREATE TABLE `certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`cid` text NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`granted_at` integer DEFAULT (unixepoch()) NOT NULL,
	`granted_by` text,
	`grant_basis` text NOT NULL,
	`grant_note` text,
	`revoked_at` integer,
	`revoked_by` text,
	`revoked_reason` text,
	`needs_review` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `certifications_cid_idx` ON `certifications` (`cid`);--> statement-breakpoint
CREATE INDEX `certifications_code_idx` ON `certifications` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `certifications_held_idx` ON `certifications` (`cid`,`code`) WHERE "certifications"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE `roster_members` ADD `certifications_checked_at` integer;