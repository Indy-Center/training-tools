import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeNamedActions } from '$lib/testing/named-actions';
import { Role } from '$lib/utils/permissions';
import { testDb } from '$lib/server/test-db';
import type { Database } from '$lib/server/db';
import { syncStateTable } from '$lib/db/schema/sync-state';
import { syncRoster } from '$lib/server/roster';
import { fetchRoster } from '$lib/server/vatusa';
import type { VatusaRosterMember } from '$lib/types/vatusa';
import { actions, load } from './+page.server';

vi.mock('$lib/server/vatusa', () => ({ fetchRoster: vi.fn() }));

describeNamedActions('/admin', actions, ['retry', 'applyRosterHold']);

describe('/admin access', () => {
	const home = { status: 303, location: '/' };

	// Every other training role, held together, is still not admin.
	const notAdmin = {
		session: {
			user: { cid: '1234567' },
			roles: [Role.TEACHERS, Role.CERTIFICATIONS, Role.INSTRUCTOR]
		}
	};

	it('sends anyone but a training admin home, before reading anything', async () => {
		const event = { locals: notAdmin } as unknown as Parameters<typeof load>[0];
		await expect(async () => load(event)).rejects.toMatchObject(home);
	});

	// A form action runs before any load, so the load's check does not cover it.
	it('checks again in the action', async () => {
		const event = { locals: notAdmin } as unknown as Parameters<typeof actions.retry>[0];
		await expect(async () => actions.retry(event)).rejects.toMatchObject(home);
	});
});

describe('/admin roster hold', () => {
	const HOUR = 60 * 60 * 1000;
	const START = new Date('2026-10-26T03:30:00Z');
	const at = (hours: number) => new Date(START.getTime() + hours * HOUR);

	const admin = {
		session: {
			user: {
				cid: '9990001',
				attributes: { preferredName: 'Pat Admin' },
				vatsimData: { personal: {} }
			},
			roles: [Role.ADMIN]
		}
	};
	// Manages students and nothing more: not a training admin.
	const studentsOnly = {
		session: { user: { cid: '9990002' }, roles: [Role.STUDENTS] }
	};

	let db: Database;

	const cids = (from: number, to: number) =>
		Array.from({ length: to - from + 1 }, (_, i) => 1000000 + from + i);

	function vatusaAnswers(list: number[]) {
		vi.mocked(fetchRoster).mockResolvedValueOnce(
			list.map(
				(cid) =>
					({
						cid,
						fname: `First${cid}`,
						lname: 'Tester',
						rating: 2,
						rating_short: 'S1',
						membership: 'home',
						facility: 'ZID',
						flag_homecontroller: true
					}) as unknown as VatusaRosterMember
			)
		);
	}

	function form(held: string[]): Request {
		const data = new FormData();
		for (const cid of held) data.append('cid', cid);
		return { formData: async () => data } as unknown as Request;
	}

	function loadEvent(locals: object) {
		return {
			locals: { ...locals, db },
			platform: { env: {} }
		} as unknown as Parameters<typeof load>[0];
	}

	function actionEvent(locals: object, held: string[]) {
		return {
			locals: { ...locals, db },
			request: form(held)
		} as unknown as Parameters<typeof actions.applyRosterHold>[0];
	}

	async function keys(): Promise<string[]> {
		return (await db.select().from(syncStateTable)).map((row) => row.key).sort();
	}

	// 160 members (limit 8); 10 go missing, so the hold opens.
	async function openHold() {
		vatusaAnswers(cids(1, 160));
		await syncRoster(db, at(-1));
		vatusaAnswers(cids(1, 150));
		await expect(syncRoster(db, at(0))).rejects.toThrow();
	}

	beforeEach(() => {
		vi.mocked(fetchRoster).mockReset();
		db = testDb();
		// The action syncs at the current time; an hour into the hold.
		vi.useFakeTimers({ toFake: ['Date'], now: at(1) });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('shows no hold when there is none', async () => {
		const data = (await load(loadEvent(admin))) as { rosterHold: unknown };
		expect(data.rosterHold).toBeNull();
	});

	it('shows when the hold started, when it applies, and who it holds, by name', async () => {
		await openHold();
		const data = (await load(loadEvent(admin))) as {
			rosterHold: { startedAt: Date; appliesAt: Date; members: { cid: string; name: string }[] };
		};
		expect(data.rosterHold.startedAt).toEqual(START);
		expect(data.rosterHold.appliesAt).toEqual(at(24));
		expect(data.rosterHold.members).toHaveLength(10);
		expect(data.rosterHold.members[0]).toEqual({ cid: '1000151', name: 'First1000151 Tester' });
	});

	it('refuses a manager of students, and writes nothing', async () => {
		await openHold();
		const before = await keys();
		await expect(async () =>
			actions.applyRosterHold(actionEvent(studentsOnly, ['1000151']))
		).rejects.toMatchObject({ status: 303, location: '/' });
		expect(await keys()).toEqual(before);
	});

	it('says so when the hold has cleared since the page loaded', async () => {
		const result = await actions.applyRosterHold(actionEvent(admin, ['1000151']));
		expect(result).toMatchObject({
			status: 409,
			data: { holdError: "There's no held roster change any more." }
		});
		expect(await keys()).toEqual([]);
	});

	it('applies the shown CIDs and says how many were removed', async () => {
		await openHold();
		vatusaAnswers(cids(1, 150));
		const result = await actions.applyRosterHold(actionEvent(admin, cids(151, 160).map(String)));
		expect(result).toEqual({ holdApplied: 'Applied: 10 members removed from the roster.' });
		expect(await keys()).toEqual([]);
	});

	it('keeps the hold when someone else has gone missing since the page loaded', async () => {
		await openHold();
		vatusaAnswers(cids(1, 149));
		const result = await actions.applyRosterHold(actionEvent(admin, cids(151, 160).map(String)));
		expect(result).toMatchObject({
			status: 409,
			data: {
				holdError:
					'The roster changed since you looked: 1 more are missing. Check the list and apply again.'
			}
		});
		expect(await keys()).toEqual(['roster-removal-hold']);
	});
});
