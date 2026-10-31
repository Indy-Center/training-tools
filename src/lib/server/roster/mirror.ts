import type { Database } from '$lib/server/db';
import { rosterMembersTable } from '$lib/db/schema/roster';

/** A mirror row, as the roster removals job reads it. */
export type MirrorMember = {
	cid: string;
	firstName: string;
	lastName: string;
	discordId: string | null;
	membership: 'home' | 'visit';
	removedAt: Date | null;
	leftHomeAt: Date | null;
};

/**
 * The whole roster mirror by CID, removed members included: a student who left
 * VATUSA keeps their row, and it is what dates their leaving. One whole-table
 * read, never an `IN (...)` over CIDs (D1's 100-parameter limit).
 */
export async function loadMirror(db: Database): Promise<Map<string, MirrorMember>> {
	const members = await db
		.select({
			cid: rosterMembersTable.cid,
			firstName: rosterMembersTable.firstName,
			lastName: rosterMembersTable.lastName,
			discordId: rosterMembersTable.discordId,
			membership: rosterMembersTable.membership,
			removedAt: rosterMembersTable.removedAt,
			leftHomeAt: rosterMembersTable.leftHomeAt
		})
		.from(rosterMembersTable);
	return new Map(members.map((member) => [member.cid, member]));
}

/** A member's name from the mirror, or `fallback` (the name on the request) when there is none. */
export function memberName(
	member: Pick<MirrorMember, 'firstName' | 'lastName'> | null | undefined,
	fallback: string
): string {
	return (member && `${member.firstName} ${member.lastName}`.trim()) || fallback;
}
