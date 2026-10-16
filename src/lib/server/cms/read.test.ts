import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CmsError } from './index';
import { readThroughCopy, type CmsCopies, type CmsCopy } from './read';

/**
 * The CMS reader's rule (decision 0036): a copy under about five minutes old is
 * used as is; an older one is refetched and a good document replaces it; a
 * failed or malformed read serves the copy whatever its age and never replaces
 * it; no copy and no CMS is an error the caller handles.
 */

const PATH = '/api/training/resources';
const NOW = new Date('2026-10-16T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

/** The documents in these tests: a version number the parser insists on. */
type Doc = { version: number };
const parse = (body: unknown): Doc => {
	const version = (body as { version?: unknown } | null)?.version;
	if (typeof version !== 'number') throw new CmsError('no version');
	return { version };
};

function fakeCms(answer: () => Promise<unknown>) {
	return { read: vi.fn(async (_path: string) => answer()) };
}

function memoryCopies(initial: Record<string, CmsCopy> = {}) {
	const rows = new Map(Object.entries(initial));
	const copies: CmsCopies = {
		get: async (key) => rows.get(key) ?? null,
		put: async (key, copy) => void rows.set(key, copy)
	};
	return { copies, rows };
}

const answers = (body: unknown) => () => Promise.resolve(body);
const fails = () => Promise.reject(new CmsError('CMS /api/training/resources answered 502', 502));

describe('readThroughCopy', () => {
	// The reader logs each read that falls back to a copy; these tests cause them on purpose.
	beforeEach(() => void vi.spyOn(console, 'error').mockImplementation(() => {}));
	afterEach(() => vi.restoreAllMocks());

	it('with no copy, asks the CMS and keeps what it answers', async () => {
		const cms = fakeCms(answers({ version: 1 }));
		const { copies, rows } = memoryCopies();

		expect(await readThroughCopy(cms, copies, PATH, parse, NOW)).toEqual({ version: 1 });
		expect(cms.read).toHaveBeenCalledWith(PATH);
		expect(rows.get(PATH)).toEqual({ document: { version: 1 }, fetchedAt: NOW });
	});

	it('uses a copy under five minutes old without asking the CMS', async () => {
		const cms = fakeCms(answers({ version: 2 }));
		const { copies } = memoryCopies({
			[PATH]: { document: { version: 1 }, fetchedAt: minutesAgo(4) }
		});

		expect(await readThroughCopy(cms, copies, PATH, parse, NOW)).toEqual({ version: 1 });
		expect(cms.read).not.toHaveBeenCalled();
	});

	it('refetches an older copy, and a good document replaces it', async () => {
		const cms = fakeCms(answers({ version: 2 }));
		const { copies, rows } = memoryCopies({
			[PATH]: { document: { version: 1 }, fetchedAt: minutesAgo(6) }
		});

		expect(await readThroughCopy(cms, copies, PATH, parse, NOW)).toEqual({ version: 2 });
		expect(cms.read).toHaveBeenCalledOnce();
		expect(rows.get(PATH)).toEqual({ document: { version: 2 }, fetchedAt: NOW });
	});

	it('serves the copy, whatever its age, when the CMS fails, and leaves it as it was', async () => {
		const kept = { document: { version: 1 }, fetchedAt: minutesAgo(60 * 24 * 30) };
		const { copies, rows } = memoryCopies({ [PATH]: kept });

		expect(await readThroughCopy(fakeCms(fails), copies, PATH, parse, NOW)).toEqual({
			version: 1
		});
		expect(rows.get(PATH)).toBe(kept);
	});

	it('serves the copy, and leaves it as it was, when the CMS answers with a malformed document', async () => {
		const kept = { document: { version: 1 }, fetchedAt: minutesAgo(10) };
		const { copies, rows } = memoryCopies({ [PATH]: kept });
		const cms = fakeCms(answers({ resources: 'not what was promised' }));

		expect(await readThroughCopy(cms, copies, PATH, parse, NOW)).toEqual({ version: 1 });
		expect(rows.get(PATH)).toBe(kept);
	});

	it('serves the copy when the CMS times out', async () => {
		const kept = { document: { version: 1 }, fetchedAt: minutesAgo(10) };
		const { copies } = memoryCopies({ [PATH]: kept });
		const timedOut = () => Promise.reject(new CmsError('CMS did not answer: TimeoutError'));

		expect(await readThroughCopy(fakeCms(timedOut), copies, PATH, parse, NOW)).toEqual({
			version: 1
		});
	});

	it('throws for the caller to handle when there is no copy and no CMS', async () => {
		const { copies, rows } = memoryCopies();

		await expect(readThroughCopy(fakeCms(fails), copies, PATH, parse, NOW)).rejects.toThrow(
			CmsError
		);
		await expect(
			readThroughCopy(fakeCms(answers({ nope: true })), copies, PATH, parse, NOW)
		).rejects.toThrow(CmsError);
		expect(rows.size).toBe(0);
	});

	// A deploy can tighten the check under a copy kept by the one before it.
	it('asks the CMS, however new the copy, when the copy no longer passes the check', async () => {
		const cms = fakeCms(answers({ version: 2 }));
		const { copies, rows } = memoryCopies({
			[PATH]: { document: { v: 1 }, fetchedAt: minutesAgo(1) }
		});

		expect(await readThroughCopy(cms, copies, PATH, parse, NOW)).toEqual({ version: 2 });
		expect(rows.get(PATH)).toEqual({ document: { version: 2 }, fetchedAt: NOW });
	});

	it('asks the CMS when the copy cannot be read', async () => {
		const cms = fakeCms(answers({ version: 2 }));
		const broken: CmsCopies = {
			get: () => Promise.reject(new Error('D1_ERROR')),
			put: async () => {}
		};

		expect(await readThroughCopy(cms, broken, PATH, parse, NOW)).toEqual({ version: 2 });
	});

	it('still serves a good answer when it cannot be kept', async () => {
		const cms = fakeCms(answers({ version: 2 }));
		const readOnly: CmsCopies = {
			get: async () => null,
			put: () => Promise.reject(new Error('D1_ERROR'))
		};

		expect(await readThroughCopy(cms, readOnly, PATH, parse, NOW)).toEqual({ version: 2 });
	});
});
