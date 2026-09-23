/**
 * Verifying and reading Jira's webhook deliveries.
 *
 * Jira Cloud signs each delivery with the secret set on the webhook, as an
 * HMAC of the raw body in `X-Hub-Signature: sha256=<hex>` (the WebSub format).
 * https://developer.atlassian.com/cloud/jira/platform/webhooks/
 */
import { parseJiraTimestamp, type JiraStatusIssue } from './status';

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

export type Delivery = {
	key: string;
	/**
	 * The issue as the delivery describes it, when it carries a status — the
	 * normal case. Null when the body has no fields (e.g. "Exclude body" is
	 * ticked), and the caller should read the issue from Jira instead.
	 */
	issue: JiraStatusIssue | null;
	/**
	 * When that state was true: the issue's own `updated`, the same clock the
	 * sweep orders by, falling back to the delivery's event `timestamp`.
	 */
	observedAt: Date | null;
};

/**
 * What a verified delivery says, if it is one of ours to look at.
 *
 * The body is trusted as data because the HMAC has already proved Jira sent it.
 * That matters: re-reading the issue instead turned out to be racy (0014), and
 * the body is exactly the state at the moment of the event. Ordering is left
 * to `observedAt`, so replays and late deliveries are refused as stale.
 *
 * Returns null for anything that is not an issue event in `projectKey`. The
 * webhook's JQL filter should already ensure that, but the filter lives in
 * Jira's admin screen, not in this repo, so it is checked again here.
 */
export function readDelivery(payload: unknown, projectKey: string): Delivery | null {
	if (!payload || typeof payload !== 'object') return null;

	const { issue, timestamp } = payload as { issue?: JiraStatusIssue; timestamp?: unknown };
	const key = issue?.key;
	if (typeof key !== 'string' || !new RegExp(`^${projectKey}-\\d+$`).test(key)) return null;

	const eventAt = typeof timestamp === 'number' ? new Date(timestamp) : null;
	const hasStatus = typeof issue?.fields?.status?.name === 'string';

	return {
		key,
		issue: hasStatus ? { key, fields: issue!.fields } : null,
		observedAt: parseJiraTimestamp(issue?.fields?.updated) ?? eventAt
	};
}
