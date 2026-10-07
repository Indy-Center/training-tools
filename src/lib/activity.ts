/**
 * The events `activity_log` records, and how a timeline words them.
 *
 * Not under `$lib/server/` on purpose — the timeline component renders these.
 *
 * Only events with no other home are logged. Certification grants and
 * revocations live in `certifications`, and qualification changes in
 * `teacher_qualifications`; the timeline reads those tables directly rather
 * than keeping a second copy here. See `$lib/server/timeline.ts`.
 *
 * **Temporary home.** All of this is meant to move to a central log on
 * identity, shared by every app. Keep events small, CID-keyed and
 * self-describing so that move is a copy, not a redesign.
 */
export const ACTIVITY_EVENTS = [
	// Every controller, written by the roster sync.
	'roster.joined',
	'roster.left',
	'roster.returned',
	// Teachers, written by the teacher roster sync.
	'teacher.joined',
	'teacher.left',
	'teacher.returned',
	'teacher.role-added',
	'teacher.role-removed',
	// Teachers, written by a manager or by the teacher.
	'teacher.status',
	'teacher.initials',
	'teacher.availability',
	'teacher.message',
	'teacher.slots'
] as const;
export type ActivityEvent = (typeof ACTIVITY_EVENTS)[number];

/**
 * What changed. `from`/`to` for edits, `role` for role changes, `note` for
 * anything a person should read.
 */
export type ActivityDetail = {
	from?: string | number | null;
	to?: string | number | null;
	role?: string;
	note?: string;
};

export const ACTIVITY_LABELS: Record<ActivityEvent, string> = {
	'roster.joined': 'Joined the ZID roster',
	'roster.left': 'Left the ZID roster',
	'roster.returned': 'Returned to the ZID roster',
	'teacher.joined': 'Joined the teacher roster',
	'teacher.left': 'Left the teacher roster',
	'teacher.returned': 'Returned to the teacher roster',
	'teacher.role-added': 'Gained a teaching role',
	'teacher.role-removed': 'Lost a teaching role',
	'teacher.status': 'Teacher status changed',
	'teacher.initials': 'Initials changed',
	'teacher.availability': 'Availability changed',
	'teacher.message': 'Message to students changed',
	'teacher.slots': 'Student slots changed'
};
