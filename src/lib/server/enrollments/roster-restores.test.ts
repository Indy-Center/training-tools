import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import {
	enrollmentsTable,
	type InsertEnrollment,
	type RosterRemovableStatus
} from '$lib/db/schema/enrollments';
import { rosterMembersTable, type InsertRosterMember } from '$lib/db/schema/roster';
import { teachersTable } from '$lib/db/schema/teachers';
import type { VatusaRosterMember } from '$lib/types/vatusa';
import { JIRA_FIELDS } from '$lib/server/jira/fields';
import { RE_INSTRUCTOR_FIELD, TEACHER_FIELD } from '$lib/server/jira/status';
import { announceArrivals } from './announce';
import { getOpenEnrollment, getWaitlistPosition } from './index';
import { processRosterRemovals } from './roster-removals';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-25T12:00:00Z');
const LEFT = new Date('2026-10-20T15:00:00Z');
const REMOVED_AT = new Date('2026-10-21T16:00:00Z');
const RESTORE_BY = new Date(LEFT.getTime() + 30 * DAY);
const CREATED = new Date('2026-09-01T00:00:00Z');

let db: Database;

beforeEach(async () => {
	db = testDb();
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	// Not the first run: old windows are not this ticket's concern.
	await processRosterRemovals(db, undefined, NOW);
	// Initials no seeded teacher holds.
	await db.insert(teachersTable).values([
		{ cid: '2000001', roles: ['MTR'], initials: 'QX' },
		{ cid: '2000002', roles: ['INS'], initials: 'QZ' }
	]);
	await addMember({ cid: '2000001', firstName: 'Sam', lastName: 'Wells' });
	await addMember({ cid: '2000002', firstName: 'Hal', lastName: 'Ito' });
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

/** A request the roster removals job took off, still in its window. */
async function addRemoved(
	overrides: Partial<InsertEnrollment> & { id: string; cid: string; from: RosterRemovableStatus }
) {
	const { from, ...rest } = overrides;
	await db.insert(enrollmentsTable).values({
		course: 'S-LC',
		status: 'removed',
		submittedName: 'Jo Rivera',
		notificationPreference: 'discord',
		createdAt: CREATED,
		jiraIssueKey: `TRK-${overrides.id}`,
		rosterRemovedAt: REMOVED_AT,
		rosterRemovedFrom: from,
		leftHomeAt: LEFT,
		restoreBy: RESTORE_BY,
		announcedStatus: 'removed',
		...rest
	});
}

const row = async (id: string) =>
	(await db.query.enrollmentsTable.findFirst({ where: eq(enrollmentsTable.id, id) }))!;

type Card = { status: string; teacher?: string | null; reInstructor?: string | null };

const TARGETS = ['Waitlist', 'In Training', 'Rating Exam', 'Needs CATP', 'Withdrawn', 'Removed'];

/**
 * TRK, as far as a restore touches it. A card at Removed offers the three
 * `Restore to …` transitions plus Needs CATP and Withdrawn, unless `refuse`.
 */
function fakeJira(cards: Record<string, Card>, options: { refuse?: boolean } = {}) {
	const calls: { method: string; path: string; body: any }[] = [];
	let clock = new Date('2026-10-22T00:00:00Z').getTime();

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
				// From Removed, the way back (ticket 02); from anywhere else, Removed.
				const offered =
					card.status === 'Removed'
						? options.refuse
							? []
							: TARGETS.filter((name) => name !== 'Removed')
						: ['Removed'];
				return Response.json({
					transitions: offered.map((name) => ({
						id: String(100 + TARGETS.indexOf(name)),
						name: ['Waitlist', 'In Training', 'Rating Exam'].includes(name)
							? `Restore to ${name}`
							: name,
						to: { id: String(TARGETS.indexOf(name)), name }
					}))
				});
			}
			if (rest === '/transitions') {
				card.status = TARGETS[Number(body.transition.id) - 100];
				clock += 60_000;
				return new Response(null, { status: 204 });
			}
			if (init.method === 'PUT') {
				if (TEACHER_FIELD in body.fields) card.teacher = body.fields[TEACHER_FIELD];
				clock += 60_000;
				return new Response(null, { status: 204 });
			}
			return Response.json({
				key,
				fields: {
					status: { name: card.status },
					[TEACHER_FIELD]: card.teacher ? { value: card.teacher } : null,
					[RE_INSTRUCTOR_FIELD]: card.reInstructor ? { value: card.reInstructor } : null,
					updated: new Date(clock).toISOString()
				}
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
	const edits = () =>
		calls
			.filter((call) => call.method === 'PUT')
			.map((call) => ({ issue: call.path.split('/')[2], fields: call.body.fields }));
	const moves = () =>
		calls.filter((call) => call.path.endsWith('/transitions') && call.method === 'POST');

	return { calls, comments, edits, moves };
}

/** Larry, collecting what would have been sent. */
function fakeLarry() {
	const channel: {
		title: string;
		description: string;
		fields: { name: string; value: string }[];
	}[] = [];
	const direct: { userId: string; title: string; description: string }[] = [];
	const posted: string[] = [];
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
			},
			send: async (message: any) => {
				posted.push(message.embeds[0].title);
				return { messageId: `m${posted.length}` };
			},
			enqueueEdit: async () => {},
			enqueueDelete: async () => {}
		}
	} as unknown as Partial<Env>;
	return { env, channel, direct, posted };
}

const STAGES = [
	['waitlist', 'Waitlist'],
	['in-training', 'In Training'],
	['rating-exam', 'Rating Exam'],
	['needs-catp', 'Needs CATP']
] as const;

describe('processRosterRemovals: restore a student back on the home roster', () => {
	for (const [stage, trk] of STAGES) {
		it(`restores a request removed from ${trk} to ${trk}, at its old place`, async () => {
			await addMember({ cid: '1000001' });
			await addRemoved({
				id: 'a',
				cid: '1000001',
				from: stage,
				teacher: stage === 'waitlist' ? null : 'QX',
				reInstructor: stage === 'rating-exam' ? 'QZ' : null
			});
			const jira = fakeJira({
				'TRK-a': {
					status: 'Removed',
					teacher: stage === 'waitlist' ? null : 'QX',
					reInstructor: stage === 'rating-exam' ? 'QZ' : null
				}
			});

			const result = await processRosterRemovals(db, fakeLarry().env, NOW);

			expect(result).toMatchObject({ restored: 1, restoreRefused: 0 });
			expect(jira.moves().map((m) => m.body.transition.id)).toHaveLength(1);
			// The Removed date cleared, and the Teacher left as it was. (The read-back
			// dates a move into In Training if the card has no Teacher Assigned.)
			const edits = jira.edits();
			expect(edits[0]).toEqual({ issue: 'TRK-a', fields: { [JIRA_FIELDS.removed]: null } });
			expect(edits.some((edit) => TEACHER_FIELD in edit.fields)).toBe(false);
			expect(jira.comments()).toEqual([
				{ issue: 'TRK-a', text: `Back on the ZID home roster. Restored to ${trk}.` }
			]);

			const restored = await row('a');
			expect(restored.status).toBe(stage);
			expect(restored.createdAt).toEqual(CREATED);
			expect(restored.rosterRemovedAt).toBeNull();
			expect(restored.rosterRemovedFrom).toBeNull();
			expect(restored.leftHomeAt).toBeNull();
			expect(restored.restoreBy).toBeNull();
			expect(restored.restoreClosedAt).toBeNull();
			expect(restored.keptInLineAt).toBeNull();
			expect(restored.announcedStatus).toBe(stage);
		});
	}

	it('puts the student back at their old place in "N ahead of you"', async () => {
		await addMember({ cid: '1000001' });
		await addMember({ cid: '1000002' });
		await addRemoved({ id: 'a', cid: '1000001', from: 'waitlist' });
		await db.insert(enrollmentsTable).values({
			id: 'b',
			cid: '1000002',
			course: 'S-LC',
			submittedName: 'Sam Lee',
			createdAt: new Date('2026-09-05T00:00:00Z')
		});
		fakeJira({ 'TRK-a': { status: 'Removed' } });

		const behind = await row('b');
		expect(await getWaitlistPosition(db, behind)).toEqual({ ahead: 0, waiting: 1 });

		await processRosterRemovals(db, fakeLarry().env, NOW);

		expect(await getWaitlistPosition(db, behind)).toEqual({ ahead: 1, waiting: 2 });
		expect(await getWaitlistPosition(db, await row('a'))).toEqual({ ahead: 0, waiting: 2 });
	});

	for (const [why, change] of [
		['removed from the teacher roster', { removedAt: LEFT }],
		['on LOA', { status: 'loa' as const }]
	] as const) {
		it(`restores In Training to Waitlist, Teacher cleared first, when the teacher is ${why}`, async () => {
			await db.update(teachersTable).set(change).where(eq(teachersTable.cid, '2000001'));
			await addMember({ cid: '1000001' });
			await addRemoved({ id: 'a', cid: '1000001', from: 'in-training', teacher: 'QX' });
			const jira = fakeJira({ 'TRK-a': { status: 'Removed', teacher: 'QX' } });
			const { env, channel, direct } = fakeLarry();

			await processRosterRemovals(db, env, NOW);

			// The Teacher edit comes before the move.
			const order = jira.calls
				.filter(
					(c) => c.method === 'PUT' || (c.method === 'POST' && c.path.endsWith('/transitions'))
				)
				.map((c) => (c.method === 'PUT' ? Object.keys(c.body.fields)[0] : 'move'));
			expect(order).toEqual([TEACHER_FIELD, 'move', JIRA_FIELDS.removed]);
			expect(jira.comments()[0].text).toBe('Back on the ZID home roster. Restored to Waitlist.');

			const restored = await row('a');
			expect(restored.status).toBe('waitlist');
			expect(restored.teacher).toBeNull();
			expect(restored.announcedStatus).toBe('waitlist');

			// The old teacher is not told; the admins hear the teacher was cleared.
			expect(direct.map((m) => m.title)).toEqual(['Your training request is back']);
			expect(channel[0].fields.find((f) => f.name === 'Teacher')?.value).toBe(
				'QX cleared: no longer an active teacher'
			);
		});
	}

	it('leaves a student still away, and a closed window, alone', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, membership: 'visit' });
		await addMember({ cid: '1000002' });
		await addRemoved({ id: 'a', cid: '1000001', from: 'waitlist' });
		await addRemoved({
			id: 'b',
			cid: '1000002',
			from: 'waitlist',
			restoreClosedAt: REMOVED_AT,
			restoreClosedReason: 'closed-by-admin'
		});
		const jira = fakeJira({ 'TRK-a': { status: 'Removed' }, 'TRK-b': { status: 'Removed' } });

		const result = await processRosterRemovals(db, fakeLarry().env, NOW);

		expect(result).toMatchObject({ restored: 0 });
		expect(jira.calls).toEqual([]);
		expect((await row('a')).status).toBe('removed');
		expect((await row('b')).status).toBe('removed');
	});

	it('restores an unfiled request here, without Jira', async () => {
		await addMember({ cid: '1000001' });
		await addRemoved({ id: 'a', cid: '1000001', from: 'waitlist', jiraIssueKey: null });
		const jira = fakeJira({});

		expect(await processRosterRemovals(db, fakeLarry().env, NOW)).toMatchObject({ restored: 1 });

		expect(jira.calls).toEqual([]);
		const restored = await row('a');
		expect(restored.status).toBe('waitlist');
		expect(restored.rosterRemovedAt).toBeNull();
	});
});

describe('processRosterRemovals: Jira refusing a restore', () => {
	it('leaves the row as it was, tells the admins once, and clears that once it goes through', async () => {
		await addMember({ cid: '1000001' });
		await addRemoved({ id: 'a', cid: '1000001', from: 'waitlist' });
		const { env, channel, direct } = fakeLarry();

		fakeJira({ 'TRK-a': { status: 'Removed' } }, { refuse: true });
		expect(await processRosterRemovals(db, env, NOW)).toMatchObject({
			restored: 0,
			restoreRefused: 1
		});
		await processRosterRemovals(db, env, new Date(NOW.getTime() + 10 * 60_000));

		const waiting = await row('a');
		expect(waiting.status).toBe('removed');
		expect(waiting.rosterRemovedAt).toEqual(REMOVED_AT);
		expect(waiting.rosterRemovedFrom).toBe('waitlist');
		expect(waiting.restoreBy).toEqual(RESTORE_BY);
		expect(waiting.restoreRefusalToldAt).toEqual(NOW);
		expect(channel.map((m) => m.title)).toEqual(['Restore waiting on the board: Jo Rivera']);
		expect(channel[0].fields.find((f) => f.name === 'Jira said')?.value).toContain(
			'No transition to "Waitlist"'
		);
		expect(direct).toEqual([]);

		fakeJira({ 'TRK-a': { status: 'Removed' } });
		expect(
			await processRosterRemovals(db, env, new Date(NOW.getTime() + 20 * 60_000))
		).toMatchObject({ restored: 1 });

		const restored = await row('a');
		expect(restored.status).toBe('waitlist');
		expect(restored.restoreRefusalToldAt).toBeNull();
		expect(channel.map((m) => m.title)).toEqual([
			'Restore waiting on the board: Jo Rivera',
			'Restored: Jo Rivera'
		]);
	});
});

describe('processRosterRemovals: a card that left Removed by another route', () => {
	it('finishes a card moved by hand to In Training while the student is away, and keeps it in line', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, removedAt: LEFT });
		await addRemoved({
			id: 'a',
			cid: '1000001',
			from: 'in-training',
			status: 'in-training',
			teacher: 'QX',
			announcedTeacher: 'QX'
		});
		const jira = fakeJira({ 'TRK-a': { status: 'In Training', teacher: 'QX' } });
		const { env, channel } = fakeLarry();

		const first = await processRosterRemovals(db, env, NOW);
		expect(first).toMatchObject({ finished: 1, removed: 0, due: 0 });

		const restored = await row('a');
		expect(restored.status).toBe('in-training');
		expect(restored.rosterRemovedAt).toBeNull();
		expect(restored.restoreBy).toBeNull();
		expect(restored.keptInLineAt).toEqual(NOW);
		expect(restored.keptInLineBy).toBeNull();
		expect(restored.announcedStatus).toBe('in-training');
		expect(restored.announcedTeacher).toBe('QX');
		expect(channel[0].description).toContain('kept in line');

		// Not removed again for this departure, and finished once.
		const later = await processRosterRemovals(db, env, new Date(NOW.getTime() + 2 * DAY));
		expect(later).toMatchObject({ finished: 0, due: 0, removed: 0 });
		expect(jira.calls).toEqual([]);
		expect(channel).toHaveLength(1);
		expect(await row('a')).toEqual(restored);
	});

	it('finishes a card a student is back for, without keeping it in line', async () => {
		await addMember({ cid: '1000001' });
		await addRemoved({ id: 'a', cid: '1000001', from: 'waitlist', status: 'waitlist' });
		fakeJira({});

		expect(await processRosterRemovals(db, fakeLarry().env, NOW)).toMatchObject({ finished: 1 });
		expect((await row('a')).keptInLineAt).toBeNull();
	});

	it('closes the window of a card moved by hand to Withdrawn, and never restores it', async () => {
		await addMember({ cid: '1000001' });
		await addRemoved({ id: 'a', cid: '1000001', from: 'waitlist', status: 'withdrawn' });
		const jira = fakeJira({ 'TRK-a': { status: 'Withdrawn' } });
		const { env, channel, direct } = fakeLarry();

		expect(await processRosterRemovals(db, env, NOW)).toMatchObject({
			closedOnBoard: 1,
			restored: 0
		});
		await processRosterRemovals(db, env, new Date(NOW.getTime() + DAY));

		const closed = await row('a');
		expect(closed.status).toBe('withdrawn');
		expect(closed.restoreClosedAt).toEqual(NOW);
		expect(closed.restoreClosedReason).toBe('moved-on-board');
		expect(jira.calls).toEqual([]);
		expect(channel).toEqual([]);
		expect(direct).toEqual([]);
	});

	it('closes the window at Needs CATP, unless that is where it was removed from', async () => {
		await addMember({ cid: '1000001', leftHomeAt: LEFT, removedAt: LEFT });
		await addMember({ cid: '1000002', leftHomeAt: LEFT, removedAt: LEFT });
		await addRemoved({ id: 'a', cid: '1000001', from: 'rating-exam', status: 'needs-catp' });
		await addRemoved({ id: 'b', cid: '1000002', from: 'needs-catp', status: 'needs-catp' });
		fakeJira({});

		expect(await processRosterRemovals(db, fakeLarry().env, NOW)).toMatchObject({
			finished: 1,
			closedOnBoard: 1
		});

		expect((await row('a')).restoreClosedReason).toBe('moved-on-board');
		const restored = await row('b');
		expect(restored.restoreClosedAt).toBeNull();
		expect(restored.rosterRemovedAt).toBeNull();
		expect(restored.keptInLineAt).toEqual(NOW);
	});
});

describe('processRosterRemovals: notices on restore', () => {
	it('tells the admins, the student, the teacher it was restored to and the examiner on the card', async () => {
		await addMember({ cid: '1000001' });
		await addRemoved({ id: 'a', cid: '1000001', from: 'in-training', teacher: 'QX' });
		await addMember({ cid: '1000003', firstName: 'Ana', lastName: 'Ruiz' });
		await addRemoved({
			id: 'b',
			cid: '1000003',
			from: 'rating-exam',
			teacher: 'QX',
			reInstructor: 'QZ',
			createdAt: new Date('2026-09-02T00:00:00Z')
		});
		fakeJira({
			'TRK-a': { status: 'Removed', teacher: 'QX' },
			'TRK-b': { status: 'Removed', teacher: 'QX', reInstructor: 'QZ' }
		});
		const { env, channel, direct } = fakeLarry();

		await processRosterRemovals(db, env, NOW);

		expect(channel.map((m) => m.title)).toEqual(['Restored: Jo Rivera', 'Restored: Ana Ruiz']);
		expect(direct.map((m) => [m.userId, m.title])).toEqual([
			['90000000000001000001', 'Your training request is back'],
			['90000000000002000001', 'Jo Rivera is back in training with you'],
			['90000000000001000003', 'Your training request is back'],
			['90000000000002000002', "Ana Ruiz's request is back"]
		]);
	});

	it('names a student who chose email, or has no Discord ID, as not told', async () => {
		await addMember({ cid: '1000001', discordId: null });
		await addMember({ cid: '1000003' });
		await addRemoved({ id: 'a', cid: '1000001', from: 'waitlist' });
		await addRemoved({
			id: 'b',
			cid: '1000003',
			from: 'waitlist',
			notificationPreference: 'email'
		});
		fakeJira({ 'TRK-a': { status: 'Removed' }, 'TRK-b': { status: 'Removed' } });
		const { env, channel, direct } = fakeLarry();

		await processRosterRemovals(db, env, NOW);

		expect(direct).toEqual([]);
		expect(channel.map((m) => m.fields.find((f) => f.name === 'Not told')?.value)).toEqual([
			'the student (no Discord ID)',
			'the student (chose email)'
		]);
	});
});

describe('after a restore, the announcements', () => {
	it('announce nothing for a restore to Needs CATP', async () => {
		await addMember({ cid: '1000001' });
		await addRemoved({ id: 'a', cid: '1000001', from: 'needs-catp' });
		fakeJira({ 'TRK-a': { status: 'Removed' } });
		const { env, channel, posted } = fakeLarry();

		await processRosterRemovals(db, env, NOW);
		channel.length = 0;
		await announceArrivals(db, env);

		expect(channel).toEqual([]);
		expect(posted).toEqual([]);
	});

	it('make a fresh exam post for an unclaimed Rating Exam', async () => {
		await addMember({ cid: '1000001' });
		await addRemoved({
			id: 'a',
			cid: '1000001',
			from: 'rating-exam',
			teacher: 'QX',
			examMessageId: 'old',
			examMessageStatus: 'waiting'
		});
		fakeJira({ 'TRK-a': { status: 'Removed', teacher: 'QX' } });
		const { env, posted } = fakeLarry();

		await processRosterRemovals(db, env, NOW);
		const restored = await row('a');
		expect(restored.examMessageId).toBeNull();
		expect(restored.examMessageStatus).toBeNull();

		await announceArrivals(db, env);

		expect(posted).toHaveLength(1);
		expect((await row('a')).examMessageId).toBe('m1');
	});

	it('make no post for a claimed Rating Exam', async () => {
		await addMember({ cid: '1000001' });
		await addRemoved({
			id: 'a',
			cid: '1000001',
			from: 'rating-exam',
			teacher: 'QX',
			reInstructor: 'QZ'
		});
		fakeJira({ 'TRK-a': { status: 'Removed', teacher: 'QX', reInstructor: 'QZ' } });
		const { env, posted } = fakeLarry();

		await processRosterRemovals(db, env, NOW);
		await announceArrivals(db, env);

		expect(posted).toEqual([]);
		expect((await row('a')).reInstructor).toBe('QZ');
	});
});

describe('a student who leaves again after a restore', () => {
	it('is removed again, with a new left_home_at and restore_by', async () => {
		await addMember({ cid: '1000001' });
		await addRemoved({ id: 'a', cid: '1000001', from: 'waitlist' });
		const jira = fakeJira({ 'TRK-a': { status: 'Removed' } });
		const { env } = fakeLarry();

		await processRosterRemovals(db, env, NOW);
		expect((await row('a')).status).toBe('waitlist');

		const leftAgain = new Date(NOW.getTime() + 3 * DAY);
		await db
			.update(rosterMembersTable)
			.set({ leftHomeAt: leftAgain, removedAt: leftAgain })
			.where(eq(rosterMembersTable.cid, '1000001'));

		const later = new Date(leftAgain.getTime() + DAY + 60_000);
		expect(await processRosterRemovals(db, env, later)).toMatchObject({ removed: 1 });
		expect(jira.moves()).toHaveLength(2);

		const again = await row('a');
		expect(again.status).toBe('removed');
		expect(again.rosterRemovedAt).toEqual(later);
		expect(again.leftHomeAt).toEqual(leftAgain);
		expect(again.restoreBy).toEqual(new Date(leftAgain.getTime() + 30 * DAY));
	});
});

describe('processRosterRemovals: expire a window that ran out', () => {
	const PAST = new Date(RESTORE_BY.getTime() + 1000);
	const BEFORE = new Date(RESTORE_BY.getTime() - 1000);

	beforeEach(async () => {
		await addMember({ cid: '1000001', membership: 'visit', leftHomeAt: LEFT });
	});

	it('closes a window one second past, tells the admins once, and leaves Jira and the student alone', async () => {
		await addRemoved({ id: 'a', cid: '1000001', from: 'waitlist' });
		const jira = fakeJira({ 'TRK-a': { status: 'Removed' } });
		const { env, channel, direct } = fakeLarry();

		expect(await processRosterRemovals(db, env, PAST)).toMatchObject({ expired: 1 });

		const closed = await row('a');
		expect(closed.restoreClosedAt).toEqual(PAST);
		expect(closed.restoreClosedReason).toBe('expired');
		expect(closed.status).toBe('removed');
		expect(jira.calls).toEqual([]);
		expect(direct).toEqual([]);
		expect(channel).toHaveLength(1);
		expect(channel[0].description).toBe(
			'Jo Rivera (1000001) did not return to the ZID home roster by November 19, 2026; their Simple Local Control (S-LC) request is closed for good.'
		);

		const later = new Date(PAST.getTime() + 10 * 60_000);
		expect(await processRosterRemovals(db, env, later)).toMatchObject({ expired: 0 });
		expect(channel).toHaveLength(1);
		expect((await row('a')).restoreClosedAt).toEqual(PAST);
	});

	it('leaves a window one second before open', async () => {
		await addRemoved({ id: 'a', cid: '1000001', from: 'waitlist' });
		fakeJira({ 'TRK-a': { status: 'Removed' } });
		const { env, channel } = fakeLarry();

		expect(await processRosterRemovals(db, env, BEFORE)).toMatchObject({ expired: 0 });

		expect((await row('a')).restoreClosedAt).toBeNull();
		expect(channel).toEqual([]);
	});

	it('restores a student who is back on the pass restore_by passes, rather than expiring them', async () => {
		await db
			.update(rosterMembersTable)
			.set({ membership: 'home', leftHomeAt: null })
			.where(eq(rosterMembersTable.cid, '1000001'));
		await addRemoved({ id: 'a', cid: '1000001', from: 'waitlist' });
		fakeJira({ 'TRK-a': { status: 'Removed' } });
		const { env, channel } = fakeLarry();

		expect(await processRosterRemovals(db, env, PAST)).toMatchObject({ restored: 1, expired: 0 });

		const restored = await row('a');
		expect(restored.status).toBe('waitlist');
		expect(restored.restoreClosedAt).toBeNull();
		expect(channel.map((m) => m.title)).toEqual(['Restored: Jo Rivera']);
	});

	it('lets the student enroll again, at the back of the line', async () => {
		await addMember({ cid: '1000003' });
		await addRemoved({ id: 'a', cid: '1000001', from: 'waitlist' });
		await db.insert(enrollmentsTable).values({
			id: 'w',
			cid: '1000003',
			course: 'S-LC',
			submittedName: 'Ana Ruiz',
			createdAt: new Date('2026-09-10T00:00:00Z')
		});
		fakeJira({ 'TRK-a': { status: 'Removed' } });
		expect((await getOpenEnrollment(db, '1000001'))?.id).toBe('a');

		await processRosterRemovals(db, fakeLarry().env, PAST);

		expect(await getOpenEnrollment(db, '1000001')).toBeNull();
		await db.insert(enrollmentsTable).values({
			id: 'n',
			cid: '1000001',
			course: 'S-LC',
			submittedName: 'Jo Rivera',
			createdAt: PAST
		});
		expect(await getWaitlistPosition(db, await row('n'))).toEqual({ ahead: 1, waiting: 2 });
	});

	it('never removes or restores a closed request again', async () => {
		await addRemoved({ id: 'a', cid: '1000001', from: 'waitlist' });
		const jira = fakeJira({ 'TRK-a': { status: 'Removed' } });
		await processRosterRemovals(db, fakeLarry().env, PAST);
		await db
			.update(rosterMembersTable)
			.set({ membership: 'home', leftHomeAt: null })
			.where(eq(rosterMembersTable.cid, '1000001'));

		await processRosterRemovals(db, fakeLarry().env, new Date(PAST.getTime() + DAY));

		expect(jira.calls).toEqual([]);
		expect((await row('a')).status).toBe('removed');
	});
});

describe('processRosterRemovals: clear kept in line for a student back home', () => {
	const KEPT = new Date('2026-10-10T00:00:00Z');

	async function addKept(id: string, cid: string, overrides: Partial<InsertEnrollment> = {}) {
		await db.insert(enrollmentsTable).values({
			id,
			cid,
			course: 'S-LC',
			status: 'waitlist',
			submittedName: 'Jo Rivera',
			createdAt: CREATED,
			keptInLineAt: KEPT,
			keptInLineBy: '1999999',
			...overrides
		});
	}

	it('clears it on the next pass, and the student is then removed after 24 hours away', async () => {
		await addMember({ cid: '1000001' });
		await addKept('a', '1000001');

		expect(await processRosterRemovals(db, undefined, NOW)).toMatchObject({
			keptInLineCleared: 1
		});
		const cleared = await row('a');
		expect(cleared.keptInLineAt).toBeNull();
		expect(cleared.keptInLineBy).toBeNull();

		// Away again: the exemption is gone, so 24 hours later the request comes off.
		const leftAgain = new Date(NOW.getTime() + DAY);
		await db
			.update(rosterMembersTable)
			.set({ membership: 'visit', leftHomeAt: leftAgain })
			.where(eq(rosterMembersTable.cid, '1000001'));
		const later = new Date(leftAgain.getTime() + DAY + 60_000);
		expect(await processRosterRemovals(db, undefined, later)).toMatchObject({
			keptInLineCleared: 0,
			due: 1,
			removed: 1
		});
		expect((await row('a')).rosterRemovedAt).toEqual(later);
	});

	it('leaves it kept while the student is still away', async () => {
		await addMember({ cid: '1000001', membership: 'visit', leftHomeAt: LEFT });
		await addKept('a', '1000001');

		expect(await processRosterRemovals(db, undefined, NOW)).toMatchObject({
			keptInLineCleared: 0
		});

		const kept = await row('a');
		expect(kept.keptInLineAt).toEqual(KEPT);
		expect(kept.keptInLineBy).toBe('1999999');
	});

	it('clears one the board kept (no admin) and leaves a closed request alone', async () => {
		await addMember({ cid: '1000001' });
		await addMember({ cid: '1000003' });
		await addKept('a', '1000001', { keptInLineBy: null });
		await addKept('b', '1000003', { status: 'withdrawn', withdrawnAt: KEPT });

		expect(await processRosterRemovals(db, undefined, NOW)).toMatchObject({
			keptInLineCleared: 1
		});

		expect((await row('a')).keptInLineAt).toBeNull();
		expect((await row('b')).keptInLineAt).toEqual(KEPT);
	});
});
