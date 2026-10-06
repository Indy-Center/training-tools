import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/waitlist` is open to every signed-in member, and the staff sheet names
 * everyone waiting. So the rows must not be **loaded** for anyone without the
 * role — hiding them in the page would still send them to the browser.
 */

const getWaitlistSheet = vi.fn(async () => [{ id: 'row', name: 'Somebody Waiting' }]);

vi.mock('$lib/server/enrollments/waitlist', () => ({
	getWaitlistSheet,
	assignTeacher: vi.fn(),
	assignVatusaCourse: vi.fn(),
	changeTeacher: vi.fn(),
	completeVatusaCourse: vi.fn(),
	removeStudent: vi.fn(),
	withdrawStudent: vi.fn()
}));

vi.mock('$lib/server/enrollments', () => ({
	getEnrollment: vi.fn(),
	getOwnOpenEnrollment: vi.fn(async () => null),
	getWaitlistPosition: vi.fn(),
	getWaitlistStats: vi.fn(async () => [])
}));

const { load } = await import('./+page.server');

const event = (roles: string[]) =>
	({
		locals: { db: {}, session: { roles, user: { cid: '100' } } },
		platform: { env: {} }
	}) as unknown as Parameters<typeof load>[0];

describe('/waitlist load', () => {
	beforeEach(() => getWaitlistSheet.mockClear());

	it('gives a member the counts and no sheet, without ever reading it', async () => {
		const data = (await load(event([]))) as { sheet: unknown; courses: unknown };
		expect(data.sheet).toBeNull();
		expect(data.courses).toEqual([]);
		expect(getWaitlistSheet).not.toHaveBeenCalled();
	});

	it('does not count another training role as this one', async () => {
		const data = (await load(
			event(['training:teachers:manage', 'training:certifications:edit'])
		)) as {
			sheet: unknown;
		};
		expect(data.sheet).toBeNull();
		expect(getWaitlistSheet).not.toHaveBeenCalled();
	});

	it('gives the sheet to training:students:manage, and to a training admin', async () => {
		for (const role of ['training:students:manage', 'training:admin']) {
			const data = (await load(event([role]))) as { sheet: { rows: unknown[] } | null };
			expect(data.sheet?.rows).toHaveLength(1);
		}
		expect(getWaitlistSheet).toHaveBeenCalledTimes(2);
	});

	it('refuses someone with no session', async () => {
		const signedOut = {
			locals: { db: {}, session: null },
			platform: { env: {} }
		} as unknown as Parameters<typeof load>[0];
		await expect(async () => load(signedOut)).rejects.toMatchObject({ status: 401 });
		expect(getWaitlistSheet).not.toHaveBeenCalled();
	});
});
