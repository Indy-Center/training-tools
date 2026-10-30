import { beforeEach, describe, expect, it } from 'vitest';
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
