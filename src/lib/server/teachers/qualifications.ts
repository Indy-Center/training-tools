import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import {
	teacherQualificationsTable,
	type QualificationBasis,
	type TeacherQualification
} from '$lib/db/schema/teachers';
import { findCredential } from '$lib/certifications';
import type { QualificationLevel } from '$lib/teachers';

/**
 * The only writers of `teacher_qualifications`. The sync and the admin edit
 * both go through these, so the log is written one way.
 *
 * They return unexecuted statements: a level change is an end and a start, and
 * the two belong in one `db.batch` so the partial unique index never sees two
 * current rows, and a failure never leaves a teacher with none.
 */

/** End a current row. Guarded on `ended_at IS NULL`, so ending twice is a no-op. */
export function endQualification(
	db: Database,
	id: string,
	input: { reason: string; by: string | null; at: Date }
) {
	return db
		.update(teacherQualificationsTable)
		.set({ endedAt: input.at, endedBy: input.by, endedReason: input.reason })
		.where(and(eq(teacherQualificationsTable.id, id), isNull(teacherQualificationsTable.endedAt)));
}

export function startQualification(
	db: Database,
	input: {
		cid: string;
		code: string;
		level: QualificationLevel;
		basis: QualificationBasis;
		note?: string | null;
		by: string | null;
		at: Date;
	}
) {
	const credential = findCredential(input.code);
	if (!credential) throw new Error(`Unknown credential ${input.code}`);

	return db.insert(teacherQualificationsTable).values({
		id: crypto.randomUUID(),
		cid: input.cid,
		code: credential.code,
		level: input.level,
		basis: input.basis,
		note: input.note ?? null,
		startedAt: input.at,
		startedBy: input.by
	});
}

/** Current levels for one teacher. */
export async function getCurrentQualifications(
	db: Database,
	cid: string
): Promise<TeacherQualification[]> {
	return db
		.select()
		.from(teacherQualificationsTable)
		.where(
			and(eq(teacherQualificationsTable.cid, cid), isNull(teacherQualificationsTable.endedAt))
		);
}

/**
 * Every current level, grouped by CID then code. Reads the whole (small) set
 * rather than filtering by the teachers on screen — D1's 100-parameter limit.
 */
export async function getAllCurrentQualifications(
	db: Database
): Promise<Map<string, Map<string, QualificationLevel>>> {
	const rows = await db
		.select({
			cid: teacherQualificationsTable.cid,
			code: teacherQualificationsTable.code,
			level: teacherQualificationsTable.level
		})
		.from(teacherQualificationsTable)
		.where(isNull(teacherQualificationsTable.endedAt));

	const byCid = new Map<string, Map<string, QualificationLevel>>();
	for (const row of rows) {
		const levels = byCid.get(row.cid) ?? new Map<string, QualificationLevel>();
		levels.set(row.code, row.level);
		byCid.set(row.cid, levels);
	}
	return byCid;
}

/** The whole log for one teacher, ended rows included. */
export async function getQualificationHistory(
	db: Database,
	cid: string
): Promise<TeacherQualification[]> {
	return db
		.select()
		.from(teacherQualificationsTable)
		.where(eq(teacherQualificationsTable.cid, cid));
}
