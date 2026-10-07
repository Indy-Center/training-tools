import { and, asc, eq, isNull, like, ne, or, sql } from 'drizzle-orm';
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

/**
 * Store the email identity handed us for a signed-in member.
 *
 * Runs on every authenticated request, so it only writes when the address has
 * actually changed — an unchanged one is a primary-key read and nothing else.
 * Removed members are updated too: the row survives their departure, and the
 * address is still theirs. Non-members have no row, so this is a no-op for them.
 */
export async function recordRosterEmail(db: Database, cid: string, email: string): Promise<void> {
	await db
		.update(rosterMembersTable)
		.set({ email })
		.where(
			and(
				eq(rosterMembersTable.cid, cid),
				or(isNull(rosterMembersTable.email), ne(rosterMembersTable.email, email))
			)
		);
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

export type PersonSummary = { name: string; rating: number; ratingShort: string };

/**
 * Names and ratings from the roster mirror, by CID, for everyone it has ever
 * held. Whole table rather than `IN (...)` — D1's 100-parameter limit — and
 * removed rows included, because a former teacher still has a name.
 */
export async function getPeople(db: Database): Promise<Map<string, PersonSummary>> {
	const rows = await db
		.select({
			cid: rosterMembersTable.cid,
			firstName: rosterMembersTable.firstName,
			lastName: rosterMembersTable.lastName,
			rating: rosterMembersTable.rating,
			ratingShort: rosterMembersTable.ratingShort
		})
		.from(rosterMembersTable);

	return new Map(
		rows.map((row) => [
			row.cid,
			{
				name: `${row.firstName} ${row.lastName}`.trim() || row.cid,
				rating: row.rating,
				ratingShort: row.ratingShort
			}
		])
	);
}

/** Display names for a set of CIDs, for rendering who did what. */
export function namesFor(
	cids: Iterable<string | null>,
	people: Map<string, PersonSummary>
): Record<string, string> {
	const names: Record<string, string> = {};
	for (const cid of cids) {
		const person = cid ? people.get(cid) : undefined;
		if (cid && person) names[cid] = person.name;
	}
	return names;
}

/**
 * The address we hold for each member, by CID: their VATSIM email, recorded when
 * they sign in, so someone who never has is absent. Whole table, like
 * `getPeople`. **Only for showing to someone who needs it to reach a student** —
 * the waitlist sheet, and that student's own teacher — and only where the
 * student asked to be reached by email.
 */
export async function getRosterEmails(db: Database): Promise<Map<string, string>> {
	const rows = await db
		.select({ cid: rosterMembersTable.cid, email: rosterMembersTable.email })
		.from(rosterMembersTable);

	return new Map(rows.flatMap((row) => (row.email ? [[row.cid, row.email] as const] : [])));
}
