import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import {
	enrollmentsTable,
	ROSTER_REMOVABLE_STATUSES,
	type Enrollment,
	type RosterRemovableStatus
} from '$lib/db/schema/enrollments';
import type { Teacher } from '$lib/db/schema/teachers';
import { isDueForRemoval, restoreByFor } from '$lib/roster-removal';
import { isAssignedTo } from '$lib/teachers';
import { issueUrl, JiraError, resolveJiraConfig, type JiraConfig } from '$lib/server/jira/client';
import { commentOnIssue, transitionIssueToStatus } from '$lib/server/jira/enrollment';
import { REMOVED_STATUS, toFacilityDate } from '$lib/server/jira/progress';
import { notify, notifyDirect, type DirectNotice } from '$lib/server/notify';
import { loadMirror, memberName, type MirrorMember } from '$lib/server/roster';
import { listTeachers } from '$lib/server/teachers';
import {
	rosterRemovalExaminerMessage,
	rosterRemovalNotice,
	rosterRemovalStudentMessage,
	rosterRemovalSummaryNotice,
	rosterRemovalTeacherMessage,
	type NoticeRequest
} from './notices';
import {
	closeBoardEndedWindows,
	finishBoardRestores,
	restoreReturnedStudents,
	TRK_STAGE_NAMES,
	type RosterRestoreResult
} from './roster-restores';
import { clearKeptInLineForReturned, expireLapsedWindows } from './roster-expiry';
import { syncEnrollmentIssue } from './status-sync';

/**
 * The `roster removals` job: requests whose student left the home roster come
 * off, and come back if the student returns within the restore window.
 *
 * Keyed on where the card and the roster are now, like the certification and
 * announcement passes, never on what caused the change. Every write to a card
 * goes to Jira first and is read back through `applyIssueMove()`, so nothing is
 * set here that Jira refused. Every query goes per row or over a whole table,
 * never an `IN (...)` over the roster (D1's 100-parameter limit).
 *
 * The rule for what is due is `$lib/roster-removal.ts`. See
 * decisions/0037-roster-removal-and-restore.md
 */

/** How many removals one pass attempts. A busy month has a handful. */
const BATCH_SIZE = 25;

export type RosterRemovalResult = RosterRestoreResult &
	RemovalCounts & {
		/** Step 4: windows that ran out, closed `expired` this pass. */
		expired: number;
		/** Step 4: kept-in-line exemptions cleared for students back home. */
		keptInLineCleared: number;
	};

/** Step 5, the removal. */
type RemovalCounts = {
	/** Requests due for removal this pass. */
	due: number;
	/** Of those, removed: card moved and read back, or an unfiled row stamped. */
	removed: number;
	/** Of those removed, closed in the same pass: their 30 days had already run out. */
	closed: number;
	/** Left for the next pass: Jira refused, or could not be reached. */
	refused: number;
	/** Due, but past this pass's batch: left for the next pass. */
	deferred: number;
};

/**
 * One pass of the job. Run by the cron after the status sweep and before the
 * announcements, and after a Jira webhook delivery.
 *
 * The spec's order:
 *
 * 1. finish restores the board made — `finishBoardRestores()`,
 * 2. close windows the board ended — `closeBoardEndedWindows()`,
 * 3. restore — `restoreReturnedStudents()` (all three in `./roster-restores.ts`),
 * 4. expire — `expireLapsedWindows()`, then clear the kept-in-line exemption of
 *    students back home — `clearKeptInLineForReturned()` (both in
 *    `./roster-expiry.ts`),
 * 5. remove — `removeDepartedStudents()`, below.
 *
 * Restores and expiry go first so a student back on the last day is restored,
 * not expired, and a request is never removed and restored in the same pass.
 */
export async function processRosterRemovals(
	db: Database,
	env: Partial<Env> | undefined,
	now = new Date()
): Promise<RosterRemovalResult> {
	const finished = await finishBoardRestores(db, env, now);
	const closedOnBoard = await closeBoardEndedWindows(db, now);
	const { restored, restoreRefused } = await restoreReturnedStudents(db, env, now);

	const expired = await expireLapsedWindows(db, env, now);
	const keptInLineCleared = await clearKeptInLineForReturned(db, now);

	const removal = await removeDepartedStudents(db, env, now);

	return {
		finished,
		closedOnBoard,
		restored,
		restoreRefused,
		expired,
		keptInLineCleared,
		...removal
	};
}

/** One roster removal: the stage it takes the request from, and its window. */
type Removal = {
	stage: RosterRemovableStatus;
	/** The student's `left_home_at`; the window starts here. */
	leftHomeAt: Date;
	/** `leftHomeAt` plus 30 days. */
	restoreBy: Date;
};

/** The comment a removed card gets. Both dates are facility days. */
function removalComment({ stage, leftHomeAt, restoreBy }: Removal): string {
	return `Left the ZID home roster on ${toFacilityDate(leftHomeAt)}. Removed automatically; restored to ${TRK_STAGE_NAMES[stage]} if back on the home roster by ${toFacilityDate(restoreBy)}.`;
}

/**
 * Remove every request that `isDueForRemoval()` says is due.
 *
 * A filed request: comment, move to Removed, read back (the row becomes
 * `removed` as for any move), then stamp the restore columns. Refused, or not
 * read back as `removed`: the row is left as it was and the next pass tries
 * again; the comment may then be posted twice. An unfiled one is stamped and
 * set to `removed` here, and the reconcile never files it.
 *
 * A request whose student left more than 30 days ago has a window that ended
 * before it came due: on the first run, after Stop keeping in line, or after
 * Jira refused its removal for a month. It is removed and closed at once
 * (`expired`), with no DMs, and the training admins get one summary for all
 * of these in the pass rather than a notice each.
 */
async function removeDepartedStudents(
	db: Database,
	env: Partial<Env> | undefined,
	now: Date
): Promise<RemovalCounts> {
	const candidates = await db
		.select()
		.from(enrollmentsTable)
		.where(
			and(
				inArray(enrollmentsTable.status, [...ROSTER_REMOVABLE_STATUSES]),
				isNull(enrollmentsTable.withdrawnAt),
				isNull(enrollmentsTable.rosterRemovedAt),
				isNull(enrollmentsTable.restoreClosedAt),
				isNull(enrollmentsTable.keptInLineAt)
			)
		)
		.orderBy(asc(enrollmentsTable.createdAt));

	const nothing = { due: 0, removed: 0, closed: 0, refused: 0, deferred: 0 };
	if (candidates.length === 0) return nothing;

	const people = await loadMirror(db);

	const due = candidates.filter((request) =>
		isDueForRemoval(request, people.get(request.cid) ?? null, now)
	);
	if (due.length === 0) return nothing;

	const config = resolveJiraConfig(env);
	const teachers = await listTeachers(db);
	const summary: (NoticeRequest & { was: string; leftHomeOn: string })[] = [];
	let removed = 0;
	let refused = 0;

	const batch = due.slice(0, BATCH_SIZE);

	for (const request of batch) {
		const member = people.get(request.cid)!;
		const leftHomeAt = member.leftHomeAt!;
		const removal: Removal = {
			stage: request.status as RosterRemovableStatus,
			leftHomeAt,
			restoreBy: restoreByFor(leftHomeAt)
		};
		// Its window ended before it came due: nothing left to restore it in.
		const closeNow = removal.restoreBy.getTime() < now.getTime();

		if (request.jiraIssueKey) {
			const moved = config && (await moveToRemoved(db, env, config, request, removal));
			if (!moved) {
				refused += 1;
				continue;
			}
		}

		const [stamped] = await db
			.update(enrollmentsTable)
			.set({
				...(request.jiraIssueKey ? {} : { status: 'removed' as const }),
				rosterRemovedAt: now,
				rosterRemovedFrom: removal.stage,
				leftHomeAt,
				restoreBy: removal.restoreBy,
				...(closeNow ? { restoreClosedAt: now, restoreClosedReason: 'expired' as const } : {}),
				updatedAt: now
			})
			.where(
				and(
					eq(enrollmentsTable.id, request.id),
					isNull(enrollmentsTable.rosterRemovedAt),
					request.jiraIssueKey
						? eq(enrollmentsTable.status, 'removed')
						: isNull(enrollmentsTable.jiraIssueKey)
				)
			)
			.returning({ id: enrollmentsTable.id });
		if (!stamped) continue;

		removed += 1;

		const described: NoticeRequest = {
			name: memberName(member, request.submittedName),
			cid: request.cid,
			course: request.course,
			teacher: request.teacher,
			examiner: request.reInstructor,
			issueKey: request.jiraIssueKey,
			issueUrl: issueUrl(env?.JIRA_BASE_URL, request.jiraIssueKey)
		};

		if (closeNow) {
			summary.push({ ...described, was: removal.stage, leftHomeOn: toFacilityDate(leftHomeAt) });
		} else {
			await announceRemoval(env, request, described, member, people, teachers, removal);
		}
	}

	if (summary.length > 0) await notify(env, rosterRemovalSummaryNotice(summary));

	return {
		due: due.length,
		removed,
		closed: summary.length,
		refused,
		deferred: due.length - batch.length
	};
}

/**
 * Comment, move to Removed, and read the card back. True once the row reads
 * `removed`; false, having logged why, for anything else.
 */
async function moveToRemoved(
	db: Database,
	env: Partial<Env> | undefined,
	config: JiraConfig,
	request: Enrollment,
	removal: Removal
): Promise<boolean> {
	const issueKey = request.jiraIssueKey!;

	try {
		await commentOnIssue(config, issueKey, removalComment(removal));
		await transitionIssueToStatus(config, issueKey, REMOVED_STATUS);
	} catch (err) {
		console.error(
			'[training-tools] roster removal refused',
			issueKey,
			err instanceof JiraError ? err.message : err
		);
		return false;
	}

	// The `Removed` date is stamped by the read-back, as for any move to Removed.
	try {
		await syncEnrollmentIssue(db, env, issueKey);
	} catch (err) {
		console.error('[training-tools] roster removal: could not read back', issueKey, err);
		return false;
	}

	const read = await db.query.enrollmentsTable.findFirst({
		columns: { status: true },
		where: eq(enrollmentsTable.id, request.id)
	});
	if (read?.status !== 'removed') {
		console.warn('[training-tools] roster removal: card not read back as Removed', issueKey);
		return false;
	}
	return true;
}

/**
 * Tell the training admins, and privately: the student (unless they chose
 * email), the teacher if the request was at In Training, and the examiner if
 * one had claimed it. Discord ids come from the roster mirror; anyone with
 * none is skipped, and the admins' notice says who.
 */
async function announceRemoval(
	env: Partial<Env> | undefined,
	request: Enrollment,
	described: NoticeRequest,
	member: MirrorMember,
	people: Map<string, MirrorMember>,
	teachers: Teacher[],
	removal: Removal
): Promise<void> {
	const restoreBy = toFacilityDate(removal.restoreBy);
	const untold: string[] = [];

	const tell = async (who: string, discordId: string | null, message: DirectNotice) => {
		if (!discordId) {
			untold.push(`${who} (no Discord ID)`);
			return;
		}
		if ((await notifyDirect(env, discordId, message)) === 'failed') {
			untold.push(`${who} (message refused)`);
		}
	};

	// The teacher or examiner a card names, by initials: an active teacher first.
	const discordIdOf = (initials: string) => {
		const matches = teachers.filter((teacher) => isAssignedTo(initials, teacher));
		const teacher = matches.find((t) => t.removedAt === null) ?? matches[0];
		return teacher ? (people.get(teacher.cid)?.discordId ?? null) : null;
	};

	if (request.notificationPreference === 'email') {
		untold.push('the student (chose email)');
	} else {
		await tell(
			'the student',
			member.discordId,
			rosterRemovalStudentMessage({ course: request.course, restoreBy })
		);
	}

	const about = { name: described.name, course: request.course, restoreBy };
	if (request.status === 'in-training' && request.teacher) {
		await tell(
			`teacher ${request.teacher}`,
			discordIdOf(request.teacher),
			rosterRemovalTeacherMessage(about)
		);
	}
	if (request.reInstructor) {
		await tell(
			`examiner ${request.reInstructor}`,
			discordIdOf(request.reInstructor),
			rosterRemovalExaminerMessage(about)
		);
	}

	await notify(
		env,
		rosterRemovalNotice({
			...described,
			was: request.status,
			leftHomeOn: toFacilityDate(removal.leftHomeAt),
			restoreBy,
			untold
		})
	);
}
