import type { AtcHoursByRating } from '$lib/certification-grant';
import type { AtcSession } from '$lib/consolidation';
import type { VatsimAtcResponse, VatsimMemberStats } from '$lib/types/vatsim';

const VATSIM_API_BASE_URL = 'https://api.vatsim.net/v2';

/** A timed-out lookup returns null, the same as any other failure. */
const STATS_TIMEOUT_MS = 5000;

/**
 * Page size for a member's whole ATC history. One page covers a student's
 * history; a second request only happens for a controller with more sessions.
 */
const ATC_HISTORY_PAGE_SIZE = 1000;
/** Bounds the subrequests one page render can spend on a single history. */
const ATC_HISTORY_MAX_PAGES = 5;

/**
 * VATSIM's public member API.
 *
 * **No API key**, same as the VATUSA roster. Neither identity nor the VATUSA
 * roster payload carries controlling history — `roster_members.lastActivityAt`
 * is VATUSA's "last seen in our system", which is not the same as having
 * controlled — so this is the only source for DEV-115's six-month currency test.
 *
 * Both functions return null rather than throwing on a bad response. A
 * controller's certification grant is not worth failing the whole cron over,
 * and the caller treats "we could not find out" as "leave them for next time"
 * rather than as "they have never controlled". See
 * research/vatsim-api.md
 */

/**
 * When this member last finished an ATC session, anywhere on the network.
 *
 * Returns null when they have never controlled, and undefined when the lookup
 * itself failed — the caller must keep those apart, because the first is a
 * real answer and the second is not.
 */
export async function fetchLastAtcSessionEnd(cid: string): Promise<Date | null | undefined> {
	// `limit=1` is the difference between 450 bytes and 42 KB. Results come back
	// newest first, so one item is all we need. `per_page` and `page_size` are
	// ignored by this endpoint — verified 2026-09-21.
	const url = `${VATSIM_API_BASE_URL}/members/${cid}/atc?limit=1`;

	try {
		const response = await fetch(url);
		if (!response.ok) return undefined;

		const body = (await response.json()) as VatsimAtcResponse;
		const latest = body?.items?.[0]?.connection_id;

		// A member with no ATC history at all — a real answer, not a failure.
		if (!latest) return null;

		// `end` is null while a session is still open, which counts as current.
		const ended = latest.end ? new Date(latest.end) : new Date();
		return Number.isNaN(ended.getTime()) ? undefined : ended;
	} catch {
		return undefined;
	}
}

/**
 * Cumulative ATC hours per rating tier.
 *
 * The arrival job fetches it for SUP and ADM, where the visible rating does not
 * say what the member earned as a controller.
 */
export async function fetchAtcHoursByRating(cid: string): Promise<AtcHoursByRating | null> {
	const url = `${VATSIM_API_BASE_URL}/members/${cid}/stats`;

	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(STATS_TIMEOUT_MS) });
		if (!response.ok) return null;

		const body = (await response.json()) as VatsimMemberStats;
		if (!body || typeof body !== 'object') return null;

		// Hand back only the numeric entries, so a string or null upstream cannot
		// reach the comparison in inferEarnedRating().
		return Object.fromEntries(
			Object.entries(body).filter(([, value]) => typeof value === 'number')
		) as AtcHoursByRating;
	} catch {
		return null;
	}
}

/**
 * Every ATC session this member has worked, anywhere on the network.
 *
 * The home page fetches it for the consolidation check, because the stats
 * endpoint breaks hours down by rating and not by position. That is why each
 * request has a timeout: a slow VATSIM must not hang a page render.
 *
 * Returns null unless the whole history arrived. Part of one would undercount
 * the hours, and that must read as "we could not find out" rather than as "not
 * consolidated".
 */
export async function fetchAtcSessions(cid: string): Promise<AtcSession[] | null> {
	const sessions: AtcSession[] = [];

	try {
		for (let page = 0; page < ATC_HISTORY_MAX_PAGES; page++) {
			// The endpoint has no filter for callsign or date, so the history is
			// fetched whole and filtered by the caller.
			const url = `${VATSIM_API_BASE_URL}/members/${cid}/atc?limit=${ATC_HISTORY_PAGE_SIZE}&offset=${sessions.length}`;
			const response = await fetch(url, { signal: AbortSignal.timeout(STATS_TIMEOUT_MS) });
			if (!response.ok) return null;

			const body = (await response.json()) as VatsimAtcResponse;
			if (!Array.isArray(body?.items) || typeof body.count !== 'number') return null;

			for (const item of body.items) {
				const connection = item?.connection_id;
				if (typeof connection?.callsign !== 'string' || typeof connection.start !== 'string') {
					return null;
				}
				sessions.push({
					callsign: connection.callsign,
					start: connection.start,
					end: typeof connection.end === 'string' ? connection.end : null
				});
			}

			if (sessions.length >= body.count) return sessions;
			// An empty page short of the count would otherwise loop to the cap.
			if (body.items.length === 0) return null;
		}

		return null;
	} catch {
		return null;
	}
}
