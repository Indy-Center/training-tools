import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/teach` shows the teacher resources the Training Admin keeps in the CMS.
 * The CMS is faked at `fetch`; the database is faked at the modules that read it.
 */

vi.mock('$lib/server/teachers', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/teachers')>()),
	getActiveTeacher: vi.fn(async () => ({
		cid: '1000001',
		initials: 'TT',
		status: 'active',
		availability: 'Evenings',
		roles: [],
		studentSlots: 2
	})),
	getAssignedEnrollments: vi.fn(async () => []),
	getCurrentQualifications: vi.fn(async () => [{ code: 'S1', level: 'instructor' }])
}));

vi.mock('$lib/server/roster', () => ({
	getPeople: vi.fn(async () => new Map()),
	getRosterEmails: vi.fn(async () => new Map())
}));

const { load } = await import('./+page.server');

const ENV = { CMS_URL: 'https://cms.example.com', TRAINING_API_TOKEN: 'secret-token' };

const event = (env: Record<string, string> = ENV) =>
	({
		locals: { db: {}, session: { roles: [], user: { cid: '1000001' } } },
		platform: { env }
	}) as unknown as Parameters<typeof load>[0];

const cms = vi.fn<typeof fetch>();

const answer = (body: unknown, status = 200) =>
	cms.mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
	cms.mockReset();
	vi.stubGlobal('fetch', cms);
	// The load logs each failed read; these tests cause them on purpose.
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('/teach load: teacher resources', () => {
	it('lists the resources in the order the CMS gives them', async () => {
		answer({
			resources: [
				{ title: 'Training Order', url: 'https://example.com/order.pdf', newTab: true },
				{ title: 'Lesson plans', url: 'https://drive.example.com/plans', newTab: false }
			]
		});

		const data = (await load(event())) as { resources: unknown };

		expect(data.resources).toEqual([
			{ title: 'Training Order', url: 'https://example.com/order.pdf', newTab: true },
			{ title: 'Lesson plans', url: 'https://drive.example.com/plans', newTab: false }
		]);
		const [url, init] = cms.mock.calls[0];
		expect(String(url)).toBe('https://cms.example.com/api/training/resources');
		expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-token');
	});

	it('shows no resources when the CMS cannot be read, and the rest of the page is unchanged', async () => {
		answer({ resources: [] });
		const { resources: none, ...page } = (await load(event())) as Record<string, unknown>;
		expect(none).toEqual([]);

		const failures: [string, () => unknown, Record<string, string>?][] = [
			['a server error', () => answer({ message: 'Server error' }, 500)],
			['a refused token', () => answer({ message: 'Unauthorized' }, 401)],
			['no answer', () => cms.mockRejectedValue(new TypeError('fetch failed'))],
			['a body that is not JSON', () => cms.mockResolvedValue(new Response('<html>'))],
			['no CMS_URL', () => answer({ resources: [] }), { TRAINING_API_TOKEN: 'secret-token' }],
			['no token', () => answer({ resources: [] }), { CMS_URL: 'https://cms.example.com' }]
		];
		for (const [name, arrange, env] of failures) {
			cms.mockReset();
			arrange();
			const { resources, ...rest } = (await load(event(env))) as Record<string, unknown>;
			expect(resources, name).toEqual([]);
			expect(rest, name).toEqual(page);
		}
	});

	it('uses none of a document that is not the shape payload promises', async () => {
		const good = { title: 'Training Order', url: 'https://example.com/order.pdf', newTab: true };
		const malformed: [string, unknown][] = [
			['no list', {}],
			['a list that is not one', { resources: 'Training Order' }],
			['a row with no title', { resources: [good, { ...good, title: '' }] }],
			['a row with no URL', { resources: [good, { title: 'X', newTab: true }] }],
			['a plain http link', { resources: [good, { ...good, url: 'http://example.com' }] }],
			['a script link', { resources: [good, { ...good, url: 'javascript:alert(1)' }] }],
			['a URL that is not one', { resources: [good, { ...good, url: 'https://' }] }],
			['a new-tab flag that is not a boolean', { resources: [good, { ...good, newTab: 'yes' }] }]
		];
		for (const [name, body] of malformed) {
			answer(body);
			const data = (await load(event())) as { resources: unknown };
			expect(data.resources, name).toEqual([]);
		}
	});

	it('keeps only the fields the panel draws', async () => {
		answer({ resources: [{ id: 'row-1', title: 'T', url: 'https://example.com', newTab: false }] });
		const data = (await load(event())) as { resources: unknown };
		expect(data.resources).toEqual([{ title: 'T', url: 'https://example.com', newTab: false }]);
	});
});
