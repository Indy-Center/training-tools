import { json } from '@sveltejs/kit';
import { applyIssueStatus, syncEnrollmentIssue } from '$lib/server/enrollments';
import { readDelivery, verifyJiraSignature } from '$lib/server/jira/webhook';
import type { RequestHandler } from './$types';

/**
 * Jira's "issue updated" webhook for project TRK.
 *
 * **Public** — listed in `PUBLIC_PATHS` in `hooks.server.ts`, because Jira has
 * no session. The HMAC signature is this route's authentication instead, and it
 * is checked before anything else.
 *
 * Once verified, the body's issue is applied directly, ordered by its own
 * `updated` time, and anything older than what is already stored is refused.
 * The first version re-read the issue from Jira instead, and lost In Training:
 * staff set Teacher and then click Assign Teacher two seconds later, and the
 * Teacher edit's read-and-write could land after the transition's. Ordering by
 * time makes delivery order irrelevant, so no `X-Atlassian-Webhook-Identifier`
 * dedup is needed either. A body without fields falls back to a Jira read.
 *
 * Status codes are chosen for Jira's retry policy, which retries 408, 409, 425,
 * 429 and 5xx up to five times and nothing else:
 *
 * | Case                                   | Answer | Retried? |
 * | -------------------------------------- | ------ | -------- |
 * | Applied, stale, ignored, or issue gone | 204    | no       |
 * | Bad or missing signature               | 401    | no       |
 * | Not configured here yet                | 503    | yes      |
 * | Fallback Jira read failed              | 502    | yes      |
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

	const delivery = readDelivery(payload, env?.JIRA_PROJECT_KEY ?? 'TRK');
	if (!delivery) return new Response(null, { status: 204 });

	try {
		let outcome: string;

		if (delivery.issue) {
			outcome = await applyIssueStatus(locals.db, delivery.issue, delivery.observedAt);
		} else {
			const result = await syncEnrollmentIssue(locals.db, env, delivery.key);
			if (!result.ok) {
				console.error('[training-tools] Jira webhook: Jira credentials are not configured');
				return json({ error: 'not configured' }, { status: 503 });
			}
			outcome = result.outcome;
		}

		// One line per delivery: TRK sees a handful of changes a day, and this is
		// what answers "did the webhook see it" from `wrangler tail`.
		console.log(
			'[training-tools] jira webhook',
			JSON.stringify({
				issue: delivery.key,
				status: delivery.issue?.fields?.status?.name ?? null,
				observedAt: delivery.observedAt?.toISOString() ?? null,
				outcome
			})
		);
		return new Response(null, { status: 204 });
	} catch (err) {
		console.error('[training-tools] Jira webhook failed', delivery.key, err);
		return json({ error: 'upstream' }, { status: 502 });
	}
};
