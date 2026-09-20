import { and, asc, isNull, lt } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { enrollmentsTable } from '$lib/db/schema/enrollments';
import { fileWithJira, MAX_JIRA_SYNC_ATTEMPTS } from './index';

export type EnrollmentReconcileResult = {
	pending: number;
	filed: number;
	failed: number;
};

/**
 * How many unfiled enrollments one cron run will attempt.
 *
 * Bounded so a long Jira outage that accumulated a backlog doesn't turn one
 * scheduled invocation into a very long sequence of requests. The next run
 * picks up where this one stopped.
 */
const BATCH_SIZE = 25;

/**
 * File any enrollments that never reached Jira.
 *
 * Runs on the same 15-minute cron as the roster sync. Selects only rows with no
 * issue key, so a row that filed successfully is never touched again and a
 * duplicate issue would need two concurrent cron runs — which Cloudflare does
 * not do for a single scheduled trigger.
 *
 * Rows past MAX_JIRA_SYNC_ATTEMPTS are skipped: at that point the failure is
 * structural (a revoked token, a field Jira no longer accepts) and retrying it
 * every fifteen minutes just buries the real error.
 */
export async function reconcileEnrollments(
	db: Database,
	env: Partial<Env> | undefined
): Promise<EnrollmentReconcileResult> {
	const pending = await db
		.select()
		.from(enrollmentsTable)
		.where(
			and(
				isNull(enrollmentsTable.jiraIssueKey),
				isNull(enrollmentsTable.withdrawnAt),
				lt(enrollmentsTable.jiraSyncAttempts, MAX_JIRA_SYNC_ATTEMPTS)
			)
		)
		// Oldest first: someone who has been waiting longest gets on the board first.
		.orderBy(asc(enrollmentsTable.createdAt))
		.limit(BATCH_SIZE);

	let filed = 0;

	for (const enrollment of pending) {
		// fileWithJira records its own outcome and never throws, so one bad row
		// cannot stop the rest of the batch.
		if (await fileWithJira(db, env, enrollment)) filed += 1;
	}

	return {
		pending: pending.length,
		filed,
		failed: pending.length - filed
	};
}
