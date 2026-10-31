import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import {
	enrollmentsTable,
	type Enrollment,
	type RosterRemovableStatus
} from '$lib/db/schema/enrollments';
import type { Teacher } from '$lib/db/schema/teachers';
import { boardMoveOutcome, isBackOnHomeRoster } from '$lib/roster-removal';
import { isAssignedTo } from '$lib/teachers';
import { issueUrl, resolveJiraConfig, type JiraConfig } from '$lib/server/jira/client';
import { commentOnIssue, transitionIssueByName } from '$lib/server/jira/enrollment';
import { JIRA_FIELDS } from '$lib/server/jira/fields';
import { fetchEnrollmentIssue } from '$lib/server/jira/issues';
import {
	NEEDS_CATP_STATUS,
	RATING_EXAM_STATUS,
	REMOVED_STATUS,
	updateIssueFields
} from '$lib/server/jira/progress';
import { TEACHER_FIELD } from '$lib/server/jira/status';
import { notify, notifyDirect, type DirectNotice } from '$lib/server/notify';
import { loadMirror, memberName, type MirrorMember } from '$lib/server/roster';
import { listTeachers } from '$lib/server/teachers';
import {
	rosterRestoreExaminerMessage,
	rosterRestoreNotice,
	rosterRestoreRefusedNotice,
	rosterRestoreStudentMessage,
	rosterRestoreTeacherMessage,
	type NoticeRequest
} from './notices';
import { inRestoreWindow } from './restore-window';
import { syncEnrollmentIssue } from './status-sync';

/**
 * The restore half of the `roster removals` job: a request a roster removal
 * took off goes back where it was. Steps 1–3 of `processRosterRemovals()`, in
 * the spec's order:
 *
 * 1. `finishBoardRestores()`: a card in its window read back off Removed at a
 *    stage is finished as restored (staff on the board, or a restore whose last
 *    step was not reached).
 * 2. `closeBoardEndedWindows()`: one read back at Withdrawn, or at Needs CATP
 *    from another stage, closes its window `moved-on-board`.
 * 3. `restoreReturnedStudents()`: a request whose student is back on the home
 *    roster is moved off Removed, then finished.
 *
 * Like the removal, keyed on where the card and the roster are now, and every
 * write to a card goes to Jira first and is read back. Whole-table reads, never
 * an `IN (...)` over the roster. See decisions/0037-roster-removal-and-restore.md
 */

/**
 * TRK's name for each stage a removal takes a request from and a restore puts
 * it back to: the card comments and the notices say it.
 */
export const TRK_STAGE_NAMES: Record<RosterRemovableStatus, string> = {
	waitlist: 'Waitlist',
	'in-training': 'In Training',
	'rating-exam': RATING_EXAM_STATUS,
	'needs-catp': NEEDS_CATP_STATUS
};

/** The TRK transition that takes a card from Removed to `stage` (ticket 02 adds the first three). */
export function restoreTransitionName(stage: RosterRemovableStatus): string {
	return stage === 'needs-catp' ? NEEDS_CATP_STATUS : `Restore to ${TRK_STAGE_NAMES[stage]}`;
}

/**
 * The comment a restored card gets. `awayRestoredBy` names the admin who pressed
 * Restore now while the student is still off the home roster.
 */
export function restoreComment(stage: RosterRemovableStatus, awayRestoredBy?: string): string {
	if (awayRestoredBy) {
		return `Restored to ${TRK_STAGE_NAMES[stage]} by ${awayRestoredBy}, while still off the ZID home roster.`;
	}
	return `Back on the ZID home roster. Restored to ${TRK_STAGE_NAMES[stage]}.`;
}

/** How many automatic restores one pass attempts. */
const BATCH_SIZE = 25;

export type RosterRestoreResult = {
	/** Step 1: cards read back off Removed at a stage, finished as restored. */
	finished: number;
	/** Step 2: windows closed because the card went to Withdrawn or Needs CATP. */
	closedOnBoard: number;
	/** Step 3: requests whose student is back, restored this pass. */
	restored: number;
	/** Step 3: left for the next pass because Jira refused or could not be reached. */
	restoreRefused: number;
};

/** The whole mirror, removed members included, and the teacher roster. */
type Context = {
	people: Map<string, MirrorMember>;
	teachers: Teacher[];
	baseUrl: string | undefined;
};

async function loadContext(db: Database, env: Partial<Env> | undefined): Promise<Context> {
	const [people, teachers] = await Promise.all([loadMirror(db), listTeachers(db)]);
	return { people, teachers, baseUrl: env?.JIRA_BASE_URL };
}

/** Requests in their window, by `createdAt`. `removed` picks those still at Removed, or the rest. */
async function windowRequests(db: Database, removed: boolean): Promise<Enrollment[]> {
	return db
		.select()
		.from(enrollmentsTable)
		.where(
			and(
				inRestoreWindow(),
				removed ? eq(enrollmentsTable.status, 'removed') : ne(enrollmentsTable.status, 'removed')
			)
		)
		.orderBy(asc(enrollmentsTable.createdAt));
}

/**
 * Step 1. A card in its window that is now at Waitlist, In Training or Rating
 * Exam (or back at Needs CATP, where it was removed from) is finished as a
 * restore. A student still off the home roster is also kept in line by the
 * board (`kept_in_line_by` null), so it is not removed again for this departure.
 */
export async function finishBoardRestores(
	db: Database,
	env: Partial<Env> | undefined,
	now: Date
): Promise<number> {
	const restored = (await windowRequests(db, false)).filter(
		(request) => boardMoveOutcome(request) === 'restored'
	);
	if (restored.length === 0) return 0;

	const context = await loadContext(db, env);
	let finished = 0;
	for (const request of restored) {
		if (await finishRestore(db, env, context, request, now, null)) finished += 1;
	}
	return finished;
}

/**
 * Step 2. A card in its window moved to Withdrawn, or to Needs CATP from any
 * other stage: the window closes, `moved-on-board`, and the card's new stage
 * stands. Nobody is told; Jira is not touched.
 */
export async function closeBoardEndedWindows(db: Database, now: Date): Promise<number> {
	let closed = 0;
	for (const request of await windowRequests(db, false)) {
		const outcome = boardMoveOutcome(request);
		if (outcome === null) {
			console.warn(
				'[training-tools] roster restore: card left Removed for a stage it cannot reach',
				JSON.stringify({ issue: request.jiraIssueKey, status: request.status })
			);
		}
		if (outcome !== 'closed') continue;

		const [written] = await db
			.update(enrollmentsTable)
			.set({ restoreClosedAt: now, restoreClosedReason: 'moved-on-board', updatedAt: now })
			.where(
				and(
					eq(enrollmentsTable.id, request.id),
					isNull(enrollmentsTable.restoreClosedAt),
					eq(enrollmentsTable.status, request.status)
				)
			)
			.returning({ id: enrollmentsTable.id });
		if (written) closed += 1;
	}
	return closed;
}

/**
 * Step 3. Every request still at Removed in its window whose student is on the
 * home roster as `home` is restored. Refused: the row is left as it was for the
 * next pass, and the training admins are told once per request.
 */
export async function restoreReturnedStudents(
	db: Database,
	env: Partial<Env> | undefined,
	now: Date
): Promise<Pick<RosterRestoreResult, 'restored' | 'restoreRefused'>> {
	const waiting = await windowRequests(db, true);
	if (waiting.length === 0) return { restored: 0, restoreRefused: 0 };

	const context = await loadContext(db, env);
	const due = waiting
		.filter((request) => isBackOnHomeRoster(context.people.get(request.cid) ?? null))
		.slice(0, BATCH_SIZE);
	if (due.length === 0) return { restored: 0, restoreRefused: 0 };

	const config = resolveJiraConfig(env);
	let restored = 0;
	let restoreRefused = 0;

	for (const request of due) {
		const outcome = await restoreRequest(db, env, config, context, request, now);
		if (outcome.ok) {
			restored += 1;
			continue;
		}
		// Taken off Removed meanwhile: the next pass's step 1 or 2 deals with it.
		if (outcome.reason === 'gone') continue;
		restoreRefused += 1;
		if (outcome.reason === 'refused') {
			await tellRefusedOnce(db, env, context, request, outcome, now);
		}
	}

	return { restored, restoreRefused };
}

/** Whether a card's `Teacher` names a teacher who is on the roster and not on LOA. */
function hasActiveTeacher(initials: string | null, teachers: Teacher[]): boolean {
	return teachers.some(
		(teacher) =>
			teacher.removedAt === null && teacher.status === 'active' && isAssignedTo(initials, teacher)
	);
}

export type RestoreOutcome =
	/** `keptInLine` when an admin restored a student still away, so it is kept in line by them. */
	| { ok: true; stage: RosterRemovableStatus; keptInLine: boolean }
	/** Jira refused the move; `error` is its message. */
	| { ok: false; stage: RosterRemovableStatus; reason: 'refused'; error: string }
	/** Jira is not configured, so there is nobody to tell. */
	| { ok: false; stage: RosterRemovableStatus; reason: 'no-jira' }
	/** Another restore, or a move on the board, took it off Removed first. */
	| { ok: false; stage: RosterRemovableStatus; reason: 'gone' };

/** The admin pressing Restore now on `/waitlist`. */
export type RestoringAdmin = { cid: string; name: string };

/**
 * Restore now, from `/waitlist`: one request in its window, at once, by the
 * same steps as the automatic restore, whether or not its student is back.
 * A student still away is also kept in line by `admin`, so the next pass does
 * not remove it again; the card's comment says who restored it.
 *
 * Refused by Jira: nothing here changes, and the admin is shown why rather
 * than the training admins being told.
 */
export async function restoreNow(
	db: Database,
	env: Partial<Env> | undefined,
	request: Enrollment,
	admin: RestoringAdmin,
	now: Date
): Promise<RestoreOutcome> {
	const context = await loadContext(db, env);
	return restoreRequest(db, env, resolveJiraConfig(env), context, request, now, admin);
}

/**
 * Restore one request in its window: steps 1–4 of the spec's "Automatic".
 *
 * 1. The stage is `roster_removed_from`, except In Training whose card has no
 *    active teacher: Waitlist.
 * 2. Fire `Restore to <stage>` (or `Needs CATP`), matched by the transition's
 *    name, not where it leads. Refused: nothing here changes, on the card
 *    either, so the Teacher is not touched before this.
 * 3. Clear the card's `Removed` date, and its `Teacher` for a restore to
 *    Waitlist, then comment. A failure is logged; the card has already moved.
 * 4. Read back, and finish. Not read back at the stage: step 1 of the next pass
 *    finishes it.
 *
 * An unfiled request has no card: its status goes back here, and it is finished.
 *
 * `admin` is set for Restore now. With a student still away, the row is kept in
 * line by that admin as soon as the card has moved, so however the restore is
 * finished (here, or by step 1 of a later pass) it is not the board's.
 */
async function restoreRequest(
	db: Database,
	env: Partial<Env> | undefined,
	config: JiraConfig | null,
	context: Context,
	request: Enrollment,
	now: Date,
	admin: RestoringAdmin | null = null
): Promise<RestoreOutcome> {
	const from = request.rosterRemovedFrom!;
	const clearTeacher =
		from === 'in-training' && !hasActiveTeacher(request.teacher, context.teachers);
	const stage: RosterRemovableStatus = clearTeacher ? 'waitlist' : from;
	const teacherCleared = clearTeacher ? request.teacher : null;
	const keptBy =
		admin && !isBackOnHomeRoster(context.people.get(request.cid) ?? null) ? admin : null;
	const keptInLine = keptBy ? { keptInLineAt: now, keptInLineBy: keptBy.cid } : {};

	if (!request.jiraIssueKey) {
		const [reverted] = await db
			.update(enrollmentsTable)
			.set({ status: stage, ...keptInLine, updatedAt: now })
			.where(
				and(
					eq(enrollmentsTable.id, request.id),
					eq(enrollmentsTable.status, 'removed'),
					isNull(enrollmentsTable.jiraIssueKey)
				)
			)
			.returning();
		if (!reverted) return { ok: false, stage, reason: 'gone' };
		await finishRestore(db, env, context, reverted, now, teacherCleared);
		return { ok: true, stage, keptInLine: keptBy !== null };
	}

	if (!config) return { ok: false, stage, reason: 'no-jira' };
	const issueKey = request.jiraIssueKey;

	try {
		await transitionIssueByName(config, issueKey, restoreTransitionName(stage));
	} catch (err) {
		// `Restore to <stage>` is offered from Removed only (ticket 02), so a
		// second restore of the same card, by two admins at once or an admin and
		// the job, is refused. That one is not Jira's refusal.
		if (await hasLeftRemoved(config, issueKey)) return { ok: false, stage, reason: 'gone' };
		const error = err instanceof Error ? err.message : String(err);
		console.error('[training-tools] roster restore refused', issueKey, error);
		return { ok: false, stage, reason: 'refused', error };
	}

	// The card has moved, so the restore will be finished: by this admin's hand.
	if (keptBy) {
		await db
			.update(enrollmentsTable)
			.set({ ...keptInLine, updatedAt: now })
			.where(eq(enrollmentsTable.id, request.id));
	}
	const done = { ok: true, stage, keptInLine: keptBy !== null } as const;

	try {
		await updateIssueFields(config, issueKey, {
			[JIRA_FIELDS.removed]: null,
			...(clearTeacher && request.teacher ? { [TEACHER_FIELD]: null } : {})
		});
	} catch (err) {
		console.error(
			'[training-tools] roster restore: could not clear the Removed date or Teacher',
			issueKey,
			err
		);
	}
	try {
		await commentOnIssue(config, issueKey, restoreComment(stage, keptBy?.name));
	} catch (err) {
		console.error('[training-tools] roster restore: could not comment', issueKey, err);
	}

	try {
		await syncEnrollmentIssue(db, env, issueKey);
	} catch (err) {
		// The card has moved; the next pass reads it back and finishes it.
		console.error('[training-tools] roster restore: could not read back', issueKey, err);
		return done;
	}

	const read = await db.query.enrollmentsTable.findFirst({
		where: eq(enrollmentsTable.id, request.id)
	});
	if (read?.status !== stage) {
		console.warn('[training-tools] roster restore: card not read back at', stage, issueKey);
		return done;
	}
	await finishRestore(db, env, context, read, now, teacherCleared);
	return done;
}

/** Whether the card is now somewhere other than Removed. False when it cannot be read. */
async function hasLeftRemoved(config: JiraConfig, issueKey: string): Promise<boolean> {
	try {
		const issue = await fetchEnrollmentIssue(config, issueKey);
		const status = issue?.fields?.status?.name;
		return !!status && status.toLowerCase() !== REMOVED_STATUS.toLowerCase();
	} catch {
		return false;
	}
}

/**
 * Finish a restore, once: clear the restore columns and the refusal marker, and
 * set `announced_status` so `announceArrivals()` does not take it for an
 * arrival. `announced_teacher` is left, so the pairing is not announced again.
 *
 * A Rating Exam nobody has claimed gets a fresh exam post with its pings: its
 * post fields are cleared and `announced_status` is left at `removed`, so the
 * next announcements pass posts it as an arrival. A claimed one keeps its
 * examiner and gets no post. A student still off the home roster is kept in
 * line by the board. `createdAt` is untouched: the request is back at its old
 * place in line.
 *
 * Guarded on the row still being in its window at this status, so a second
 * pass, or two at once, finish it and tell people once. True when this call did.
 */
async function finishRestore(
	db: Database,
	env: Partial<Env> | undefined,
	context: Context,
	request: Enrollment,
	now: Date,
	teacherCleared: string | null
): Promise<boolean> {
	const member = context.people.get(request.cid) ?? null;
	const away = !isBackOnHomeRoster(member);
	const unclaimedExam = request.status === 'rating-exam' && !request.reInstructor;

	const [finished] = await db
		.update(enrollmentsTable)
		.set({
			rosterRemovedAt: null,
			rosterRemovedFrom: null,
			leftHomeAt: null,
			restoreBy: null,
			restoreRefusalToldAt: null,
			announcedStatus: unclaimedExam ? 'removed' : request.status,
			...(unclaimedExam ? { examMessageId: null, examMessageStatus: null } : {}),
			...(away && !request.keptInLineAt ? { keptInLineAt: now, keptInLineBy: null } : {}),
			updatedAt: now
		})
		.where(
			and(
				eq(enrollmentsTable.id, request.id),
				inRestoreWindow(),
				eq(enrollmentsTable.status, request.status)
			)
		)
		.returning({ id: enrollmentsTable.id });
	if (!finished) return false;

	await announceRestore(env, context, request, member, { keptInLine: away, teacherCleared });
	return true;
}

function describeRequest(
	request: Enrollment,
	member: MirrorMember | null,
	baseUrl: string | undefined
): NoticeRequest {
	return {
		name: memberName(member, request.submittedName),
		cid: request.cid,
		course: request.course,
		teacher: request.teacher,
		examiner: request.reInstructor,
		issueKey: request.jiraIssueKey,
		issueUrl: issueUrl(baseUrl, request.jiraIssueKey)
	};
}

/**
 * Tell the training admins, and privately: the student (unless they chose
 * email), the teacher if it was restored to In Training with them, and the
 * examiner if one is still on the card. Anyone not reachable is named in the
 * admins' notice.
 */
async function announceRestore(
	env: Partial<Env> | undefined,
	context: Context,
	request: Enrollment,
	member: MirrorMember | null,
	how: { keptInLine: boolean; teacherCleared: string | null }
): Promise<void> {
	const described = describeRequest(request, member, context.baseUrl);
	const stage = TRK_STAGE_NAMES[request.status as RosterRemovableStatus] ?? request.status;
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
		const matches = context.teachers.filter((teacher) => isAssignedTo(initials, teacher));
		const teacher = matches.find((t) => t.removedAt === null) ?? matches[0];
		return teacher ? (context.people.get(teacher.cid)?.discordId ?? null) : null;
	};

	if (request.notificationPreference === 'email') {
		untold.push('the student (chose email)');
	} else {
		await tell(
			'the student',
			member?.discordId ?? null,
			rosterRestoreStudentMessage({
				course: request.course,
				stage,
				teacherCleared: how.teacherCleared !== null
			})
		);
	}

	if (request.status === 'in-training' && request.teacher) {
		await tell(
			`teacher ${request.teacher}`,
			discordIdOf(request.teacher),
			rosterRestoreTeacherMessage({ name: described.name, course: request.course })
		);
	}
	if (request.reInstructor) {
		await tell(
			`examiner ${request.reInstructor}`,
			discordIdOf(request.reInstructor),
			rosterRestoreExaminerMessage({ name: described.name, course: request.course, stage })
		);
	}

	await notify(
		env,
		rosterRestoreNotice({
			...described,
			stage,
			keptInLine: how.keptInLine,
			teacherCleared: how.teacherCleared,
			untold
		})
	);
}

/**
 * Tell the training admins that Jira refused a restore, unless they have been
 * told for this request already. The marker is written only once the notice is
 * not refused, so a Larry outage is retried.
 */
async function tellRefusedOnce(
	db: Database,
	env: Partial<Env> | undefined,
	context: Context,
	request: Enrollment,
	refusal: { stage: RosterRemovableStatus; error: string },
	now: Date
): Promise<void> {
	if (request.restoreRefusalToldAt) return;

	const outcome = await notify(
		env,
		rosterRestoreRefusedNotice({
			...describeRequest(request, context.people.get(request.cid) ?? null, context.baseUrl),
			stage: TRK_STAGE_NAMES[refusal.stage],
			transition: restoreTransitionName(refusal.stage),
			error: refusal.error
		})
	);
	if (outcome === 'failed') return;

	await db
		.update(enrollmentsTable)
		.set({ restoreRefusalToldAt: now })
		.where(and(eq(enrollmentsTable.id, request.id), isNull(enrollmentsTable.restoreRefusalToldAt)));
}
