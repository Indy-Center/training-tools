import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import {
	certificationsTable,
	type Certification,
	type GrantBasis
} from '$lib/db/schema/certifications';
import { findCredential, highestCertification, type CredentialCode } from '$lib/certifications';

export { grantArrivalCertifications, type ArrivalGrantResult } from './arrival';

/**
 * Every grant and revocation in the app goes through these two functions —
 * the arrival job, the staff edit view and the import all call them rather than
 * writing rows themselves.
 *
 * That is deliberate. When the Discord notification work lands (blocked on
 * DEV-113's shared notification service), it needs one producer site to hook,
 * not three call sites to go and find.
 */

export type GrantInput = {
	cid: string;
	code: string;
	basis: GrantBasis;
	/** CID of the staff member responsible, or null when automatic. */
	grantedBy?: string | null;
	note?: string | null;
	needsReview?: boolean;
};

export type RevokeInput = {
	cid: string;
	/** Must come from the catalogue — `findCredential(...)?.code`, not raw input. */
	code: CredentialCode;
	revokedBy?: string | null;
	reason: string;
};

/** Live credentials held by one controller, newest grant first. */
export async function getHeldCredentials(db: Database, cid: string): Promise<Certification[]> {
	return db
		.select()
		.from(certificationsTable)
		.where(and(eq(certificationsTable.cid, cid), isNull(certificationsTable.revokedAt)));
}

/**
 * Every live credential, grouped by CID.
 *
 * For rendering a list of controllers. Reads the whole (small) table and groups
 * in memory rather than filtering by the CIDs on screen — same reasoning as the
 * roster sync: an `IN (...)` over a page of results creeps towards **D1's
 * 100-bound-parameter limit**, and this binds none.
 */
export async function getLiveCredentialsByCid(db: Database): Promise<Map<string, string[]>> {
	const rows = await db
		.select({ cid: certificationsTable.cid, code: certificationsTable.code })
		.from(certificationsTable)
		.where(isNull(certificationsTable.revokedAt));

	const byCid = new Map<string, string[]>();
	for (const row of rows) {
		const codes = byCid.get(row.cid);
		if (codes) codes.push(row.code);
		else byCid.set(row.cid, [row.code]);
	}

	return byCid;
}

/** Everything ever granted to one controller, revoked rows included. */
export async function getCredentialHistory(db: Database, cid: string): Promise<Certification[]> {
	return db.select().from(certificationsTable).where(eq(certificationsTable.cid, cid));
}

/**
 * Grant a credential.
 *
 * `onConflictDoNothing` covers the partial unique index on
 * `(cid, code) WHERE revoked_at IS NULL`. Callers check what is held first, so a
 * conflict here means two writers raced — and doing nothing is the right answer,
 * because the credential they were trying to grant is already held.
 */
export async function grantCredential(db: Database, input: GrantInput): Promise<void> {
	const credential = findCredential(input.code);
	if (!credential) throw new Error(`Unknown credential ${input.code}`);

	const now = new Date();

	await db
		.insert(certificationsTable)
		.values({
			id: crypto.randomUUID(),
			cid: input.cid,
			code: credential.code,
			// Taken from the catalogue, never from the caller: the config decides
			// what is a certification and what is an endorsement.
			kind: credential.kind,
			grantedAt: now,
			grantedBy: input.grantedBy ?? null,
			grantBasis: input.basis,
			grantNote: input.note ?? null,
			needsReview: input.needsReview ?? false,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoNothing();
}

/** Revoke a live credential. Does nothing if it is not currently held. */
export async function revokeCredential(db: Database, input: RevokeInput): Promise<void> {
	const now = new Date();

	await db
		.update(certificationsTable)
		.set({
			revokedAt: now,
			revokedBy: input.revokedBy ?? null,
			revokedReason: input.reason,
			updatedAt: now,
			// A revoked row is history; it no longer needs anyone's attention.
			needsReview: false
		})
		.where(
			and(
				eq(certificationsTable.cid, input.cid),
				eq(certificationsTable.code, input.code),
				isNull(certificationsTable.revokedAt)
			)
		);
}

/**
 * Move a controller to a given certification, or to none.
 *
 * The top-down model means one certification at a time, so this revokes
 * whatever is held before granting. Endorsements are untouched — they sit
 * alongside a certification rather than being superseded by it, which is why
 * S-LC survives a change of ground certification.
 */
export async function setCertification(
	db: Database,
	cid: string,
	code: string | null,
	actorCid: string
): Promise<void> {
	const held = await getHeldCredentials(db, cid);
	const current = highestCertification(held.map((row) => row.code));

	if (current?.code === code) return;

	if (current) {
		await revokeCredential(db, {
			cid,
			code: current.code,
			revokedBy: actorCid,
			reason: code ? `Replaced by ${code}` : 'Removed by training staff'
		});
	}

	if (!code) return;

	const credential = findCredential(code);
	if (credential?.kind !== 'certification') {
		throw new Error(`${code} is not a certification`);
	}

	await grantCredential(db, { cid, code, basis: 'manual', grantedBy: actorCid });
}

/** Add or remove an endorsement, leaving the certification alone. */
export async function toggleEndorsement(
	db: Database,
	cid: string,
	code: string,
	actorCid: string
): Promise<'granted' | 'revoked'> {
	const credential = findCredential(code);
	if (credential?.kind !== 'endorsement') {
		throw new Error(`${code} is not an endorsement`);
	}

	const held = await getHeldCredentials(db, cid);

	if (held.some((row) => row.code === credential.code)) {
		await revokeCredential(db, {
			cid,
			code: credential.code,
			revokedBy: actorCid,
			reason: 'Removed by training staff'
		});
		return 'revoked';
	}

	await grantCredential(db, { cid, code: credential.code, basis: 'manual', grantedBy: actorCid });
	return 'granted';
}
