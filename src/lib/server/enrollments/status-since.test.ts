import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { enrollmentsTable, type InsertEnrollment } from '$lib/db/schema/enrollments';
import type { JiraConfig } from '$lib/server/jira/client';
import { fetchStatusSince } from '$lib/server/jira/issues';
import { BACKFILL_LIMIT, backfillStatusSince } from './status-since';

const env = {
	JIRA_BASE_URL: 'https://jira.test',
	JIRA_PROJECT_KEY: 'TRK',
	JIRA_USER_EMAIL: 'bot@example.com',
	JIRA_API_TOKEN: 'token'
} as unknown as Partial<Env>;

let db: Database;

beforeEach(() => {
	db = testDb();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

let n = 0;
async function addRow(overrides: Partial<InsertEnrollment> = {}) {
	n += 1;
	const id = `e${n}`;
	await db.insert(enrollmentsTable).values({
		id,
		cid: `${1000000 + n}`,
		course: 'S-LC',
		status: 'in-training',
		submittedName: 'Jo Rivera',
		jiraIssueKey: `TRK-${n}`,
		createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, n)),
		...overrides
	});
	return id;
}

const since = async (id: string) =>
	(await db.query.enrollmentsTable.findFirst({ where: eq(enrollmentsTable.id, id) }))!.statusSince;

describe('backfillStatusSince', () => {
	const at = new Date('2026-08-15T14:00:00Z');

	it('fills an open row from the Jira read', async () => {
		const id = await addRow();
		const read = vi.fn(async () => at);
		const result = await backfillStatusSince(db, env, read);
		expect(result).toEqual({ filled: 1, failed: 0 });
		expect(read).toHaveBeenCalledWith(
			expect.objectContaining({ baseUrl: 'https://jira.test' }),
			'TRK-1'
		);
		expect(await since(id)).toEqual(at);
	});

	it('skips closed, withdrawn, filled and unfiled rows', async () => {
		const closed = await addRow({ status: 'completed' });
		const removed = await addRow({ status: 'removed' });
		const withdrawn = await addRow({ status: 'withdrawn' });
		const withdrawnAt = await addRow({ withdrawnAt: new Date('2026-09-02T00:00:00Z') });
		const filled = await addRow({ statusSince: new Date('2026-09-03T00:00:00Z') });
		const unfiled = await addRow({ jiraIssueKey: null });
		const read = vi.fn(async () => at);

		expect(await backfillStatusSince(db, env, read)).toEqual({ filled: 0, failed: 0 });
		expect(read).not.toHaveBeenCalled();
		for (const id of [closed, removed, withdrawn, withdrawnAt, unfiled]) {
			expect(await since(id)).toBeNull();
		}
		expect(await since(filled)).toEqual(new Date('2026-09-03T00:00:00Z'));
	});

	it('stops at 20 rows, taking the rest on the next run', async () => {
		const ids: string[] = [];
		for (let i = 0; i < BACKFILL_LIMIT + 3; i += 1) ids.push(await addRow());
		const read = vi.fn(async () => at);

		expect(BACKFILL_LIMIT).toBe(20);
		expect(await backfillStatusSince(db, env, read)).toEqual({ filled: 20, failed: 0 });
		expect(read).toHaveBeenCalledTimes(20);
		expect(await since(ids[19])).toEqual(at);
		expect(await since(ids[20])).toBeNull();

		expect(await backfillStatusSince(db, env, read)).toEqual({ filled: 3, failed: 0 });
		expect(await since(ids[22])).toEqual(at);
	});

	it('leaves a failed row null and carries on with the rest', async () => {
		const bad = await addRow();
		const good = await addRow();
		const read = vi.fn(async (_config: JiraConfig, key: string) => {
			if (key === 'TRK-' + bad.slice(1)) throw new Error('Jira 500');
			return at;
		});

		expect(await backfillStatusSince(db, env, read)).toEqual({ filled: 1, failed: 1 });
		expect(await since(bad)).toBeNull();
		expect(await since(good)).toEqual(at);

		// Tried again next run.
		read.mockResolvedValue(at);
		expect(await backfillStatusSince(db, env, read)).toEqual({ filled: 1, failed: 0 });
		expect(await since(bad)).toEqual(at);
	});

	it('does nothing without Jira configured', async () => {
		await addRow();
		const read = vi.fn(async () => at);
		expect(await backfillStatusSince(db, {}, read)).toEqual({
			filled: 0,
			failed: 0,
			skipped: 'jira-not-configured'
		});
		expect(read).not.toHaveBeenCalled();
	});
});

describe('fetchStatusSince', () => {
	const config: JiraConfig = {
		baseUrl: 'https://jira.test',
		email: 'bot@example.com',
		apiToken: 'token',
		projectKey: 'TRK'
	};

	function stubJira(pages: object[], created = '2026-07-01T09:00:00.000-0400') {
		const paths: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				const u = new URL(url);
				paths.push(u.pathname.replace('/rest/api/3', '') + u.search);
				if (u.pathname.endsWith('/changelog')) {
					const page = pages[paths.filter((p) => p.includes('/changelog')).length - 1];
					return Response.json(page);
				}
				return Response.json({ fields: { created } });
			})
		);
		return paths;
	}

	const status = (created: string) => ({ created, items: [{ field: 'status' }] });
	const other = (created: string) => ({ created, items: [{ field: 'Teacher' }] });

	it('takes the latest status change, not the latest change', async () => {
		stubJira([
			{
				isLast: true,
				values: [
					status('2026-08-01T10:00:00.000+0000'),
					status('2026-09-10T10:00:00.000+0000'),
					other('2026-09-20T10:00:00.000+0000')
				]
			}
		]);
		expect(await fetchStatusSince(config, 'TRK-1')).toEqual(new Date('2026-09-10T10:00:00Z'));
	});

	it('reads every page of the changelog', async () => {
		const paths = stubJira([
			{ isLast: false, values: [status('2026-08-01T10:00:00.000+0000')] },
			{ isLast: true, values: [status('2026-09-10T10:00:00.000+0000')] }
		]);
		expect(await fetchStatusSince(config, 'TRK-1')).toEqual(new Date('2026-09-10T10:00:00Z'));
		expect(paths[0]).toBe('/issue/TRK-1/changelog?startAt=0&maxResults=100');
		expect(paths[1]).toBe('/issue/TRK-1/changelog?startAt=1&maxResults=100');
	});

	it("falls back to the issue's created time when no history changes status", async () => {
		stubJira([{ isLast: true, values: [other('2026-09-20T10:00:00.000+0000')] }]);
		expect(await fetchStatusSince(config, 'TRK-1')).toEqual(new Date('2026-07-01T13:00:00Z'));
	});
});
