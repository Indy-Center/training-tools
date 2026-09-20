import { drizzle as drizzleFactory } from 'drizzle-orm/d1';

/**
 * No tables yet — DEV-108 (enrollment form) adds the first ones under
 * src/lib/db/schema/ and re-exports them here. The client is wired up now so
 * the binding, migration loop and CI step are proven before a feature needs them.
 */
const schema = {};

export type Database = ReturnType<typeof drizzle>;

export function drizzle(db: D1Database) {
	return drizzleFactory(db, { schema });
}
