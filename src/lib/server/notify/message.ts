import { NOTIFY_CHANNELS } from '$lib/config';
import type { DirectNotice, Notice } from './index';
import type { ChannelSend, DirectSend, Message } from '@indy-center/indy-larry-worker';

/**
 * A notice as a message for Larry to post.
 *
 * Pure, so the size limits and the mention guard are tested.
 */

/** Discord's embed limits. Past these the whole message is rejected. */
const LIMITS = { title: 256, description: 4096, fieldName: 256, fieldValue: 1024, fields: 25 };

const COLORS = { info: 0x0284c7 /* sky-600 */, warning: 0xea580c /* orange-600 */ };

/** Discord user IDs are 17–20 digits. Anything else is dropped rather than sent. */
const DISCORD_ID = /^\d{17,20}$/;

function clip(text: string, max: number): string {
	const value = text.trim() || '—';
	return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function buildMessage(notice: Notice, now: Date): ChannelSend {
	const mentions = [...new Set((notice.mention ?? []).filter((id) => DISCORD_ID.test(id)))];

	return {
		channel: NOTIFY_CHANNELS[notice.audience],
		// A mention only pings from the message text, not from inside an embed.
		content: mentions.length > 0 ? mentions.map((id) => `<@${id}>`).join(' ') : undefined,
		// Only the people the notice names, and never anyone else. Fields carry
		// text people typed — availability is free text — so "@everyone" or a
		// pasted mention in it must stay words.
		allowedMentions: { parse: [], users: mentions },
		embeds: [embed(notice, now)],
		// Left out, not empty, when there are none: on an edit that keeps the
		// buttons the message already has.
		...(notice.buttons?.length ? { buttons: notice.buttons } : {})
	};
}

function embed(notice: DirectNotice, now: Date): NonNullable<Message['embeds']>[number] {
	return {
		title: clip(notice.title, LIMITS.title),
		description: clip(notice.summary, LIMITS.description),
		url: notice.link,
		color: COLORS[notice.tone ?? 'info'],
		fields: (notice.fields ?? []).slice(0, LIMITS.fields).map((field) => ({
			name: clip(field.label, LIMITS.fieldName),
			value: clip(field.value, LIMITS.fieldValue),
			inline: false
		})),
		timestamp: now.toISOString()
	};
}

/** A notice as a private message to one person. It can ping nobody. */
export function buildDirectMessage(userId: string, notice: DirectNotice, now: Date): DirectSend {
	return { userId, allowedMentions: { parse: [] }, embeds: [embed(notice, now)] };
}
