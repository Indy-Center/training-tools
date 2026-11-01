import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { enrollmentsTable, type InsertEnrollment } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import type { VatusaRosterMember } from '$lib/types/vatusa';
import { JIRA_FIELDS } from '$lib/server/jira/fields';
import { RE_INSTRUCTOR_FIELD, TEACHER_FIELD } from '$lib/server/jira/status';
import { describeNamedActions } from '$lib/testing/named-actions';
import { Role } from '$lib/utils/permissions';
import { actions, load } from './+page.server';

/**
 * Edit card on `/admin/cards/{key}`: the `edit` action, and the choices the
 * load gives its form. In-memory D1, Jira stubbed at `fetch`.
 */

describeNamedActions('/admin/cards/{key}', actions, ['edit']);

const env = {
	JIRA_BASE_URL: 'https://jira.test',
	JIRA_PROJECT_KEY: 'TRK',
	JIRA_USER_EMAIL: 'bot@example.com',
	JIRA_API_TOKEN: 'token'
} as unknown as Partial<Env>;

const user = (cid: string) => ({
	cid,
	attributes: {},
	vatsimData: { personal: { name_first: 'Sam', name_last: 'Admin' } }
});
const admin = { user: user('3000001'), roles: [Role.ADMIN] };
const studentsOnly = { user: user('3000002'), roles: [Role.STUDENTS] };

let db: Database;

beforeEach(async () => {
	db = testDb();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	await db.insert(rosterMembersTable).values({
		cid: '1000001',
		firstName: 'Jo',
		lastName: 'Rivera',
		rating: 3,
		ratingShort: 'S2',
		membership: 'home',
		facility: 'ZID',
		data: {} as VatusaRosterMember
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

async function addRow(overrides: Partial<InsertEnrollment> = {}) {
	await db.insert(enrollmentsTable).values({
		id: 'e1',
		cid: '1000001',
		course: 'T-RC',
		status: 'needs-catp',
		submittedName: 'Jo R',
		jiraIssueKey: 'TRK-9001',
		teacher: 'SW',
		reInstructor: 'HI',
		...overrides
	});
}

type Call = { method: string; path: string; body: any };

/**
 * TRK-9001 at Needs CATP, taught by SW and examined by HI. A move it is
 * offered changes its status, so the read-back sees where it went.
 */
function fakeJira({ moveFails = false, fields = {} as Record<string, unknown> } = {}) {
	const calls: Call[] = [];
	const card: Record<string, unknown> = {
		status: { name: 'Needs CATP' },
		[TEACHER_FIELD]: { value: 'SW' },
		[RE_INSTRUCTOR_FIELD]: { value: 'HI' },
		[JIRA_FIELDS.trainingCompleted]: '2026-10-01',
		[JIRA_FIELDS.reCompleted]: '2026-10-05',
		[JIRA_FIELDS.teacherAssigned]: '2026-09-01',
		updated: '2026-10-20T10:00:00.000-0400',
		...fields
	};
	const transitions = [
		{ id: '11', name: 'Back to training', to: { id: '1', name: 'In Training' } },
		{ id: '12', name: 'Retrain', to: { id: '1', name: 'In Training' } },
		{ id: '13', name: 'Remove', to: { id: '2', name: 'Removed' } },
		{ id: '14', name: 'Done', to: { id: '3', name: 'Completed' } },
		{ id: '15', name: 'To Audit', to: { id: '4', name: 'Audit' } }
	];

	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init: { method: string; body?: string }) => {
			const path = new URL(url).pathname.replace('/rest/api/3', '');
			const body = init.body ? JSON.parse(init.body) : null;
			calls.push({ method: init.method, path, body });

			if (path.endsWith('/comment')) {
				return init.method === 'GET'
					? Response.json({ comments: [] })
					: Response.json({}, { status: 201 });
			}
			if (path.endsWith('/transitions')) {
				if (init.method === 'GET') return Response.json({ transitions });
				if (moveFails) {
					return Response.json({ errorMessages: ['Transition not allowed'] }, { status: 400 });
				}
				const fired = transitions.find((t) => t.id === body.transition.id)!;
				card.status = { name: fired.to.name };
				card.updated = '2026-10-20T10:05:00.000-0400';
				return new Response(null, { status: 204 });
			}
			if (path.endsWith('/editmeta')) {
				return Response.json({
					fields: {
						[RE_INSTRUCTOR_FIELD]: {
							allowedValues: [
								{ id: '201', value: 'HI' },
								{ id: '202', value: 'SW' },
								{ id: '203', value: 'VATUSA' }
							]
						}
					}
				});
			}
			if (path === '/issue/TRK-9001') {
				if (init.method === 'PUT') {
					Object.assign(card, body.fields);
					return new Response(null, { status: 204 });
				}
				return Response.json({ key: 'TRK-9001', fields: card });
			}
			return new Response('not found', { status: 404 });
		})
	);

	const comments = () =>
		calls
			.filter((call) => call.path.endsWith('/comment') && call.method === 'POST')
			.map((call) => call.body.body.content.map((p: any) => p.content[0].text).join('\n'));
	const writes = () => calls.filter((call) => call.method !== 'GET');
	const puts = () => calls.filter((call) => call.method === 'PUT').map((call) => call.body.fields);
	const moves = () =>
		calls.filter((call) => call.path.endsWith('/transitions') && call.method === 'POST');
	return { calls, comments, writes, puts, moves };
}

type EditEvent = Parameters<typeof actions.edit>[0];

function post(fields: Record<string, string>, session: unknown = admin, withEnv = env) {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.set(name, value);
	return {
		locals: { db, session },
		params: { issueKey: 'TRK-9001' },
		request: new Request('https://training.test/admin/cards/TRK-9001?/edit', {
			method: 'POST',
			body
		}),
		platform: { env: withEnv }
	} as unknown as EditEvent;
}

const refused = (status: number, editError: string) => ({ status, data: { editError } });

describe('/admin/cards/{key} ?/edit access', () => {
	it('sends someone who manages students but is not a training admin home, before Jira', async () => {
		await addRow();
		const jira = fakeJira();

		await expect(async () =>
			actions.edit(post({ stage: 'In Training' }, studentsOnly))
		).rejects.toMatchObject({ status: 303, location: '/' });
		expect(jira.calls).toEqual([]);
	});
});

describe('/admin/cards/{key} ?/edit refusals', () => {
	it('refuses a request the student withdrew here, before Jira', async () => {
		await addRow({ withdrawnAt: new Date('2026-10-10T00:00:00Z'), status: 'withdrawn' });
		const jira = fakeJira();

		const result = await actions.edit(post({ trainingCompleted: '2026-10-02' }));

		expect(result).toMatchObject(
			refused(409, "Jo Rivera withdrew this request themselves; it can't be edited here.")
		);
		expect(jira.calls).toEqual([]);
	});

	it('refuses Completed posted by hand, before Jira', async () => {
		await addRow();
		const jira = fakeJira();

		const result = await actions.edit(post({ stage: 'Completed' }));

		expect(result).toMatchObject(refused(400, 'A card is completed from the audit.'));
		expect(jira.calls).toEqual([]);
	});

	it('refuses the student’s teacher as examiner, writing nothing', async () => {
		await addRow();
		const jira = fakeJira();

		const result = await actions.edit(post({ examiner: 'sw' }));

		expect(result).toMatchObject(refused(400, "The examiner can't be the student's teacher."));
		expect(jira.writes()).toEqual([]);
	});

	it('refuses a date after today, writing nothing', async () => {
		await addRow();
		const jira = fakeJira();

		const result = await actions.edit(post({ reCompleted: '2999-01-01' }));

		expect(result).toMatchObject(refused(400, 'RE Completed must be a date no later than today.'));
		expect(jira.writes()).toEqual([]);
	});

	it('refuses a malformed date, writing nothing', async () => {
		await addRow();
		const jira = fakeJira();

		for (const date of ['10/01/2026', '2026-02-30', 'soon']) {
			const result = await actions.edit(post({ trainingCompleted: date }));
			expect(result).toMatchObject(
				refused(400, 'Training Completed must be a date no later than today.')
			);
		}
		expect(jira.writes()).toEqual([]);
	});

	it('refuses a save that changes nothing', async () => {
		await addRow();
		const jira = fakeJira();

		const result = await actions.edit(
			post({ stage: 'Needs CATP', examiner: 'HI', trainingCompleted: '2026-10-01', removed: '' })
		);

		expect(result).toMatchObject(refused(400, 'Nothing changed.'));
		expect(jira.writes()).toEqual([]);
	});

	it('gives the earlier refusal in the spec’s order when two apply', async () => {
		await addRow();
		fakeJira();

		expect(
			await actions.edit(post({ examiner: 'SW', trainingCompleted: '2999-01-01' }))
		).toMatchObject(refused(400, "The examiner can't be the student's teacher."));
		expect(await actions.edit(post({ stage: 'Completed', examiner: 'SW' }))).toMatchObject(
			refused(400, 'A card is completed from the audit.')
		);
	});

	it('refuses a stage Jira does not offer the card now, writing nothing', async () => {
		await addRow();
		const jira = fakeJira();

		const result = await actions.edit(post({ stage: 'Rating Exam' }));

		expect(result).toMatchObject(
			refused(409, "TRK-9001 can't move to Rating Exam from Needs CATP now. Reload and try again.")
		);
		expect(jira.writes()).toEqual([]);
	});
});

describe('/admin/cards/{key} ?/edit saves', () => {
	it('writes only the changed dates, in one call, with no move', async () => {
		await addRow();
		const jira = fakeJira();

		const result = await actions.edit(
			post({ stage: 'Needs CATP', trainingCompleted: '2026-10-02', reCompleted: '' })
		);

		expect(result).toEqual({ edited: 'TRK-9001' });
		expect(jira.puts()).toEqual([
			{ [JIRA_FIELDS.trainingCompleted]: '2026-10-02', [JIRA_FIELDS.reCompleted]: null }
		]);
		expect(jira.moves()).toEqual([]);
		expect(jira.comments()).toEqual([
			'Edited by Sam Admin: Training Completed 2026-10-01 → 2026-10-02; RE Completed 2026-10-05 → none. (through training.flyindycenter.com)'
		]);
	});

	it('moves Needs CATP → In Training by name, comments, and reads the card back', async () => {
		await addRow();
		const jira = fakeJira();

		const result = await actions.edit(post({ stage: 'In Training' }));

		expect(result).toEqual({ edited: 'TRK-9001' });
		expect(jira.puts()).toEqual([]);
		expect(jira.moves().map((call) => call.body.transition.id)).toEqual(['11']);
		expect(jira.comments()).toEqual([
			'Edited by Sam Admin: moved Needs CATP → In Training. (through training.flyindycenter.com)'
		]);
		// The read-back brought our row into line with the card.
		const row = await db.query.enrollmentsTable.findFirst();
		expect(row?.status).toBe('in-training');
	});

	it('keeps the fields when the move fails, and says why', async () => {
		await addRow();
		const jira = fakeJira({ moveFails: true });

		const result = await actions.edit(post({ stage: 'In Training', removed: '2026-10-03' }));

		expect(result).toMatchObject({ status: 409 });
		expect((result as any).data.editError).toMatch(
			/^TRK-9001 can't move to In Training from Needs CATP now\. Reload and try again\. \(.*Transition not allowed.*\)$/
		);
		expect(jira.puts()).toEqual([{ [JIRA_FIELDS.removed]: '2026-10-03' }]);
		expect(jira.comments()).toEqual([
			'Edited by Sam Admin: Removed none → 2026-10-03. (through training.flyindycenter.com)'
		]);
	});

	it('clears the examiner with null', async () => {
		await addRow();
		const jira = fakeJira();

		expect(await actions.edit(post({ examiner: '' }))).toEqual({ edited: 'TRK-9001' });

		expect(jira.puts()).toEqual([{ [RE_INSTRUCTOR_FIELD]: null }]);
		expect(jira.comments()).toEqual([
			'Edited by Sam Admin: RE Instructor HI → none. (through training.flyindycenter.com)'
		]);
	});

	it('sets the examiner by option id', async () => {
		await addRow();
		const jira = fakeJira();

		expect(await actions.edit(post({ examiner: 'VATUSA' }))).toEqual({ edited: 'TRK-9001' });

		expect(jira.puts()).toEqual([{ [RE_INSTRUCTOR_FIELD]: { id: '203' } }]);
	});

	it('saves a move to Audit that will be held: the warning never refuses', async () => {
		await addRow();
		const jira = fakeJira({ fields: { [JIRA_FIELDS.trainingCompleted]: null } });

		expect(await actions.edit(post({ stage: 'Audit' }))).toEqual({ edited: 'TRK-9001' });

		expect(jira.moves().map((call) => call.body.transition.id)).toEqual(['15']);
	});

	it('says Jira isn’t set up, and writes nothing, without Jira', async () => {
		await addRow();
		const jira = fakeJira();

		const result = await actions.edit(post({ stage: 'In Training' }, admin, {}));

		expect(result).toMatchObject({ status: 502 });
		expect(jira.calls).toEqual([]);
	});
});

describe('/admin/cards/{key} Edit card choices', () => {
	type LoadEvent = Parameters<typeof load>[0];
	const loaded = async () =>
		(await load({
			locals: { db, session: admin },
			params: { issueKey: 'TRK-9001' },
			platform: { env }
		} as unknown as LoadEvent)) as Exclude<Awaited<ReturnType<typeof load>>, void>;

	it('offers the current stage and each move but Completed, and the RE Instructor options', async () => {
		await addRow();
		fakeJira();

		const data = await loaded();

		expect(data.stages).toEqual([
			{ name: 'Needs CATP', audit: false },
			{ name: 'In Training', audit: false },
			{ name: 'Removed', audit: false },
			{ name: 'Audit', audit: true }
		]);
		expect(data.examiners).toEqual([
			{ id: '201', value: 'HI' },
			{ id: '202', value: 'SW' },
			{ id: '203', value: 'VATUSA' }
		]);
		// 04's list is passed on as Jira gave it, Completed included.
		expect(data.transitions.map((t: { to: string }) => t.to)).toContain('Completed');
	});
});
