/**
 * Verifying and reading Jira's webhook deliveries.
 *
 * Jira Cloud signs each delivery with the secret set on the webhook, as an
 * HMAC of the raw body in `X-Hub-Signature: sha256=<hex>` (the WebSub format).
 * https://developer.atlassian.com/cloud/jira/platform/webhooks/
 */

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
	return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Compare without returning early, so timing does not leak how much matched. */
function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return difference === 0;
}

/**
 * True when `header` is a valid signature of `body` under `secret`.
 *
 * `body` must be the raw request text — re-serialising parsed JSON changes the
 * bytes and every signature fails. Only sha256 is accepted: it is what Jira
 * sends, and accepting a weaker method the header names would let a forger pick.
 */
export async function verifyJiraSignature(
	secret: string,
	body: string,
	header: string | null
): Promise<boolean> {
	if (!secret || !header) return false;

	const [method, signature] = header.trim().split('=', 2);
	if (method?.toLowerCase() !== 'sha256' || !signature) return false;

	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const expected = toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));

	return constantTimeEqual(expected, signature.toLowerCase());
}

/**
 * The issue key a delivery is about, if it is one of ours to look at.
 *
 * Returns null for anything that is not an issue event in `projectKey` — the
 * webhook's JQL filter should already ensure that, but the filter lives in
 * Jira's admin screen, not in this repo, so it is checked again here.
 */
export function issueKeyFromDelivery(payload: unknown, projectKey: string): string | null {
	if (!payload || typeof payload !== 'object') return null;

	const key = (payload as { issue?: { key?: unknown } }).issue?.key;
	if (typeof key !== 'string') return null;

	return new RegExp(`^${projectKey}-\\d+$`).test(key) ? key : null;
}
