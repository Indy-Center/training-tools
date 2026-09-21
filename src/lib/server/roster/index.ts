import { and, asc, eq, isNull, like, or, sql } from 'drizzle-orm';
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

/** Cap on rows returned by a search, so a bare query can't render the facility. */
export const ROSTER_SEARCH_LIMIT = 50;

/**
 * Find active roster members by CID or name.
 *
 * Matching is `LIKE` on three columns rather than an `IN (...)` over candidate
 * CIDs — **D1 allows only 100 bound parameters**, and the facility has more
 * members than that. This shape binds four regardless of how many match.
 *
 * DEV-115 also asks for search by operating initials. Identity's typed RPC
 * surface is `getSessionContext(token)` alone, so there is no way to look up
 * another controller's initials; the roster mirror is the only people-source we
 * have. CID and name until that changes.
 *
 * An empty query returns the start of the roster rather than nothing, so the
 * page has something to show before anyone types.
 */
export async function searchRosterMembers(db: Database, query: string): Promise<RosterMember[]> {
	const trimmed = query.trim();

	const where = trimmed
		? and(
				isNull(rosterMembersTable.removedAt),
				or(
					like(rosterMembersTable.cid, `%${trimmed}%`),
					like(rosterMembersTable.firstName, `%${trimmed}%`),
					like(rosterMembersTable.lastName, `%${trimmed}%`),
					// So "Jo Rivera" matches, which neither name column does alone.
					like(
						sql`${rosterMembersTable.firstName} || ' ' || ${rosterMembersTable.lastName}`,
						`%${trimmed}%`
					)
				)
			)
		: isNull(rosterMembersTable.removedAt);

	return db
		.select()
		.from(rosterMembersTable)
		.where(where)
		.orderBy(asc(rosterMembersTable.lastName), asc(rosterMembersTable.firstName))
		.limit(ROSTER_SEARCH_LIMIT);
}
