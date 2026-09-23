/**
 * Shapes returned by the VATUSA API.
 *
 * Only the roster endpoint is used today, and it needs no API key. The
 * transfer/visit eligibility checklist does need one, and lands with DEV-106.
 */

export type VatusaRosterResponse = {
	data: VatusaRosterMember[];
};

export type VatusaRole = {
	id: number;
	cid: number;
	facility: string;
	role: string;
	created_at: string;
};

/**
 * A single roster entry. Verified against the live ZID roster on 2026-09-20:
 * 157 members, `membership` is always "home" or "visit", and `rating_short`
 * ranges over OBS, S1, S2, S3, C1, C3, I1, I3, SUP — note that **rostered OBS
 * controllers exist**, so roster membership must be checked before rating.
 */
export type VatusaRosterMember = {
	cid: number;
	fname: string;
	lname: string;
	/** Always null on the public roster endpoint; our copy comes from identity at sign-in. */
	email: string | null;
	facility: string;
	rating: number;
	rating_short: string;
	membership: string;
	created_at: string;
	updated_at: string;
	facility_join: string;
	lastactivity: string;
	flag_homecontroller: boolean;
	flag_needbasic: boolean;
	flag_xferOverride: boolean;
	flag_nameprivacy: boolean;
	/** A string once parsed — see `parseRosterBody`; on the wire it is a lossy number. */
	discord_id: string | null;
	last_promotion: string | null;
	last_competency_date: string | null;
	promotion_eligible: boolean;
	transfer_eligible: string | null;
	isMentor: boolean;
	isSupIns: boolean;
	roles: VatusaRole[];
	[key: string]: unknown;
};
