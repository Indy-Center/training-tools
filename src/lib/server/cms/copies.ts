import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { cmsCopiesTable } from '$lib/db/schema/cms-copies';
import type { CmsCopies } from './read';

/** The CMS reader's copies, kept in D1. */
export function d1Copies(db: Database): CmsCopies {
	return {
		async get(path) {
			const [row] = await db
				.select()
				.from(cmsCopiesTable)
				.where(eq(cmsCopiesTable.key, path))
				.limit(1);
			return row ? { document: JSON.parse(row.document), fetchedAt: row.fetchedAt } : null;
		},
		async put(path, copy) {
			const set = { document: JSON.stringify(copy.document), fetchedAt: copy.fetchedAt };
			await db
				.insert(cmsCopiesTable)
				.values({ key: path, ...set })
				.onConflictDoUpdate({ target: cmsCopiesTable.key, set });
		}
	};
}
