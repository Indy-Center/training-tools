import type { Database } from '$lib/server/db';
import { activityLogTable } from '$lib/db/schema/activity-log';
import type { ActivityDetail, ActivityEvent } from '$lib/activity';

/**
 * Writes to `activity_log`. Append-only: nothing here updates or deletes.
 *
 * Temporary home — see `$lib/activity.ts`. When the central log on identity
 * exists, this is the module to point at it.
 */

export type ActivityInput = {
	cid: string;
	event: ActivityEvent;
	detail?: ActivityDetail | null;
	/** CID of whoever did it; null or absent for the cron. */
	actor?: string | null;
	at?: Date;
};

/**
 * The insert for one entry, unexecuted, so a caller can put it in the same
 * `db.batch` as the change it describes — the change and its record land
 * together or not at all.
 */
export function activityInsert(db: Database, input: ActivityInput) {
	return db.insert(activityLogTable).values({
		id: crypto.randomUUID(),
		cid: input.cid,
		event: input.event,
		detail: input.detail ?? null,
		actor: input.actor ?? null,
		at: input.at ?? new Date()
	});
}

/** One statement of any kind that `db.batch` accepts. */
export type BatchStatement = Parameters<Database['batch']>[0][number];

/** Statements per `db.batch`, the same chunk the roster sync uses. */
const CHUNK_SIZE = 25;

/**
 * Run statements in order, in chunks. Each chunk is atomic in D1; chunks are
 * not atomic with each other, so callers keep anything that must land together
 * inside one chunk (see `runGroups`).
 */
export async function runInBatches(db: Database, statements: BatchStatement[]): Promise<void> {
	for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
		const chunk = statements.slice(i, i + CHUNK_SIZE);
		await db.batch(chunk as unknown as Parameters<Database['batch']>[0]);
	}
}

/**
 * Run groups of statements, each group atomically. Groups are packed into
 * batches without ever splitting one across two.
 */
export async function runGroups(db: Database, groups: BatchStatement[][]): Promise<void> {
	let chunk: BatchStatement[] = [];

	for (const group of groups) {
		if (group.length === 0) continue;
		if (chunk.length > 0 && chunk.length + group.length > CHUNK_SIZE) {
			await db.batch(chunk as unknown as Parameters<Database['batch']>[0]);
			chunk = [];
		}
		chunk.push(...group);
	}

	if (chunk.length > 0) await db.batch(chunk as unknown as Parameters<Database['batch']>[0]);
}
