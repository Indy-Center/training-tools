import { FACILITY_ID } from '$lib/config';
import type { VatusaRosterMember, VatusaRosterResponse } from '$lib/types/vatusa';

const VATUSA_API_BASE_URL = 'https://api.vatusa.net';

/**
 * Parse a roster response without mangling Discord ids.
 *
 * VATUSA sends `discord_id` as a bare JSON number, but Discord snowflakes are
 * 18-19 digits — past `Number.MAX_SAFE_INTEGER`. `response.json()` silently
 * rounds them: against the live ZID roster on 2026-09-23, 149 of 155 ids came
 * out wrong. Quoting the digits before parsing keeps them exact.
 */
export function parseRosterBody(text: string): VatusaRosterResponse {
	return JSON.parse(text.replace(/"discord_id"\s*:\s*(\d+)/g, '"discord_id":"$1"'));
}

/**
 * Fetch the facility roster. This endpoint is public — no API key — which is
 * why the roster sync needs no secrets. (The transfer/visit eligibility
 * checklist does require VATUSA_API_KEY; that arrives with DEV-106.)
 *
 * Throws on a non-2xx or malformed response so the cron fails loudly rather
 * than quietly wiping the mirror.
 */
export async function fetchRoster(
	membership: 'home' | 'visit' | 'both' = 'both',
	artcc: string = FACILITY_ID
): Promise<VatusaRosterMember[]> {
	const url = `${VATUSA_API_BASE_URL}/facility/${artcc}/roster/${membership}`;
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`VATUSA roster fetch failed: ${response.status} ${response.statusText}`);
	}

	const body = parseRosterBody(await response.text());

	if (!Array.isArray(body?.data)) {
		throw new Error('VATUSA roster fetch returned no data array');
	}

	return body.data;
}
