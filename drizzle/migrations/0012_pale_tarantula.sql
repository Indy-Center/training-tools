CREATE TABLE `job_health` (
	`name` text PRIMARY KEY NOT NULL,
	`last_run_at` integer NOT NULL,
	`last_ok` integer NOT NULL,
	`last_success_at` integer,
	`last_failure_at` integer,
	`last_error` text,
	`failures_in_a_row` integer DEFAULT 0 NOT NULL,
	`last_summary` text,
	`last_summary_at` integer
);
