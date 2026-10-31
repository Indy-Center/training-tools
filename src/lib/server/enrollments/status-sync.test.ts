import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { enrollmentsTable } from '$lib/db/schema/enrollments';
import { TEACHER_FIELD, type JiraStatusIssue } from '$lib/server/jira/status';
import { applyIssueMove, sweepWindowMinutes } from './status-sync';

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
