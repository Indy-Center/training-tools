/**
 * Tell people that something happened, through Larry.
 *
 * Callers say **who** to tell and **what** to say — a `Notice` — never how.
 * This module turns it into a message (`./message.ts`) and queues it on Larry,
 * the Indy Center Discord bot, over the `LARRY` service binding. Larry delivers
 * it, retrying rate limits and Discord outages. See
 * .ai/decisions/0022-notifications-through-larry.md
 *
 * Notifications never fail the thing they describe. Every failure — no binding,
 * an unknown channel, Larry unreachable — is logged and swallowed, and the
 * change that prompted the notice has already been saved.
 */
import { NOTIFY_CHANNELS } from '$lib/config';
import { buildMessage } from './message';
import type { LarryBinding } from './larry';

export type NotifyAudience = keyof typeof NOTIFY_CHANNELS;

export type Notice = {
	audience: NotifyAudience;
	/** One line: what happened. */
	title: string;
	/** A sentence or two: why they are being told. */
	summary: string;
	/** The specifics, as label/value pairs. */
	fields?: { label: string; value: string }[];
	/** Where to act on it. Makes the title a link. */
	link?: string;
	/**
	 * Discord user IDs to ping. Only these are ever pinged; anything else in the
	 * notice, typed text included, cannot mention anyone.
	 */
	mention?: string[];
	/** `warning` for something that needs acting on. */
	tone?: 'info' | 'warning';
};

/** `sent` means Larry has accepted it into its queue. */
export type NotifyOutcome = 'sent' | 'skipped' | 'failed';

/**
 * The binding, typed. `wrangler types` only knows it as a bare Fetcher, and the
 * global `Env` cannot be narrowed by declaration merging, so the one cast in
 * the app lives here.
 */
function larry(env: Partial<Env> | undefined): LarryBinding | undefined {
	return (env as { LARRY?: LarryBinding } | undefined)?.LARRY;
}

async function deliver(env: Partial<Env> | undefined, notice: Notice): Promise<NotifyOutcome> {
	const binding = larry(env);

	if (!binding) {
		// Under `vite dev` without Larry running alongside, mostly.
		console.warn(`[training-tools] notify: no LARRY binding; skipped "${notice.title}"`);
		return 'skipped';
	}

	await binding.enqueue(buildMessage(notice, new Date()));
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
		// Larry's own message: an unknown channel, a message over Discord's limits.
		console.error(`[training-tools] notify: "${notice.title}" was refused`, err);
		return 'failed';
	}
}

/**
 * Send a notice after the response, from a request handler. The page does not
 * wait on Larry, and nothing about the request depends on the outcome.
 */
export function notifyInBackground(platform: App.Platform | undefined, notice: Notice): void {
	const sending = notify(platform?.env as Partial<Env> | undefined, notice);
	platform?.ctx?.waitUntil(sending);
}
