import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { enrollmentsTable, type InsertEnrollment } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { teachersTable } from '$lib/db/schema/teachers';
import { JIRA_FIELDS } from '$lib/server/jira/fields';
import { RE_INSTRUCTOR_FIELD } from '$lib/server/jira/status';
import type { VatusaRosterMember } from '$lib/types/vatusa';
import { checkCtrsRecords } from './ctrs-read-back';

const NOW = new Date('2026-10-28T12:00:00Z');
const SINCE = new Date('2026-10-20T16:00:00Z');

let db: Database;

beforeEach(async () => {
	db = testDb();
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	await db.insert(teachersTable).values([
		{ cid: '1000800', roles: ['MTR'], initials: 'AB' },
		{ cid: '1000900', roles: ['INS'], initials: 'CD' }
	]);
	await db.insert(rosterMembersTable).values({
		cid: '1000900',
		firstName: 'Casey',
		lastName: 'Dunn',
		rating: 8,
		ratingShort: 'I1',
		membership: 'home',
		facility: 'ZID',
		data: {} as VatusaRosterMember
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

async function addCard(overrides: Partial<InsertEnrollment> & { id: string; cid: string }) {
	await db.insert(enrollmentsTable).values({
		course: 'A-LC',
		status: 'rating-exam',
		submittedName: 'Jo Rivera',
		teacher: 'AB',
		statusSince: SINCE,
		jiraIssueKey: `TRK-${overrides.id}`,
		...overrides
	});
}

const row = async (id: string) =>
	(await db.query.enrollmentsTable.findFirst({ where: eq(enrollmentsTable.id, id) }))!;

type Record = {
	id: number;
	instructor_id: number | null;
	session_date: string;
	position: string;
	ots_status: number;
};

const pass = (overrides: Partial<Record> = {}): Record => ({
	id: 501,
	instructor_id: 1000900,
	session_date: '2026-10-25 19:00:00',
	position: 'XXX_TWR',
	ots_status: 1,
	...overrides
});

/**
 * VATUSA's records by student CID (`'down'` answers 500), and TRK as far as the
 * read-back touches it. `options` is what RE Instructor's dropdown offers.
 */
function fakeServices(
	records: { [cid: string]: Record[] | 'down' },
	{ options = ['AB', 'CD', 'VATUSA'] }: { options?: string[] } = {}
) {
	const cards = new Map<string, { status: string; updated: number }>();
	const calls: { method: string; path: string; body: any }[] = [];

	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: string, init: { method?: string; body?: string } = {}) => {
			const url = new URL(input);
			if (url.hostname === 'api.vatusa.net') {
				const cid = url.pathname.split('/')[3];
				const found = records[cid] ?? [];
				if (found === 'down') return new Response('down', { status: 500 });
				return Response.json({
					data: found.map((r) => ({ student_id: Number(cid), facility_id: 'ZID', ...r }))
				});
			}

			const method = init.method ?? 'GET';
			const path = url.pathname.replace('/rest/api/3', '');
			const body = init.body ? JSON.parse(init.body) : undefined;
			calls.push({ method, path, body });

			const [, key, rest = ''] = path.match(/^\/issue\/([^/]+)(\/.*)?$/) ?? [];
			if (!key) return Response.json({ issues: [] });
			const card = cards.get(key) ?? { status: 'Rating Exam', updated: NOW.getTime() };
			cards.set(key, card);

			if (rest === '/editmeta') {
				return Response.json({
					fields: {
						[RE_INSTRUCTOR_FIELD]: {
							allowedValues: options.map((value, i) => ({ id: String(100 + i), value }))
						}
					}
				});
			}
			if (rest === '/comment') return Response.json({}, { status: 201 });
			if (rest === '/transitions' && method === 'GET') {
				return Response.json({
					transitions: [
						{ id: '41', name: 'Pass', to: { id: '4', name: 'Audit' } },
						{ id: '42', name: 'Fail', to: { id: '5', name: 'Needs CATP' } },
						{ id: '43', name: 'Training complete', to: { id: '3', name: 'Rating Exam' } }
					]
				});
			}
			if (rest === '/transitions') {
				card.status =
					body.transition.id === '41'
						? 'Audit'
						: body.transition.id === '43'
							? 'Rating Exam'
							: 'Needs CATP';
				card.updated += 60_000;
				return new Response(null, { status: 204 });
			}
			if (method === 'PUT') return new Response(null, { status: 204 });
			return Response.json({
				key,
				fields: { status: { name: card.status }, updated: new Date(card.updated).toISOString() }
			});
		})
	);

	const comments = (key: string) =>
		calls
			.filter((c) => c.path === `/issue/${key}/comment`)
			.map((c) => c.body.body.content.map((p: any) => p.content[0].text).join('\n'));
	const puts = (key: string) =>
		calls.filter((c) => c.method === 'PUT' && c.path === `/issue/${key}`).map((c) => c.body.fields);

	return { comments, puts };
}

function fakeEnv({ refuse = false } = {}) {
	const sent: { title: string; description: string }[] = [];
	const env = {
		VATUSA_API_KEY: 'made-up-key',
		JIRA_BASE_URL: 'https://jira.test',
		JIRA_PROJECT_KEY: 'TRK',
		JIRA_USER_EMAIL: 'bot@example.com',
		JIRA_API_TOKEN: 'token',
		LARRY: {
			enqueue: async (message: any) => {
				if (refuse) throw new Error('refused');
				sent.push(message.embeds[0]);
			},
			enqueueDirect: async () => {}
		}
	} as unknown as Partial<Env>;
	return { env, sent };
}

/** How many of the notices say the record could be for either of two courses. */
const unclear = (sent: { description: string }[]) =>
	sent.filter((notice) => notice.description.includes('more than one of their courses')).length;

describe('the ctrs records job, Rating Exam half', () => {
	it('moves a pass to Audit, dated from the session, and fills RE Instructor', async () => {
		await addCard({ id: '1', cid: '1000001' });
		const jira = fakeServices({ '1000001': [pass()] });
		const { env } = fakeEnv();

		const result = await checkCtrsRecords(db, env, NOW);

		expect(result.ratingExam).toEqual({ checked: 1, passed: 1, failed: 0, told: 0, errors: 0 });
		expect(jira.puts('TRK-1')).toContainEqual({ [RE_INSTRUCTOR_FIELD]: { id: '101' } });
		expect(jira.puts('TRK-1')).toContainEqual({ [JIRA_FIELDS.reCompleted]: '2026-10-25' });
		expect(jira.comments('TRK-1')).toContain(
			"Rating exam passed: CTRS record 501 of 2026-10-25, filed by Casey Dunn (1000900), found in VATUSA's records. RE Instructor set to CD. (through training.flyindycenter.com)"
		);
		expect((await row('1')).status).toBe('certification-update');
	});

	it('moves a fail to Needs CATP and names a different examiner', async () => {
		await addCard({ id: '1', cid: '1000001', reInstructor: 'EF' });
		const jira = fakeServices({ '1000001': [pass({ ots_status: 2, instructor_id: 1000555 })] });
		const { env } = fakeEnv();

		const result = await checkCtrsRecords(db, env, NOW);

		expect(result.ratingExam).toMatchObject({ failed: 1, errors: 0 });
		expect(jira.comments('TRK-1')).toContain(
			"Rating exam not passed: CTRS record 501 of 2026-10-25, filed by 1000555, found in VATUSA's records. The card's examiner is EF. (through training.flyindycenter.com)"
		);
		expect(jira.puts('TRK-1')).not.toContainEqual(
			expect.objectContaining({ [RE_INSTRUCTOR_FIELD]: expect.anything() })
		);
		expect((await row('1')).status).toBe('needs-catp');
	});

	// The fail is dated from the session, not the day the record was found
	// (#215); the move's own stamp then keeps it (`fieldsForMove()`).
	it('dates RE Failed from the session, before the move', async () => {
		await addCard({ id: '1', cid: '1000001', reInstructor: 'EF' });
		const jira = fakeServices({ '1000001': [pass({ ots_status: 2 })] });
		const { env } = fakeEnv();

		await checkCtrsRecords(db, env, NOW);

		const reFailed = jira.puts('TRK-1').filter((fields) => JIRA_FIELDS.reFailed in fields);
		expect(reFailed[0]).toEqual({ [JIRA_FIELDS.reFailed]: '2026-10-25' });
	});

	it('falls back to the VATUSA option when the dropdown lacks the instructor', async () => {
		await addCard({ id: '1', cid: '1000001' });
		const jira = fakeServices({ '1000001': [pass()] }, { options: ['AB', 'VATUSA'] });
		const { env } = fakeEnv();

		await checkCtrsRecords(db, env, NOW);

		expect(jira.puts('TRK-1')).toContainEqual({ [RE_INSTRUCTOR_FIELD]: { id: '101' } });
		expect(jira.comments('TRK-1')[0]).toContain('RE Instructor set to VATUSA.');
	});

	it('does not act, and counts an error, with neither the instructor nor VATUSA offered', async () => {
		await addCard({ id: '1', cid: '1000001' });
		const jira = fakeServices({ '1000001': [pass()] }, { options: ['AB'] });
		const { env } = fakeEnv();

		const result = await checkCtrsRecords(db, env, NOW);

		expect(result.ratingExam).toMatchObject({ passed: 0, errors: 1 });
		expect(jira.puts('TRK-1')).toEqual([]);
		expect((await row('1')).status).toBe('rating-exam');
	});

	it("tells the training admins once when the teacher filed it, and doesn't move the card", async () => {
		await addCard({ id: '1', cid: '1000001', teacher: 'CD' });
		const jira = fakeServices({ '1000001': [pass()] });
		const { env, sent } = fakeEnv();

		const first = await checkCtrsRecords(db, env, NOW);
		const second = await checkCtrsRecords(db, env, NOW);

		expect(first.ratingExam).toMatchObject({ told: 1, passed: 0 });
		expect(second.ratingExam).toMatchObject({ told: 0, passed: 0 });
		expect(sent).toHaveLength(1);
		expect(sent[0].description).toContain('filed by Casey Dunn, who is their teacher on the card');
		expect((await row('1')).ctrsNotice).toBe('501');
		expect(jira.comments('TRK-1')).toEqual([]);
	});

	it('tells again next run when Larry refused the notice', async () => {
		await addCard({ id: '1', cid: '1000001', teacher: 'CD' });
		fakeServices({ '1000001': [pass()] });

		await checkCtrsRecords(db, fakeEnv({ refuse: true }).env, NOW);
		expect((await row('1')).ctrsNotice).toBeNull();

		const { env, sent } = fakeEnv();
		await checkCtrsRecords(db, env, NOW);
		expect(sent).toHaveLength(1);
	});

	it("tells once, and doesn't move or count an error, when the record names no instructor", async () => {
		await addCard({ id: '1', cid: '1000001' });
		const jira = fakeServices({ '1000001': [pass({ instructor_id: null })] });
		const { env, sent } = fakeEnv();

		const first = await checkCtrsRecords(db, env, NOW);
		const second = await checkCtrsRecords(db, env, NOW);

		expect(first.ratingExam).toEqual({ checked: 1, passed: 0, failed: 0, told: 1, errors: 0 });
		expect(second.ratingExam).toEqual({ checked: 1, passed: 0, failed: 0, told: 0, errors: 0 });
		expect(sent).toHaveLength(1);
		expect(sent[0].description).toContain('VATUSA names no instructor on it');
		expect(jira.comments('TRK-1')).toEqual([]);
		expect((await row('1')).status).toBe('rating-exam');
	});

	it("carries on to the next card after one student's records cannot be read", async () => {
		await addCard({ id: '1', cid: '1000001' });
		await addCard({ id: '2', cid: '1000002' });
		fakeServices({ '1000001': 'down', '1000002': [pass()] });
		const { env } = fakeEnv();

		const result = await checkCtrsRecords(db, env, NOW);

		expect(result.ratingExam).toEqual({ checked: 2, passed: 1, failed: 0, told: 0, errors: 1 });
		expect((await row('2')).status).toBe('certification-update');
	});

	it('skips a card with no status_since', async () => {
		await addCard({ id: '1', cid: '1000001', statusSince: null });
		const jira = fakeServices({ '1000001': [pass()] });
		const { env } = fakeEnv();

		const result = await checkCtrsRecords(db, env, NOW);

		expect(result.ratingExam.checked).toBe(0);
		expect(jira.comments('TRK-1')).toEqual([]);
	});

	describe('Custom Training', () => {
		it('moves the only open card on a record of any position type', async () => {
			await addCard({ id: '1', cid: '1000001', course: 'CUSTOM' });
			await addCard({ id: '2', cid: '1000001', course: 'S-GC', status: 'completed' });
			fakeServices({ '1000001': [pass({ position: 'XXX_CTR' })] });
			const { env } = fakeEnv();

			const result = await checkCtrsRecords(db, env, NOW);

			expect(result.ratingExam).toMatchObject({ passed: 1 });
			expect((await row('1')).status).toBe('certification-update');
		});

		it("tells, and doesn't move, with another open card", async () => {
			await addCard({ id: '1', cid: '1000001', course: 'CUSTOM' });
			await addCard({ id: '2', cid: '1000001', course: 'E-RC', status: 'in-training' });
			const jira = fakeServices({ '1000001': [pass({ position: 'XXX_CTR' })] });
			const { env, sent } = fakeEnv();

			const result = await checkCtrsRecords(db, env, NOW);

			expect(result.ratingExam).toMatchObject({ passed: 0, told: 1 });
			expect(sent[0].description).toBe(
				"Jo Rivera (1000001) has a CTRS record of October 25, 2026 giving a pass at XXX_CTR, but more than one of their courses could be the one it's for. The card was not moved."
			);
			expect((await row('1')).status).toBe('rating-exam');
			expect(jira.comments('TRK-1')).toEqual([]);
		});

		it.each([
			['before', ['s', 'c']],
			['after', ['c', 's']]
		])(
			'judges the other card as the run found it, examined %s the Custom card; a told record stays unmoved',
			async (_, order) => {
				// The half reads the oldest request first: `order` is the order it examines them.
				for (const [i, id] of order.entries()) {
					await addCard({
						id,
						cid: '1000001',
						course: id === 's' ? 'S-GC' : 'CUSTOM',
						createdAt: new Date(Date.UTC(2026, 9, 1, 0, i))
					});
				}
				const gnd = pass({ position: 'XXX_GND' });
				fakeServices({ '1000001': [gnd] });
				const { env, sent } = fakeEnv();

				// The S-GC pass moves S-GC on, but the Custom card is still not moved.
				const first = await checkCtrsRecords(db, env, NOW);
				expect(first.ratingExam).toMatchObject({ passed: 1, told: 1 });
				expect((await row('s')).status).toBe('certification-update');
				expect((await row('c')).status).toBe('rating-exam');
				expect((await row('c')).ctrsNotice).toBe('501');
				expect(unclear(sent)).toBe(1);

				// A second run, with the other card gone: the told record still doesn't move it.
				const second = await checkCtrsRecords(db, env, NOW);
				expect(second.ratingExam).toMatchObject({ passed: 0, told: 0, errors: 0 });
				expect((await row('c')).status).toBe('rating-exam');
				expect(unclear(sent)).toBe(1);

				// A newer record is judged afresh: it is now the only open card.
				fakeServices({
					'1000001': [
						gnd,
						pass({ id: 502, session_date: '2026-10-26 19:00:00', position: 'XXX_CTR' })
					]
				});
				const third = await checkCtrsRecords(db, env, NOW);
				expect(third.ratingExam).toMatchObject({ passed: 1 });
				expect((await row('c')).status).toBe('certification-update');
			}
		);
	});

	it('does nothing without a VATUSA key', async () => {
		await addCard({ id: '1', cid: '1000001' });
		const { env } = fakeEnv();
		const result = await checkCtrsRecords(db, { ...env, VATUSA_API_KEY: '' }, NOW);
		expect(result).toMatchObject({
			skipped: 'no-api-key',
			ratingExam: { checked: 0 },
			inTraining: { checked: 0 }
		});
	});
});

describe('the ctrs records job, In Training half', () => {
	const recommend = (overrides: Partial<Record> = {}) =>
		pass({ ots_status: 3, instructor_id: 1000900, ...overrides });

	const addTraining = (overrides: Partial<InsertEnrollment> & { id: string; cid: string }) =>
		addCard({ status: 'in-training', teacher: 'CD', ...overrides });

	it("moves the teacher's Recommend to Rating Exam, dated from the session", async () => {
		await addTraining({ id: '1', cid: '1000001' });
		const jira = fakeServices({ '1000001': [recommend()] });
		const { env } = fakeEnv();

		const result = await checkCtrsRecords(db, env, NOW);

		expect(result.inTraining).toEqual({ checked: 1, moved: 1, told: 0, errors: 0 });
		expect(result.ratingExam.checked).toBe(0);
		expect(jira.puts('TRK-1')).toContainEqual({ [JIRA_FIELDS.trainingCompleted]: '2026-10-25' });
		expect(jira.comments('TRK-1')).toContain(
			"Recommended for a rating exam: CTRS record 501 of 2026-10-25, filed by Casey Dunn (1000900), found in VATUSA's records. (through training.flyindycenter.com)"
		);
		expect((await row('1')).status).toBe('rating-exam');
	});

	it("tells once, and doesn't move, when another instructor filed it", async () => {
		await addTraining({ id: '1', cid: '1000001', teacher: 'AB' });
		const jira = fakeServices({ '1000001': [recommend()] });
		const { env, sent } = fakeEnv();

		const first = await checkCtrsRecords(db, env, NOW);
		const second = await checkCtrsRecords(db, env, NOW);

		expect(first.inTraining).toMatchObject({ moved: 0, told: 1 });
		expect(second.inTraining).toMatchObject({ moved: 0, told: 0 });
		expect(sent).toHaveLength(1);
		expect(sent[0].description).toBe(
			"Jo Rivera (1000001)'s Advanced Local Control (A-LC) has a CTRS record of October 25, 2026 recommending a rating exam, filed by Casey Dunn, who isn't their teacher on the card (AB). The card was not moved. Ask the teacher to mark the training complete on /teach, or move the card by hand."
		);
		expect((await row('1')).ctrsNotice).toBe('501');
		expect((await row('1')).status).toBe('in-training');
		expect(jira.comments('TRK-1')).toEqual([]);
	});

	it('tells when the card has no teacher', async () => {
		await addTraining({ id: '1', cid: '1000001', teacher: null });
		fakeServices({ '1000001': [recommend()] });
		const { env, sent } = fakeEnv();

		const result = await checkCtrsRecords(db, env, NOW);

		expect(result.inTraining).toMatchObject({ moved: 0, told: 1 });
		expect(sent[0].description).toContain('(no teacher)');
		expect((await row('1')).status).toBe('in-training');
	});

	it('ignores a Recommend from before status_since', async () => {
		await addTraining({ id: '1', cid: '1000001' });
		fakeServices({ '1000001': [recommend({ session_date: '2026-10-19 19:00:00' })] });
		const { env, sent } = fakeEnv();

		const result = await checkCtrsRecords(db, env, NOW);

		expect(result.inTraining).toEqual({ checked: 1, moved: 0, told: 0, errors: 0 });
		expect(sent).toEqual([]);
	});

	describe('Custom Training', () => {
		it('moves the only open card on a Recommend of any position type', async () => {
			await addTraining({ id: '1', cid: '1000001', course: 'CUSTOM' });
			await addCard({ id: '2', cid: '1000001', course: 'S-GC', status: 'completed' });
			fakeServices({ '1000001': [recommend({ position: 'XXX_CTR' })] });
			const { env } = fakeEnv();

			const result = await checkCtrsRecords(db, env, NOW);

			expect(result.inTraining).toMatchObject({ moved: 1 });
			expect((await row('1')).status).toBe('rating-exam');
		});

		it("tells, and doesn't move, with another open card", async () => {
			await addTraining({ id: '1', cid: '1000001', course: 'CUSTOM' });
			await addCard({ id: '2', cid: '1000001', course: 'S-GC', status: 'in-training' });
			const jira = fakeServices({ '1000001': [recommend({ position: 'XXX_CTR' })] });
			const { env, sent } = fakeEnv();

			const result = await checkCtrsRecords(db, env, NOW);

			expect(result.inTraining).toMatchObject({ moved: 0, told: 1 });
			expect(sent[0].description).toBe(
				"Jo Rivera (1000001) has a CTRS record of October 25, 2026 recommending a rating exam at XXX_CTR, but more than one of their courses could be the one it's for. The card was not moved."
			);
			expect((await row('1')).status).toBe('in-training');
			expect(jira.comments('TRK-1')).toEqual([]);
		});

		it.each([
			['before', ['s', 'c']],
			['after', ['c', 's']]
		])(
			'never moves a Custom card on a record it was told about, the other card examined %s it',
			async (_, order) => {
				for (const id of order) {
					await addTraining(
						id === 's'
							? { id, cid: '1000001', course: 'S-GC' }
							: { id, cid: '1000001', course: 'CUSTOM' }
					);
				}
				fakeServices({ '1000001': [recommend({ position: 'XXX_GND' })] });
				const { env, sent } = fakeEnv();

				// The S-GC Recommend moves S-GC on, but the Custom card is still not moved.
				const first = await checkCtrsRecords(db, env, NOW);
				expect(first.inTraining).toMatchObject({ moved: 1, told: 1 });
				expect((await row('s')).status).toBe('rating-exam');
				expect((await row('c')).status).toBe('in-training');
				expect((await row('c')).ctrsNotice).toBe('501');
				expect(unclear(sent)).toBe(1);

				// The other card leaves; the told record still doesn't move the Custom card.
				await db
					.update(enrollmentsTable)
					.set({ status: 'completed' })
					.where(eq(enrollmentsTable.id, 's'));
				const second = await checkCtrsRecords(db, env, NOW);
				expect(second.inTraining).toMatchObject({ moved: 0, told: 0, errors: 0 });
				expect((await row('c')).status).toBe('in-training');
				expect(unclear(sent)).toBe(1);

				// A newer record is judged afresh: it is now the only open card.
				fakeServices({
					'1000001': [
						recommend({ position: 'XXX_GND' }),
						recommend({ id: 502, session_date: '2026-10-26 19:00:00', position: 'XXX_CTR' })
					]
				});
				const third = await checkCtrsRecords(db, env, NOW);
				expect(third.inTraining).toMatchObject({ moved: 1 });
				expect((await row('c')).status).toBe('rating-exam');
			}
		);
		it('judges the other card as the run found it, though the Rating Exam half moves it first', async () => {
			await addCard({ id: 's', cid: '1000001', course: 'S-GC' });
			await addTraining({ id: 'c', cid: '1000001', course: 'CUSTOM' });
			fakeServices({
				'1000001': [
					pass({ id: 501, position: 'XXX_GND' }),
					recommend({ id: 502, position: 'XXX_GND' })
				]
			});
			const { env, sent } = fakeEnv();

			// S-GC passes in the Rating Exam half, before the Custom card is examined.
			const first = await checkCtrsRecords(db, env, NOW);
			expect(first.ratingExam).toMatchObject({ passed: 1 });
			expect(first.inTraining).toMatchObject({ moved: 0, told: 1 });
			expect((await row('s')).status).toBe('certification-update');
			expect((await row('c')).status).toBe('in-training');
			expect((await row('c')).ctrsNotice).toBe('502');
			expect(unclear(sent)).toBe(1);

			const second = await checkCtrsRecords(db, env, NOW);
			expect(second.inTraining).toMatchObject({ moved: 0, told: 0, errors: 0 });
			expect((await row('c')).status).toBe('in-training');
			expect(unclear(sent)).toBe(1);
		});
	});

	describe('which cards are read', () => {
		it('reads only In Training cards on a course that can end in an exam', async () => {
			await addTraining({ id: '1', cid: '1000001', course: 'A-GC' });
			await addTraining({ id: '2', cid: '1000002', course: 'S-LC' });
			await addTraining({ id: '3', cid: '1000003', course: 'T-RC' });
			await addTraining({ id: '4', cid: '1000004', course: 'CUSTOM' });
			await addTraining({ id: '5', cid: '1000005', statusSince: null });
			await addTraining({ id: '6', cid: '1000006', jiraIssueKey: null });
			await addTraining({ id: '7', cid: '1000007', withdrawnAt: NOW });
			await addCard({ id: '8', cid: '1000008' });
			fakeServices({});
			const { env } = fakeEnv();

			const result = await checkCtrsRecords(db, env, NOW);

			expect(result.inTraining.checked).toBe(2);
			expect((await row('3')).ctrsCheckedAt).toEqual(NOW);
			expect((await row('4')).ctrsCheckedAt).toEqual(NOW);
			for (const id of ['1', '2', '5', '6', '7', '8']) {
				expect((await row(id)).ctrsCheckedAt).toBeNull();
			}
		});

		it('reads at most 20, the least recently checked first and never checked first of all', async () => {
			for (let i = 1; i <= 25; i += 1) {
				await addTraining({
					id: String(i),
					cid: String(1001000 + i),
					// 1-5 never checked; the rest checked at ascending times, 6 the oldest.
					ctrsCheckedAt: i <= 5 ? null : new Date(Date.UTC(2026, 9, 1, 0, i))
				});
			}
			fakeServices({});
			const { env } = fakeEnv();

			const first = await checkCtrsRecords(db, env, NOW);

			expect(first.inTraining.checked).toBe(20);
			// The 20 are 1-5 (never) and 6-20; 21-25, checked most recently, wait.
			for (let i = 1; i <= 20; i += 1) expect((await row(String(i))).ctrsCheckedAt).toEqual(NOW);
			for (let i = 21; i <= 25; i += 1) {
				expect((await row(String(i))).ctrsCheckedAt).not.toEqual(NOW);
			}

			const second = await checkCtrsRecords(db, env, NOW);
			expect(second.inTraining.checked).toBe(20);
			expect((await row('25')).ctrsCheckedAt).toEqual(NOW);
		});

		it('stamps a card whose read failed, and goes on to the next', async () => {
			await addTraining({ id: '1', cid: '1000001' });
			await addTraining({ id: '2', cid: '1000002' });
			fakeServices({ '1000001': 'down', '1000002': [recommend()] });
			const { env } = fakeEnv();

			const result = await checkCtrsRecords(db, env, NOW);

			expect(result.inTraining).toEqual({ checked: 2, moved: 1, told: 0, errors: 1 });
			expect((await row('1')).ctrsCheckedAt).toEqual(NOW);
			expect((await row('1')).status).toBe('in-training');
			expect((await row('2')).status).toBe('rating-exam');
		});
	});
});
