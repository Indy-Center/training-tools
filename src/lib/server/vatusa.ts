import { FACILITY_ID } from '$lib/config';
import type { VatusaRosterMember, VatusaRosterResponse } from '$lib/types/vatusa';
import type { TrainingRecord } from '$lib/ctrs';
import type { AcademyExam, AcademyTranscript } from '$lib/vatusa-academy';

const VATUSA_API_BASE_URL = 'https://api.vatusa.net';

/**
 * Parse a roster response without mangling Discord ids.
 *
 * VATUSA sends `discord_id` as a bare JSON number, but Discord snowflakes are
 * 18-19 digits — past `Number.MAX_SAFE_INTEGER`. `response.json()` silently
 * rounds them: against the live ZID roster on 2026-09-23, 149 of 155 ids came
 * out wrong. Quoting the digits before parsing keeps them exact.
 */
export function parseRosterBody(text: string): VatusaRosterResponse {
	return JSON.parse(text.replace(/"discord_id"\s*:\s*(\d+)/g, '"discord_id":"$1"'));
}

/**
 * Fetch the facility roster. This endpoint is public — no API key — which is
 * why the roster sync needs no secrets. (The transfer/visit eligibility
 * checklist does require VATUSA_API_KEY; that arrives with DEV-106.)
 *
 * Throws on a non-2xx or malformed response so the cron fails loudly rather
 * than quietly wiping the mirror.
 */
export async function fetchRoster(
	membership: 'home' | 'visit' | 'both' = 'both',
	artcc: string = FACILITY_ID
): Promise<VatusaRosterMember[]> {
	const url = `${VATUSA_API_BASE_URL}/facility/${artcc}/roster/${membership}`;
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`VATUSA roster fetch failed: ${response.status} ${response.statusText}`);
	}

	const body = parseRosterBody(await response.text());

	if (!Array.isArray(body?.data)) {
		throw new Error('VATUSA roster fetch returned no data array');
	}

	return body.data;
}

/**
 * VATUSA's academy: the written rating courses. Both calls need the facility's
 * API key, sent as `apikey` the way VATUSA's API reads it.
 *
 * Written from VATUSA's published API description and its public source
 * (VATUSA/api, `AcademyController`), read on 2026-10-06. **Not yet exercised
 * with a real key** when this was written; see research/vatusa-roster.md.
 */

/** A refusal from VATUSA, with what it said. */
export class VatusaError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

async function vatusaMessage(response: Response): Promise<string> {
	const text = await response.text();
	try {
		const body = JSON.parse(text) as { data?: { msg?: string }; msg?: string };
		return body.data?.msg ?? body.msg ?? text;
	} catch {
		return text;
	}
}

/**
 * The academy course ID for each written exam VATUSA will enrol someone in.
 * Public, no key. `BASIC` comes back null: it cannot be assigned through the API.
 */
export async function fetchAcademyCourseIds(): Promise<
	Partial<Record<AcademyExam, number | null>>
> {
	const response = await fetch(`${VATUSA_API_BASE_URL}/v2/academy/identifiers`);
	if (!response.ok) {
		throw new VatusaError(response.status, `VATUSA course list: ${await vatusaMessage(response)}`);
	}
	const body = (await response.json()) as { data?: Partial<Record<AcademyExam, number | null>> };
	return body.data ?? {};
}

/**
 * Enrol a home controller in a written rating course. VATUSA emails them, and
 * copies in `instructorCid`, who it records as having assigned it; that person
 * must be a home controller of the facility. Throws VatusaError if refused.
 */
export async function enrollInAcademyCourse(
	apiKey: string,
	courseId: number,
	cid: string,
	instructorCid: string
): Promise<void> {
	const response = await fetch(
		`${VATUSA_API_BASE_URL}/v2/academy/enroll/${courseId}?apikey=${encodeURIComponent(apiKey)}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ cid, instructor: instructorCid })
		}
	);
	if (!response.ok) {
		throw new VatusaError(response.status, await vatusaMessage(response));
	}
}

/** Every attempt a controller has made at each written exam. Throws VatusaError if refused. */
export async function fetchAcademyTranscript(
	apiKey: string,
	cid: string
): Promise<AcademyTranscript> {
	const response = await fetch(
		`${VATUSA_API_BASE_URL}/v2/academy/transcript/${encodeURIComponent(cid)}?apikey=${encodeURIComponent(apiKey)}`
	);
	if (!response.ok) {
		throw new VatusaError(response.status, await vatusaMessage(response));
	}
	const body = (await response.json()) as { data?: AcademyTranscript };
	return body.data ?? {};
}

/**
 * File a training session in VATUSA's CTRS, in `instructorCid`'s name. The key
 * must belong to the student's home facility, or one they visit.
 *
 * With `test`, VATUSA checks the record and answers as it would, but saves
 * nothing — and the id comes back null. Throws VatusaError if refused.
 *
 * Written from VATUSA's public source (`TrainingController::postNewRecord`),
 * read on 2026-10-06. **Not yet exercised with a real key** when this was written.
 */
export async function submitTrainingRecord(
	apiKey: string,
	studentCid: string,
	instructorCid: string,
	record: TrainingRecord,
	options: { test: boolean }
): Promise<{ id: number | null }> {
	const query = new URLSearchParams({ apikey: apiKey });
	if (options.test) query.set('test', '1');

	const body = new URLSearchParams({
		instructor_id: instructorCid,
		session_date: record.sessionDate,
		position: record.position,
		duration: record.duration,
		location: String(record.location),
		ots_status: String(record.otsStatus),
		notes: record.notes
	});
	if (record.score !== null) body.set('score', String(record.score));
	if (record.movements !== null) body.set('movements', String(record.movements));

	const response = await fetch(
		`${VATUSA_API_BASE_URL}/v2/user/${encodeURIComponent(studentCid)}/training/record?${query}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body
		}
	);
	if (!response.ok) {
		throw new VatusaError(response.status, await vatusaMessage(response));
	}
	const answer = (await response.json()) as { data?: { id?: number | null } };
	return { id: answer.data?.id ?? null };
}
