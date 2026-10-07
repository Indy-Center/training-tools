import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDirectMessage, buildMessage } from './message';
import { notify, notifyDelete, notifyEdit, notifyTracked, type Notice } from './index';

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

describe('buttons', () => {
	it('carries link buttons, and leaves them out entirely when there are none', () => {
		const button = { label: 'Open Teach', url: 'https://training.flyindycenter.com/teach' };
		expect(buildMessage({ ...notice, buttons: [button] }, NOW).buttons).toEqual([button]);
		expect('buttons' in buildMessage(notice, NOW)).toBe(false);
		expect('buttons' in buildMessage({ ...notice, buttons: [] }, NOW)).toBe(false);
	});
});

describe('notifyTracked', () => {
	const env = (larry: object) => ({ LARRY: larry }) as unknown as Partial<Env>;

	it('posts now and says which message it became', async () => {
		const send = vi.fn().mockResolvedValue({ channelId: '1', messageId: '555' });
		const enqueue = vi.fn();

		expect(await notifyTracked(env({ send, enqueue }), notice)).toEqual({
			outcome: 'sent',
			messageId: '555'
		});
		expect(enqueue).not.toHaveBeenCalled();
	});

	// It still has to arrive; it just cannot be changed afterwards.
	it('queues it instead when it cannot be posted now, with no message to track', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const send = vi.fn().mockRejectedValue(new Error('rate limited'));
		const enqueue = vi.fn().mockResolvedValue(undefined);

		expect(await notifyTracked(env({ send, enqueue }), notice)).toEqual({
			outcome: 'sent',
			messageId: null
		});
		expect(enqueue).toHaveBeenCalledOnce();
	});

	it('skips quietly when there is no Larry binding', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(await notifyTracked({}, notice)).toEqual({ outcome: 'skipped', messageId: null });
	});
});

describe('notifyEdit and notifyDelete', () => {
	const env = (larry: object) => ({ LARRY: larry }) as unknown as Partial<Env>;

	it('changes the message without its mentions, so the first post’s pings stay', async () => {
		const enqueueEdit = vi.fn().mockResolvedValue(undefined);
		const outcome = await notifyEdit(env({ enqueueEdit }), '555', {
			...notice,
			audience: 'instructors',
			mention: [EXAMINER]
		});

		expect(outcome).toBe('sent');
		const request = enqueueEdit.mock.calls[0][0];
		expect(request).toMatchObject({ channel: 'instructor-actions', messageId: '555' });
		expect(request.content).toBeUndefined();
		expect(request.embeds[0].title).toBe(notice.title);
	});

	it('removes the message from the audience’s channel', async () => {
		const enqueueDelete = vi.fn().mockResolvedValue(undefined);

		expect(await notifyDelete(env({ enqueueDelete }), 'instructors', '555')).toBe('sent');
		expect(enqueueDelete).toHaveBeenCalledWith({ channel: 'instructor-actions', messageId: '555' });
	});

	// A Larry that is still on 1.1.0 has neither method.
	it('reports a failure rather than throwing when Larry cannot do it', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(await notifyEdit(env({}), '555', notice)).toBe('failed');
		expect(await notifyDelete(env({}), 'instructors', '555')).toBe('failed');
	});
});
