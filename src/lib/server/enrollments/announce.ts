import { and, asc, eq, isNull, ne, or } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { enrollmentsTable, type Enrollment } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { highestCertification } from '$lib/certifications';
import { isAssignedTo } from '$lib/teachers';
import { getLiveCredentialsByCid } from '$lib/server/certifications';
import { notify, type Notice } from '$lib/server/notify';
import { getPeople } from '$lib/server/roster';
import { getAllCurrentQualifications, listTeachers } from '$lib/server/teachers';
import {
	announcementFor,
	awaitingAuditNotice,
	examReadyNotice,
	needsCatpNotice,
	type NoticeRequest
} from './notices';

/**
 * Tell the next people in line when a request arrives somewhere they act.
 *
 * Keyed on where the card **is**, like the certification pass: a request whose
 * status differs from `announced_status` has arrived somewhere new, however it
 * got there — a step taken here, or a card dragged on the board. Each arrival is
 * announced once; a retake that leaves Rating Exam and comes back is a new
 * arrival, and is announced again.
 *
 * Run by the cron's last job, by the webhook after a delivery, and after each
 * end-of-course step here.
 *
 * See .ai/decisions/0022-notifications-through-larry.md
 */

export type AnnounceResult = {
	/** Requests whose status had moved on since it was last announced. */
	pending: number;
	/** Of those, how many were sent a notice. The rest needed none. */
	announced: number;
};

/** Guards against a backlog after an outage; normally a pass finds one or two. */
const BATCH_SIZE = 25;

/** Everything a notice may need about the people around a request, read once per pass. */
type People = {
	names: Map<string, string>;
	discordIds: Map<string, string>;
	evaluators: (course: string, request: Enrollment) => string[];
	holds: (cid: string) => string | null;
};

async function loadPeople(db: Database): Promise<People> {
	// Whole tables, not `IN (...)` over the requests: D1's 100-parameter limit.
	const [people, rosterIds, teachers, levels, credentials] = await Promise.all([
		getPeople(db),
		db
			.select({ cid: rosterMembersTable.cid, discordId: rosterMembersTable.discordId })
			.from(rosterMembersTable),
		listTeachers(db),
		getAllCurrentQualifications(db),
		getLiveCredentialsByCid(db)
	]);

	const discordIds = new Map(
		rosterIds.flatMap((row) => (row.discordId ? [[row.cid, row.discordId] as const] : []))
	);

	return {
		names: new Map([...people].map(([cid, person]) => [cid, person.name])),
		discordIds,
		// Evaluators who could claim it: on the teacher roster, not on LOA,
		// evaluating this course — and not the student's own teacher, who may
		// never examine them.
		evaluators: (course, request) =>
			teachers
				.filter(
					(teacher) =>
						teacher.removedAt === null &&
						teacher.status === 'active' &&
						teacher.cid !== request.cid &&
						levels.get(teacher.cid)?.get(course) === 'evaluator' &&
						!isAssignedTo(request.teacher, teacher)
				)
				.flatMap((teacher) => {
					const id = discordIds.get(teacher.cid);
					return id ? [id] : [];
				}),
		holds: (cid) => highestCertification(credentials.get(cid) ?? [])?.code ?? null
	};
}

function describe(
	enrollment: Enrollment,
	people: People,
	jiraBaseUrl: string | undefined
): NoticeRequest {
	const base = jiraBaseUrl?.trim().replace(/\/$/, '');
	return {
		name: people.names.get(enrollment.cid) ?? enrollment.submittedName,
		cid: enrollment.cid,
		course: enrollment.course,
		teacher: enrollment.teacher,
		examiner: enrollment.reInstructor,
		issueKey: enrollment.jiraIssueKey,
		issueUrl: base && enrollment.jiraIssueKey ? `${base}/browse/${enrollment.jiraIssueKey}` : null
	};
}

/** The notice for an arrival, or null when this status tells nobody. */
function noticeFor(enrollment: Enrollment, people: People, jiraBaseUrl?: string): Notice | null {
	const request = describe(enrollment, people, jiraBaseUrl);

	switch (announcementFor(enrollment.status)) {
		case 'exam-ready':
			return examReadyNotice(
				{ ...request, availability: enrollment.availability },
				people.evaluators(enrollment.course, enrollment)
			);
		case 'needs-catp':
			return needsCatpNotice(request);
		case 'awaiting-audit':
			return awaitingAuditNotice({ ...request, holds: people.holds(enrollment.cid) });
		default:
			return null;
	}
}

/** Set `announced_status` only if nobody else has since: two passes can run at once. */
async function mark(db: Database, enrollment: Enrollment, from: string | null, to: string | null) {
	const written = await db
		.update(enrollmentsTable)
		.set({ announcedStatus: to })
		.where(
			and(
				eq(enrollmentsTable.id, enrollment.id),
				from === null
					? isNull(enrollmentsTable.announcedStatus)
					: eq(enrollmentsTable.announcedStatus, from)
			)
		)
		.returning({ id: enrollmentsTable.id });
	return written.length > 0;
}

export async function announceArrivals(
	db: Database,
	env: Partial<Env> | undefined
): Promise<AnnounceResult> {
	const pending = await db
		.select()
		.from(enrollmentsTable)
		.where(
			and(
				isNull(enrollmentsTable.withdrawnAt),
				or(
					isNull(enrollmentsTable.announcedStatus),
					ne(enrollmentsTable.announcedStatus, enrollmentsTable.status)
				)
			)
		)
		.orderBy(asc(enrollmentsTable.updatedAt))
		.limit(BATCH_SIZE);

	let people: People | null = null;
	let announced = 0;

	for (const enrollment of pending) {
		// Not over to the TA until the certification is on: the next pass will see
		// it again once it is.
		if (
			announcementFor(enrollment.status) === 'awaiting-audit' &&
			!enrollment.certificationAppliedAt
		) {
			continue;
		}

		const previous = enrollment.announcedStatus;

		// Claim the arrival first, so a concurrent pass does not announce it too.
		if (!(await mark(db, enrollment, previous, enrollment.status))) continue;

		if (!announcementFor(enrollment.status)) continue;

		people ??= await loadPeople(db);
		const notice = noticeFor(enrollment, people, env?.JIRA_BASE_URL);
		if (!notice) continue;

		const outcome = await notify(env, notice);
		if (outcome === 'failed') {
			// Larry refused or could not be reached: put it back for the next pass.
			await mark(db, enrollment, enrollment.status, previous);
			continue;
		}
		announced += 1;
	}

	return { pending: pending.length, announced };
}
