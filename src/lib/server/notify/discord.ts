import type { Notice } from './index';

/**
 * A notice as a Discord webhook message. TEMPORARY — goes when notices move to
 * the Discord bot's queue; see `./index.ts`.
 *
 * Pure, so the size limits and the mention guard are tested.
 */

/** Discord's embed limits. Past these the whole message is rejected with a 400. */
const LIMITS = { title: 256, description: 4096, fieldName: 256, fieldValue: 1024, fields: 25 };

const COLORS = { info: 0x0284c7 /* sky-600 */, warning: 0xea580c /* orange-600 */ };

function clip(text: string, max: number): string {
	const value = text.trim() || '—';
	return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function buildDiscordPayload(notice: Notice, now: Date) {
	return {
		username: 'Indy Center Training',
		// Nothing a notice carries may ping anyone. Availability is free text a
		// teacher typed, so "@everyone" in it must stay words, not a mention.
		allowed_mentions: { parse: [] as string[] },
		embeds: [
			{
				title: clip(notice.title, LIMITS.title),
				description: clip(notice.summary, LIMITS.description),
				color: COLORS[notice.tone ?? 'info'],
				fields: (notice.fields ?? []).slice(0, LIMITS.fields).map((field) => ({
					name: clip(field.label, LIMITS.fieldName),
					value: clip(field.value, LIMITS.fieldValue),
					inline: false
				})),
				timestamp: now.toISOString()
			}
		]
	};
}
