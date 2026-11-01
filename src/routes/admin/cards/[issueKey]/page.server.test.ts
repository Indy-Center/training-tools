import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { enrollmentsTable, type InsertEnrollment } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import type { VatusaRosterMember } from '$lib/types/vatusa';
import { JIRA_FIELDS } from '$lib/server/jira/fields';
import { RE_INSTRUCTOR_FIELD, TEACHER_FIELD } from '$lib/server/jira/status';
import { Role } from '$lib/utils/permissions';
import { load } from './+page.server';

/**
 * `/admin/cards/{key}`: the enrollment row with that key and its TRK card, read
 * live. Runs against the in-memory D1 with Jira stubbed at `fetch`.
 */

const env = {
	JIRA_BASE_URL: 'https://jira.test',
	JIRA_PROJECT_KEY: 'TRK',
	JIRA_USER_EMAIL: 'bot@example.com',
	JIRA_API_TOKEN: 'token'
} as unknown as Partial<Env>;

const admin = { user: { cid: '3000001' }, roles: [Role.ADMIN] };
const studentsOnly = { user: { cid: '3000002' }, roles: [Role.STUDENTS] };

let db: Database;

beforeEach(async () => {
	db = testDb();
	vi.spyOn(console, 'error').mockImplementation(() => {});
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

/** TRK as the card page reads it: the card, its moves and its comments. */
function stubJira({ fail = false } = {}) {
	const fetch = vi.fn(async (url: string) => {
		if (fail) return new Response('Internal error', { status: 500 });
		const { pathname } = new URL(url);
		if (pathname.endsWith('/transitions')) {
			return Response.json({
				transitions: [
					{ id: '11', name: 'Back to training', to: { name: 'In Training' } },
					{ id: '12', name: 'Retrain', to: { name: 'In Training' } },
					{ id: '13', name: 'Remove', to: { name: 'Removed' } }
				]
			});
		}
		if (pathname.endsWith('/comment')) {
			return Response.json({
				comments: [
					{
						id: '100',
						author: { displayName: 'Sam Weller' },
						created: '2026-10-02T10:00:00.000-0400',
						body: {
							type: 'doc',
							version: 1,
							content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Exam failed.' }] }]
						}
					}
				]
			});
		}
		return Response.json({
			key: 'TRK-9001',
			fields: {
				status: { name: 'Needs CATP' },
				[TEACHER_FIELD]: { value: 'SW' },
				[RE_INSTRUCTOR_FIELD]: { value: 'HI' },
				[JIRA_FIELDS.trainingCompleted]: '2026-10-01',
				[JIRA_FIELDS.teacherAssigned]: '2026-09-01'
			}
		});
	});
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

type Event = Parameters<typeof load>[0];

function event(session: unknown, issueKey = 'TRK-9001', withEnv: Partial<Env> | undefined = env) {
	return {
		locals: { db, session },
		params: { issueKey },
		platform: { env: withEnv }
	} as unknown as Event;
}

const loaded = async (e: Event) =>
	(await load(e)) as Exclude<Awaited<ReturnType<typeof load>>, void>;

describe('/admin/cards/{key} access', () => {
	it('lets a training admin see the row and the live card', async () => {
		await addRow();
		stubJira();

		const data = await loaded(event(admin));

		expect(data.issueKey).toBe('TRK-9001');
		expect(data.enrollment).toMatchObject({
			cid: '1000001',
			name: 'Jo Rivera',
			course: 'T-RC',
			status: 'needs-catp'
		});
		expect(data.jiraUrl).toBe('https://jira.test/browse/TRK-9001');
		expect(data.jiraError).toBeNull();
		expect(data.card).toMatchObject({
			status: 'Needs CATP',
			teacher: 'SW',
			reInstructor: 'HI',
			dates: { trainingCompleted: '2026-10-01', teacherAssigned: '2026-09-01', reCompleted: null }
		});
		expect(data.transitions).toEqual([
			{ id: '11', name: 'Back to training', to: 'In Training' },
			{ id: '13', name: 'Remove', to: 'Removed' }
		]);
		expect(data.comments).toEqual([
			{
				id: '100',
				author: 'Sam Weller',
				created: '2026-10-02T10:00:00.000-0400',
				text: 'Exam failed.'
			}
		]);
		expect(data.hold).toEqual([]);
	});

	it('sends someone who manages students but is not a training admin home, unread', async () => {
		await addRow();
		const fetch = stubJira();

		await expect(async () => load(event(studentsOnly))).rejects.toMatchObject({
			status: 303,
			location: '/'
		});
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('/admin/cards/{key} refusals', () => {
	it('is a 404 for a key no enrollment has', async () => {
		await addRow();
		stubJira();

		await expect(async () => load(event(admin, 'TRK-9002'))).rejects.toMatchObject({
			status: 404,
			body: { message: 'No enrollment in the app for TRK-9002.' }
		});
	});

	it('shows the row without a card when Jira is not configured', async () => {
		await addRow();
		const fetch = stubJira();

		const data = await loaded(event(admin, 'TRK-9001', {}));

		expect(data.enrollment.cid).toBe('1000001');
		expect(data.card).toBeNull();
		expect(data.transitions).toEqual([]);
		expect(data.comments).toEqual([]);
		expect(data.jiraError).toBe(
			"Couldn't read TRK-9001 from Jira: Jira isn't configured for this app."
		);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('shows the row without a card, and Jira’s error, when Jira fails', async () => {
		await addRow();
		stubJira({ fail: true });

		const data = await loaded(event(admin));

		expect(data.enrollment.cid).toBe('1000001');
		expect(data.card).toBeNull();
		expect(data.transitions).toEqual([]);
		expect(data.comments).toEqual([]);
		expect(data.jiraError).toMatch(/^Couldn't read TRK-9001 from Jira: Jira GET .* returned 500/);
	});
});

describe('/admin/cards/{key} hold', () => {
	it('lists what a held card is missing', async () => {
		await addRow({
			status: 'certification-update',
			certificationHold: 're-instructor,re-completed'
		});
		stubJira();

		const data = await loaded(event(admin));

		expect(data.hold).toEqual(['RE Instructor', 'RE Completed']);
	});
});
