import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { enrollmentsTable } from '$lib/db/schema/enrollments';
import { resolveJiraConfig } from '$lib/server/jira/client';
import { listBoardIssues } from '$lib/server/jira/issues';
import { parseBoardIssue, type BoardEnrollment } from '$lib/server/jira/board-issue';
import { applyIssueStatus } from './status-sync';

/**
 * Brings TRK issues filed by hand on the board into `enrollments`.
 *
 * The form files most requests, but staff also create Student Enrollment issues
 * directly — the whole backlog was moved onto the board that way on 2026-09-05,
 * before this app existed. Without a row those students are invisible here: no
 * waitlist position on `/`, missing from `/stats`, and free to submit a second
 * request for a course they are already queued for.
 *
 * This is the only code that **creates** rows from Jira. The status sweep and
 * the webhook only update rows that already exist, and stay that way.
 *
 * Every run reads the whole board, not a window: an issue filed by hand months
 * ago and never touched since is exactly what this is for, and a cursor would
 * have walked straight past it. TRK is a few dozen issues, so this is one page.
 *
 * ## Not creating a second row for an issue the form filed
 *
 * The form commits its row, files the issue, *then* writes the key back. An
 * issue caught between those last two steps looks hand-filed. So before
 * inserting, the import looks for an unfiled row with the same CID and course
 * and **adopts** it — writing the key onto it — instead. The form's own
 * write-back is guarded on a null key, so it then does nothing. The same
 * adoption catches an issue the form filed whose write-back failed outright,
 * which would otherwise be filed a second time by the reconcile.
 *
 * Anything still racing after that hits the unique index on `jira_issue_key`,
 * and the insert does nothing.
 */

export type ImportResult = {
	/** Issues Jira returned. */
	read: number;
	/** New rows created for hand-filed issues. */
	imported: number;
	/** Unfiled rows of ours that turned out to already have an issue. */
	adopted: number;
	/** Issues with no row that could not become one. Logged individually. */
	skipped: number;
	/** False when the page cap was hit; the rest are picked up on a later run. */
	complete: boolean;
	skippedReason?: 'jira-not-configured';
};

export async function importBoardIssues(
	db: Database,
	env: Partial<Env> | undefined,
	now = new Date()
): Promise<ImportResult> {
	const config = resolveJiraConfig(env);
	if (!config) {
		return {
			read: 0,
			imported: 0,
			adopted: 0,
			skipped: 0,
			complete: true,
			skippedReason: 'jira-not-configured'
		};
	}

	const { issues, complete } = await listBoardIssues(config);

	// Every key we already hold, compared in memory. One unparameterised query,
	// rather than `NOT IN (...)` over the board's keys, which D1's 100-parameter
	// limit would break once TRK passes a hundred issues.
	const known = new Set(
		(
			await db
				.select({ key: enrollmentsTable.jiraIssueKey })
				.from(enrollmentsTable)
				.where(isNotNull(enrollmentsTable.jiraIssueKey))
		).map((row) => row.key)
	);

	const result: ImportResult = {
		read: issues.length,
		imported: 0,
		adopted: 0,
		skipped: 0,
		complete
	};

	for (const issue of issues) {
		if (known.has(issue.key)) continue;

		const parsed = parseBoardIssue(issue);
		if (!parsed.ok) {
			// Left alone, and said so every run: it is something staff can fix on
			// the issue, and a silent skip would never get fixed.
			console.warn(
				'[training-tools] TRK issue not imported',
				JSON.stringify({ issue: issue.key, reason: parsed.reason })
			);
			result.skipped += 1;
			continue;
		}

		if (await adoptUnfiledRow(db, parsed.enrollment, now)) {
			// The row predates the issue, so its status is still our `waitlist`.
			// Bring it up to what the board says, through the one writer.
			await applyIssueStatus(db, issue, parsed.enrollment.updatedAt, now);
			result.adopted += 1;
		} else if (await insertImportedRow(db, parsed.enrollment, now)) {
			result.imported += 1;
		}
	}

	return result;
}

/** Write the issue's key onto our unfiled row for the same request, if there is one. */
async function adoptUnfiledRow(
	db: Database,
	enrollment: BoardEnrollment,
	now: Date
): Promise<boolean> {
	const candidate = await db.query.enrollmentsTable.findFirst({
		where: and(
			eq(enrollmentsTable.cid, enrollment.cid),
			eq(enrollmentsTable.course, enrollment.course),
			isNull(enrollmentsTable.jiraIssueKey),
			isNull(enrollmentsTable.withdrawnAt)
		),
		orderBy: asc(enrollmentsTable.createdAt)
	});
	if (!candidate) return false;

	// Guarded on a null key, like the form's own write-back: whichever of the two
	// lands first wins, and the other changes nothing.
	const adopted = await db
		.update(enrollmentsTable)
		.set({ jiraIssueKey: enrollment.issueKey, jiraSyncedAt: now, jiraSyncError: null })
		.where(and(eq(enrollmentsTable.id, candidate.id), isNull(enrollmentsTable.jiraIssueKey)))
		.returning({ id: enrollmentsTable.id });

	return adopted.length > 0;
}

async function insertImportedRow(
	db: Database,
	enrollment: BoardEnrollment,
	now: Date
): Promise<boolean> {
	const inserted = await db
		.insert(enrollmentsTable)
		.values({
			id: crypto.randomUUID(),
			cid: enrollment.cid,
			course: enrollment.course,
			status: enrollment.status,
			teacher: enrollment.teacher,
			notificationPreference: enrollment.notificationPreference,
			submittedName: enrollment.name,
			jiraIssueKey: enrollment.issueKey,
			jiraSyncedAt: now,
			jiraStatusSyncedAt: now,
			jiraUpdatedAt: enrollment.updatedAt,
			// Queue order is by `createdAt`, and for these that is `Waitlisted`.
			createdAt: enrollment.waitlistedAt,
			updatedAt: now,
			importedAt: now
		})
		.onConflictDoNothing({ target: enrollmentsTable.jiraIssueKey })
		.returning({ id: enrollmentsTable.id });

	return inserted.length > 0;
}
