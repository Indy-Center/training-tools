import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWaitlistPosition } from '$lib/server/enrollments';
import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { enrollmentsTable } from '$lib/db/schema/enrollments';
import { rosterMembersTable, type InsertRosterMember } from '$lib/db/schema/roster';
import type { VatusaRosterMember } from '$lib/types/vatusa';
import { actions, load } from './+page.server';

const LEFT = new Date('2026-10-20T15:00:00Z');
const RESTORE_BY = new Date('2026-11-19T15:00:00Z');
const CID = '1000001';

let db: Database;

beforeEach(async () => {
	db = testDb();
	// Removed by the roster removals job: in its restore window.
	await db.insert(enrollmentsTable).values({
		id: 'a',
		cid: CID,
		course: 'S-LC',
		status: 'removed',
		submittedName: 'Jo Rivera',
		jiraIssueKey: 'TRK-1',
		rosterRemovedAt: new Date('2026-10-21T16:00:00Z'),
		rosterRemovedFrom: 'waitlist',
		leftHomeAt: LEFT,
		restoreBy: RESTORE_BY
	});
});

async function member(overrides: Partial<InsertRosterMember>) {
	await db.insert(rosterMembersTable).values({
		cid: CID,
		firstName: 'Jo',
		lastName: 'Rivera',
		rating: 3,
		ratingShort: 'S2',
		membership: 'home',
		facility: 'ZID',
		data: {} as VatusaRosterMember,
		...overrides
	});
}

function locals() {
	return {
		db,
		session: {
			roles: [],
			user: {
				cid: CID,
				attributes: {},
				vatsimData: {
					personal: { name_full: 'Jo Rivera' },
					vatsim: { rating: { id: 3, short: 'S2' }, division: { id: 'USA' } }
				}
			}
		}
	} as unknown as App.Locals;
}

type LoadEvent = Parameters<typeof load>[0];
type EnrollEvent = Parameters<typeof actions.enroll>[0];

const visit = () =>
	load({ locals: locals(), url: new URL('https://training.test/') } as unknown as LoadEvent);

const enroll = () =>
	actions.enroll({
		locals: locals(),
		request: new Request('https://training.test/?/enroll', {
			method: 'POST',
			body: new FormData()
		}),
		platform: undefined
	} as unknown as EnrollEvent);

describe('/ as a student whose request is paused by a roster removal', () => {
	for (const [where, row] of [
		['gone from the VATUSA roster', { leftHomeAt: LEFT, removedAt: LEFT }],
		['on it as a visitor', { leftHomeAt: LEFT, membership: 'visit' as const }]
	] as const) {
		it(`shows the paused request, ${where}`, async () => {
			await member(row);

			const data = (await visit()) as Exclude<Awaited<ReturnType<typeof visit>>, void>;

			expect(data.flow).toBe('left-home-roster');
			expect(data.enroll).toBeNull();
			// 30 days after leaving, as a facility day.
			expect(data.request).toMatchObject({ id: 'a', course: 'S-LC', restoreBy: '2026-11-19' });
		});

		it(`refuses ?/enroll, ${where}`, async () => {
			await member(row);

			expect(await enroll()).toMatchObject({
				status: 409,
				data: { formError: 'You already have an open training request.' }
			});
		});
	}
});

describe('/ once the restore window has expired', () => {
	it('no longer shows the paused request, and ?/enroll no longer refuses for it', async () => {
		await member({ leftHomeAt: LEFT, membership: 'visit' });
		await db
			.update(enrollmentsTable)
			.set({ restoreClosedAt: RESTORE_BY, restoreClosedReason: 'expired' })
			.where(eq(enrollmentsTable.id, 'a'));

		const data = (await visit()) as Exclude<Awaited<ReturnType<typeof visit>>, void>;
		expect(data.flow).not.toBe('left-home-roster');
		expect(data.request).toBeNull();
		// Not refused for the closed request: a visitor is sent on, as with none.
		await expect(enroll()).rejects.toMatchObject({ status: 303 });
	});
});

describe('/ as a home controller whose restore window expired', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('offers enrolling, and files the new request behind everyone already waiting', async () => {
		// VATSIM's session history, empty: nothing for the consolidation check to count.
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ items: [], count: 0 }))
		);
		await member({ membership: 'home' });
		await db
			.update(enrollmentsTable)
			.set({ restoreClosedAt: RESTORE_BY, restoreClosedReason: 'expired' })
			.where(eq(enrollmentsTable.id, 'a'));

		const data = (await visit()) as Exclude<Awaited<ReturnType<typeof visit>>, void>;
		expect(data.flow).toBe('enroll');
		expect(data.request).toBeNull();
		expect(data.enroll).not.toBeNull();

		// Someone already waiting for the course the form offers.
		const offered = data.courseOptions[0];
		await db.insert(enrollmentsTable).values({
			id: 'w',
			cid: '1000009',
			course: offered,
			submittedName: 'Ana Ruiz',
			createdAt: new Date('2026-10-25T00:00:00Z')
		});

		const form = new FormData();
		form.set('course', offered);
		form.set('notificationPreference', 'discord');
		form.set('availability', 'Evenings');
		form.set('agreed', 'on');
		await expect(
			actions.enroll({
				locals: locals(),
				request: new Request('https://training.test/?/enroll', { method: 'POST', body: form }),
				platform: undefined
			} as unknown as EnrollEvent)
		).rejects.toMatchObject({ status: 303 });

		const filed = await db.query.enrollmentsTable.findMany({
			where: eq(enrollmentsTable.cid, CID)
		});
		const fresh = filed.find((row) => row.id !== 'a')!;
		expect(fresh.course).toBe(offered);
		expect(await getWaitlistPosition(db, fresh)).toEqual({ ahead: 1, waiting: 2 });
	});
});

// Home again, before the roster removals pass has restored the request.
describe('/ as a returning student whose request is being restored', () => {
	beforeEach(async () => {
		await member({ membership: 'home' });
	});

	it('shows the being-restored copy and no enroll form', async () => {
		const data = (await visit()) as Exclude<Awaited<ReturnType<typeof visit>>, void>;

		expect(data.flow).toBe('back-on-home-roster');
		expect(data.enroll).toBeNull();
		expect(data.request).toMatchObject({ id: 'a', course: 'S-LC' });
	});

	it('refuses ?/enroll', async () => {
		expect(await enroll()).toMatchObject({
			status: 409,
			data: { formError: 'You already have an open training request.' }
		});
	});
});
