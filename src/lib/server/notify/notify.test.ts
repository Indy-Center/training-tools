import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDirectMessage, buildMessage } from './message';
import { notify, type Notice } from './index';

const NOW = new Date('2026-09-30T12:00:00Z');
const STUDENT = '123456789012345678';
const EXAMINER = '234567890123456789';

const notice: Notice = {
	audience: 'training-admins',
	title: 'Teacher availability changed',
	summary: 'For your information.',
	fields: [{ label: 'Teacher', value: 'Jo Rivera (JR)' }]
};

afterEach(() => vi.restoreAllMocks());

describe('buildMessage', () => {
	it("goes to the audience's channel on Larry", () => {
		expect(buildMessage(notice, NOW).channel).toBe('training-admin-alerts');
		expect(buildMessage({ ...notice, audience: 'instructors' }, NOW).channel).toBe(
			'instructor-actions'
		);
	});

	it('pings nobody unless the notice names them', () => {
		const message = buildMessage(
			{ ...notice, fields: [{ label: 'Availability', value: '@everyone weekends <@1>' }] },
			NOW
		);
		expect(message.content).toBeUndefined();
		expect(message.allowedMentions).toEqual({ parse: [], users: [] });
	});

	// A mention only pings from the message text, so the named people go there.
	it('pings exactly the people the notice names, once each', () => {
		const message = buildMessage({ ...notice, mention: [STUDENT, EXAMINER, STUDENT] }, NOW);
		expect(message.content).toBe(`<@${STUDENT}> <@${EXAMINER}>`);
		expect(message.allowedMentions).toEqual({ parse: [], users: [STUDENT, EXAMINER] });
	});

	it('drops anything that is not a Discord ID rather than send it', () => {
		const message = buildMessage({ ...notice, mention: ['@everyone', '', 'JR', EXAMINER] }, NOW);
		expect(message.allowedMentions?.users).toEqual([EXAMINER]);
	});

	it('makes the title a link when the notice has one', () => {
		const message = buildMessage({ ...notice, link: 'https://training.test/teach' }, NOW);
		expect(message.embeds?.[0].url).toBe('https://training.test/teach');
	});

	it("clips text to Discord's limits rather than having the message rejected", () => {
		const message = buildMessage(
			{ ...notice, fields: [{ label: 'Availability', value: 'x'.repeat(5000) }] },
			NOW
		);
		const value = message.embeds![0].fields![0].value;
		expect(value).toHaveLength(1024);
		expect(value.endsWith('…')).toBe(true);
	});

	it('fills an empty value, which Discord would reject', () => {
		const message = buildMessage({ ...notice, fields: [{ label: 'Was', value: '' }] }, NOW);
		expect(message.embeds![0].fields![0].value).toBe('—');
	});

	it('colours warnings differently from information', () => {
		const info = buildMessage(notice, NOW).embeds![0].color;
		const warning = buildMessage({ ...notice, tone: 'warning' }, NOW).embeds![0].color;
		expect(warning).not.toBe(info);
	});
});

describe('notify', () => {
	it('skips quietly when there is no Larry binding', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(await notify({}, notice)).toBe('skipped');
	});

	it('queues the message on Larry', async () => {
		const enqueue = vi.fn().mockResolvedValue(undefined);
		const outcome = await notify({ LARRY: { enqueue } } as unknown as Partial<Env>, notice);

		expect(outcome).toBe('sent');
		expect(enqueue).toHaveBeenCalledOnce();
		expect(enqueue.mock.calls[0][0]).toMatchObject({ channel: 'training-admin-alerts' });
	});

	// A notification must never be why a save fails.
	it('never throws, whatever Larry does', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const refusing = {
			LARRY: { enqueue: vi.fn().mockRejectedValue(new Error('Unknown channel')) }
		};
		expect(await notify(refusing as unknown as Partial<Env>, notice)).toBe('failed');
	});
});

describe('buildDirectMessage', () => {
	it('goes to one person, as an embed that can ping nobody', () => {
		const message = buildDirectMessage(
			STUDENT,
			{ title: 'Your course has been assigned', summary: '@everyone you have 30 days.' },
			NOW
		);

		expect(message.userId).toBe(STUDENT);
		expect(message.content).toBeUndefined();
		expect(message.allowedMentions).toEqual({ parse: [] });
		expect(message.embeds?.[0]).toMatchObject({
			title: 'Your course has been assigned',
			description: '@everyone you have 30 days.'
		});
	});
});
