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
import { RE_INSTRUCTOR_FIELD, TEACHER_FIELD } from '$lib/server/jira/status';
import { processRosterRemovals } from '$lib/server/enrollments/roster-removals';
import { actions, load } from './+page.server';

/**
 * `/waitlist`'s **Left the roster** group and its four actions: Restore now,
 * Close for good, Keep in line and Stop keeping in line. The load and the
 * actions run against the in-memory D1, with TRK and Larry faked, and the
 * `roster removals` job is run after them to see what the next pass does.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-10-25T12:00:00Z');
const LEFT = new Date('2026-10-20T15:00:00Z');
const REMOVED_AT = new Date('2026-10-21T16:00:00Z');
const RESTORE_BY = new Date(LEFT.getTime() + 30 * DAY);
const CREATED = new Date('2026-09-01T00:00:00Z');

const ADMIN_CID = '3000001';

let db: Database;

beforeEach(async () => {
	db = testDb();
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	// Not the first run: old windows are not what is tested here.
	await processRosterRemovals(db, undefined, NOW);
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
	// Initials no seeded teacher holds.
	await db.insert(teachersTable).values([{ cid: '2000001', roles: ['MTR'], initials: 'QX' }]);
	await addMember({ cid: '2000001', firstName: 'Sam', lastName: 'Wells' });
	await addMember({ cid: ADMIN_CID, firstName: 'Pat', lastName: 'Admin' });
});

afterEach(() => {
	vi.useRealTimers();
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

/** An open request, not removed. */
async function addOpen(overrides: Partial<InsertEnrollment> & { id: string; cid: string }) {
	await db.insert(enrollmentsTable).values({
		course: 'S-LC',
		status: 'waitlist',
		submittedName: 'Jo Rivera',
		notificationPreference: 'discord',
		createdAt: CREATED,
		jiraIssueKey: `TRK-${overrides.id}`,
		announcedStatus: 'waitlist',
		...overrides
	});
}

const row = async (id: string) =>
	(await db.query.enrollmentsTable.findFirst({ where: eq(enrollmentsTable.id, id) }))!;

type Card = { status: string; teacher?: string | null; reInstructor?: string | null };

const TARGETS = ['Waitlist', 'In Training', 'Rating Exam', 'Needs CATP', 'Withdrawn', 'Removed'];

/**
 * TRK, as far as these actions touch it. A card at Removed offers the way back
 * (ticket 02's transitions) unless `refuse`; a card anywhere else offers Removed.
 * `beforeTransitions` runs as the transitions are asked for: another admin
 * acting in between.
 */
function fakeJira(
	cards: Record<string, Card>,
	options: { refuse?: boolean; beforeTransitions?: () => Promise<void> } = {}
) {
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
				await options.beforeTransitions?.();
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
	return { calls, comments };
}

/** Larry, collecting what would have been sent. */
function fakeLarry() {
	const channel: { title: string; description: string }[] = [];
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
			},
			send: async () => ({ messageId: 'm1' }),
			enqueueEdit: async () => {},
			enqueueDelete: async () => {}
		}
	} as unknown as Env;
	return { env, channel, direct };
}

const ADMIN = ['training:students:manage'];

function locals(roles: string[]) {
	return {
		db,
		session: {
			roles,
			user: {
				cid: roles.length ? ADMIN_CID : '1000009',
				attributes: { preferredName: roles.length ? 'Pat Admin' : 'Sid Student' },
				vatsimData: { personal: {} }
			}
		}
	} as unknown as App.Locals;
}

const loadAs = async (roles: string[], env: Record<string, string> = {}) =>
	(await load({ locals: locals(roles), platform: { env } } as unknown as Parameters<
		typeof load
	>[0])) as any;

/** POST to one of the sheet's actions, as the form would. */
async function post(
	action: keyof typeof actions,
	id: string,
	env: Partial<Env> = {},
	roles = ADMIN
): Promise<any> {
	const body = new FormData();
	body.set('id', id);
	return actions[action]!({
		locals: locals(roles),
		platform: { env },
		request: new Request(`http://localhost/waitlist?/${action}`, { method: 'POST', body })
	} as unknown as Parameters<NonNullable<(typeof actions)[typeof action]>>[0]);
}

describe('/waitlist: the Left the roster group', () => {
	it('lists every request in its window to an admin, soonest restore_by first', async () => {
		await addMember({ cid: '1000001', membership: 'visit', leftHomeAt: LEFT });
		await addMember({
			cid: '1000002',
			firstName: 'Ana',
			lastName: 'Lind',
			removedAt: NOW,
			leftHomeAt: new Date(LEFT.getTime() - 3 * DAY)
		});
		await addRemoved({ id: 'later', cid: '1000001', from: 'in-training', teacher: 'QX' });
		await addRemoved({
			id: 'sooner',
			cid: '1000002',
			from: 'waitlist',
			leftHomeAt: new Date(LEFT.getTime() - 3 * DAY),
			restoreBy: new Date(RESTORE_BY.getTime() - 3 * DAY)
		});
		// Closed windows are not listed.
		await addRemoved({
			id: 'closed',
			cid: '1000001',
			from: 'waitlist',
			restoreClosedAt: NOW,
			restoreClosedReason: 'expired'
		});

		const data = await loadAs(ADMIN, { JIRA_BASE_URL: 'https://jira.test' });

		expect(data.sheet.leftTheRoster).toEqual([
			{
				id: 'sooner',
				cid: '1000002',
				name: 'Ana Lind',
				course: 'S-LC',
				courseName: 'Simple Local Control',
				from: 'waitlist',
				teacher: null,
				leftHomeOn: '2026-10-17',
				restoreBy: '2026-11-16',
				issueKey: 'TRK-sooner',
				issueUrl: 'https://jira.test/browse/TRK-sooner'
			},
			{
				id: 'later',
				cid: '1000001',
				name: 'Jo Rivera',
				course: 'S-LC',
				courseName: 'Simple Local Control',
				from: 'in-training',
				teacher: 'Sam Wells (QX)',
				leftHomeOn: '2026-10-20',
				restoreBy: '2026-11-19',
				issueKey: 'TRK-later',
				issueUrl: 'https://jira.test/browse/TRK-later'
			}
		]);
	});

	it('is empty when nobody is in a window', async () => {
		const data = await loadAs(ADMIN);
		expect(data.sheet.leftTheRoster).toEqual([]);
	});

	it('is not loaded for a signed-in student', async () => {
		await addMember({ cid: '1000001', membership: 'visit', leftHomeAt: LEFT });
		await addRemoved({ id: 'r1', cid: '1000001', from: 'waitlist' });
		const data = await loadAs([]);
		expect(data.sheet).toBeNull();
	});

	it('marks who may be kept in line on the sheet, and who keeps them', async () => {
		// Off the home roster for 2 hours: not removed yet.
		await addMember({
			cid: '1000001',
			membership: 'visit',
			leftHomeAt: new Date(NOW.getTime() - 2 * HOUR)
		});
		await addMember({ cid: '1000002', membership: 'visit', leftHomeAt: LEFT });
		await addMember({ cid: '1000003', membership: 'visit', leftHomeAt: LEFT });
		await addMember({ cid: '1000004' });
		await addOpen({ id: 'away', cid: '1000001' });
		await addOpen({ id: 'kept', cid: '1000002', keptInLineAt: LEFT, keptInLineBy: ADMIN_CID });
		await addOpen({ id: 'board', cid: '1000003', keptInLineAt: LEFT, keptInLineBy: null });
		await addOpen({ id: 'home', cid: '1000004' });

		const data = await loadAs(ADMIN);
		const byId = Object.fromEntries(
			data.sheet.rows.map((r: any) => [
				r.id,
				{ mayKeepInLine: r.mayKeepInLine, keptInLineBy: r.keptInLineBy }
			])
		);
		expect(byId).toEqual({
			away: { mayKeepInLine: true, keptInLineBy: null },
			kept: { mayKeepInLine: false, keptInLineBy: 'Pat Admin' },
			board: { mayKeepInLine: false, keptInLineBy: 'the board' },
			home: { mayKeepInLine: false, keptInLineBy: null }
		});
	});
});

const GONE_FROM_WINDOW = 'This request is no longer waiting to be restored.';

describe('/waitlist: the actions are for admins only', () => {
	it("refuses a signed-in student each action's POST, and changes nothing", async () => {
		await addMember({ cid: '1000001', membership: 'visit', leftHomeAt: LEFT });
		await addRemoved({ id: 'r1', cid: '1000001', from: 'waitlist' });
		await addMember({
			cid: '1000002',
			membership: 'visit',
			leftHomeAt: new Date(NOW.getTime() - 2 * HOUR)
		});
		await addOpen({ id: 'o1', cid: '1000002' });
		const before = [await row('r1'), await row('o1')];
		const { env } = fakeLarry();

		for (const [action, id] of [
			['restoreNow', 'r1'],
			['closeForGood', 'r1'],
			['keepInLine', 'o1'],
			['stopKeepingInLine', 'o1']
		] as const) {
			await expect(post(action, id, env, [])).rejects.toMatchObject({ status: 303 });
		}
		expect([await row('r1'), await row('o1')]).toEqual(before);
	});
});

describe('/waitlist ?/restoreNow', () => {
	it('restores a request whose student is back to its stage, with the usual comment', async () => {
		await addMember({ cid: '1000001' });
		await addRemoved({ id: 'r1', cid: '1000001', from: 'waitlist' });
		const jira = fakeJira({ 'TRK-r1': { status: 'Removed' } });
		const { env, channel } = fakeLarry();

		const result = await post('restoreNow', 'r1', env);

		expect(result).toEqual({ sheetDone: 'Jo Rivera restored to Waitlist.' });
		const restored = await row('r1');
		expect(restored.status).toBe('waitlist');
		expect(restored.rosterRemovedAt).toBeNull();
		expect(restored.keptInLineAt).toBeNull();
		expect(restored.createdAt).toEqual(CREATED);
		expect(jira.comments()).toEqual([
			{ issue: 'TRK-r1', text: 'Back on the ZID home roster. Restored to Waitlist.' }
		]);
		expect(channel.map((notice) => notice.title)).toEqual(['Restored: Jo Rivera']);
	});

	it('restores a student still away, kept in line by this admin, and the next pass leaves it', async () => {
		await addMember({ cid: '1000001', membership: 'visit', leftHomeAt: LEFT });
		await addRemoved({ id: 'r1', cid: '1000001', from: 'in-training', teacher: 'QX' });
		const jira = fakeJira({ 'TRK-r1': { status: 'Removed', teacher: 'QX' } });
		const { env } = fakeLarry();

		const result = await post('restoreNow', 'r1', env);

		expect(result).toEqual({
			sheetDone:
				'Jo Rivera restored to In Training, and kept in line while they are off the home roster.'
		});
		const restored = await row('r1');
		expect(restored.status).toBe('in-training');
		expect(restored.rosterRemovedAt).toBeNull();
		expect(restored.keptInLineAt).toEqual(NOW);
		expect(restored.keptInLineBy).toBe(ADMIN_CID);
		expect(jira.comments()).toEqual([
			{
				issue: 'TRK-r1',
				text: 'Restored to In Training by Pat Admin, while still off the ZID home roster.'
			}
		]);

		await processRosterRemovals(db, env, new Date(NOW.getTime() + 2 * DAY));
		const after = await row('r1');
		expect(after.status).toBe('in-training');
		expect(after.rosterRemovedAt).toBeNull();
		expect(after.keptInLineBy).toBe(ADMIN_CID);
	});

	it("shows TRK's refusal, and leaves the row as it was", async () => {
		await addMember({ cid: '1000001' });
		await addRemoved({ id: 'r1', cid: '1000001', from: 'waitlist' });
		fakeJira({ 'TRK-r1': { status: 'Removed' } }, { refuse: true });
		const { env, channel } = fakeLarry();
		const before = await row('r1');

		const result = await post('restoreNow', 'r1', env);

		expect(result.status).toBe(502);
		expect(result.data).toEqual({
			sheetError:
				'TRK refused "Restore to Waitlist": No transition "Restore to Waitlist" from TRK-r1\'s current status. Available: (none). Has the transition been added to the board?'
		});
		expect(await row('r1')).toEqual(before);
		expect(channel).toEqual([]);
	});

	it('refuses a request no longer in its window', async () => {
		await addMember({ cid: '1000001', membership: 'visit', leftHomeAt: LEFT });
		await addRemoved({
			id: 'r1',
			cid: '1000001',
			from: 'waitlist',
			restoreClosedAt: NOW,
			restoreClosedReason: 'expired'
		});
		const jira = fakeJira({ 'TRK-r1': { status: 'Removed' } });
		const { env } = fakeLarry();

		const result = await post('restoreNow', 'r1', env);

		expect(result.status).toBe(409);
		expect(result.data).toEqual({ sheetError: GONE_FROM_WINDOW });
		expect(jira.calls).toEqual([]);
	});

	it('tells the second of two admins pressing at once that it is no longer waiting', async () => {
		await addMember({ cid: '1000001' });
		await addRemoved({ id: 'r1', cid: '1000001', from: 'waitlist' });
		// The first admin's restore lands between this one's read and its move:
		// the card is at Waitlist, so TRK offers no way there, and the row is done.
		fakeJira(
			{ 'TRK-r1': { status: 'Waitlist' } },
			{
				beforeTransitions: async () => {
					await db
						.update(enrollmentsTable)
						.set({
							status: 'waitlist',
							rosterRemovedAt: null,
							rosterRemovedFrom: null,
							leftHomeAt: null,
							restoreBy: null
						})
						.where(eq(enrollmentsTable.id, 'r1'));
				}
			}
		);
		const { env, channel } = fakeLarry();

		const result = await post('restoreNow', 'r1', env);

		expect(result.status).toBe(409);
		expect(result.data).toEqual({ sheetError: GONE_FROM_WINDOW });
		expect(channel).toEqual([]);
	});
});

describe('/waitlist ?/closeForGood', () => {
	it('closes the window closed-by-admin without touching Jira, and tells the admins', async () => {
		await addMember({ cid: '1000001', membership: 'visit', leftHomeAt: LEFT });
		await addRemoved({ id: 'r1', cid: '1000001', from: 'waitlist' });
		const jira = fakeJira({ 'TRK-r1': { status: 'Removed' } });
		const { env, channel, direct } = fakeLarry();

		const result = await post('closeForGood', 'r1', env);

		expect(result).toEqual({ sheetDone: "Jo Rivera's request closed for good." });
		const closed = await row('r1');
		expect(closed.restoreClosedAt).toEqual(NOW);
		expect(closed.restoreClosedReason).toBe('closed-by-admin');
		expect(closed.status).toBe('removed');
		expect(jira.calls).toEqual([]);
		expect(direct).toEqual([]);
		expect(channel).toEqual([
			expect.objectContaining({
				title: 'Request closed: Jo Rivera',
				description:
					'Jo Rivera (1000001) did not return to the ZID home roster by November 19, 2026; their Simple Local Control (S-LC) request is closed for good, closed by Pat Admin.'
			})
		]);
	});

	it('refuses a second POST: no longer waiting to be restored', async () => {
		await addMember({ cid: '1000001', membership: 'visit', leftHomeAt: LEFT });
		await addRemoved({ id: 'r1', cid: '1000001', from: 'waitlist' });
		const { env, channel } = fakeLarry();

		await post('closeForGood', 'r1', env);
		const second = await post('closeForGood', 'r1', env);

		expect(second.status).toBe(409);
		expect(second.data).toEqual({ sheetError: GONE_FROM_WINDOW });
		expect(channel).toHaveLength(1);
	});

	it('refuses a request that was never removed', async () => {
		await addMember({ cid: '1000001' });
		await addOpen({ id: 'o1', cid: '1000001' });
		const result = await post('closeForGood', 'o1', fakeLarry().env);
		expect(result.status).toBe(409);
		expect(result.data).toEqual({ sheetError: GONE_FROM_WINDOW });
	});

	it('refuses a card the board has moved off Removed, so the next pass finishes the restore', async () => {
		await addMember({ cid: '1000001', membership: 'visit', leftHomeAt: LEFT });
		// Staff moved the card back to Waitlist; the next pass has not finished it yet.
		await addRemoved({ id: 'r1', cid: '1000001', from: 'waitlist', status: 'waitlist' });
		const { env, channel } = fakeLarry();

		const result = await post('closeForGood', 'r1', env);

		expect(result.status).toBe(409);
		expect(result.data).toEqual({ sheetError: GONE_FROM_WINDOW });
		expect((await row('r1')).restoreClosedAt).toBeNull();
		expect(channel).toEqual([]);
	});
});

describe('/waitlist ?/keepInLine and ?/stopKeepingInLine', () => {
	it('keeps a request in line before the 24 hours, so the next pass after them leaves it', async () => {
		await addMember({
			cid: '1000001',
			membership: 'visit',
			leftHomeAt: new Date(NOW.getTime() - 2 * HOUR)
		});
		await addOpen({ id: 'o1', cid: '1000001' });
		const jira = fakeJira({ 'TRK-o1': { status: 'Waitlist' } });
		const { env } = fakeLarry();

		expect(await post('keepInLine', 'o1', env)).toEqual({
			sheetDone: 'Jo Rivera kept in line while they are off the home roster.'
		});
		const kept = await row('o1');
		expect(kept.keptInLineAt).toEqual(NOW);
		expect(kept.keptInLineBy).toBe(ADMIN_CID);

		await processRosterRemovals(db, env, new Date(NOW.getTime() + 2 * DAY));
		expect((await row('o1')).status).toBe('waitlist');
		expect(jira.calls).toEqual([]);
	});

	it('stops keeping it in line, so the next pass removes it', async () => {
		await addMember({
			cid: '1000001',
			membership: 'visit',
			leftHomeAt: new Date(NOW.getTime() - 2 * HOUR)
		});
		await addOpen({ id: 'o1', cid: '1000001', keptInLineAt: NOW, keptInLineBy: ADMIN_CID });
		fakeJira({ 'TRK-o1': { status: 'Waitlist' } });
		const { env } = fakeLarry();

		expect(await post('stopKeepingInLine', 'o1', env)).toEqual({
			sheetDone: 'Jo Rivera is no longer kept in line.'
		});
		const stopped = await row('o1');
		expect(stopped.keptInLineAt).toBeNull();
		expect(stopped.keptInLineBy).toBeNull();

		await processRosterRemovals(db, env, new Date(NOW.getTime() + 2 * DAY));
		const removed = await row('o1');
		expect(removed.status).toBe('removed');
		expect(removed.rosterRemovedFrom).toBe('waitlist');
	});

	it('refuses Keep in line on a request already removed', async () => {
		await addMember({ cid: '1000001', membership: 'visit', leftHomeAt: LEFT });
		await addRemoved({ id: 'r1', cid: '1000001', from: 'waitlist' });
		const before = await row('r1');

		const result = await post('keepInLine', 'r1', fakeLarry().env);

		expect(result.status).toBe(409);
		expect(result.data).toEqual({ sheetError: 'Already removed. Use Restore now instead.' });
		expect(await row('r1')).toEqual(before);
	});

	it('refuses Keep in line for a student on the home roster, and a second press', async () => {
		await addMember({ cid: '1000001' });
		await addOpen({ id: 'home', cid: '1000001' });
		await addMember({ cid: '1000002', membership: 'visit', leftHomeAt: LEFT });
		await addOpen({ id: 'kept', cid: '1000002', keptInLineAt: LEFT, keptInLineBy: null });
		const { env } = fakeLarry();

		const home = await post('keepInLine', 'home', env);
		expect(home.status).toBe(409);
		expect(home.data).toEqual({
			sheetError: 'Jo Rivera is on the ZID home roster, so there is nothing to keep in line.'
		});

		const kept = await post('keepInLine', 'kept', env);
		expect(kept.status).toBe(409);
		expect(kept.data).toEqual({ sheetError: 'That request is already kept in line.' });
		expect((await row('kept')).keptInLineBy).toBeNull();
	});

	it('refuses Stop keeping in line on a request not kept', async () => {
		await addMember({ cid: '1000001', membership: 'visit', leftHomeAt: LEFT });
		await addOpen({ id: 'o1', cid: '1000001' });
		const result = await post('stopKeepingInLine', 'o1', fakeLarry().env);
		expect(result.status).toBe(409);
		expect(result.data).toEqual({ sheetError: 'That request is not kept in line.' });
	});
});
