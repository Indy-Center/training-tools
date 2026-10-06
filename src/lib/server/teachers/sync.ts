import { eq, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { rosterMembersTable } from '$lib/db/schema/roster';
import {
	teacherQualificationsTable,
	teachersTable,
	type Teacher,
	type TeacherQualification
} from '$lib/db/schema/teachers';
import {
	activityInsert,
	runGroups,
	type ActivityInput,
	type BatchStatement
} from '$lib/server/activity';
import {
	QUALIFICATION_CREDENTIALS,
	QUALIFICATION_RETENTION_MONTHS,
	downgradeFor,
	automaticLevel,
	qualificationsExpired,
	teacherRolesFrom,
	type QualificationLevel,
	type TeacherRole
} from '$lib/teachers';
import type { VatusaRosterMember } from '$lib/types/vatusa';
import { notify } from '$lib/server/notify';
import { getPeople } from '$lib/server/roster';
import { assignmentsFor, getAssignedEnrollments, teacherLabel } from './index';
import { leftRosterNotice, qualificationChangesNotice } from './notices';
import { endQualification, startQualification } from './qualifications';

/** One active roster member, as the teacher sync needs them. */
export type RosterFacts = { cid: string; rating: number; roles: TeacherRole[] };

export type TeacherWrite = {
	cid: string;
	roles: TeacherRole[];
	/** Null puts them on (or back on) the teacher roster. */
	removedAt: Date | null;
	/** True for someone the sync has never seen: insert rather than update. */
	isNew: boolean;
};

/** A level change, applied atomically: end the current row, start the next. */
export type QualificationChange = {
	cid: string;
	code: string;
	/** The current row to end, if there is one. */
	endId: string | null;
	/**
	 * Why: an instructor's level set for them, a level the rules no longer
	 * allow, or everything ended after six months away. The last two are what
	 * training admins are told about.
	 */
	kind: 'automatic' | 'downgraded' | 'expired';
	/** The level being ended, or null when there was none. */
	fromLevel: QualificationLevel | null;
	reason: string;
	/** The level to start, or null to leave them on No Qual. */
	startLevel: QualificationLevel | null;
	note: string | null;
};

export type TeacherRosterPlan = {
	teachers: TeacherWrite[];
	events: ActivityInput[];
	qualifications: QualificationChange[];
	summary: {
		teachers: number;
		joined: number;
		returned: number;
		left: number;
		roleChanges: number;
		/** Levels raised to what an instructor holds automatically. */
		automatic: number;
		downgraded: number;
		expired: number;
	};
};

function sameRoles(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((role, i) => role === b[i]);
}

/**
 * Work out what the teacher roster sync should change. Pure, so every rule is
 * testable without D1.
 *
 * In order:
 *
 * 1. **Membership.** Anyone holding `ZID:INS`/`ZID:MTR` on the active roster is
 *    a teacher; anyone else is not. New people are added, returners restored,
 *    leavers soft-removed, and role changes recorded.
 * 2. **Instructors teach everything automatically**: Teacher and Evaluator on
 *    every course with an evaluation, Teacher on every other course and
 *    endorsement.
 * 3. **Evaluators who no longer qualify drop to Teacher** — someone who lost
 *    INS, or a mentor rated below S3 holding S-GC.
 * 4. **Six months off the roster ends every qualification.** Before that they
 *    are kept, so someone who comes back sooner simply still holds them.
 *
 * 2 and 3 apply only to people on the teacher roster: someone away keeps what
 * they held, exactly as they held it, until they return or it expires.
 */
export function planTeacherRoster(input: {
	roster: readonly RosterFacts[];
	teachers: readonly Teacher[];
	current: readonly TeacherQualification[];
	now: Date;
}): TeacherRosterPlan {
	const { now } = input;
	const summary: TeacherRosterPlan['summary'] = {
		teachers: 0,
		joined: 0,
		returned: 0,
		left: 0,
		roleChanges: 0,
		automatic: 0,
		downgraded: 0,
		expired: 0
	};
	const writes: TeacherWrite[] = [];
	const events: ActivityInput[] = [];
	const qualifications: QualificationChange[] = [];

	const wanted = new Map(
		input.roster.filter((member) => member.roles.length > 0).map((member) => [member.cid, member])
	);
	const existing = new Map(input.teachers.map((teacher) => [teacher.cid, teacher]));

	// 1. Membership.
	for (const member of wanted.values()) {
		const teacher = existing.get(member.cid);

		if (!teacher) {
			writes.push({ cid: member.cid, roles: member.roles, removedAt: null, isNew: true });
			events.push({
				cid: member.cid,
				event: 'teacher.joined',
				detail: { note: member.roles.join(', ') },
				at: now
			});
			summary.joined += 1;
			continue;
		}

		const returning = teacher.removedAt !== null;
		const rolesChanged = !sameRoles(teacher.roles, member.roles);
		if (!returning && !rolesChanged) continue;

		writes.push({ cid: member.cid, roles: member.roles, removedAt: null, isNew: false });

		if (returning) {
			events.push({ cid: member.cid, event: 'teacher.returned', at: now });
			summary.returned += 1;
		}

		for (const role of member.roles.filter((role) => !teacher.roles.includes(role))) {
			events.push({ cid: member.cid, event: 'teacher.role-added', detail: { role }, at: now });
			summary.roleChanges += 1;
		}
		for (const role of teacher.roles.filter((role) => !member.roles.includes(role))) {
			events.push({ cid: member.cid, event: 'teacher.role-removed', detail: { role }, at: now });
			summary.roleChanges += 1;
		}
	}

	for (const teacher of input.teachers) {
		if (teacher.removedAt !== null || wanted.has(teacher.cid)) continue;

		writes.push({ cid: teacher.cid, roles: [], removedAt: now, isNew: false });
		events.push({
			cid: teacher.cid,
			event: 'teacher.left',
			detail: { note: 'No longer holds ZID:INS or ZID:MTR on the VATUSA roster' },
			at: now
		});
		for (const role of teacher.roles) {
			events.push({ cid: teacher.cid, event: 'teacher.role-removed', detail: { role }, at: now });
		}
		summary.left += 1;
	}

	// Who is on the teacher roster after this run, and on what terms.
	const onRoster = new Map<string, RosterFacts>(wanted);
	summary.teachers = onRoster.size;

	const currentByCid = new Map<string, TeacherQualification[]>();
	for (const row of input.current) {
		const rows = currentByCid.get(row.cid);
		if (rows) rows.push(row);
		else currentByCid.set(row.cid, [row]);
	}

	// 2 and 3. Rules, for people on the roster.
	for (const member of onRoster.values()) {
		const held = currentByCid.get(member.cid) ?? [];

		for (const credential of QUALIFICATION_CREDENTIALS) {
			const row = held.find((candidate) => candidate.code === credential.code) ?? null;

			const automatic = automaticLevel(credential.code, member);
			if (automatic) {
				if (row?.level === automatic) continue;
				const does = automatic === 'evaluator' ? 'evaluates' : 'teaches';
				qualifications.push({
					cid: member.cid,
					code: credential.code,
					endId: row?.id ?? null,
					kind: 'automatic',
					fromLevel: row?.level ?? null,
					reason: `Instructor: ${does} automatically`,
					startLevel: automatic,
					note: `Instructor (ZID:INS): ${does} automatically`
				});
				summary.automatic += 1;
				continue;
			}

			if (!row) continue;
			const lowered = downgradeFor(credential.code, row.level, member);
			if (!lowered) continue;

			// Instructors may evaluate everything evaluable, so a downgrade always
			// means someone without INS: either an S-GC mentor below S3, or a
			// former instructor on a course only instructors evaluate.
			const why =
				credential.code === 'S-GC' && member.roles.includes('MTR')
					? 'Mentors must be rated S3 or higher to evaluate S-GC'
					: `Only instructors evaluate ${credential.code}`;
			qualifications.push({
				cid: member.cid,
				code: credential.code,
				endId: row.id,
				kind: 'downgraded',
				fromLevel: row.level,
				reason: why,
				startLevel: lowered,
				note: why
			});
			summary.downgraded += 1;
		}
	}

	// 4. Expiry, for people off the roster. Membership changes this run
	// count: a leaver this run is not expired, a returner is not off at all.
	for (const teacher of input.teachers) {
		if (onRoster.has(teacher.cid)) continue;
		const removedAt = teacher.removedAt ?? now;
		if (!qualificationsExpired(removedAt, now)) continue;

		for (const row of currentByCid.get(teacher.cid) ?? []) {
			qualifications.push({
				cid: teacher.cid,
				code: row.code,
				endId: row.id,
				kind: 'expired',
				fromLevel: row.level,
				reason: `Off the teacher roster for more than ${QUALIFICATION_RETENTION_MONTHS} months`,
				startLevel: null,
				note: null
			});
			summary.expired += 1;
		}
	}

	return { teachers: writes, events, qualifications, summary };
}

/**
 * Keep the teacher roster in step with VATUSA, and qualifications in step with
 * the rules. Runs from the cron, after the roster sync it reads.
 *
 * Reads whole tables rather than filtering by CID — **D1 allows only 100 bound
 * parameters per query** — and each write binds a handful.
 *
 * Refuses to run against an empty roster mirror, or one where nobody holds a
 * teaching role while we have teachers on file: either means the upstream data
 * is wrong, and applying it would mark every teacher as departed and start the
 * clock on their qualifications. A stale teacher roster beats an empty one,
 * the same call the roster sync makes.
 */
export async function syncTeacherRoster(db: Database, env?: Partial<Env>, now = new Date()) {
	const [rosterRows, teachers, current] = await Promise.all([
		db
			.select({
				cid: rosterMembersTable.cid,
				rating: rosterMembersTable.rating,
				data: rosterMembersTable.data
			})
			.from(rosterMembersTable)
			.where(isNull(rosterMembersTable.removedAt)),
		db.select().from(teachersTable),
		db.select().from(teacherQualificationsTable).where(isNull(teacherQualificationsTable.endedAt))
	]);

	if (rosterRows.length === 0) {
		throw new Error('Roster mirror is empty; refusing to sync the teacher roster');
	}

	const roster: RosterFacts[] = rosterRows.map((row) => ({
		cid: row.cid,
		rating: row.rating,
		roles: teacherRolesFrom((row.data as VatusaRosterMember).roles)
	}));

	const activeTeachers = teachers.filter((teacher) => teacher.removedAt === null).length;
	if (activeTeachers > 0 && !roster.some((member) => member.roles.length > 0)) {
		throw new Error(
			'No roster member holds ZID:INS or ZID:MTR; refusing to empty the teacher roster'
		);
	}

	const plan = planTeacherRoster({ roster, teachers, current, now });

	const groups: BatchStatement[][] = [];

	for (const write of plan.teachers) {
		groups.push([
			write.isNew
				? db.insert(teachersTable).values({
						cid: write.cid,
						roles: write.roles,
						joinedAt: now,
						updatedAt: now
					})
				: db
						.update(teachersTable)
						.set({ roles: write.roles, removedAt: write.removedAt, updatedAt: now })
						.where(eq(teachersTable.cid, write.cid))
		]);
	}

	for (const event of plan.events) groups.push([activityInsert(db, event)]);

	for (const change of plan.qualifications) {
		const group: BatchStatement[] = [];
		if (change.endId) {
			group.push(endQualification(db, change.endId, { reason: change.reason, by: null, at: now }));
		}
		if (change.startLevel) {
			group.push(
				startQualification(db, {
					cid: change.cid,
					code: change.code,
					level: change.startLevel,
					basis: 'automatic',
					note: change.note,
					by: null,
					at: now
				})
			);
		}
		groups.push(group);
	}

	await runGroups(db, groups);

	// After the writes, and never part of them: a notice that cannot be sent
	// must not undo or fail the sync.
	await announceRosterChanges(db, env, plan, teachers).catch((err) =>
		console.error('[training-tools] teacher roster notices failed', err)
	);

	return plan.summary;
}

/**
 * Tell training admins what this run changed that they need to act on: a
 * teacher who left with students still assigned, and qualifications lowered or
 * ended by the rules. Joins, returns and role changes are timeline-only.
 */
async function announceRosterChanges(
	db: Database,
	env: Partial<Env> | undefined,
	plan: TeacherRosterPlan,
	teachers: readonly Teacher[]
): Promise<void> {
	const leavers = plan.teachers.filter((write) => write.removedAt !== null);
	const lowered = plan.qualifications.filter(
		(change) => change.kind !== 'automatic' && change.fromLevel !== null
	);
	if (leavers.length === 0 && lowered.length === 0) return;

	const byCid = new Map(teachers.map((teacher) => [teacher.cid, teacher]));
	const people = await getPeople(db);
	const label = (cid: string) =>
		teacherLabel({ cid, initials: byCid.get(cid)?.initials ?? null }, people.get(cid));

	if (leavers.length > 0) {
		const enrollments = await getAssignedEnrollments(db);
		for (const leaver of leavers) {
			const teacher = { cid: leaver.cid, initials: byCid.get(leaver.cid)?.initials ?? null };
			const notice = leftRosterNotice({
				teacher: label(leaver.cid),
				assigned: assignmentsFor(teacher, enrollments).students.map((student) => ({
					name: people.get(student.cid)?.name ?? student.submittedName,
					course: student.course,
					status: student.status
				}))
			});
			if (notice) await notify(env, notice);
		}
	}

	const notice = qualificationChangesNotice(
		lowered.map((change) => ({
			teacher: label(change.cid),
			code: change.code,
			from: change.fromLevel!,
			to: change.startLevel,
			reason: change.reason
		}))
	);
	if (notice) await notify(env, notice);
}
