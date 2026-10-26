import { isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { certificationsTable } from '$lib/db/schema/certifications';
import { CERTIFICATIONS, CREDENTIALS, ENDORSEMENTS } from '$lib/certifications';
import { FACILITY_ID } from '$lib/config';
import type { AvailableCredential, Roster, RosterMember } from '$lib/rpc/training-rpc';

/** The roster mirror's columns the answer is built from. */
export type MemberRow = {
	cid: string;
	firstName: string;
	lastName: string;
	ratingShort: string;
	facilityJoinedAt: string | null;
	removedAt: Date | null;
	/** VATUSA's record; only the name-privacy flag and the roles are read. */
	data: {
		flag_nameprivacy?: boolean | null;
		roles?: readonly { facility?: string; role?: string }[] | null;
	};
};

export type HeldRow = { cid: string; code: string; revokedAt: Date | null };

/**
 * What `TrainingRpc.getRoster()` answers: the controller roster now and the
 * available credentials. See `$lib/rpc/training-rpc.ts` for the contract.
 *
 * Two queries whatever the roster's size — the active roster and every live
 * credential — grouped in memory, never an `IN (...)` over CIDs (D1 allows 100
 * bound parameters; the facility has more members than that).
 */
export async function readRoster(db: Database): Promise<Roster> {
	const [members, held] = await Promise.all([
		db
			.select({
				cid: rosterMembersTable.cid,
				firstName: rosterMembersTable.firstName,
				lastName: rosterMembersTable.lastName,
				ratingShort: rosterMembersTable.ratingShort,
				facilityJoinedAt: rosterMembersTable.facilityJoinedAt,
				removedAt: rosterMembersTable.removedAt,
				data: rosterMembersTable.data
			})
			.from(rosterMembersTable)
			.where(isNull(rosterMembersTable.removedAt))
			.orderBy(rosterMembersTable.cid),
		db
			.select({
				cid: certificationsTable.cid,
				code: certificationsTable.code,
				revokedAt: certificationsTable.revokedAt
			})
			.from(certificationsTable)
			.where(isNull(certificationsTable.revokedAt))
	]);

	return buildRoster(members, held);
}

/**
 * The answer from plain rows. Removed members and revoked credentials are left
 * out here as well as in the queries, so this alone decides what is "now".
 */
export function buildRoster(members: readonly MemberRow[], held: readonly HeldRow[]): Roster {
	const codesByCid = new Map<string, Set<string>>();
	for (const row of held) {
		if (row.revokedAt) continue;
		const codes = codesByCid.get(row.cid) ?? new Set<string>();
		codes.add(row.code);
		codesByCid.set(row.cid, codes);
	}

	return {
		credentials: availableCredentials(),
		members: members
			.filter((row) => !row.removedAt)
			.map((row) => toMember(row, codesByCid.get(row.cid)))
	};
}

/** Certifications lowest to highest, then endorsements; never `requires`. */
function availableCredentials(): AvailableCredential[] {
	const ladder = [...[...CERTIFICATIONS].sort((a, b) => a.rank - b.rank), ...ENDORSEMENTS] as const;
	return ladder.map((credential, index) => ({
		code: credential.code,
		kind: credential.kind,
		name: credential.name,
		order: index + 1,
		description: credential.description
	}));
}

function toMember(row: MemberRow, codes: Set<string> | undefined): RosterMember {
	const heldNow = CREDENTIALS.filter((credential) => codes?.has(credential.code));
	const certification = heldNow
		.filter((credential) => credential.kind === 'certification')
		.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))[0];

	return {
		cid: row.cid,
		firstName: row.firstName,
		lastName: row.lastName,
		namePrivacy: row.data.flag_nameprivacy === true,
		rating: row.ratingShort,
		facilityJoinedAt: row.facilityJoinedAt,
		roles: [
			...new Set(
				(row.data.roles ?? [])
					.filter((entry) => entry.facility === FACILITY_ID && entry.role)
					.map((entry) => entry.role as string)
			)
		],
		certification: certification?.code ?? null,
		endorsements: heldNow
			.filter((credential) => credential.kind === 'endorsement')
			.map((credential) => credential.code)
	};
}
