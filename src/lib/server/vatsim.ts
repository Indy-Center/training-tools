import type { AtcHoursByRating } from '$lib/certification-grant';
import type { VatsimAtcResponse, VatsimMemberStats } from '$lib/types/vatsim';

const VATSIM_API_BASE_URL = 'https://api.vatsim.net/v2';

/** A timed-out stats lookup returns null, the same as any other failure. */
const STATS_TIMEOUT_MS = 5000;

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
 * .ai/research/vatsim-api.md
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
 * say what the member earned as a controller. The home page and `/enroll` fetch
 * it for the consolidation check, which is why it has a timeout: a slow VATSIM
 * must not hang a page render.
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
