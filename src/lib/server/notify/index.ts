/**
 * Tell people that something happened.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TEMPORARY — MIGRATE TO THE DISCORD BOT'S MESSAGE QUEUE.                  │
 * │                                                                          │
 * │ Today a notice is posted straight to a Discord webhook. That stands in   │
 * │ until the Discord bot has a message queue; then this module sends to    │
 * │ the bot instead, and only this module changes. Callers say *who* to tell │
 * │ and *what* to say, never how, so no call site needs touching.           │
 * │                                                                          │
 * │ To migrate: replace `deliver()` below with a send to the bot, delete     │
 * │ `discord.ts` and `NOTIFY_AUDIENCES`' secrets, keep `Notice` as the       │
 * │ contract. See .ai/decisions/0018-temporary-webhook-notifications.md      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Notifications never fail the thing they describe. Every failure — no secret,
 * Discord down, a bad URL — is logged and swallowed, and the change that
 * prompted the notice has already been saved.
 */
import { NOTIFY_AUDIENCES } from '$lib/config';
import { buildDiscordPayload } from './discord';

export type NotifyAudience = keyof typeof NOTIFY_AUDIENCES;

export type Notice = {
	audience: NotifyAudience;
	/** One line: what happened. */
	title: string;
	/** A sentence or two: why they are being told. */
	summary: string;
	/** The specifics, as label/value pairs. */
	fields?: { label: string; value: string }[];
	/** `warning` for something that needs acting on. */
	tone?: 'info' | 'warning';
};

export type NotifyOutcome = 'sent' | 'skipped' | 'failed';

/** Give up on a slow webhook rather than hold a Worker invocation open. */
const TIMEOUT_MS = 5000;

async function deliver(env: Partial<Env> | undefined, notice: Notice): Promise<NotifyOutcome> {
	const secret = NOTIFY_AUDIENCES[notice.audience];
	const url = env?.[secret]?.trim();

	if (!url) {
		console.warn(`[training-tools] notify: ${secret} is not set; skipped "${notice.title}"`);
		return 'skipped';
	}

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(buildDiscordPayload(notice, new Date())),
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});

	if (!response.ok) {
		// The body names the problem (bad embed, rate limit); never the URL.
		const detail = await response.text().catch(() => '');
		console.error(
			`[training-tools] notify: ${notice.audience} returned ${response.status}: ${detail.slice(0, 300)}`
		);
		return 'failed';
	}

	return 'sent';
}

/** Send a notice now. Never throws. */
export async function notify(
	env: Partial<Env> | undefined,
	notice: Notice
): Promise<NotifyOutcome> {
	try {
		return await deliver(env, notice);
	} catch (err) {
		console.error('[training-tools] notify failed', err);
		return 'failed';
	}
}

/**
 * Send a notice after the response, from a request handler. The page does not
 * wait on Discord, and nothing about the request depends on the outcome.
 */
export function notifyInBackground(platform: App.Platform | undefined, notice: Notice): void {
	const sending = notify(platform?.env as Partial<Env> | undefined, notice);
	platform?.ctx?.waitUntil(sending);
}
