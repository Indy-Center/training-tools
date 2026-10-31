import { and, asc, eq, isNotNull, isNull, lt, notInArray, or } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { CLOSED_ENROLLMENT_STATUSES, enrollmentsTable } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { isBackOnHomeRoster } from '$lib/roster-removal';
import { toFacilityDate } from '$lib/server/jira/progress';
import { notify } from '$lib/server/notify';
import { rosterExpiryNotice } from './notices';
import { inRestoreWindow } from './restore-window';

/**
 * Steps 4 and 4b of the `roster removals` job, after the restores and before
 * the removals: close the windows that ran out, and clear the exemption of a
 * student who is back. Keyed on where the row and the roster are now; per row,
 * never an `IN (...)` over the roster (D1's 100-parameter limit).
 * See decisions/0037-roster-removal-and-restore.md
 */

/**
 * Step 4. A request in its window whose `restore_by` has passed is closed,
 * `expired`, and the training admins get one line. The card is already at
 * Removed, so Jira is not touched, and the student is not told. A student back
 * on the home roster as `home` is skipped: step 3 restores them, and when Jira
 * refuses that restore the window stays open for it to retry (the admins were
 * told once) until it goes through or the student leaves again.
 *
 * Guarded on the window still being open, so a second pass, or two at once,
 * close it and tell the admins once. Returns how many this call closed.
 */
export async function expireLapsedWindows(
	db: Database,
	env: Partial<Env> | undefined,
	now: Date
): Promise<number> {
	const lapsed = await db
		.select()
		.from(enrollmentsTable)
		.where(and(inRestoreWindow(), lt(enrollmentsTable.restoreBy, now)))
		.orderBy(asc(enrollmentsTable.createdAt));

	let expired = 0;
	for (const request of lapsed) {
		const member = await db.query.rosterMembersTable.findFirst({
			columns: {
				firstName: true,
				lastName: true,
				membership: true,
				removedAt: true,
				leftHomeAt: true
			},
			where: eq(rosterMembersTable.cid, request.cid)
		});
		if (isBackOnHomeRoster(member ?? null)) continue;

		const [closed] = await db
			.update(enrollmentsTable)
			.set({ restoreClosedAt: now, restoreClosedReason: 'expired', updatedAt: now })
			.where(and(eq(enrollmentsTable.id, request.id), inRestoreWindow()))
			.returning({ id: enrollmentsTable.id });
		if (!closed) continue;
		expired += 1;

		await notify(
			env,
			rosterExpiryNotice({
				name: (member && `${member.firstName} ${member.lastName}`.trim()) || request.submittedName,
				cid: request.cid,
				course: request.course,
				restoreBy: toFacilityDate(request.restoreBy!)
			})
		);
	}
	return expired;
}

/**
 * Step 4b. An open request kept in line whose student is on the home roster as
 * `home` again has the exemption cleared (`kept_in_line_at` and
 * `kept_in_line_by`), so a later departure counts from scratch. Kept in line
 * while the student is still away is left. Returns how many were cleared.
 */
export async function clearKeptInLineForReturned(db: Database, now: Date): Promise<number> {
	const kept = await db
		.select({ id: enrollmentsTable.id, cid: enrollmentsTable.cid })
		.from(enrollmentsTable)
		.where(
			and(
				isNotNull(enrollmentsTable.keptInLineAt),
				isNull(enrollmentsTable.withdrawnAt),
				isNull(enrollmentsTable.restoreClosedAt),
				or(
					notInArray(enrollmentsTable.status, [...CLOSED_ENROLLMENT_STATUSES]),
					isNotNull(enrollmentsTable.rosterRemovedAt)
				)
			)
		);
	if (kept.length === 0) return 0;

	const home = new Set(
		(
			await db
				.select({
					cid: rosterMembersTable.cid,
					membership: rosterMembersTable.membership,
					removedAt: rosterMembersTable.removedAt,
					leftHomeAt: rosterMembersTable.leftHomeAt
				})
				.from(rosterMembersTable)
		)
			.filter(isBackOnHomeRoster)
			.map((member) => member.cid)
	);

	let cleared = 0;
	for (const request of kept) {
		if (!home.has(request.cid)) continue;
		const [written] = await db
			.update(enrollmentsTable)
			.set({ keptInLineAt: null, keptInLineBy: null, updatedAt: now })
			.where(and(eq(enrollmentsTable.id, request.id), isNotNull(enrollmentsTable.keptInLineAt)))
			.returning({ id: enrollmentsTable.id });
		if (written) cleared += 1;
	}
	return cleared;
}
