import { drizzle as drizzleFactory } from 'drizzle-orm/d1';
import * as roster from '$lib/db/schema/roster';
import * as enrollments from '$lib/db/schema/enrollments';

const schema = { ...roster, ...enrollments };

export type Database = ReturnType<typeof drizzle>;

export function drizzle(db: D1Database) {
	return drizzleFactory(db, { schema });
}
