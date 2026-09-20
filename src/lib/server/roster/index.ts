import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { rosterMembersTable, type RosterMember } from '$lib/db/schema/roster';

export { syncRoster, type RosterSyncResult } from './sync';

/**
 * The current roster entry for a CID, or null if they are not on the roster.
 *
 * Soft-removed rows are excluded, so someone who has left VATUSA reads as
 * not-rostered while their row (and any training history keyed to it) survives.
 */
export async function getRosterMember(db: Database, cid: string): Promise<RosterMember | null> {
	const member = await db.query.rosterMembersTable.findFirst({
		where: and(eq(rosterMembersTable.cid, cid), isNull(rosterMembersTable.removedAt))
	});

	return member ?? null;
}
