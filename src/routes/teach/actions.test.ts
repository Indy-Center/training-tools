import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { enrollmentsTable, type InsertEnrollment } from '$lib/db/schema/enrollments';
import { teachersTable } from '$lib/db/schema/teachers';
import { describeNamedActions } from '$lib/testing/named-actions';
import { actions } from './+page.server';

describeNamedActions('/teach', actions, [
	'claimExam',
	'completeExam',
	'completeTraining',
	'failExam'
]);

const ENV = {
	JIRA_BASE_URL: 'https://jira.test',
	JIRA_PROJECT_KEY: 'TRK',
	JIRA_USER_EMAIL: 'bot@example.com',
	JIRA_API_TOKEN: 'token'
} as unknown as Partial<Env>;

let db: Database;

beforeEach(async () => {
	db = testDb();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	await db.insert(teachersTable).values([
		{ cid: '1000001', roles: ['INS'], initials: 'ST' },
		{ cid: '1000002', roles: ['MTR'], initials: 'OT' }
	]);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

async function addRequest(overrides: Partial<InsertEnrollment> = {}) {
	await db.insert(enrollmentsTable).values({
		id: 'req-1',
		cid: '1000100',
		course: 'S-GC',
		status: 'in-training',
		teacher: 'ST',
		submittedName: 'Jo Rivera',
		jiraIssueKey: 'TRK-1',
		...overrides
	});
}

/** TRK, as far as these steps touch it: every write is accepted. */
function fakeJira() {
	const calls: { method: string; path: string; body: any }[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init: { method: string; body?: string }) => {
			const path = new URL(url).pathname.replace('/rest/api/3', '');
			calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : null });
			if (path.endsWith('/comment')) return Response.json({}, { status: 201 });
			if (path.endsWith('/transitions') && init.method === 'GET') {
				return Response.json({
					transitions: [
						{ id: '1', name: 'To Rating Exam', to: { id: '1', name: 'Rating Exam' } },
						{ id: '2', name: 'To Audit', to: { id: '2', name: 'Audit' } }
					]
				});
			}
			if (init.method === 'GET') return new Response('not found', { status: 404 });
			return new Response(null, { status: 204 });
		})
	);
	const comments = () =>
		calls
			.filter((call) => call.path.endsWith('/comment'))
			.map((call) => call.body.body.content.map((p: any) => p.content[0].text).join('\n'));
	const moves = () =>
		calls.filter((call) => call.path.endsWith('/transitions') && call.method === 'POST');
	return { calls, comments, moves };
}

/** A POST to `?/completeTraining` by the teacher with this CID. */
function post(cid: string, fields: Record<string, string>) {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.set(name, value);
	return {
		locals: {
			db,
			session: {
				roles: [],
				user: {
					cid,
					attributes: {},
					vatsimData: { personal: { name_first: 'Sam', name_last: 'Teacher' } }
				}
			}
		},
		request: new Request('https://training.test/teach?/completeTraining', {
			method: 'POST',
			body
		}),
		platform: { env: ENV }
	} as unknown as Parameters<typeof actions.completeTraining>[0];
}

describe('/teach ?/completeTraining', () => {
	it('lets the teacher on the card end the training, saying no report was filed', async () => {
		await addRequest();
		const jira = fakeJira();

		const result = await actions.completeTraining(post('1000001', { id: 'req-1' }));

		expect(result).toEqual({ flowDone: 'Training marked complete for Jo Rivera.' });
		expect(jira.moves()).toHaveLength(1);
		expect(jira.comments()).toEqual([
			'Training marked complete by Sam Teacher on /teach; no training report filed through the app. (through training.flyindycenter.com)'
		]);
	});

	it('refuses another teacher, and leaves the card alone', async () => {
		await addRequest();
		const jira = fakeJira();

		const result = await actions.completeTraining(post('1000002', { id: 'req-1' }));

		expect(result).toMatchObject({
			status: 403,
			data: {
				flowError: 'That is not yours to do, or it has already been done. Reload the page.'
			}
		});
		expect(jira.calls).toEqual([]);
	});

	it('refuses a card already at Rating Exam', async () => {
		await addRequest({ status: 'rating-exam' });
		const jira = fakeJira();

		const result = await actions.completeTraining(post('1000001', { id: 'req-1' }));

		expect(result).toMatchObject({
			status: 403,
			data: {
				flowError: 'That is not yours to do, or it has already been done. Reload the page.'
			}
		});
		expect(jira.calls).toEqual([]);
	});

	it('refuses Custom Training sent without a choice', async () => {
		await addRequest({ course: 'CUSTOM' });
		const jira = fakeJira();

		const result = await actions.completeTraining(post('1000001', { id: 'req-1' }));

		expect(result).toMatchObject({
			status: 502,
			data: { flowError: 'Choose whether this training ends in a rating exam.' }
		});
		expect(jira.calls).toEqual([]);
	});

	it('moves Custom Training where the teacher chose', async () => {
		await addRequest({ course: 'CUSTOM' });
		const jira = fakeJira();

		const result = await actions.completeTraining(
			post('1000001', { id: 'req-1', next: 'certification-update' })
		);

		expect(result).toEqual({ flowDone: 'Training marked complete for Jo Rivera.' });
		expect(jira.moves().map((move) => move.body)).toEqual([{ transition: { id: '2' } }]);
	});
});
