/**
 * The contract of the `TrainingRpc` entrypoint (`src/worker.ts`): what another
 * Worker bound to this one gets back. Types only.
 *
 * This is a published contract (community-website decision 0003). Adding a
 * field or a method is made here in place; anything that would break a caller
 * (renaming, removing or retyping a field) goes into a new entrypoint class,
 * `TrainingRpcV2`, beside the old one, so no caller breaks mid-deploy.
 */

/** One credential this ARTCC issues, as the training app defines it. */
export type AvailableCredential = {
	/** Short code, e.g. `T-RC`. What `certification` and `endorsements` hold. */
	code: string;
	kind: 'certification' | 'endorsement';
	/** Human name without the code, e.g. "Terminal Radar Control". */
	name: string;
	/**
	 * Position in the ladder, from 1: certifications lowest to highest, then
	 * endorsements. Sort by this, not by code.
	 */
	order: number;
	/** One line of orientation. */
	description: string;
};

/** A member of the ZID controller roster now, with what they hold now. */
export type RosterMember = {
	/** VATSIM CID. */
	cid: string;
	firstName: string;
	/**
	 * Present even when `namePrivacy` is set, so a caller can match it against
	 * a name it holds. **Never show it publicly when `namePrivacy` is set.**
	 */
	lastName: string;
	/**
	 * VATUSA's name-privacy flag. When set, show the first name with the CID
	 * (or the first name alone), never the last name.
	 */
	namePrivacy: boolean;
	/** ATC rating's short code, e.g. `S3`, `C1`. */
	rating: string;
	/** When they joined ZID, as VATUSA gives it; null if VATUSA does not say. */
	facilityJoinedAt: string | null;
	/**
	 * VATUSA facility role codes held at ZID, e.g. `ATM`, `TA`, `EC`, `INS`,
	 * `MTR`. Empty for most members.
	 */
	roles: string[];
	/** Code of the highest certification held, or null for none. */
	certification: string | null;
	/** Codes of the endorsements held, in `order`. */
	endorsements: string[];
};

export type Roster = {
	/** Every available credential, in `order`. */
	credentials: AvailableCredential[];
	/** Everyone on the controller roster now; removed members are left out. */
	members: RosterMember[];
};

/** What a caller's `TrainingRpc` binding can call. */
export interface TrainingRpcMethods {
	/** The whole controller roster and the available credentials, in one call. Read-only. */
	getRoster(): Promise<Roster>;
}
