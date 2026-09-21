/**
 * VATSIM API v2 shapes.
 *
 * Verified live against a real ZID CID on 2026-09-21. Public, **no API key** —
 * like the VATUSA roster, and for the same reason the roster sync needs no
 * secrets. See .ai/research/vatsim-api.md
 */

/** One network connection. `type` 1 is a pilot session, 2 is ATC. */
export type VatsimConnection = {
	id: number;
	vatsim_id: string;
	type: number;
	rating: number;
	callsign: string;
	/** ISO 8601, e.g. "2026-07-21T01:20:35Z". */
	start: string;
	/** Null while the session is still open. */
	end: string | null;
	server: string;
	[key: string]: unknown;
};

/** An entry in `/v2/members/{cid}/atc`, with the connection nested. */
export type VatsimAtcSession = {
	connection_id: VatsimConnection;
	aircrafttracked: number;
	handoffsinitiated: number;
	[key: string]: unknown;
};

/**
 * `/v2/members/{cid}/atc` — newest first, 100 per page by default.
 *
 * `limit` narrows the page (`?limit=1` returns 450 bytes rather than 42 KB).
 * `per_page` and `page_size` are silently ignored.
 */
export type VatsimAtcResponse = {
	items: VatsimAtcSession[];
	count: number;
};

/**
 * `/v2/members/{cid}/stats` — cumulative hours.
 *
 * `atc` and `pilot` are totals; the rest are per-rating breakdowns, which is
 * what makes a supervisor's earned controller rating recoverable.
 */
export type VatsimMemberStats = {
	id: number;
	atc: number;
	pilot: number;
	s1: number;
	s2: number;
	s3: number;
	c1: number;
	c2: number;
	c3: number;
	i1: number;
	i2: number;
	i3: number;
	sup: number;
	adm: number;
	[key: string]: unknown;
};
