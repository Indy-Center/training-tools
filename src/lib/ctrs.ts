/**
 * A training session report for VATUSA's CTRS (its training records).
 *
 * Not under `$lib/server/` on purpose — the form renders the choices here, and
 * the action checks what it was sent against the same rules.
 *
 * The fields and their rules are VATUSA's, read from its public source
 * (VATUSA/api, `TrainingController::postNewRecord` and
 * `Training_records_endpoints.md`) on 2026-10-06. See research/vatusa-roster.md
 */
import { findCredential } from './certifications';
import {
	afterTrainingOptions,
	canCompleteExam,
	canCompleteTraining,
	type AfterTraining
} from './course-completion';
import { ASSIGNED_STATUSES, isAssignedTo } from './teachers';

/** Where the session happened. The numbers are VATUSA's. */
export const SESSION_LOCATIONS = [
	{ value: 1, label: 'Live network' },
	{ value: 2, label: 'Sweatbox' },
	{ value: 0, label: 'Classroom' }
] as const;

/**
 * Whether the session was a rating exam ("OTS"). The numbers are VATUSA's.
 *
 * A result is the examiner's to choose, and it moves the card: passed on to
 * audit, not passed to Needs CATP — see `ExamResult`. "Recommended" (3) is never
 * chosen: it is what the teacher's "recommend for a rating exam" tick sends —
 * see `FINISH_LABELS`.
 */
export const OTS_STATUSES = [
	{ value: 0, label: 'Not a rating exam' },
	{ value: 1, label: 'Rating exam: passed' },
	{ value: 2, label: 'Rating exam: not passed' }
] as const;
const OTS_RECOMMENDED = 3;

/** What an examiner's report says of the exam, and so where the card goes. */
export type ExamResult = 'passed' | 'not-passed';
const EXAM_RESULTS: Readonly<Record<number, ExamResult>> = { 1: 'passed', 2: 'not-passed' };

/** What a result does to the card, said beside the choice and again before sending. */
export const EXAM_RESULT_DETAILS: Record<ExamResult, string> = {
	passed: 'Applies the certification and sends it to the TA to audit.',
	'not-passed': 'The TA decides what further training they get.'
};

/**
 * The tick that ends the training with this report, worded for where the
 * course goes next. Ticking it dates the card and moves it on; for a rating
 * exam it also flags the report as a recommendation.
 */
export const FINISH_LABELS: Record<
	AfterTraining,
	{ label: string; detail: (course: string) => string }
> = {
	'rating-exam': {
		label: 'Recommend for a rating exam',
		detail: () =>
			'Marks their training complete and notifies instructors the student is ready for a rating exam.'
	},
	'certification-update': {
		label: 'Mark the course complete',
		// Custom Training earns nothing of its own, so there is nothing to name.
		detail: (course) => {
			const credential = findCredential(course);
			return credential
				? `Applies the ${credential.code} ${credential.kind} and sends it to the TA to audit.`
				: 'Sends it to the TA to audit.';
		}
	}
};

/** VATUSA's own pattern for a position: `IND_GND`, `ZID_CTR`, `IND_E_APP`. */
export const POSITION_PATTERN =
	/^([A-Z0-9]{2,3})(_([A-Z0-9]{1,3}))?_(DEL|GND|TWR|APP|DEP|CTR|FSS)$/;

export const MAX_NOTES_LENGTH = 10_000;

/** What VATUSA is sent, already in its formats. */
export type TrainingRecord = {
	/** `YYYY-MM-DD HH:MM`, Zulu. */
	sessionDate: string;
	position: string;
	/** `HH:MM`. */
	duration: string;
	location: 0 | 1 | 2;
	otsStatus: 0 | 1 | 2 | 3;
	/** The student's progress, 1 to 5, or null. VATUSA's API calls it `score`. */
	score: number | null;
	movements: number | null;
	notes: string;
};

/** The form's fields, as strings, so a refused form can be shown again as typed. */
export type ReportValues = {
	date: string;
	time: string;
	duration: string;
	position: string;
	location: string;
	otsStatus: string;
	/** Where the training goes if this report ends it; empty if it carries on. */
	finish: string;
	score: string;
	movements: string;
	notes: string;
};

/**
 * A position to start the form on, from the course. Only a starting point:
 * S-GC is taught at the simple fields, so the teacher will often change it.
 */
export function suggestedPosition(course: string): string {
	const suffix: Record<string, string> = {
		'S-GC': 'GND',
		'A-GC': 'GND',
		'S-LC': 'TWR',
		'A-LC': 'TWR',
		'T-RC': 'APP',
		'E-RC': 'CTR'
	};
	if (course === 'E-RC') return 'ZID_CTR';
	return suffix[course] ? `IND_${suffix[course]}` : '';
}

/** What a new form starts with. `now` is passed in so it can be tested. */
export function blankReport(course: string, now: Date): ReportValues {
	const iso = now.toISOString();
	return {
		date: iso.slice(0, 10),
		time: iso.slice(11, 16),
		duration: '01:00',
		position: suggestedPosition(course),
		location: '1',
		otsStatus: '0',
		finish: '',
		score: '',
		movements: '',
		notes: ''
	};
}

type Reportable = {
	cid: string;
	course: string;
	status: string;
	teacher: string | null;
	reInstructor: string | null;
};
type Reporter = { cid: string; initials: string | null };

/**
 * Whether this teacher is the examiner on the card, at the exam stage — and so
 * the one whose report carries the result. Never the student's own teacher,
 * even if staff put them on the card by hand.
 */
export function isExaminerFor(enrollment: Reportable, teacher: Reporter): boolean {
	return canCompleteExam(enrollment, teacher);
}

/**
 * Whether this teacher may report a session with this student: they are the
 * teacher or the examiner on an open card, and it is not their own.
 */
export function canReport(enrollment: Reportable, teacher: Reporter): boolean {
	if (enrollment.cid === teacher.cid) return false;
	if (!(ASSIGNED_STATUSES as readonly string[]).includes(enrollment.status)) return false;
	return (
		isAssignedTo(enrollment.teacher, teacher) || isAssignedTo(enrollment.reInstructor, teacher)
	);
}

/** The rating-exam choices this teacher is offered: a result only from the examiner. */
export function otsChoices(examiner: boolean) {
	return examiner ? [...OTS_STATUSES] : OTS_STATUSES.filter((status) => status.value === 0);
}

/**
 * How this teacher may end the training with a report: nothing unless it is
 * theirs to end, one way for a standard course, either for Custom Training.
 */
export function finishChoices(enrollment: Reportable, teacher: Reporter): AfterTraining[] {
	return canCompleteTraining(enrollment, teacher) ? afterTrainingOptions(enrollment.course) : [];
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** The form as sent, as strings. Anything missing comes back empty. */
export function readReport(form: { get(name: string): unknown }): ReportValues {
	return {
		date: text(form.get('date')),
		time: text(form.get('time')),
		duration: text(form.get('duration')),
		position: text(form.get('position')).toUpperCase(),
		location: text(form.get('location')),
		otsStatus: text(form.get('otsStatus')),
		finish: text(form.get('finish')),
		score: text(form.get('score')),
		movements: text(form.get('movements')),
		notes: text(form.get('notes'))
	};
}

/** A real calendar date, not just the right shape: 2026-02-30 is refused. */
function isRealDate(date: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
	const parsed = new Date(`${date}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** `H:MM` or `HH:MM` to `HH:MM`, or null. VATUSA reads it as a time of day, so under 24 hours. */
function clockTime(value: string): string | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) return null;
	return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

export type ReportResult =
	| {
			ok: true;
			record: TrainingRecord;
			finish: AfterTraining | null;
			/** The examiner's result, which moves the card. Null for any other report. */
			examResult: ExamResult | null;
	  }
	| { ok: false; errors: string[] };

/**
 * Check a report against VATUSA's rules before it is sent, so the teacher
 * hears everything wrong with it at once, in our words rather than one
 * refusal at a time in VATUSA's.
 */
export function checkReport(
	values: ReportValues,
	allowed: { examiner: boolean; finish: readonly AfterTraining[] }
): ReportResult {
	const errors: string[] = [];

	const time = clockTime(values.time);
	if (!isRealDate(values.date) || !time) errors.push('Give the date and the Zulu time it started.');

	const duration = clockTime(values.duration);
	if (!duration || duration === '00:00') {
		errors.push('Give the duration as hours and minutes, like 01:30.');
	}

	if (!POSITION_PATTERN.test(values.position)) {
		errors.push('Give the position the way it is logged on, like IND_GND or ZID_CTR.');
	}

	const location = SESSION_LOCATIONS.find((choice) => String(choice.value) === values.location);
	if (!location) errors.push('Choose where the session took place.');

	// Left out of the form entirely for anyone but the examiner, so empty is "not an exam".
	const ots = otsChoices(allowed.examiner).find(
		(choice) => String(choice.value) === (values.otsStatus || '0')
	);
	if (!ots) errors.push('Only the examiner on the card can report a rating exam result.');

	const finish = allowed.finish.find((option) => option === values.finish) ?? null;
	if (values.finish !== '' && !finish) {
		errors.push('That is not yours to do, or it has already been done. Reload the page.');
	}

	let score: number | null = null;
	if (values.score !== '') {
		score = Number(values.score);
		if (!Number.isInteger(score) || score < 1 || score > 5) {
			errors.push('Progress is a whole number from 1 to 5, or left blank.');
		}
	}

	let movements: number | null = null;
	if (values.movements !== '') {
		movements = Number(values.movements);
		if (!Number.isInteger(movements) || movements < 0) {
			errors.push('Movements is a whole number, or left blank.');
		}
	}

	if (!values.notes) errors.push('Write some notes on the session.');
	if (values.notes.length > MAX_NOTES_LENGTH) {
		errors.push(`Keep the notes under ${MAX_NOTES_LENGTH.toLocaleString('en-US')} characters.`);
	}

	if (errors.length > 0 || !time || !duration || !location || !ots) return { ok: false, errors };

	return {
		ok: true,
		record: {
			sessionDate: `${values.date} ${time}`,
			position: values.position,
			duration,
			location: location.value,
			otsStatus: finish === 'rating-exam' ? OTS_RECOMMENDED : ots.value,
			score,
			movements,
			notes: values.notes
		},
		finish,
		examResult: EXAM_RESULTS[ots.value] ?? null
	};
}

/** `live` sends the report for real; anything else asks VATUSA to check it and save nothing. */
export function ctrsMode(value: string | undefined): 'live' | 'test' {
	return value?.trim().toLowerCase() === 'live' ? 'live' : 'test';
}
