import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { enrollmentsTable } from '$lib/db/schema/enrollments';
import { TEACHER_FIELD, type JiraStatusIssue } from '$lib/server/jira/status';
import { applyIssueMove, dateCardMove, sweepWindowMinutes } from './status-sync';

const NOW = new Date('2026-09-23T12:00:00Z');

describe('applyIssueMove and status_since', () => {
	const ENTERED = new Date('2026-09-01T00:00:00Z');
	const SEEN = new Date('2026-09-22T10:00:00Z');
	let db: Database;

	beforeEach(async () => {
		db = testDb();
		await db.insert(enrollmentsTable).values({
			id: 'e1',
			cid: '1000001',
			course: 'S-LC',
			status: 'waitlist',
			submittedName: 'Jo Rivera',
			jiraIssueKey: 'TRK-1',
			statusSince: ENTERED
		});
	});

	const issue = (status: string, teacher: string | null = null): JiraStatusIssue => ({
		key: 'TRK-1',
		fields: { status: { name: status }, [TEACHER_FIELD]: teacher ? { value: teacher } : null }
	});
	const since = async () =>
		(await db.query.enrollmentsTable.findFirst({ where: eq(enrollmentsTable.id, 'e1') }))!
			.statusSince;

	it('sets it to observedAt on a move', async () => {
		const { outcome } = await applyIssueMove(db, issue('In Training', 'AB'), SEEN, NOW);
		expect(outcome).toBe('updated');
		expect(await since()).toEqual(SEEN);
	});

	it('sets it to now when the move has no observedAt', async () => {
		await applyIssueMove(db, issue('In Training', 'AB'), null, NOW);
		expect(await since()).toEqual(NOW);
	});

	it('leaves it when only the teacher changes', async () => {
		const { outcome } = await applyIssueMove(db, issue('Waitlist', 'AB'), SEEN, NOW);
		expect(outcome).toBe('updated');
		expect(await since()).toEqual(ENTERED);
	});

	it('leaves it when the delivery is stale', async () => {
		await applyIssueMove(db, issue('In Training', 'AB'), SEEN, NOW);
		const older = new Date('2026-09-21T00:00:00Z');
		const { outcome } = await applyIssueMove(db, issue('Rating Exam', 'AB'), older, NOW);
		expect(outcome).toBe('stale');
		expect(await since()).toEqual(SEEN);
	});
});

describe('applyIssueMove and ctrs_notice', () => {
	const SEEN = new Date('2026-09-22T10:00:00Z');
	let db: Database;

	beforeEach(async () => {
		db = testDb();
		await db.insert(enrollmentsTable).values({
			id: 'e1',
			cid: '1000001',
			course: 'S-GC',
			status: 'rating-exam',
			submittedName: 'Jo Rivera',
			jiraIssueKey: 'TRK-1',
			teacher: 'AB',
			ctrsNotice: '501'
		});
	});

	const issue = (status: string, teacher: string | null = 'AB'): JiraStatusIssue => ({
		key: 'TRK-1',
		fields: { status: { name: status }, [TEACHER_FIELD]: teacher ? { value: teacher } : null }
	});
	const notice = async () =>
		(await db.query.enrollmentsTable.findFirst({ where: eq(enrollmentsTable.id, 'e1') }))!
			.ctrsNotice;

	it('clears it on a move', async () => {
		await applyIssueMove(db, issue('Needs CATP'), SEEN, NOW);
		expect(await notice()).toBeNull();
	});

	it('keeps it when only the teacher changes', async () => {
		const { outcome } = await applyIssueMove(db, issue('Rating Exam', 'CD'), SEEN, NOW);
		expect(outcome).toBe('updated');
		expect(await notice()).toBe('501');
	});

	it('keeps it when the delivery is stale', async () => {
		await applyIssueMove(db, issue('Rating Exam', 'CD'), SEEN, NOW);
		const older = new Date('2026-09-21T00:00:00Z');
		const { outcome } = await applyIssueMove(db, issue('Needs CATP'), older, NOW);
		expect(outcome).toBe('stale');
		expect(await notice()).toBe('501');
	});
});

describe('applyIssueMove reports a move once', () => {
	const SEEN = new Date('2026-09-22T10:00:00Z');
	const LATER = new Date('2026-09-22T10:00:05Z');
	let db: Database;

	beforeEach(async () => {
		db = testDb();
		await db.insert(enrollmentsTable).values({
			id: 'e1',
			cid: '1000001',
			course: 'S-GC',
			status: 'rating-exam',
			submittedName: 'Jo Rivera',
			jiraIssueKey: 'TRK-1',
			teacher: 'AB'
		});
	});

	const atCatp: JiraStatusIssue = {
		key: 'TRK-1',
		fields: { status: { name: 'Needs CATP' }, [TEACHER_FIELD]: { value: 'AB' } }
	};

	// The webhook and the sweep both describe the same move; only the first
	// says it moved, so the exam count goes up once.
	it('says it moved on the write that moved it, and not on a second read of it', async () => {
		expect((await applyIssueMove(db, atCatp, SEEN, NOW)).moved).toEqual({
			from: 'rating-exam',
			to: 'needs-catp'
		});
		expect((await applyIssueMove(db, atCatp, SEEN, NOW)).moved).toBeNull();
		expect((await applyIssueMove(db, atCatp, LATER, NOW)).moved).toBeNull();
	});
});

describe('dateCardMove', () => {
	const env = {
		JIRA_BASE_URL: 'https://jira.test',
		JIRA_PROJECT_KEY: 'TRK',
		JIRA_USER_EMAIL: 'bot@example.com',
		JIRA_API_TOKEN: 'token'
	} as unknown as Partial<Env>;

	function stubJira(status = 204) {
		const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
			status < 300 ? new Response(null, { status }) : new Response('Bad', { status })
		);
		vi.stubGlobal('fetch', fetch);
		return fetch;
	}

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	const failed: JiraStatusIssue = {
		key: 'TRK-9001',
		fields: {
			status: { name: 'Needs CATP' },
			customfield_10324: '2026-09-15',
			customfield_10325: 2
		}
	};

	it('sends a failed exam’s fields in one write', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const fetch = stubJira();

		await dateCardMove(env, failed, { from: 'rating-exam', to: 'needs-catp' }, NOW);

		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = fetch.mock.calls[0];
		expect(url).toBe('https://jira.test/rest/api/3/issue/TRK-9001');
		expect(init?.method).toBe('PUT');
		expect(JSON.parse(String(init?.body))).toEqual({
			fields: { customfield_10324: '2026-09-23', customfield_10325: 3 }
		});
	});

	it('writes nothing when the card has not moved', async () => {
		const fetch = stubJira();
		await dateCardMove(env, failed, null, NOW);
		expect(fetch).not.toHaveBeenCalled();
	});

	// The move is consumed: a second try could count the exam twice.
	it('logs a failed write and does not retry it', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const fetch = stubJira(500);

		await dateCardMove(env, failed, { from: 'rating-exam', to: 'needs-catp' }, NOW);

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledWith(
			'[training-tools] could not date card',
			expect.stringContaining('TRK-9001'),
			expect.anything()
		);
	});
});

describe('sweepWindowMinutes', () => {
	it('reads everything when there is no cursor yet', () => {
		expect(sweepWindowMinutes(null, NOW)).toBeNull();
	});

	it('covers the time since the cursor, plus an overlap', () => {
		expect(sweepWindowMinutes(new Date('2026-09-23T11:45:00Z'), NOW)).toBe(20);
	});

	it('rounds a part-minute up rather than dropping it', () => {
		expect(sweepWindowMinutes(new Date('2026-09-23T11:44:30Z'), NOW)).toBe(21);
	});

	// After an outage the window simply grows; nothing is skipped.
	it('stretches to cover missed runs', () => {
		expect(sweepWindowMinutes(new Date('2026-09-22T12:00:00Z'), NOW)).toBe(24 * 60 + 5);
	});

	it('never asks for a negative window if clocks disagree', () => {
		expect(sweepWindowMinutes(new Date('2026-09-23T12:10:00Z'), NOW)).toBe(5);
	});
});
