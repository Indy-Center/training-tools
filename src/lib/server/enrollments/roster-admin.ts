import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { enrollmentsTable, type Enrollment } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { isInRestoreWindow } from '$lib/roster-removal';
import { toFacilityDate } from '$lib/server/jira/progress';
import { notify } from '$lib/server/notify';
import { SHEET_STATUSES } from '$lib/waitlist';
import { NOT_CONFIGURED } from './completion';
import { rosterExpiryNotice } from './notices';
import {
	restoreNow,
	restoreTransitionName,
	TRK_STAGE_NAMES,
	type RestoringAdmin
} from './roster-restores';

/**
 * The admins' side of roster removal, from `/waitlist`: Restore now, Close for
 * good, Keep in line and Stop keeping in line. With these, none of the feature
 * needs the TRK board.
 *
 * Each re-reads the row and writes only while it still holds what the button
 * was for, so two admins pressing at once do not both act: the second gets the
 * refusal. The role is checked by the action, before any of this runs.
 * See decisions/0037-roster-removal-and-restore.md
 */

export type AdminActionResult =
	{ ok: true; message: string } | { ok: false; status: number; message: string };

/** The spec's refusal for Restore now or Close for good once the window is over. */
export const NOT_IN_WINDOW = 'This request is no longer waiting to be restored.';
/** The spec's refusal for Keep in line on a request the job has removed. */
export const ALREADY_REMOVED = 'Already removed. Use Restore now instead.';

const GONE = 'That request is no longer open. Reload the page.';

async function read(db: Database, id: string): Promise<Enrollment | null> {
	return (
		(await db.query.enrollmentsTable.findFirst({ where: eq(enrollmentsTable.id, id) })) ?? null
	);
}

async function studentName(db: Database, request: Enrollment): Promise<string> {
	const member = await db.query.rosterMembersTable.findFirst({
		columns: { firstName: true, lastName: true },
		where: eq(rosterMembersTable.cid, request.cid)
	});
	return (member && `${member.firstName} ${member.lastName}`.trim()) || request.submittedName;
}

/**
 * Restore now: 05's restore, for this one request, at once. Only a request in
 * its window still at Removed; one the board has already moved off Removed is
 * finished by the next pass.
 */
export async function restoreRequestNow(
	db: Database,
	env: Partial<Env> | undefined,
	id: string,
	admin: RestoringAdmin,
	now: Date
): Promise<AdminActionResult> {
	const request = await read(db, id);
	if (!request || !isInRestoreWindow(request) || request.status !== 'removed') {
		return { ok: false, status: 409, message: NOT_IN_WINDOW };
	}

	const outcome = await restoreNow(db, env, request, admin, now);
	if (!outcome.ok) {
		// The row may have changed under us: another admin's Restore now, or the
		// job, restored or closed it meanwhile. Then it is not Jira's refusal.
		const after = await read(db, id);
		if (!after || !isInRestoreWindow(after) || after.status !== 'removed') {
			return { ok: false, status: 409, message: NOT_IN_WINDOW };
		}
		if (outcome.error === null) return { ok: false, status: 502, message: NOT_CONFIGURED };
		return {
			ok: false,
			status: 502,
			message: `TRK refused "${restoreTransitionName(outcome.stage)}": ${outcome.error}. Has the transition been added to the board?`
		};
	}

	const name = await studentName(db, request);
	const stage = TRK_STAGE_NAMES[outcome.stage];
	return {
		ok: true,
		message: outcome.keptInLine
			? `${name} restored to ${stage}, and kept in line while they are off the home roster.`
			: `${name} restored to ${stage}.`
	};
}

/**
 * Close for good: the window ends, `closed-by-admin`. The card is already at
 * Removed, so Jira is not touched. The training admins get the expiry's line,
 * saying who closed it.
 */
export async function closeRequestForGood(
	db: Database,
	env: Partial<Env> | undefined,
	id: string,
	admin: { name: string },
	now: Date
): Promise<AdminActionResult> {
	const [closed] = await db
		.update(enrollmentsTable)
		.set({ restoreClosedAt: now, restoreClosedReason: 'closed-by-admin', updatedAt: now })
		.where(
			and(
				eq(enrollmentsTable.id, id),
				isNotNull(enrollmentsTable.rosterRemovedAt),
				isNull(enrollmentsTable.restoreClosedAt)
			)
		)
		.returning();
	if (!closed) return { ok: false, status: 409, message: NOT_IN_WINDOW };

	const name = await studentName(db, closed);
	await notify(
		env,
		rosterExpiryNotice({
			name,
			cid: closed.cid,
			course: closed.course,
			restoreBy: toFacilityDate(closed.restoreBy!),
			closedBy: admin.name
		})
	);
	return { ok: true, message: `${name}'s request closed for good.` };
}

/** An open request on the sheet: one Keep in line and Stop keeping in line act on. */
function isOpenOnSheet(request: Enrollment): boolean {
	return (
		request.withdrawnAt === null && (SHEET_STATUSES as readonly string[]).includes(request.status)
	);
}

/**
 * Keep in line: an open request whose student is off the home roster, and not
 * yet removed, is exempt from roster removal, by this admin.
 */
export async function keepRequestInLine(
	db: Database,
	id: string,
	admin: { cid: string },
	now: Date
): Promise<AdminActionResult> {
	const request = await read(db, id);
	if (request?.rosterRemovedAt) return { ok: false, status: 409, message: ALREADY_REMOVED };
	if (!request || !isOpenOnSheet(request)) return { ok: false, status: 404, message: GONE };

	const name = await studentName(db, request);
	const member = await db.query.rosterMembersTable.findFirst({
		columns: { leftHomeAt: true },
		where: eq(rosterMembersTable.cid, request.cid)
	});
	if (!member?.leftHomeAt) {
		return {
			ok: false,
			status: 409,
			message: `${name} is on the ZID home roster, so there is nothing to keep in line.`
		};
	}

	const [kept] = await db
		.update(enrollmentsTable)
		.set({ keptInLineAt: now, keptInLineBy: admin.cid, updatedAt: now })
		.where(
			and(
				eq(enrollmentsTable.id, id),
				isNull(enrollmentsTable.keptInLineAt),
				isNull(enrollmentsTable.rosterRemovedAt),
				eq(enrollmentsTable.status, request.status)
			)
		)
		.returning({ id: enrollmentsTable.id });
	if (!kept) {
		const after = await read(db, id);
		if (after?.rosterRemovedAt) return { ok: false, status: 409, message: ALREADY_REMOVED };
		return { ok: false, status: 409, message: 'That request is already kept in line.' };
	}
	return { ok: true, message: `${name} kept in line while they are off the home roster.` };
}

/**
 * Stop keeping in line: the exemption is cleared, by an admin or the board's,
 * and the next pass removes the request if the 24 hours have passed.
 */
export async function stopKeepingRequestInLine(
	db: Database,
	id: string,
	now: Date
): Promise<AdminActionResult> {
	const request = await read(db, id);
	if (!request || !isOpenOnSheet(request)) return { ok: false, status: 404, message: GONE };

	const [stopped] = await db
		.update(enrollmentsTable)
		.set({ keptInLineAt: null, keptInLineBy: null, updatedAt: now })
		.where(and(eq(enrollmentsTable.id, id), isNotNull(enrollmentsTable.keptInLineAt)))
		.returning({ id: enrollmentsTable.id });
	if (!stopped) return { ok: false, status: 409, message: 'That request is not kept in line.' };

	return { ok: true, message: `${await studentName(db, request)} is no longer kept in line.` };
}
