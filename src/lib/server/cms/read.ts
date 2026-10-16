/** Something that answers CMS paths: `readCms` with its config, or a fake. */
export type Cms = { read(path: string): Promise<unknown> };

/** A document as the CMS last answered it, kept so a page outlives a CMS outage. */
export type CmsCopy = { document: unknown; fetchedAt: Date };

/** Where copies are kept, one per path: D1 in the Worker (`./copies`), memory in tests. */
export type CmsCopies = {
	get(path: string): Promise<CmsCopy | null>;
	put(path: string, copy: CmsCopy): Promise<void>;
};

/** How long a copy is used without asking the CMS. */
const FRESH_MS = 5 * 60_000;

/**
 * Read a CMS path through its copy, checking each document with `parse`.
 *
 * A copy under five minutes old is used without asking the CMS. An older one
 * is refetched, and a document that passes `parse` replaces it. A failed,
 * timed-out or malformed read serves the copy whatever its age and leaves it
 * alone: a stale list beats none. With no copy as well, the error is thrown
 * for the caller to handle. On demand only, with no scheduled job and no
 * Cloudflare cache (decision 0036).
 *
 * The copies are a convenience, so they never cost a good answer: one that
 * cannot be read, or no longer passes `parse` after a deploy, counts as no
 * copy, and one that cannot be written is skipped.
 */
export async function readThroughCopy<T>(
	cms: Cms,
	copies: CmsCopies,
	path: string,
	parse: (body: unknown) => T,
	now = new Date()
): Promise<T> {
	const copy = await usableCopy(copies, path, parse);
	if (copy && now.getTime() - copy.fetchedAt.getTime() < FRESH_MS) return copy.parsed;

	let body: unknown;
	let parsed: T;
	try {
		body = await cms.read(path);
		parsed = parse(body);
	} catch (err) {
		if (!copy) throw err;
		console.error(
			`CMS ${path} could not be read; serving the copy from ${copy.fetchedAt.toISOString()}:`,
			err
		);
		return copy.parsed;
	}

	await copies
		.put(path, { document: body, fetchedAt: now })
		.catch((err) => console.error(`CMS ${path}: the copy could not be kept:`, err));
	return parsed;
}

/** The copy, checked as a fresh answer would be; null when there is none worth serving. */
async function usableCopy<T>(
	copies: CmsCopies,
	path: string,
	parse: (body: unknown) => T
): Promise<{ parsed: T; fetchedAt: Date } | null> {
	try {
		const copy = await copies.get(path);
		return copy && { parsed: parse(copy.document), fetchedAt: copy.fetchedAt };
	} catch (err) {
		console.error(`CMS ${path}: the copy could not be used:`, err);
		return null;
	}
}
