import { ROSTER_REMOVABLE_STATUSES, type Enrollment } from '$lib/db/schema/enrollments';

/**
 * When a request comes off because its student left the home roster, and how
 * long it can be restored for. Pure, so the rule is tested without a database.
 *
 * The job that acts on it is `processRosterRemovals()` in
 * `$lib/server/enrollments/roster-removals.ts`. See
 * decisions/0037-roster-removal-and-restore.md
 */

/** How long a student must have been off the home roster before their request comes off. */
export const ROSTER_REMOVAL_DELAY_MS = 24 * 60 * 60 * 1000;

/** The restore window, counted from leaving the home roster rather than from the removal. */
export const RESTORE_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

type RemovalCandidate = Pick<
	Enrollment,
	'withdrawnAt' | 'keptInLineAt' | 'rosterRemovedAt' | 'restoreClosedAt'
> & { status: string };

/**
 * Whether a request is due for roster removal now. All of these hold:
 *
 * - it is at Waitlist, In Training, Rating Exam or Needs CATP (never Audit);
 * - its student's `left_home_at` is more than 24 hours ago;
 * - it is not kept in line;
 * - it is not already in a restore window, or closed by one.
 *
 * `member` is the student's mirror row, removed or not. With none there is no
 * `left_home_at` to count from, so nothing is due; the same goes for a student
 * who is home again (`leftHomeAt` null).
 */
export function isDueForRemoval(
	request: RemovalCandidate,
	member: { leftHomeAt: Date | null } | null,
	now: Date
): boolean {
	if (request.withdrawnAt) return false;
	if (!(ROSTER_REMOVABLE_STATUSES as readonly string[]).includes(request.status)) return false;
	if (request.keptInLineAt) return false;
	if (request.rosterRemovedAt || request.restoreClosedAt) return false;
	if (!member?.leftHomeAt) return false;

	return now.getTime() - member.leftHomeAt.getTime() > ROSTER_REMOVAL_DELAY_MS;
}

/** The last moment a removed request can be restored: `left_home_at` plus 30 days. */
export function restoreByFor(leftHomeAt: Date): Date {
	return new Date(leftHomeAt.getTime() + RESTORE_WINDOW_DAYS * DAY_MS);
}

/**
 * Removed by the app and still restorable. Such a request counts as open (the
 * student cannot file another) but not as waiting (its status is `removed`).
 */
export function isInRestoreWindow(
	request: Pick<Enrollment, 'rosterRemovedAt' | 'restoreClosedAt'>
): boolean {
	return request.rosterRemovedAt !== null && request.restoreClosedAt === null;
}

/**
 * On the home roster as `home`: mirror row present and not removed, and no
 * `left_home_at`. A request in its window whose student is this is restored.
 */
export function isBackOnHomeRoster(
	member: {
		membership: 'home' | 'visit';
		removedAt: Date | null;
		leftHomeAt: Date | null;
	} | null
): boolean {
	return (
		member !== null &&
		member.removedAt === null &&
		member.membership === 'home' &&
		member.leftHomeAt === null
	);
}

/**
 * What a request in its window means once its card is read back off Removed by
 * some other route than the automatic restore (staff on the board, Restore now,
 * or a restore whose last step was not reached):
 *
 * - `restored`: Waitlist, In Training or Rating Exam, or Needs CATP when that is
 *   where it was removed from. Finished as a restore.
 * - `closed`: Withdrawn, or Needs CATP from any other stage. The window closes,
 *   `moved-on-board`, and the card's new stage stands.
 * - null: still Removed, or somewhere TRK cannot take a card from Removed
 *   (Audit, Completed). Left alone.
 */
export function boardMoveOutcome(
	request: Pick<Enrollment, 'status' | 'rosterRemovedFrom'>
): 'restored' | 'closed' | null {
	switch (request.status) {
		case 'waitlist':
		case 'in-training':
		case 'rating-exam':
			return 'restored';
		case 'needs-catp':
			return request.rosterRemovedFrom === 'needs-catp' ? 'restored' : 'closed';
		case 'withdrawn':
			return 'closed';
		default:
			return null;
	}
}
