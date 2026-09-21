import { drizzle as drizzleFactory } from 'drizzle-orm/d1';
import * as roster from '$lib/db/schema/roster';
import * as enrollments from '$lib/db/schema/enrollments';
import * as certifications from '$lib/db/schema/certifications';

// Every table module has to be spread in here, not just re-exported from the
// schema barrel — miss one and `db.query.<table>` silently does not exist.
const schema = { ...roster, ...enrollments, ...certifications };

export type Database = ReturnType<typeof drizzle>;

export function drizzle(db: D1Database) {
	return drizzleFactory(db, { schema });
}
