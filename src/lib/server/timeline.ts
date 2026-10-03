import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { activityLogTable, type ActivityLogEntry } from '$lib/db/schema/activity-log';
import { certificationsTable, type Certification } from '$lib/db/schema/certifications';
import { teacherQualificationsTable, type TeacherQualification } from '$lib/db/schema/teachers';
import { ACTIVITY_LABELS, type ActivityDetail, type ActivityEvent } from '$lib/activity';
import {
	QUALIFICATION_LEVEL_LABELS,
	TEACHER_STATUS_LABELS,
	type TeacherStatus
} from '$lib/teachers';

/**
 * One controller's history, newest first: roster and teacher events from
 * `activity_log`, qualification changes from `teacher_qualifications`, and
 * certification grants and revocations from `certifications`.
 *
 * Read from each table's own record rather than copied into one log, so
 * nothing can disagree with the table it came from.
 *
 * **The one place to repoint** when this history moves to a central log on
 * identity: pages call `getTimeline()` and render `TimelineEntry`, and never
 * read these tables for history themselves.
 */

export type TimelineKind = 'roster' | 'teacher' | 'qualification' | 'certification';

export type TimelineEntry = {
	at: Date;
	kind: TimelineKind;
	title: string;
	detail: string | null;
	/** CID of the person responsible; null when automatic. */
	actor: string | null;
	/** Short label shown beside the title — a credential code, usually. */
	tag: string | null;
	/** Something a training admin should look at. */
	flag: string | null;
};

const GRANT_BASIS_LABELS: Record<string, string> = {
	'auto-arrival': 'Granted on arrival',
	training: 'Earned by completing the course',
	imported: 'Imported from the community site',
	manual: 'Set by training staff'
};

function statusLabel(value: unknown): string {
	return TEACHER_STATUS_LABELS[value as TeacherStatus] ?? String(value);
}

function orNotSet(value: unknown): string {
	return value === null || value === undefined || value === '' ? 'not set' : String(value);
}

/** The one line under an activity entry. Pure. */
export function describeActivity(
	event: ActivityEvent,
	detail: ActivityDetail | null
): string | null {
	if (!detail) return null;

	const parts: string[] = [];
	if (detail.role) parts.push(detail.role);

	if ('from' in detail || 'to' in detail) {
		if (event === 'teacher.status') {
			parts.push(`${statusLabel(detail.from)} → ${statusLabel(detail.to)}`);
		} else if (event === 'teacher.availability') {
			// Free text can run to paragraphs; the new value is what matters.
			parts.push(`Now: ${orNotSet(detail.to)}`);
		} else {
			parts.push(`${orNotSet(detail.from)} → ${orNotSet(detail.to)}`);
		}
	}

	if (detail.note) parts.push(detail.note);
	return parts.length > 0 ? parts.join(' · ') : null;
}

function fromActivity(row: ActivityLogEntry): TimelineEntry {
	return {
		at: row.at,
		kind: row.event.startsWith('roster.') ? 'roster' : 'teacher',
		title: ACTIVITY_LABELS[row.event] ?? row.event,
		detail: describeActivity(row.event, row.detail ?? null),
		actor: row.actor,
		tag: null,
		flag: null
	};
}

function fromQualifications(rows: readonly TeacherQualification[]): TimelineEntry[] {
	const entries: TimelineEntry[] = [];
	// A level change ends one row and starts the next at the same instant.
	// Only the start is worth showing then; an end on its own is a removal.
	const startedAt = new Set(rows.map((row) => `${row.code}@${row.startedAt.getTime()}`));

	for (const row of rows) {
		entries.push({
			at: row.startedAt,
			kind: 'qualification',
			title: `Qualified: ${QUALIFICATION_LEVEL_LABELS[row.level]}`,
			detail: row.note,
			actor: row.startedBy,
			tag: row.code,
			flag: null
		});

		if (row.endedAt && !startedAt.has(`${row.code}@${row.endedAt.getTime()}`)) {
			entries.push({
				at: row.endedAt,
				kind: 'qualification',
				title: `Qualification ended: back to ${QUALIFICATION_LEVEL_LABELS.none}`,
				detail: row.endedReason,
				actor: row.endedBy,
				tag: row.code,
				flag: null
			});
		}
	}

	return entries;
}

function fromCertifications(rows: readonly Certification[]): TimelineEntry[] {
	const entries: TimelineEntry[] = [];

	for (const row of rows) {
		entries.push({
			at: row.grantedAt,
			kind: 'certification',
			title: `${row.kind === 'endorsement' ? 'Endorsement' : 'Certification'} granted`,
			detail: [GRANT_BASIS_LABELS[row.grantBasis] ?? row.grantBasis, row.grantNote]
				.filter(Boolean)
				.join(' · '),
			actor: row.grantedBy,
			tag: row.code,
			flag: row.needsReview && !row.revokedAt ? 'Needs review' : null
		});

		if (row.revokedAt) {
			entries.push({
				at: row.revokedAt,
				kind: 'certification',
				title: `${row.kind === 'endorsement' ? 'Endorsement' : 'Certification'} revoked`,
				detail: row.revokedReason,
				actor: row.revokedBy,
				tag: row.code,
				flag: null
			});
		}
	}

	return entries;
}

/** Merge the three sources, newest first. Pure. */
export function buildTimeline(input: {
	activity: readonly ActivityLogEntry[];
	qualifications: readonly TeacherQualification[];
	certifications: readonly Certification[];
}): TimelineEntry[] {
	return [
		...input.activity.map(fromActivity),
		...fromQualifications(input.qualifications),
		...fromCertifications(input.certifications)
	].sort((a, b) => b.at.getTime() - a.at.getTime());
}

export async function getTimeline(db: Database, cid: string): Promise<TimelineEntry[]> {
	const [activity, qualifications, certifications] = await Promise.all([
		db.select().from(activityLogTable).where(eq(activityLogTable.cid, cid)),
		db.select().from(teacherQualificationsTable).where(eq(teacherQualificationsTable.cid, cid)),
		db.select().from(certificationsTable).where(eq(certificationsTable.cid, cid))
	]);

	return buildTimeline({ activity, qualifications, certifications });
}
