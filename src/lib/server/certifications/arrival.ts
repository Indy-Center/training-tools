import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { certificationsTable } from '$lib/db/schema/certifications';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { needsVatsimLookup, resolveArrivalGrant } from '$lib/certification-grant';
import { fetchAtcHoursByRating, fetchLastAtcSessionEnd } from '$lib/server/vatsim';
import { grantCredential } from './index';

export type ArrivalGrantResult = {
	/** Members with no certification decision recorded yet. */
	pending: number;
	/** How many we got through this run. */
	examined: number;
	granted: number;
	kept: number;
	none: number;
	/** VATSIM lookups made, which is what the batch cap protects. */
	lookups: number;
	/** Members whose VATSIM lookup failed; left unstamped for the next run. */
	deferred: number;
};

/**
 * How many VATSIM lookups one run may make.
 *
 * A Worker invocation has a subrequest budget, and the first pass after this
 * ships faces every roster member at once rather than the usual zero. Anyone
 * left over is picked up on the next 15-minute tick, so the cap costs time and
 * nothing else.
 *
 * Members decidable without a lookup — already certified, or a rating that
 * carries no certification — do not count against it.
 */
const MAX_LOOKUPS_PER_RUN = 20;

/** D1 caps how much one batch can carry, so writes go in chunks. */
const CHUNK_SIZE = 25;

/**
 * Work out and grant what each new arrival is entitled to under GCAP.
 *
 * Driven by `roster_members.certificationsCheckedAt` rather than by the CID
 * lists the sync returns, which matters for three reasons: the first run has a
 * backlog no single sync produced, a failed lookup has to be retried later, and
 * selecting on a null column avoids putting 157 CIDs in an `IN (...)` clause —
 * D1 allows only 100 bound parameters, which is how the roster sync first broke.
 *
 * Restored members are re-examined because the sync clears their stamp; they may
 * have earned a rating elsewhere, or gone long enough without controlling that
 * the answer has changed.
 *
 * See .ai/decisions/0010-certifications-model.md and DEV-115.
 */
export async function grantArrivalCertifications(db: Database): Promise<ArrivalGrantResult> {
	const candidates = await db
		.select({
			cid: rosterMembersTable.cid,
			ratingShort: rosterMembersTable.ratingShort
		})
		.from(rosterMembersTable)
		.where(
			and(isNull(rosterMembersTable.removedAt), isNull(rosterMembersTable.certificationsCheckedAt))
		);

	const result: ArrivalGrantResult = {
		pending: candidates.length,
		examined: 0,
		granted: 0,
		kept: 0,
		none: 0,
		lookups: 0,
		deferred: 0
	};

	if (candidates.length === 0) return result;

	// Read every live credential and group in memory rather than filtering by the
	// candidate CIDs — same reason as above, and the table is small enough that
	// scanning it is cheaper than being clever.
	const live = await db
		.select({ cid: certificationsTable.cid, code: certificationsTable.code })
		.from(certificationsTable)
		.where(isNull(certificationsTable.revokedAt));

	const heldByCid = new Map<string, string[]>();
	for (const row of live) {
		const codes = heldByCid.get(row.cid);
		if (codes) codes.push(row.code);
		else heldByCid.set(row.cid, [row.code]);
	}

	const now = new Date();
	const checked: string[] = [];
	const grants: { cid: string; code: string; note: string; needsReview: boolean }[] = [];

	for (const candidate of candidates) {
		const held = heldByCid.get(candidate.cid) ?? [];
		const lookupNeeded = needsVatsimLookup(candidate.ratingShort, held);

		// Stop taking on new lookups once the budget is spent, but keep going for
		// members who need none — they are free.
		if (lookupNeeded && result.lookups >= MAX_LOOKUPS_PER_RUN) continue;

		let lastAtcSessionEnd: Date | null = null;
		let atcHoursByRating = null;

		if (lookupNeeded) {
			result.lookups += 1;
			const lastSession = await fetchLastAtcSessionEnd(candidate.cid);

			// undefined means the lookup failed, which is not the same as "never
			// controlled". Leave the stamp unset so the next run tries again rather
			// than recording a decision made on missing data.
			if (lastSession === undefined) {
				result.deferred += 1;
				continue;
			}

			lastAtcSessionEnd = lastSession;

			if (candidate.ratingShort === 'SUP' || candidate.ratingShort === 'ADM') {
				result.lookups += 1;
				atcHoursByRating = await fetchAtcHoursByRating(candidate.cid);
			}
		}

		const decision = resolveArrivalGrant(
			{ ratingShort: candidate.ratingShort, lastAtcSessionEnd, atcHoursByRating, held },
			now
		);

		result.examined += 1;
		checked.push(candidate.cid);

		if (decision.action === 'grant') {
			result.granted += 1;
			grants.push({
				cid: candidate.cid,
				code: decision.code,
				note: decision.note,
				needsReview: decision.needsReview
			});
		} else if (decision.action === 'keep') {
			result.kept += 1;
		} else {
			result.none += 1;
		}
	}

	// Grants first: a crash between the two must not leave someone stamped as
	// checked with nothing granted, which would silently deny them a
	// certification until a human noticed.
	for (const grant of grants) {
		await grantCredential(db, {
			cid: grant.cid,
			code: grant.code,
			basis: 'auto-arrival',
			grantedBy: null,
			note: grant.note,
			needsReview: grant.needsReview
		});
	}

	for (let i = 0; i < checked.length; i += CHUNK_SIZE) {
		const statements = checked
			.slice(i, i + CHUNK_SIZE)
			.map((cid) =>
				db
					.update(rosterMembersTable)
					.set({ certificationsCheckedAt: now })
					.where(eq(rosterMembersTable.cid, cid))
			);

		if (statements.length === 0) continue;
		await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
	}

	return result;
}
