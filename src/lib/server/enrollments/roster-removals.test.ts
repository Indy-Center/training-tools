import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { enrollmentsTable, type InsertEnrollment } from '$lib/db/schema/enrollments';
import { rosterMembersTable, type InsertRosterMember } from '$lib/db/schema/roster';
import { teachersTable } from '$lib/db/schema/teachers';
import type { VatusaRosterMember } from '$lib/types/vatusa';
import {
	getOpenEnrollment,
	getUnfiledEnrollments,
	getWaitlistPosition,
	getWaitlistStats,
	retryFiling
} from './index';
import { reconcileEnrollments } from './reconcile';
import { processRosterRemovals } from './roster-removals';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-22T12:00:00Z');
/** Two days before NOW: a facility day of 2026-10-20, so restore by 2026-11-19. */
const LEFT = new Date('2026-10-20T15:00:00Z');

let db: Database;

beforeEach(() => {
	db = testDb();
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

async function addMember(overrides: Partial<InsertRosterMember> & { cid: string }) {
	await db.insert(rosterMembersTable).values({
		firstName: 'Jo',
		lastName: 'Rivera',
		rating: 3,
		ratingShort: 'S2',
		membership: 'home',
		facility: 'ZID',
		discordId: `9000000000000${overrides.cid}`,
		data: {} as VatusaRosterMember,
		...overrides
	});
}

async function addRequest(overrides: Partial<InsertEnrollment> & { id: string; cid: string }) {
	await db.insert(enrollmentsTable).values({
		course: 'S-LC',
		status: 'waitlist',
		submittedName: 'Jo Rivera',
		notificationPreference: 'discord',
		createdAt: new Date('2026-09-01T00:00:00Z'),
		...overrides
	});
}

const row = async (id: string) =>
	(await db.query.enrollmentsTable.findFirst({ where: eq(enrollmentsTable.id, id) }))!;

type Card = { status: string; updated: string };

/** TRK, as far as a removal touches it. `refuse` leaves no transition to Removed. */
function fakeJira(cards: Record<string, Card>, { refuse = false } = {}) {
	const calls: { method: string; path: string; body: any }[] = [];

	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init: { method: string; body?: string }) => {
			const path = new URL(url).pathname.replace('/rest/api/3', '');
			const body = init.body ? JSON.parse(init.body) : undefined;
			calls.push({ method: init.method, path, body });

			const [, key, rest = ''] = path.match(/^\/issue\/([^/]+)(\/.*)?$/) ?? [];
			const card = cards[decodeURIComponent(key ?? '')];
			if (!card) return new Response('not found', { status: 404 });

			if (rest === '/comment') return Response.json({}, { status: 201 });
			if (rest === '/transitions' && init.method === 'GET') {
				return Response.json({
					transitions: refuse
						? []
						: [{ id: '91', name: 'Remove', to: { id: '6', name: 'Removed' } }]
				});
			}
			if (rest === '/transitions') {
				card.status = 'Removed';
				card.updated = new Date(new Date(card.updated).getTime() + 60_000).toISOString();
				return new Response(null, { status: 204 });
			}
			if (init.method === 'PUT') return new Response(null, { status: 204 });
			return Response.json({
				key,
				fields: { status: { name: card.status }, updated: card.updated }
			});
		})
	);

	const comments = () =>
		calls
			.filter((call) => call.path.endsWith('/comment'))
			.map((call) => ({
				issue: call.path.split('/')[2],
				text: call.body.body.content.map((p: any) => p.content[0].text).join('\n')
			}));
	const moves = () =>
		calls.filter((call) => call.path.endsWith('/transitions') && call.method === 'POST');

	return { calls, comments, moves };
}

/** Larry, collecting what would have been sent. */
function fakeLarry() {
	const channel: {
		title: string;
		description: string;
		fields: { name: string; value: string }[];
	}[] = [];
	const direct: { userId: string; title: string; description: string }[] = [];
	const env = {
		JIRA_BASE_URL: 'https://jira.test',
		JIRA_PROJECT_KEY: 'TRK',
		JIRA_USER_EMAIL: 'bot@example.com',
		JIRA_API_TOKEN: 'token',
		LARRY: {
			enqueue: async (message: any) => {
				channel.push(message.embeds[0]);
			},
			enqueueDirect: async (message: any) => {
				direct.push({ userId: message.userId, ...message.embeds[0] });
			}
		}
	} as unknown as Partial<Env>;
	return { env, channel, direct };
}

const updatedAt = '2026-10-01T10:00:00.000Z';

describe('processRosterRemovals: removal', () => {
	it('comments on a filed request, moves it to Removed, reads it back and stamps the row', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, removedAt: LEFT });
		await addRequest({ id: 'a', cid: '1000001', jiraIssueKey: 'TRK-1' });
		const jira = fakeJira({ 'TRK-1': { status: 'Waitlist', updated: updatedAt } });
		const { env } = fakeLarry();

		const result = await processRosterRemovals(db, env, NOW);

		expect(jira.comments()).toEqual([
			{
				issue: 'TRK-1',
				text: 'Left the ZID home roster on 2026-10-20. Removed automatically; restored to Waitlist if back on the home roster by 2026-11-19.'
			}
		]);
		expect(jira.moves()).toHaveLength(1);
		expect(result).toMatchObject({ due: 1, removed: 1, refused: 0 });

		const removed = await row('a');
		expect(removed.status).toBe('removed');
		expect(removed.rosterRemovedAt).toEqual(NOW);
		expect(removed.rosterRemovedFrom).toBe('waitlist');
		expect(removed.leftHomeAt).toEqual(LEFT);
		expect(removed.restoreBy).toEqual(new Date(LEFT.getTime() + 30 * DAY));
		expect(removed.restoreClosedAt).toBeNull();
	});

	it('names the stage the request left in the comment', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, membership: 'visit' });
		await addRequest({ id: 'a', cid: '1000001', status: 'rating-exam', jiraIssueKey: 'TRK-1' });
		const jira = fakeJira({ 'TRK-1': { status: 'Rating Exam', updated: updatedAt } });

		await processRosterRemovals(db, fakeLarry().env, NOW);

		expect(jira.comments()[0].text).toContain('restored to Rating Exam if back');
		expect((await row('a')).rosterRemovedFrom).toBe('rating-exam');
	});

	it('leaves the row as it was when Jira refuses the move, for the next pass', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, removedAt: LEFT });
		await addRequest({ id: 'a', cid: '1000001', jiraIssueKey: 'TRK-1' });
		fakeJira({ 'TRK-1': { status: 'Waitlist', updated: updatedAt } }, { refuse: true });
		const { env, channel, direct } = fakeLarry();

		const result = await processRosterRemovals(db, env, NOW);

		expect(result).toMatchObject({ due: 1, removed: 0, refused: 1 });
		const untouched = await row('a');
		expect(untouched.status).toBe('waitlist');
		expect(untouched.rosterRemovedAt).toBeNull();
		expect(untouched.restoreBy).toBeNull();
		expect(channel).toEqual([]);
		expect(direct).toEqual([]);
	});

	it('stamps an unfiled request and marks it removed here, and the reconcile then leaves it', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, removedAt: LEFT });
		await addRequest({ id: 'a', cid: '1000001' });
		const jira = fakeJira({});
		const { env } = fakeLarry();

		await processRosterRemovals(db, env, NOW);

		const removed = await row('a');
		expect(removed.status).toBe('removed');
		expect(removed.rosterRemovedAt).toEqual(NOW);
		expect(removed.rosterRemovedFrom).toBe('waitlist');
		expect(removed.restoreBy).toEqual(new Date(LEFT.getTime() + 30 * DAY));

		expect(await reconcileEnrollments(db, env)).toEqual({ pending: 0, filed: 0, failed: 0 });
		expect(jira.calls).toEqual([]);
	});

	it('waits out the 24 hours', async () => {
		await addMember({ cid: '1000001', leftHomeAt: new Date(NOW.getTime() - 23 * 60 * 60 * 1000) });
		await addRequest({ id: 'a', cid: '1000001', jiraIssueKey: 'TRK-1' });
		const jira = fakeJira({ 'TRK-1': { status: 'Waitlist', updated: updatedAt } });

		const result = await processRosterRemovals(db, fakeLarry().env, NOW);

		expect(result).toMatchObject({ due: 0, removed: 0 });
		expect(jira.calls).toEqual([]);
		expect((await row('a')).status).toBe('waitlist');
	});

	it('leaves a request kept in line', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, removedAt: LEFT });
		await addRequest({ id: 'a', cid: '1000001', keptInLineAt: LEFT, keptInLineBy: '1000099' });

		await processRosterRemovals(db, fakeLarry().env, NOW);

		expect((await row('a')).status).toBe('waitlist');
	});

	it('removes a request once, however many passes run', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, removedAt: LEFT });
		await addRequest({ id: 'a', cid: '1000001', jiraIssueKey: 'TRK-1' });
		const jira = fakeJira({ 'TRK-1': { status: 'Waitlist', updated: updatedAt } });
		const { env } = fakeLarry();

		await processRosterRemovals(db, env, NOW);
		await processRosterRemovals(db, env, new Date(NOW.getTime() + 10 * 60_000));

		expect(jira.comments()).toHaveLength(1);
	});
});

describe('while the window is open', () => {
	it('getOpenEnrollment returns a request in its window, and not one whose window closed', async () => {
		await addRequest({
			id: 'a',
			cid: '1000001',
			status: 'removed',
			rosterRemovedAt: LEFT,
			rosterRemovedFrom: 'waitlist',
			leftHomeAt: LEFT,
			restoreBy: new Date(LEFT.getTime() + 30 * DAY)
		});
		expect((await getOpenEnrollment(db, '1000001'))?.id).toBe('a');

		await db
			.update(enrollmentsTable)
			.set({ restoreClosedAt: NOW, restoreClosedReason: 'expired' })
			.where(eq(enrollmentsTable.id, 'a'));
		expect(await getOpenEnrollment(db, '1000001')).toBeNull();
	});

	it('a staff removal is still closed', async () => {
		await addRequest({ id: 'a', cid: '1000001', status: 'removed' });
		expect(await getOpenEnrollment(db, '1000001')).toBeNull();
	});

	it('leaves the removed request out of the waitlist counts, so the people behind move up', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, removedAt: LEFT });
		await addMember({ cid: '1000002' });
		await addRequest({ id: 'a', cid: '1000001', jiraIssueKey: 'TRK-1' });
		await addRequest({ id: 'b', cid: '1000002', createdAt: new Date('2026-09-05T00:00:00Z') });
		fakeJira({ 'TRK-1': { status: 'Waitlist', updated: updatedAt } });

		const behind = await row('b');
		expect(await getWaitlistPosition(db, behind)).toEqual({ ahead: 1, waiting: 2 });

		await processRosterRemovals(db, fakeLarry().env, NOW);

		expect(await getWaitlistPosition(db, behind)).toEqual({ ahead: 0, waiting: 1 });
		const course = (await getWaitlistStats(db)).find((c) => c.code === 'S-LC');
		expect(course?.waiting).toBe(1);
	});
});

describe('processRosterRemovals: notices', () => {
	beforeEach(async () => {
		await db.insert(teachersTable).values([
			// Initials no seeded teacher holds.
			{ cid: '2000001', roles: ['MTR'], initials: 'QX' },
			{ cid: '2000002', roles: ['INS'], initials: 'QZ' }
		]);
		await addMember({ cid: '2000001', firstName: 'Sam', lastName: 'Wells' });
		await addMember({ cid: '2000002', firstName: 'Hal', lastName: 'Ito' });
	});

	it('a Waitlist request: the training admins and the student', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, removedAt: LEFT });
		await addRequest({ id: 'a', cid: '1000001', jiraIssueKey: 'TRK-1' });
		fakeJira({ 'TRK-1': { status: 'Waitlist', updated: updatedAt } });
		const { env, channel, direct } = fakeLarry();

		await processRosterRemovals(db, env, NOW);

		expect(channel.map((m) => m.title)).toEqual(['Left the home roster: Jo Rivera']);
		expect(channel[0].fields.find((f) => f.name === 'Not told')).toBeUndefined();
		expect(direct.map((m) => [m.userId, m.title])).toEqual([
			['90000000000001000001', 'Your training request is paused']
		]);
		expect(direct[0].description).toContain('by November 19, 2026');
	});

	it('an In Training request: the teacher as well', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, removedAt: LEFT });
		await addRequest({ id: 'a', cid: '1000001', status: 'in-training', teacher: 'QX' });
		const { env, channel, direct } = fakeLarry();

		await processRosterRemovals(db, env, NOW);

		expect(channel).toHaveLength(1);
		expect(direct.map((m) => [m.userId, m.title])).toEqual([
			['90000000000001000001', 'Your training request is paused'],
			['90000000000002000001', 'Jo Rivera has left the home roster']
		]);
	});

	it('a claimed Rating Exam: the examiner, not the teacher', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, removedAt: LEFT });
		await addRequest({
			id: 'a',
			cid: '1000001',
			status: 'rating-exam',
			teacher: 'QX',
			reInstructor: 'QZ'
		});
		const { env, direct } = fakeLarry();

		await processRosterRemovals(db, env, NOW);

		expect(direct.map((m) => [m.userId, m.title])).toEqual([
			['90000000000001000001', 'Your training request is paused'],
			['90000000000002000002', "Jo Rivera's rating exam is paused"]
		]);
	});

	it('skips anyone with no Discord ID, or who chose email, and tells the admins who', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, removedAt: LEFT, discordId: null });
		await addMember({ cid: '1000003', leftHomeAt: LEFT, removedAt: LEFT });
		await db
			.update(rosterMembersTable)
			.set({ discordId: null })
			.where(eq(rosterMembersTable.cid, '2000001'));
		await addRequest({ id: 'a', cid: '1000001', status: 'in-training', teacher: 'QX' });
		await addRequest({ id: 'b', cid: '1000003', notificationPreference: 'email' });
		const { env, channel, direct } = fakeLarry();

		await processRosterRemovals(db, env, NOW);

		expect(direct).toEqual([]);
		const notTold = channel.map((m) => m.fields.find((f) => f.name === 'Not told')?.value);
		expect(notTold).toEqual([
			'the student (no Discord ID), teacher QX (no Discord ID)',
			'the student (chose email)'
		]);
	});
});

describe('processRosterRemovals: the first run', () => {
	const LONG_AGO = new Date(NOW.getTime() - 40 * DAY);

	it('removes and closes requests whose student left more than 30 days ago, with one summary and no DMs', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LONG_AGO, removedAt: LONG_AGO });
		await addMember({ cid: '1000002', leftHomeAt: LONG_AGO, membership: 'visit' });
		await addMember({ cid: '1000003', leftHomeAt: LEFT, removedAt: LEFT });
		await addRequest({ id: 'a', cid: '1000001', jiraIssueKey: 'TRK-1' });
		await addRequest({ id: 'b', cid: '1000002', status: 'in-training', teacher: 'QX' });
		await addRequest({ id: 'c', cid: '1000003' });
		const jira = fakeJira({ 'TRK-1': { status: 'Waitlist', updated: updatedAt } });
		const { env, channel, direct } = fakeLarry();

		const result = await processRosterRemovals(db, env, NOW);

		expect(result).toMatchObject({ firstRun: true, removed: 3, closed: 2 });
		expect(jira.comments()).toHaveLength(1);

		for (const id of ['a', 'b']) {
			const closed = await row(id);
			expect(closed.status).toBe('removed');
			expect(closed.restoreClosedAt).toEqual(NOW);
			expect(closed.restoreClosedReason).toBe('expired');
		}
		expect(await getOpenEnrollment(db, '1000001')).toBeNull();
		expect((await row('c')).restoreClosedAt).toBeNull();

		// The recent one is told as usual; the old ones only in the summary.
		expect(direct.map((m) => m.userId)).toEqual(['90000000000001000003']);
		expect(channel.map((m) => m.title)).toEqual([
			'Left the home roster: Jo Rivera',
			'Closed 2 requests from students who left the home roster'
		]);
	});

	it('happens once: a later pass treats an old departure like any other', async () => {
		const { env, channel, direct } = fakeLarry();
		await processRosterRemovals(db, env, NOW);

		await addMember({ cid: '1000001', leftHomeAt: LONG_AGO, removedAt: LONG_AGO });
		await addRequest({ id: 'a', cid: '1000001' });
		await processRosterRemovals(db, env, NOW);

		expect((await row('a')).restoreClosedAt).toBeNull();
		expect(channel.map((m) => m.title)).toEqual(['Left the home roster: Jo Rivera']);
		expect(direct).toHaveLength(1);
	});

	it('is not over until a pass has removed everything due', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LONG_AGO, removedAt: LONG_AGO });
		await addRequest({ id: 'a', cid: '1000001', jiraIssueKey: 'TRK-1' });
		fakeJira({ 'TRK-1': { status: 'Waitlist', updated: updatedAt } }, { refuse: true });
		const { env } = fakeLarry();

		expect(await processRosterRemovals(db, env, NOW)).toMatchObject({ firstRun: true });

		fakeJira({ 'TRK-1': { status: 'Waitlist', updated: updatedAt } });
		expect(await processRosterRemovals(db, env, NOW)).toMatchObject({ firstRun: true, closed: 1 });
		expect(await processRosterRemovals(db, env, NOW)).toMatchObject({ firstRun: false });
	});

	// A pass takes 25. The rest are still the first run's, not a later pass's.
	it('is not over while old departures wait beyond one pass', async () => {
		for (let i = 1; i <= 26; i += 1) {
			const cid = String(1000000 + i);
			await addMember({ cid, leftHomeAt: LONG_AGO, removedAt: LONG_AGO });
			await addRequest({ id: `r${i}`, cid, createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)) });
		}
		const { env, channel, direct } = fakeLarry();

		expect(await processRosterRemovals(db, env, NOW)).toMatchObject({
			firstRun: true,
			due: 26,
			closed: 25,
			deferred: 1
		});
		expect(await processRosterRemovals(db, env, NOW)).toMatchObject({
			firstRun: true,
			closed: 1,
			deferred: 0
		});
		expect(await processRosterRemovals(db, env, NOW)).toMatchObject({ firstRun: false });

		const last = await row('r26');
		expect(last.restoreClosedReason).toBe('expired');
		expect(direct).toEqual([]);
		expect(channel.map((m) => m.title)).toEqual([
			'Closed 25 requests from students who left the home roster',
			'Closed 1 request from students who left the home roster'
		]);
	});
});

describe('unfiled requests removed here', () => {
	beforeEach(async () => {
		await addRequest({
			id: 'a',
			cid: '1000001',
			status: 'removed',
			rosterRemovedAt: LEFT,
			rosterRemovedFrom: 'waitlist',
			leftHomeAt: LEFT,
			restoreBy: new Date(LEFT.getTime() + 30 * DAY)
		});
	});

	it('are not listed as unfiled on /admin', async () => {
		expect(await getUnfiledEnrollments(db)).toEqual([]);
	});

	it('cannot be filed by Retry, in the window or after it closed', async () => {
		const jira = fakeJira({});
		const { env } = fakeLarry();

		expect(await retryFiling(db, env, 'a')).toBe('not-unfiled');

		await db
			.update(enrollmentsTable)
			.set({ restoreClosedAt: NOW, restoreClosedReason: 'expired' })
			.where(eq(enrollmentsTable.id, 'a'));
		expect(await retryFiling(db, env, 'a')).toBe('not-unfiled');
		expect(jira.calls).toEqual([]);
	});
});
