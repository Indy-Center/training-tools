import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JiraConfig } from './client';
import { distinctTransitions, fetchCard, fetchLatestComments, fetchTransitions } from './card';
import { JIRA_FIELDS } from './fields';
import { RE_INSTRUCTOR_FIELD, TEACHER_FIELD } from './status';

const config: JiraConfig = {
	baseUrl: 'https://jira.test',
	projectKey: 'TRK',
	email: 'bot@example.com',
	apiToken: 'token'
};

/** Answers every request with `body`, and records what was asked. */
function stubJira(body: unknown, status = 200) {
	const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
		status === 200
			? new Response(JSON.stringify(body), { status })
			: new Response('Internal error', { status })
	);
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

const transition = (id: string, name: string, to: string) => ({
	id,
	name,
	to: { id: `s${id}`, name: to }
});

describe('distinctTransitions', () => {
	it('keeps one move per target status, the first Jira lists', () => {
		expect(
			distinctTransitions([
				transition('11', 'Back to training', 'In Training'),
				transition('12', 'Send to exam', 'Rating Exam'),
				transition('13', 'Retrain', 'In Training')
			])
		).toEqual([
			{ id: '11', name: 'Back to training', to: 'In Training' },
			{ id: '12', name: 'Send to exam', to: 'Rating Exam' }
		]);
	});

	it('treats status names that differ only in case or spaces as the same', () => {
		expect(
			distinctTransitions([
				transition('21', 'Remove', 'Removed'),
				transition('22', 'Remove (old)', ' removed ')
			])
		).toEqual([{ id: '21', name: 'Remove', to: 'Removed' }]);
	});

	// Completed is offered like any other move; leaving it out is the form's job.
	it('keeps every status, Completed included', () => {
		expect(distinctTransitions([transition('31', 'Done', 'Completed')])).toEqual([
			{ id: '31', name: 'Done', to: 'Completed' }
		]);
	});

	it('drops a transition with no target status', () => {
		expect(distinctTransitions([{ id: '41', name: 'Broken' } as never])).toEqual([]);
	});
});

describe('fetchTransitions', () => {
	it('asks Jira what the card can do now, one move per status', async () => {
		const fetch = stubJira({
			transitions: [
				transition('11', 'Back to training', 'In Training'),
				transition('13', 'Retrain', 'In Training'),
				transition('14', 'Remove', 'Removed')
			]
		});

		expect(await fetchTransitions(config, 'TRK-9001')).toEqual([
			{ id: '11', name: 'Back to training', to: 'In Training' },
			{ id: '14', name: 'Remove', to: 'Removed' }
		]);
		expect(fetch.mock.calls[0][0]).toBe('https://jira.test/rest/api/3/issue/TRK-9001/transitions');
		expect(fetch.mock.calls[0][1]?.method).toBe('GET');
	});

	it('throws when Jira fails', async () => {
		stubJira(null, 500);
		await expect(fetchTransitions(config, 'TRK-9001')).rejects.toThrow(/returned 500/);
	});
});

const adf = (...paragraphs: string[]) => ({
	type: 'doc',
	version: 1,
	content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] }))
});

describe('fetchLatestComments', () => {
	it('reads the five newest, newest first, as plain text', async () => {
		const fetch = stubJira({
			comments: [
				{
					id: '100',
					author: { displayName: 'Training Bot' },
					created: '2026-10-01T10:00:00.000-0400',
					body: adf('Older note.')
				},
				{
					id: '101',
					author: { displayName: 'Sam Weller' },
					created: '2026-10-02T10:00:00.000-0400',
					body: adf('First line.', 'Second line.')
				}
			]
		});

		expect(await fetchLatestComments(config, 'TRK-9001')).toEqual([
			{
				id: '101',
				author: 'Sam Weller',
				created: '2026-10-02T10:00:00.000-0400',
				text: 'First line.\nSecond line.'
			},
			{
				id: '100',
				author: 'Training Bot',
				created: '2026-10-01T10:00:00.000-0400',
				text: 'Older note.'
			}
		]);

		const url = new URL(fetch.mock.calls[0][0]);
		expect(url.pathname).toBe('/rest/api/3/issue/TRK-9001/comment');
		expect(url.searchParams.get('orderBy')).toBe('-created');
		expect(url.searchParams.get('maxResults')).toBe('5');
	});

	it('keeps no more than five, whatever Jira sends', async () => {
		stubJira({
			comments: Array.from({ length: 7 }, (_, i) => ({
				id: String(i),
				created: `2026-10-0${i + 1}T10:00:00.000-0400`,
				body: adf(`Note ${i}`)
			}))
		});

		const comments = await fetchLatestComments(config, 'TRK-9001');
		expect(comments.map((c) => c.text)).toEqual(['Note 6', 'Note 5', 'Note 4', 'Note 3', 'Note 2']);
	});

	it('reads a comment with no author or body as empty, not as an error', async () => {
		stubJira({ comments: [{ id: '7' }] });
		expect(await fetchLatestComments(config, 'TRK-9001')).toEqual([
			{ id: '7', author: null, created: null, text: '' }
		]);
	});

	it('is empty for a card with no comments', async () => {
		stubJira({});
		expect(await fetchLatestComments(config, 'TRK-9001')).toEqual([]);
	});
});

describe('fetchCard', () => {
	it('reads the status, the people and every date the form edits', async () => {
		const fetch = stubJira({
			key: 'TRK-9001',
			fields: {
				status: { name: 'Needs CATP' },
				[TEACHER_FIELD]: { value: 'SW' },
				[RE_INSTRUCTOR_FIELD]: { value: 'HI' },
				[JIRA_FIELDS.trainingCompleted]: '2026-10-01',
				[JIRA_FIELDS.reCompleted]: null,
				[JIRA_FIELDS.teacherAssigned]: '2026-09-01',
				[JIRA_FIELDS.vatusaAssigned]: '2026-08-20',
				[JIRA_FIELDS.vatusaCompleted]: '2026-08-25'
			}
		});

		expect(await fetchCard(config, 'TRK-9001')).toEqual({
			status: 'Needs CATP',
			teacher: 'SW',
			reInstructor: 'HI',
			dates: {
				trainingCompleted: '2026-10-01',
				reCompleted: null,
				teacherAssigned: '2026-09-01',
				removed: null,
				vatusaAssigned: '2026-08-20',
				vatusaCompleted: '2026-08-25'
			}
		});

		const url = new URL(fetch.mock.calls[0][0]);
		expect(url.pathname).toBe('/rest/api/3/issue/TRK-9001');
		expect(url.searchParams.get('fields')?.split(',')).toEqual(
			expect.arrayContaining([
				'status',
				TEACHER_FIELD,
				RE_INSTRUCTOR_FIELD,
				JIRA_FIELDS.trainingCompleted,
				JIRA_FIELDS.reCompleted,
				JIRA_FIELDS.teacherAssigned,
				JIRA_FIELDS.removed,
				JIRA_FIELDS.vatusaAssigned,
				JIRA_FIELDS.vatusaCompleted
			])
		);
	});

	it('reads an empty card as nulls', async () => {
		stubJira({ key: 'TRK-9001', fields: { [TEACHER_FIELD]: { value: '  ' } } });
		const card = await fetchCard(config, 'TRK-9001');
		expect(card.status).toBeNull();
		expect(card.teacher).toBeNull();
		expect(card.reInstructor).toBeNull();
		expect(Object.values(card.dates).every((value) => value === null)).toBe(true);
	});

	it('throws when Jira fails', async () => {
		stubJira(null, 500);
		await expect(fetchCard(config, 'TRK-9001')).rejects.toThrow(/returned 500/);
	});
});
