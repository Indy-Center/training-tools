import { and, asc, eq, isNotNull, isNull, notInArray } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { CLOSED_ENROLLMENT_STATUSES, enrollmentsTable } from '$lib/db/schema/enrollments';
import { resolveJiraConfig, type JiraConfig } from '$lib/server/jira/client';
import { fetchStatusSince } from '$lib/server/jira/issues';

/** Rows back-filled per run, which bounds the Jira reads one cron invocation spends. */
export const BACKFILL_LIMIT = 20;

export type BackfillResult = {
	filled: number;
	failed: number;
	skipped?: 'jira-not-configured';
};

/**
 * Give open rows that predate `status_since` the day their card entered its
 * current status, from the issue's Jira changelog.
 *
 * Runs in the `enrollment status sweep` job, after the sweep's own writes (a
 * move the sweep just applied has already set the column, and is skipped).
 * Takes up to `BACKFILL_LIMIT` open rows with a null `status_since` and an
 * issue key; a row whose read fails stays null and is tried next run, without
 * stopping the rest. Closed and withdrawn rows stay null for good.
 *
 * `readStatusSince` is a parameter so a test can stub the Jira read.
 */
export async function backfillStatusSince(
	db: Database,
	env: Partial<Env> | undefined,
	readStatusSince: (config: JiraConfig, issueKey: string) => Promise<Date | null> = fetchStatusSince
): Promise<BackfillResult> {
	const config = resolveJiraConfig(env);
	if (!config) return { filled: 0, failed: 0, skipped: 'jira-not-configured' };

	const rows = await db
		.select({ id: enrollmentsTable.id, jiraIssueKey: enrollmentsTable.jiraIssueKey })
		.from(enrollmentsTable)
		.where(
			and(
				isNull(enrollmentsTable.statusSince),
				isNull(enrollmentsTable.withdrawnAt),
				isNotNull(enrollmentsTable.jiraIssueKey),
				notInArray(enrollmentsTable.status, [...CLOSED_ENROLLMENT_STATUSES])
			)
		)
		.orderBy(asc(enrollmentsTable.createdAt))
		.limit(BACKFILL_LIMIT);

	let filled = 0;
	let failed = 0;

	for (const { id, jiraIssueKey } of rows) {
		try {
			const since = await readStatusSince(config, jiraIssueKey!);
			if (!since) throw new Error('no status change and no created time');

			// Only while still null: a move applied meanwhile has set it already.
			await db
				.update(enrollmentsTable)
				.set({ statusSince: since })
				.where(and(eq(enrollmentsTable.id, id), isNull(enrollmentsTable.statusSince)));
			filled += 1;
		} catch (err) {
			failed += 1;
			console.error('[training-tools] could not back-fill status_since', jiraIssueKey, err);
		}
	}

	return { filled, failed };
}
