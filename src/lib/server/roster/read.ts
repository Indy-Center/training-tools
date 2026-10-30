import { isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { certificationsTable } from '$lib/db/schema/certifications';
import {
	CERTIFICATIONS,
	CREDENTIALS,
	ENDORSEMENTS,
	highestCertification
} from '$lib/certifications';
import { FACILITY_ID } from '$lib/config';
import type { AvailableCredential, Roster, RosterMember } from '$rpc';

/** An active member's columns from the roster mirror. */
export type MemberRow = {
	cid: string;
	firstName: string;
	lastName: string;
	ratingShort: string;
	facilityJoinedAt: string | null;
	/** VATUSA's record; only the name-privacy flag and the roles are read. */
	data: {
		flag_nameprivacy?: boolean | null;
		roles?: readonly { facility?: string; role?: string }[] | null;
	};
};

/** A credential someone holds now. */
export type HeldRow = { cid: string; code: string };

/**
 * What `TrainingRpc.getRoster()` answers: the controller roster now and the
 * available credentials. See `rpc/src/index.ts` for the contract.
 *
 * Two queries whatever the roster's size — the active roster and every live
 * credential — grouped in memory, never an `IN (...)` over CIDs (D1 allows 100
 * bound parameters; the facility has more members than that). The queries alone
 * leave out removed members and revoked credentials.
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
				data: rosterMembersTable.data
			})
			.from(rosterMembersTable)
			.where(isNull(rosterMembersTable.removedAt))
			.orderBy(rosterMembersTable.cid),
		db
			.select({ cid: certificationsTable.cid, code: certificationsTable.code })
			.from(certificationsTable)
			.where(isNull(certificationsTable.revokedAt))
	]);

	return buildRoster(members, held);
}

/** The answer from active members and the credentials held now. */
export function buildRoster(members: readonly MemberRow[], held: readonly HeldRow[]): Roster {
	const codesByCid = new Map<string, Set<string>>();
	for (const row of held) {
		const codes = codesByCid.get(row.cid) ?? new Set<string>();
		codes.add(row.code);
		codesByCid.set(row.cid, codes);
	}

	return {
		credentials: availableCredentials(),
		members: members.map((row) => toMember(row, codesByCid.get(row.cid) ?? new Set()))
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

function toMember(row: MemberRow, codes: ReadonlySet<string>): RosterMember {
	return {
		cid: row.cid,
		firstName: row.firstName,
		lastName: row.lastName,
		namePrivacy: row.data.flag_nameprivacy === true,
		rating: row.ratingShort,
		facilityJoinedAt: row.facilityJoinedAt,
		roles: [
			...new Set(
				(row.data.roles ?? []).flatMap((entry) =>
					entry.facility === FACILITY_ID && entry.role ? [entry.role] : []
				)
			)
		],
		certification: highestCertification([...codes])?.code ?? null,
		endorsements: CREDENTIALS.filter(
			(credential) => credential.kind === 'endorsement' && codes.has(credential.code)
		).map((credential) => credential.code)
	};
}
