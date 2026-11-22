import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { enrollmentsTable } from '$lib/db/schema/enrollments';
import { TEACHER_FIELD } from '$lib/server/jira/status';
import { syncEnrollmentIssue, sweepEnrollmentStatuses } from './status-sync';
import { withdrawEnrollment } from './index';

// Made-up people; nothing here is a real controller.
const NOW = new Date('2026-10-22T12:00:00Z');

type Card = { status: string; teacher: string | null };

/** TRK, as far as reading cards goes: one issue by key, or the sweep's search. */
function fakeJira(cards: Record<string, Card>) {
	let clock = NOW.getTime();
	const issue = (key: string) => ({
		key,
		fields: {
			status: { name: cards[key].status },
			[TEACHER_FIELD]: cards[key].teacher ? { value: cards[key].teacher } : null,
			updated: new Date((clock += 60_000)).toISOString()
		}
	});

	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			const path = new URL(url).pathname.replace('/rest/api/3', '');
			if (path === '/search/jql') {
				return Response.json({ issues: Object.keys(cards).map(issue), isLast: true });
			}
			const key = decodeURIComponent(path.match(/^\/issue\/([^/]+)/)?.[1] ?? '');
			if (path === `/issue/${key}` && cards[key]) return Response.json(issue(key));
			// Comments and transitions, from a withdrawal: none on offer.
			return Response.json({ transitions: [] });
		})
	);
}

/** A stand-in for larry that records every `syncMembers()` call. */
function fakeLarry(fail = false) {
	const calls: number[][] = [];
	const env = {
		JIRA_BASE_URL: 'https://jira.test',
		JIRA_PROJECT_KEY: 'TRK',
		JIRA_USER_EMAIL: 'bot@example.com',
		JIRA_API_TOKEN: 'token',
		LARRY: {
			syncMembers: async (cids: number[]) => {
				calls.push(cids);
				if (fail) throw new Error('larry is down');
				return [];
			},
			enqueue: async () => {}
		}
	} as unknown as Partial<Env>;
	return { env, calls };
}

const request = (
	id: string,
	cid: string,
	status: 'waitlist' | 'in-training',
	teacher: string | null
) => ({
	id,
	cid,
	course: 'S-GC' as const,
	status,
	teacher,
	submittedName: 'Student',
	jiraIssueKey: `TRK-${id}`
});

describe("an enrollment's teacher or status changing tells larry", () => {
	let db: Database;

	beforeEach(async () => {
		db = testDb();
		await db
			.insert(enrollmentsTable)
			.values([
				request('1', '1000201', 'waitlist', null),
				request('2', '1000202', 'in-training', 'JR'),
				request('3', '1000203', 'in-training', 'JR')
			]);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('in one call for every card the sweep moved or reassigned', async () => {
		fakeJira({
			'TRK-1': { status: 'In Training', teacher: 'JR' }, // assigned
			'TRK-2': { status: 'In Training', teacher: 'AB' }, // a new teacher
			'TRK-3': { status: 'In Training', teacher: 'JR' } // as it was
		});
		const larry = fakeLarry();

		await sweepEnrollmentStatuses(db, larry.env, NOW);

		expect(larry.calls).toEqual([[1000201, 1000202]]);
	});

	it('when one card is read back', async () => {
		fakeJira({ 'TRK-3': { status: 'Rating Exam', teacher: 'JR' } });
		const larry = fakeLarry();

		await syncEnrollmentIssue(db, larry.env, 'TRK-3');
		// Read again, unchanged: nothing to tell.
		await syncEnrollmentIssue(db, larry.env, 'TRK-3');

		expect(larry.calls).toEqual([[1000203]]);
	});

	it('when a student withdraws', async () => {
		fakeJira({});
		const larry = fakeLarry();

		expect(await withdrawEnrollment(db, larry.env, '2', '1000202')).toBe(true);

		expect(larry.calls).toEqual([[1000202]]);
	});

	it('and a failed call does not fail the write', async () => {
		fakeJira({ 'TRK-1': { status: 'In Training', teacher: 'JR' } });
		const larry = fakeLarry(true);
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await sweepEnrollmentStatuses(db, larry.env, NOW);

		expect(result.updated).toBe(1);
		expect(larry.calls).toHaveLength(1);
		const row = await db.query.enrollmentsTable.findFirst({
			where: (table, { eq }) => eq(table.id, '1')
		});
		expect(row?.status).toBe('in-training');
	});
});
