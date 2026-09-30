import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDiscordPayload } from './discord';
import { notify, type Notice } from './index';

const NOW = new Date('2026-09-30T12:00:00Z');

const notice: Notice = {
	audience: 'training-admins',
	title: 'Teacher availability changed',
	summary: 'For your information.',
	fields: [{ label: 'Teacher', value: 'Jo Rivera (JR)' }]
};

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('buildDiscordPayload', () => {
	it('never lets a notice mention anyone', () => {
		const payload = buildDiscordPayload(
			{ ...notice, fields: [{ label: 'Availability', value: '@everyone weekends' }] },
			NOW
		);
		expect(payload.allowed_mentions).toEqual({ parse: [] });
	});

	it("clips text to Discord's limits rather than having the message rejected", () => {
		const payload = buildDiscordPayload(
			{ ...notice, fields: [{ label: 'Availability', value: 'x'.repeat(5000) }] },
			NOW
		);
		expect(payload.embeds[0].fields[0].value).toHaveLength(1024);
		expect(payload.embeds[0].fields[0].value.endsWith('…')).toBe(true);
	});

	it('fills an empty value, which Discord would reject', () => {
		const payload = buildDiscordPayload({ ...notice, fields: [{ label: 'Was', value: '' }] }, NOW);
		expect(payload.embeds[0].fields[0].value).toBe('—');
	});

	it('colours warnings differently from information', () => {
		const info = buildDiscordPayload(notice, NOW).embeds[0].color;
		const warning = buildDiscordPayload({ ...notice, tone: 'warning' }, NOW).embeds[0].color;
		expect(warning).not.toBe(info);
	});
});

describe('notify', () => {
	it('skips quietly when the webhook secret is not set', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		expect(await notify({}, notice)).toBe('skipped');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("posts to the audience's webhook", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetchSpy);

		const outcome = await notify(
			{ DISCORD_WEBHOOK_TRAINING_ADMINS: ' https://discord.test/hook ' },
			notice
		);

		expect(outcome).toBe('sent');
		expect(fetchSpy.mock.calls[0][0]).toBe('https://discord.test/hook');
	});

	// A notification must never be why a save fails.
	it('never throws, whatever Discord does', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
		expect(await notify({ DISCORD_WEBHOOK_TRAINING_ADMINS: 'https://x' }, notice)).toBe('failed');

		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 400 })));
		expect(await notify({ DISCORD_WEBHOOK_TRAINING_ADMINS: 'https://x' }, notice)).toBe('failed');
	});
});
