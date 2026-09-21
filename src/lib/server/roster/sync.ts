import { and, isNull, lt } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { fetchRoster } from '$lib/server/vatusa';
import {
	rosterMembersTable,
	type InsertRosterMember,
	type RosterMembership
} from '$lib/db/schema/roster';
import type { VatusaRosterMember } from '$lib/types/vatusa';

export type RosterSyncResult = {
	fetched: number;
	added: number;
	restored: number;
	removed: number;
	/**
	 * Who changed, not just how many. The arrival-certification job (DEV-115)
	 * runs off these, so it can look at the handful of people who actually
	 * arrived instead of re-scanning the facility.
	 */
	addedCids: string[];
	restoredCids: string[];
	removedCids: string[];
};

/** VATUSA sends "home" | "visit"; anything unexpected is treated as visiting. */
function toMembership(value: unknown): RosterMembership {
	return value === 'home' ? 'home' : 'visit';
}

export function toRosterRow(member: VatusaRosterMember, now: Date): InsertRosterMember {
	return {
		cid: String(member.cid),
		firstName: member.fname ?? '',
		lastName: member.lname ?? '',
		rating: member.rating ?? 0,
		ratingShort: member.rating_short ?? 'UNK',
		membership: toMembership(member.membership),
		facility: member.facility ?? '',
		isHomeController: Boolean(member.flag_homecontroller),
		isMentor: Boolean(member.isMentor),
		isSupIns: Boolean(member.isSupIns),
		discordId: member.discord_id ? String(member.discord_id) : null,
		facilityJoinedAt: member.facility_join ?? null,
		lastActivityAt: member.lastactivity ?? null,
		data: member,
		syncedAt: now,
		// Present in this sync, so explicitly not removed. This is what brings
		// back someone who left the roster and returned.
		removedAt: null
	};
}

/** D1 caps how much one batch can carry, so upserts go in chunks. */
const CHUNK_SIZE = 25;

/**
 * Pull the VATUSA roster and reconcile it into our mirror.
 *
 * Upserts everyone present, soft-removes everyone who has disappeared. We
 * deliberately do not truncate-and-replace (what community-website does),
 * because that loses the difference between "never on the roster" and "left
 * recently", and rows here are referenced by CID from training data we own.
 *
 * Throws if the upstream fetch fails or returns an empty roster, so a VATUSA
 * outage leaves the previous mirror intact instead of marking the whole
 * facility as removed.
 */
export async function syncRoster(db: Database): Promise<RosterSyncResult> {
	const members = await fetchRoster();

	if (members.length === 0) {
		throw new Error('VATUSA roster returned zero members; refusing to sync');
	}

	const now = new Date();
	const rows = members.map((member) => toRosterRow(member, now));

	// Classify before writing, so the counts describe what actually changed.
	// Read the whole table rather than filtering by CID: D1 allows only 100
	// bound parameters per query and the facility has more members than that,
	// while the table itself is small enough to scan cheaply.
	const existing = await db
		.select({ cid: rosterMembersTable.cid, removedAt: rosterMembersTable.removedAt })
		.from(rosterMembersTable);

	const previousRemovedAt = new Map(existing.map((row) => [row.cid, row.removedAt]));
	const addedCids = rows.filter((row) => !previousRemovedAt.has(row.cid)).map((row) => row.cid);
	const restoredCids = rows
		.filter((row) => previousRemovedAt.get(row.cid) != null)
		.map((row) => row.cid);
	const restoredCidSet = new Set(restoredCids);

	for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
		const statements = rows.slice(i, i + CHUNK_SIZE).map((row) =>
			db
				.insert(rosterMembersTable)
				.values(row)
				.onConflictDoUpdate({
					target: rosterMembersTable.cid,
					set: {
						firstName: row.firstName,
						lastName: row.lastName,
						rating: row.rating,
						ratingShort: row.ratingShort,
						membership: row.membership,
						facility: row.facility,
						isHomeController: row.isHomeController,
						isMentor: row.isMentor,
						isSupIns: row.isSupIns,
						discordId: row.discordId,
						facilityJoinedAt: row.facilityJoinedAt,
						lastActivityAt: row.lastActivityAt,
						data: row.data,
						syncedAt: row.syncedAt,
						removedAt: null,
						// Someone coming back gets looked at again: they may have earned a
						// rating elsewhere, or gone long enough without controlling that the
						// answer has changed. Everyone else keeps their stamp, which is why
						// it is absent from this clause for them — a roster refresh must not
						// queue the whole facility for re-checking.
						...(restoredCidSet.has(row.cid) ? { certificationsCheckedAt: null } : {})
					}
				})
		);

		if (statements.length === 0) continue;
		await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
	}

	// Anyone still carrying an older syncedAt was absent from this run. Using the
	// timestamp as the tombstone marker avoids listing every current CID in a
	// NOT IN clause, which would exceed D1's 100-parameter limit.
	const removedRows = await db
		.update(rosterMembersTable)
		.set({ removedAt: now })
		.where(and(lt(rosterMembersTable.syncedAt, now), isNull(rosterMembersTable.removedAt)))
		.returning({ cid: rosterMembersTable.cid });

	return {
		fetched: members.length,
		added: addedCids.length,
		restored: restoredCids.length,
		removed: removedRows.length,
		addedCids,
		restoredCids,
		removedCids: removedRows.map((row) => row.cid)
	};
}
