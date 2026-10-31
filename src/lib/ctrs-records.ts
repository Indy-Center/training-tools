/**
 * Reading back what is filed on VATUSA's CTRS: the shape of a record and the
 * rule for which one counts. Pure; the fetch is `fetchCtrsRecords()` in
 * `$lib/server/vatusa.ts`. See decisions/0038.
 */
import { FACILITY_ID } from '$lib/config';
import { toFacilityDate } from '$lib/server/jira/progress';

/** VATUSA's `ots_status`: 0 none, 1 pass, 2 fail, 3 recommended. */
export type CtrsOtsStatus = 0 | 1 | 2 | 3;

/** One training record, as much of it as the read-back needs. */
export type CtrsRecord = {
	id: number;
	studentId: number;
	/** Null when VATUSA sends none. */
	instructorId: number | null;
	/** As VATUSA returns it: `YYYY-MM-DD HH:MM:SS`, no zone marker. */
	sessionDate: string;
	/** The facility the record is filed under, e.g. `ZID`. */
	facility: string;
	/** `{airport}_{type}`, e.g. `XXX_TWR`. */
	position: string;
	otsStatus: CtrsOtsStatus;
};

function isOtsStatus(value: unknown): value is CtrsOtsStatus {
	return value === 0 || value === 1 || value === 2 || value === 3;
}

/**
 * Parse the body of `GET /v2/user/{cid}/training/records`. Throws on a body
 * that is not `{ data: [...] }` or a record missing its id, date, facility or
 * position; a missing `ots_status` reads as 0 and a missing `instructor_id` as null.
 */
export function parseCtrsRecords(body: unknown): CtrsRecord[] {
	const data = (body as { data?: unknown } | null)?.data;
	if (!Array.isArray(data)) throw new Error('VATUSA training records: no data array');

	return data.map((row: Record<string, unknown>) => {
		const { id, student_id, instructor_id, session_date, facility_id, position, ots_status } =
			row ?? {};
		if (
			typeof id !== 'number' ||
			typeof session_date !== 'string' ||
			typeof facility_id !== 'string' ||
			typeof position !== 'string'
		) {
			throw new Error(
				'VATUSA training records: a record is missing its id, date, facility or position'
			);
		}
		return {
			id,
			studentId: Number(student_id),
			instructorId: instructor_id == null ? null : Number(instructor_id),
			sessionDate: session_date,
			facility: facility_id,
			position,
			otsStatus: isOtsStatus(ots_status) ? ots_status : 0
		};
	});
}

/**
 * The facility day a record was for, `YYYY-MM-DD`: the date part of
 * `session_date` as VATUSA returns it. This is what 04 and 05 write to the card.
 */
export function recordFacilityDay(record: Pick<CtrsRecord, 'sessionDate'>): string {
	return record.sessionDate.slice(0, 10);
}

export type CtrsRecordQuery = {
	/** `GND`, `TWR`, `APP`, `CTR`; null matches any position. */
	positionType: string | null;
	/** Only sessions on or after this moment's facility day count. */
	since: Date;
	statuses: readonly CtrsOtsStatus[];
};

/**
 * The record that counts: this facility's, of the position type, with one of
 * the statuses, on or after `since`'s facility day. The latest by session date,
 * then the highest id; or null.
 */
export function latestMatchingRecord(
	records: readonly CtrsRecord[],
	{ positionType, since, statuses }: CtrsRecordQuery
): CtrsRecord | null {
	const sinceDay = toFacilityDate(since);
	let best: CtrsRecord | null = null;

	for (const record of records) {
		if (record.facility !== FACILITY_ID) continue;
		if (positionType !== null && !record.position.endsWith(`_${positionType}`)) continue;
		if (!statuses.includes(record.otsStatus)) continue;
		if (recordFacilityDay(record) < sinceDay) continue;
		if (
			best === null ||
			record.sessionDate > best.sessionDate ||
			(record.sessionDate === best.sessionDate && record.id > best.id)
		) {
			best = record;
		}
	}
	return best;
}
