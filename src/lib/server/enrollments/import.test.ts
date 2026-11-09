import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { enrollmentsTable, type InsertEnrollment } from '$lib/db/schema/enrollments';
import { JIRA_FIELDS } from '$lib/server/jira/fields';
import { importBoardIssues } from './import';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-10T12:00:00Z');
const LEFT = new Date('2026-10-20T15:00:00Z');
const REMOVED_AT = new Date('2026-10-21T16:00:00Z');
const RESTORE_BY = new Date(LEFT.getTime() + 30 * DAY);
const CREATED = new Date('2026-09-01T00:00:00Z');

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

/** A request the roster removals job took off before it was filed. */
async function addRemovedUnfiled(overrides: Partial<InsertEnrollment> & { id: string }) {
	await db.insert(enrollmentsTable).values({
		cid: '1000001',
		course: 'T-RC',
		status: 'removed',
		submittedName: 'Jo Rivera',
		notificationPreference: 'discord',
		createdAt: CREATED,
		jiraIssueKey: null,
		rosterRemovedAt: REMOVED_AT,
		rosterRemovedFrom: 'waitlist',
		leftHomeAt: LEFT,
		restoreBy: RESTORE_BY,
		...overrides
	});
}

const row = async (id: string) =>
	(await db.query.enrollmentsTable.findFirst({ where: eq(enrollmentsTable.id, id) }))!;

const rows = async () => db.select().from(enrollmentsTable);

/** A T-RC card staff filed by hand for CID 1000001. */
function card(key: string, status = 'In Training') {
	return {
		key,
		fields: {
			status: { name: status },
			updated: '2026-11-09T11:02:10.000-0500',
			created: '2026-11-09T10:58:41.000-0500',
			summary: 'Jo Rivera – Terminal Radar Control (T-RC)',
			[JIRA_FIELDS.course]: { id: '10094', value: 'Terminal Radar Control (T-RC)' },
			[JIRA_FIELDS.cid]: '1000001',
			[JIRA_FIELDS.name]: 'Jo Rivera',
			[JIRA_FIELDS.waitlisted]: '2026-11-09'
		}
	};
}

/** TRK's board search, returning `issues`, and Larry collecting what is sent. */
function fakeBoard(issues: ReturnType<typeof card>[]) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			if (new URL(url).pathname.endsWith('/search/jql')) {
				return Response.json({ issues, isLast: true });
			}
			return new Response('not found', { status: 404 });
		})
	);
	const sent: { channel: string; title: string; description: string }[] = [];
	const env = {
		JIRA_BASE_URL: 'https://jira.test',
		JIRA_PROJECT_KEY: 'TRK',
		JIRA_USER_EMAIL: 'bot@example.com',
		JIRA_API_TOKEN: 'token',
		LARRY: {
			enqueue: async (message: any) => {
				sent.push({ channel: message.channel, ...message.embeds[0] });
			},
			enqueueDirect: async () => {}
		}
	} as unknown as Partial<Env>;
	return { env, sent };
}

describe('importBoardIssues: a hand-filed card for a removed, unfiled request', () => {
	it('adopts the card in the window, closes the window moved-on-board, and tells nobody', async () => {
		await addRemovedUnfiled({ id: 'a' });
		const { env, sent } = fakeBoard([card('TRK-40')]);

		expect(await importBoardIssues(db, env, NOW)).toMatchObject({ adopted: 1, imported: 0 });

		const adopted = await row('a');
		expect(adopted.jiraIssueKey).toBe('TRK-40');
		expect(adopted.status).toBe('in-training');
		expect(adopted.restoreClosedAt).toEqual(NOW);
		expect(adopted.restoreClosedReason).toBe('moved-on-board');
		expect(await rows()).toHaveLength(1);
		expect(sent).toEqual([]);
	});

	it('leaves the card unlinked once the window has closed, and tells the admins once', async () => {
		await addRemovedUnfiled({
			id: 'a',
			restoreClosedAt: RESTORE_BY,
			restoreClosedReason: 'expired'
		});
		const { env, sent } = fakeBoard([card('TRK-40')]);

		expect(await importBoardIssues(db, env, NOW)).toMatchObject({ adopted: 0, imported: 0 });
		await importBoardIssues(db, env, new Date(NOW.getTime() + DAY));

		expect(await rows()).toHaveLength(1);
		expect((await row('a')).jiraIssueKey).toBeNull();
		expect(sent).toHaveLength(1);
		expect(sent[0].channel).toBe('training-admin-alerts');
		expect(sent[0].description).toContain(
			"TRK-40 matches Jo Rivera's Terminal Radar Control (T-RC) request, which closed after they left the ZID home roster, so the import left it unlinked. Enroll them again, or close the card."
		);
	});

	it('tells the admins about each such card, once each', async () => {
		await addRemovedUnfiled({
			id: 'a',
			restoreClosedAt: RESTORE_BY,
			restoreClosedReason: 'expired'
		});
		const first = fakeBoard([card('TRK-40')]);
		await importBoardIssues(db, first.env, NOW);
		const second = fakeBoard([card('TRK-40'), card('TRK-41')]);
		await importBoardIssues(db, second.env, NOW);

		expect(first.sent.map((notice) => notice.description)).toEqual([
			expect.stringContaining('TRK-40')
		]);
		expect(second.sent.map((notice) => notice.description)).toEqual([
			expect.stringContaining('TRK-41')
		]);
	});

	it('adopts the card onto a later request the student filed, not the closed one', async () => {
		await addRemovedUnfiled({
			id: 'a',
			restoreClosedAt: RESTORE_BY,
			restoreClosedReason: 'expired'
		});
		await db.insert(enrollmentsTable).values({
			id: 'b',
			cid: '1000001',
			course: 'T-RC',
			status: 'waitlist',
			submittedName: 'Jo Rivera',
			createdAt: NOW
		});
		const { env, sent } = fakeBoard([card('TRK-40')]);

		expect(await importBoardIssues(db, env, NOW)).toMatchObject({ adopted: 1 });

		expect((await row('a')).jiraIssueKey).toBeNull();
		expect((await row('b')).jiraIssueKey).toBe('TRK-40');
		expect(sent).toEqual([]);
	});
});
