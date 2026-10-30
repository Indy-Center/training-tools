import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { syncStateTable } from '$lib/db/schema/sync-state';
import { fetchRoster } from '$lib/server/vatusa';
import {
	rosterMembersTable,
	type InsertRosterMember,
	type RosterMembership
} from '$lib/db/schema/roster';
import type { VatusaRosterMember } from '$lib/types/vatusa';
import { activityInsert, runInBatches } from '$lib/server/activity';
import { overLimitError } from '$lib/server/change-limit';

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

/**
 * Only a run of digits is a Discord id. `parseRosterBody` hands us a string,
 * so a placeholder zero arrives as "0" — truthy, and not an id.
 */
function toDiscordId(value: unknown): string | null {
	const id = value == null ? '' : String(value);
	return /^[1-9]\d*$/.test(id) ? id : null;
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
		discordId: toDiscordId(member.discord_id),
		facilityJoinedAt: member.facility_join ?? null,
		lastActivityAt: member.lastactivity ?? null,
		data: member,
		syncedAt: now,
		// Present in this sync, so explicitly not removed. This is what brings
		// back someone who left the roster and returned.
		removedAt: null
	};
}

/**
 * VATUSA's `facility_join`, as a date, for dating a new arrival's "joined"
 * entry — on a first population that is when they really joined, not when this
 * app first looked. Null when it is missing or does not parse.
 */
export function parseFacilityJoin(value: string | null | undefined): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** D1 caps how much one batch can carry, so upserts go in chunks. */
const CHUNK_SIZE = 25;

/** The fewest members the removal limit ever allows. */
const REMOVAL_LIMIT_MIN = 5;

/** The share of the active mirror one run may remove, when that is more. */
const REMOVAL_LIMIT_SHARE = 0.05;

/**
 * The most members one run may remove: `REMOVAL_LIMIT_MIN`, or
 * `REMOVAL_LIMIT_SHARE` of the active mirror, whichever is larger. VATUSA can
 * answer with a short roster without warning (on 2026-10-26 it returned 89 of
 * 164), and nothing in its answer says so.
 */
function removalLimit(active: number): number {
	return Math.max(REMOVAL_LIMIT_MIN, Math.floor(active * REMOVAL_LIMIT_SHARE));
}

/** How long a removal over the limit waits before it applies anyway. */
const REMOVAL_HOLD_MS = 24 * 60 * 60 * 1000;

/**
 * `sync_state` key: removals held back for being over the limit. `cursorAt` is
 * when the hold started, `value` the CIDs it holds, as a JSON array. The CIDs
 * are a record for whoever looks; each run works out who is held afresh, from
 * who is missing.
 */
const REMOVAL_HOLD_KEY = 'roster-removal-hold';

/** When the current removal hold started, or null when there is none. */
async function readRemovalHoldStart(db: Database): Promise<Date | null> {
	const row = await db.query.syncStateTable.findFirst({
		where: eq(syncStateTable.key, REMOVAL_HOLD_KEY)
	});
	return row?.cursorAt ?? null;
}

async function writeRemovalHold(db: Database, startedAt: Date, cids: string[]): Promise<void> {
	const value = JSON.stringify(cids);
	await db
		.insert(syncStateTable)
		.values({ key: REMOVAL_HOLD_KEY, cursorAt: startedAt, value })
		.onConflictDoUpdate({ target: syncStateTable.key, set: { value } });
}

async function clearRemovalHold(db: Database): Promise<void> {
	await db.delete(syncStateTable).where(eq(syncStateTable.key, REMOVAL_HOLD_KEY));
}

/** `2026-10-27 03:30 UTC` */
function formatUtc(date: Date): string {
	return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

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
 *
 * Also refuses to remove more than `removalLimit` members in one run, since a
 * short answer looks like a valid one. Everyone present is still upserted,
 * added and restored; only the removals wait, in a hold kept in `sync_state`,
 * and the run throws so the job shows as failing. The hold applies to whoever
 * is still missing 24 hours after it started, or as soon as it shrinks to the
 * limit, so a real mass departure lands a day late rather than never.
 */
export async function syncRoster(db: Database, now = new Date()): Promise<RosterSyncResult> {
	const members = await fetchRoster();

	if (members.length === 0) {
		throw new Error('VATUSA roster returned zero members; refusing to sync');
	}

	const rows = members.map((member) => toRosterRow(member, now));

	// Classify before writing, so the counts describe what actually changed.
	// Read the whole table rather than filtering by CID: D1 allows only 100
	// bound parameters per query and the facility has more members than that,
	// while the table itself is small enough to scan cheaply.
	const existing = await db
		.select({
			cid: rosterMembersTable.cid,
			removedAt: rosterMembersTable.removedAt,
			membership: rosterMembersTable.membership
		})
		.from(rosterMembersTable);

	// Active home members: the ones who leave the home roster by turning up as
	// a visitor, or by disappearing (stamped below, with `removedAt`).
	const activeHome = new Set(
		existing.filter((row) => row.removedAt === null && row.membership === 'home').map((r) => r.cid)
	);
	const previousRemovedAt = new Map(existing.map((row) => [row.cid, row.removedAt]));
	const addedCids = rows.filter((row) => !previousRemovedAt.has(row.cid)).map((row) => row.cid);
	const restoredCids = rows
		.filter((row) => previousRemovedAt.get(row.cid) != null)
		.map((row) => row.cid);
	const restoredCidSet = new Set(restoredCids);

	const present = new Set(rows.map((row) => row.cid));
	const activeCids = existing.filter((row) => row.removedAt === null).map((row) => row.cid);
	const missingCids = activeCids.filter((cid) => !present.has(cid));
	const limit = removalLimit(activeCids.length);
	const previousHoldStart = await readRemovalHoldStart(db);
	const holdStartedAt = previousHoldStart ?? now;
	// The hold is whoever is missing now: returners leave it, newly missing
	// join it. It applies once it has run for 24 hours, or shrinks to the limit.
	const overLimit = missingCids.length > limit;
	const holdExpired = now.getTime() - holdStartedAt.getTime() >= REMOVAL_HOLD_MS;
	const holdUntil =
		overLimit && !holdExpired ? new Date(holdStartedAt.getTime() + REMOVAL_HOLD_MS) : null;

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
						// Always overwritten, null included, so a changed or unlinked Discord
						// account is reflected on the next run. `email` is absent on purpose:
						// VATUSA never sends it to us, and identity owns our copy.
						discordId: row.discordId,
						facilityJoinedAt: row.facilityJoinedAt,
						lastActivityAt: row.lastActivityAt,
						data: row.data,
						syncedAt: row.syncedAt,
						removedAt: null,
						// Home again clears it; home to visitor dates it. Anything else
						// (a visitor still, a returner who is only a visitor) keeps it.
						...(row.membership === 'home'
							? { leftHomeAt: null }
							: activeHome.has(row.cid)
								? { leftHomeAt: now }
								: {}),
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

	// The hold changes before anything else, so a failure later in the run
	// leaves it safe: a hold that failed to clear stays and is cleared next
	// run, and removals that failed after it cleared are held again then.
	if (holdUntil) await writeRemovalHold(db, holdStartedAt, missingCids);
	else if (previousHoldStart) await clearRemovalHold(db);

	// Anyone still carrying an older syncedAt was absent from this run. Using the
	// timestamp as the tombstone marker avoids listing every current CID in a
	// NOT IN clause, which would exceed D1's 100-parameter limit.
	const removedRows = holdUntil
		? []
		: await db
				.update(rosterMembersTable)
				.set({
					removedAt: now,
					// Same write as `removedAt`, so a held removal stamps neither. A home
					// member gets the date they left; a visitor keeps whatever they had
					// (their date from stopping being home, or none).
					leftHomeAt: sql`CASE WHEN ${rosterMembersTable.membership} = 'home'
						THEN coalesce(${rosterMembersTable.leftHomeAt}, ${Math.floor(now.getTime() / 1000)})
						ELSE ${rosterMembersTable.leftHomeAt} END`
				})
				.where(and(lt(rosterMembersTable.syncedAt, now), isNull(rosterMembersTable.removedAt)))
				.returning({ cid: rosterMembersTable.cid });

	const removedCids = removedRows.map((row) => row.cid);

	// Every controller's timeline. Written after the mirror so a failure here
	// never stops the roster refreshing; a missed entry is a gap in a log, not
	// a wrong roster.
	const joinedAt = new Map(rows.map((row) => [row.cid, row.facilityJoinedAt]));
	await runInBatches(db, [
		...addedCids.map((cid) =>
			activityInsert(db, {
				cid,
				event: 'roster.joined',
				at: parseFacilityJoin(joinedAt.get(cid)) ?? now
			})
		),
		...restoredCids.map((cid) => activityInsert(db, { cid, event: 'roster.returned', at: now })),
		...removedCids.map((cid) => activityInsert(db, { cid, event: 'roster.left', at: now }))
	]);

	if (holdUntil) {
		throw overLimitError({
			would: 'VATUSA roster would remove',
			count: missingCids.length,
			of: activeCids.length,
			noun: 'members',
			limit,
			keeping: 'the mirror',
			then: `Applies to whoever is still missing at ${formatUtc(holdUntil)}.`
		});
	}

	return {
		fetched: members.length,
		added: addedCids.length,
		restored: restoredCids.length,
		removed: removedRows.length,
		addedCids,
		restoredCids,
		removedCids
	};
}
