import { eq, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { teacherQualificationsTable, teachersTable } from '$lib/db/schema/teachers';
import { activityLogTable } from '$lib/db/schema/activity-log';
import { syncStateTable } from '$lib/db/schema/sync-state';
import { resolveJiraConfig } from '$lib/server/jira/client';
import {
	fetchTeacherDropdownOptions,
	isDriftEmpty,
	planDropdownDrift
} from '$lib/server/jira/teacher-options';
import { notify } from '$lib/server/notify';
import { jiraOptionValue } from '$lib/teachers';
import { dropdownNotice, type TeacherDropdownDrift } from './notices';

/** `sync_state` key: when the dropdowns were last checked, and what was found. */
export const DROPDOWN_STATE_KEY = 'jira-teacher-options';

/**
 * `sync_state` key: the difference training admins were last actually told
 * about. Separate from the check itself, so a notice that was skipped (no
 * webhook yet) or failed is sent on a later run instead of being forgotten.
 */
export const DROPDOWN_NOTIFIED_KEY = 'jira-teacher-options-notified';

export type StoredDropdownDrift = { checkedAt: Date; drift: TeacherDropdownDrift };

export type DropdownCheckResult = {
	teacher: TeacherDropdownDrift['teacher'];
	reInstructor: TeacherDropdownDrift['reInstructor'];
	/** True when this run told training admins, because the drift was new. */
	notified: boolean;
};

/**
 * What TRK's teacher dropdowns should offer, from the teacher roster:
 *
 * - `Teacher`: every active teacher on the roster.
 * - `RE Instructor`: every active teacher who evaluates at least one course.
 *   Jira cannot make a dropdown depend on the course, so admins pick the right
 *   person for the course; this only keeps non-evaluators off the list.
 *
 * Teachers on LOA or off the roster are on neither.
 */
async function wantedValues(db: Database) {
	const [teachers, current, initialsHistory] = await Promise.all([
		db.select().from(teachersTable),
		db
			.select({ cid: teacherQualificationsTable.cid, level: teacherQualificationsTable.level })
			.from(teacherQualificationsTable)
			.where(isNull(teacherQualificationsTable.endedAt)),
		db
			.select({ detail: activityLogTable.detail })
			.from(activityLogTable)
			.where(eq(activityLogTable.event, 'teacher.initials'))
	]);

	const evaluating = new Set(
		current.filter((row) => row.level === 'evaluator').map((row) => row.cid)
	);

	const active = teachers.filter(
		(teacher) => teacher.removedAt === null && teacher.status === 'active'
	);

	// Every value that has ever stood for one of our teachers, so an old
	// option of theirs is recognised as ours to remove.
	const known = new Set<string>();
	for (const teacher of teachers) {
		known.add(teacher.cid);
		if (teacher.initials) known.add(teacher.initials);
	}
	for (const row of initialsHistory) {
		if (typeof row.detail?.from === 'string') known.add(row.detail.from);
	}

	return {
		teacher: active.map(jiraOptionValue),
		reInstructor: active.filter((teacher) => evaluating.has(teacher.cid)).map(jiraOptionValue),
		known: [...known]
	};
}

/**
 * Compare TRK's `Teacher` and `RE Instructor` dropdowns with the teacher
 * roster, store the result for `/teachers`, and tell training admins when the
 * difference is new.
 *
 * Told once per distinct difference, not every fifteen minutes: the last
 * difference actually sent is compared first. One that could not be sent is
 * retried next run; one that clears and later returns is reported again.
 *
 * Null when Jira is not configured. Runs from the cron after the teacher roster
 * sync, and in the background after an admin edits a teacher.
 */
export async function checkTeacherDropdowns(
	db: Database,
	env: Partial<Env> | undefined
): Promise<DropdownCheckResult | null> {
	const config = resolveJiraConfig(env);
	if (!config) return null;

	const [wanted, options, lastNotified] = await Promise.all([
		wantedValues(db),
		fetchTeacherDropdownOptions(config),
		db.query.syncStateTable.findFirst({ where: eq(syncStateTable.key, DROPDOWN_NOTIFIED_KEY) })
	]);

	const drift: TeacherDropdownDrift = {
		teacher: planDropdownDrift({
			options: options.teacher,
			wanted: wanted.teacher,
			known: wanted.known
		}),
		reInstructor: planDropdownDrift({
			options: options.reInstructor,
			wanted: wanted.reInstructor,
			known: wanted.known
		})
	};

	const now = new Date();
	const value = JSON.stringify(drift);
	await saveState(db, DROPDOWN_STATE_KEY, now, value);

	const clean = isDriftEmpty(drift.teacher) && isDriftEmpty(drift.reInstructor);
	let notified = false;

	if (clean) {
		// Forget what was sent, so the same difference coming back is news again.
		if (lastNotified?.value) await saveState(db, DROPDOWN_NOTIFIED_KEY, now, null);
	} else if (lastNotified?.value !== value) {
		const notice = dropdownNotice(drift);
		notified = notice !== null && (await notify(env, notice)) === 'sent';
		if (notified) await saveState(db, DROPDOWN_NOTIFIED_KEY, now, value);
	}

	return { ...drift, notified };
}

async function saveState(db: Database, key: string, at: Date, value: string | null) {
	await db
		.insert(syncStateTable)
		.values({ key, cursorAt: at, value })
		.onConflictDoUpdate({ target: syncStateTable.key, set: { cursorAt: at, value } });
}

/** The last check's result, for the roster page. Null before the first run. */
export async function getStoredDropdownDrift(db: Database): Promise<StoredDropdownDrift | null> {
	const row = await db.query.syncStateTable.findFirst({
		where: eq(syncStateTable.key, DROPDOWN_STATE_KEY)
	});
	if (!row?.value) return null;

	try {
		return { checkedAt: row.cursorAt, drift: JSON.parse(row.value) as TeacherDropdownDrift };
	} catch {
		return null;
	}
}
