import { json } from '@sveltejs/kit';
import { syncEnrollmentIssue } from '$lib/server/enrollments';
import { issueKeyFromDelivery, verifyJiraSignature } from '$lib/server/jira/webhook';
import type { RequestHandler } from './$types';

/**
 * Jira's "issue updated" webhook for project TRK.
 *
 * **Public** — listed in `PUBLIC_PATHS` in `hooks.server.ts`, because Jira has
 * no session. The HMAC signature is this route's authentication instead, and it
 * is checked before anything else.
 *
 * The body is used for exactly one thing: which issue changed. The issue is then
 * re-read from Jira, so a replayed or out-of-order delivery can do no more than
 * make us look at an issue again. That is also why no
 * `X-Atlassian-Webhook-Identifier` dedup is needed: a duplicate is harmless.
 *
 * Status codes are chosen for Jira's retry policy, which retries 408, 409, 425,
 * 429 and 5xx up to five times and nothing else:
 *
 * | Case                              | Answer | Retried? |
 * | --------------------------------- | ------ | -------- |
 * | Applied, ignored, or issue gone   | 204    | no       |
 * | Bad or missing signature          | 401    | no       |
 * | Not configured here yet           | 503    | yes      |
 * | Jira read failed                  | 502    | yes      |
 *
 * The 15-minute sweep catches anything that runs out of retries.
 * See .ai/decisions/0014-enrollment-status-from-jira.md
 */
export const POST: RequestHandler = async ({ request, locals, platform }) => {
	// Widened to the global Env, where app.d.ts declares the secrets: the
	// generated platform type only knows what `wrangler types` saw in .dev.vars.
	const env: Partial<Env> | undefined = platform?.env;
	const secret = env?.JIRA_WEBHOOK_SECRET?.trim();

	if (!secret) {
		console.error('[training-tools] Jira webhook received but JIRA_WEBHOOK_SECRET is not set');
		return json({ error: 'not configured' }, { status: 503 });
	}

	// Raw text, not request.json(): the signature is over the exact bytes.
	const body = await request.text();

	if (!(await verifyJiraSignature(secret, body, request.headers.get('x-hub-signature')))) {
		return json({ error: 'bad signature' }, { status: 401 });
	}

	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		return new Response(null, { status: 204 });
	}

	const issueKey = issueKeyFromDelivery(payload, env?.JIRA_PROJECT_KEY ?? 'TRK');
	if (!issueKey) return new Response(null, { status: 204 });

	try {
		const result = await syncEnrollmentIssue(locals.db, env, issueKey);

		if (!result.ok) {
			console.error('[training-tools] Jira webhook: Jira credentials are not configured');
			return json({ error: 'not configured' }, { status: 503 });
		}

		if (result.outcome === 'updated') {
			console.log('[training-tools] enrollment status from webhook', issueKey);
		}
		return new Response(null, { status: 204 });
	} catch (err) {
		console.error('[training-tools] Jira webhook: reading the issue failed', issueKey, err);
		return json({ error: 'upstream' }, { status: 502 });
	}
};
