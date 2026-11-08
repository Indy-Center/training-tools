import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { enrollmentsTable } from '$lib/db/schema/enrollments';
import { describeNamedActions } from '$lib/testing/named-actions';
import { actions } from './+page.server';

describeNamedActions('/waitlist', actions, [
	'assignVatusa',
	'completeVatusa',
	'assignTeacher',
	'changeTeacher',
	'removeStudent',
	'withdrawStudent',
	'restoreNow',
	'closeForGood',
	'keepInLine',
	'stopKeepingInLine'
]);

/**
 * Remove, with its reason: the field, then the move, then the comment. A
 * reason missing, or one only the roster-removal pass sets, is refused before
 * Jira is asked anything. Against the in-memory D1, with TRK faked.
 */
describe('/waitlist ?/removeStudent', () => {
	const REMOVAL_REASON = 'customfield_10323';
	const env = {
		JIRA_BASE_URL: 'https://jira.test',
		JIRA_PROJECT_KEY: 'TRK',
		JIRA_USER_EMAIL: 'bot@example.com',
		JIRA_API_TOKEN: 'token'
	} as unknown as Env;

	let db: Database;
	let calls: { method: string; path: string; body: any }[];

	beforeEach(async () => {
		db = testDb();
		calls = [];
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		await db.insert(enrollmentsTable).values({
			id: 'req-1',
			cid: '1000001',
			course: 'S-LC',
			status: 'waitlist',
			submittedName: 'Jo Rivera',
			notificationPreference: 'discord',
			createdAt: new Date('2026-09-01T00:00:00Z'),
			jiraIssueKey: 'TRK-9001',
			announcedStatus: 'waitlist'
		});

		let status = 'Waitlist';
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init: { method: string; body?: string }) => {
				const path = new URL(url).pathname.replace('/rest/api/3', '');
				const body = init.body ? JSON.parse(init.body) : undefined;
				calls.push({ method: init.method, path, body });
				if (path.endsWith('/comment')) return Response.json({}, { status: 201 });
				if (path.endsWith('/transitions') && init.method === 'GET') {
					return Response.json({
						transitions: [{ id: '13', name: 'Remove', to: { id: '6', name: 'Removed' } }]
					});
				}
				if (path.endsWith('/transitions')) {
					status = 'Removed';
					return new Response(null, { status: 204 });
				}
				if (init.method === 'PUT') return new Response(null, { status: 204 });
				return Response.json({
					key: 'TRK-9001',
					fields: { status: { name: status }, updated: '2026-11-08T10:00:00.000Z' }
				});
			})
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	async function post(fields: Record<string, string>): Promise<any> {
		const body = new FormData();
		for (const [name, value] of Object.entries(fields)) body.set(name, value);
		return actions.removeStudent!({
			locals: {
				db,
				session: {
					roles: ['training:students:manage'],
					user: {
						cid: '3000001',
						attributes: { preferredName: 'Pat Admin' },
						vatsimData: { personal: {} }
					}
				}
			},
			platform: { env },
			request: new Request('http://localhost/waitlist?/removeStudent', { method: 'POST', body })
		} as unknown as Parameters<NonNullable<typeof actions.removeStudent>>[0]);
	}

	/** The writes, in order: field writes, moves and comments. Reads left out. */
	const writes = () =>
		calls
			.filter((call) => call.method !== 'GET')
			.map((call) =>
				call.path.endsWith('/comment')
					? {
							comment: call.body.body.content.map((p: any) => p.content[0].text).join('\n')
						}
					: call.path.endsWith('/transitions')
						? { move: call.body.transition.id }
						: { fields: call.body.fields }
			);

	it('writes the reason, then moves the card to Removed, then names the reason in a comment', async () => {
		const result = await post({ id: 'req-1', reason: 'no-response' });

		expect(result).toEqual({ sheetDone: 'Jo Rivera removed.' });
		// The read-back's own date write (Removed) follows; the first three are the action's.
		expect(writes().slice(0, 3)).toEqual([
			{ fields: { [REMOVAL_REASON]: { id: '10181' } } },
			{ move: '13' },
			{ comment: 'Removed by Pat Admin: No response. (through training.flyindycenter.com)' }
		]);
	});

	it('refuses a removal with no reason, asking Jira nothing', async () => {
		const result = await post({ id: 'req-1' });

		expect(result.status).toBe(400);
		expect(result.data).toEqual({ sheetError: 'Pick a reason for removing Jo Rivera.' });
		expect(calls).toEqual([]);
	});

	it('refuses Roster removal posted by hand, asking Jira nothing', async () => {
		const result = await post({ id: 'req-1', reason: 'roster-removal' });

		expect(result.status).toBe(400);
		expect(result.data).toEqual({ sheetError: 'Pick a reason for removing Jo Rivera.' });
		expect(calls).toEqual([]);
	});
});
