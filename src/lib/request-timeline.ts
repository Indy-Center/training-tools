/**
 * An open training request as the steps of its course: which are behind the
 * student, which one they are on, and the dates we hold.
 *
 * Pure, like `$lib/training-flow.ts`. Only some steps have a stored date — when
 * a teacher was assigned and when training or the exam finished live on the TRK
 * card alone — so a finished step can be undated; the status still says it is
 * done.
 */
import { afterTraining } from './course-completion';
import { formatCardDate, formatDate } from './format';
import { academyExamFor } from './vatusa-academy';

export type RequestStepState = 'done' | 'current' | 'upcoming';

export type RequestStep = {
	key: 'waitlist' | 'vatusa-assigned' | 'vatusa-passed' | 'training' | 'exam' | 'certification';
	label: string;
	state: RequestStepState;
	/** Formatted, or null when we hold no date for the step. */
	date: string | null;
	detail: string | null;
};

export type RequestTimelineInput = {
	course: string;
	status: string;
	createdAt: Date;
	/** Who is teaching, as shown to the student. Null until someone is assigned. */
	teacher: string | null;
	/** Who is running the rating exam, shown the same way. */
	examiner: string | null;
	/** `YYYY-MM-DD`, as the TRK card holds them. */
	vatusaAssignedOn: string | null;
	vatusaCompletedOn: string | null;
	certificationAppliedAt: Date | null;
};

const STAGES = ['waitlist', 'training', 'exam', 'certification'] as const;
type Stage = (typeof STAGES)[number];

/**
 * Needs CATP is further training, whether it followed an exam or not, so it
 * sits on the training step.
 */
const STAGE_BY_STATUS: Record<string, Stage> = {
	waitlist: 'waitlist',
	'in-training': 'training',
	'needs-catp': 'training',
	'rating-exam': 'exam',
	'certification-update': 'certification'
};

export function requestTimeline(request: RequestTimelineInput): RequestStep[] {
	const current = STAGE_BY_STATUS[request.status] ?? 'waitlist';
	const stateOf = (stage: Stage): RequestStepState => {
		const difference = STAGES.indexOf(stage) - STAGES.indexOf(current);
		return difference < 0 ? 'done' : difference === 0 ? 'current' : 'upcoming';
	};

	const steps: RequestStep[] = [
		{
			key: 'waitlist',
			label: 'Joined the waitlist',
			state: stateOf('waitlist'),
			date: formatDate(request.createdAt, 'long'),
			detail: null
		}
	];

	// The written course sits between the waitlist and training for the courses
	// that have one, shown from the start so the student sees the order. It is
	// dated from the card rather than tied to the status: a request can be in
	// training with the course still to pass. A date on a course we do not
	// expect one for still shows.
	if (academyExamFor(request.course) || request.vatusaAssignedOn || request.vatusaCompletedOn) {
		const assigned = request.vatusaAssignedOn !== null || request.vatusaCompletedOn !== null;
		const passed = request.vatusaCompletedOn !== null;

		steps.push(
			{
				key: 'vatusa-assigned',
				label: 'VATUSA Academy course assigned',
				state: assigned ? 'done' : 'upcoming',
				date: request.vatusaAssignedOn ? formatCardDate(request.vatusaAssignedOn, 'long') : null,
				detail: null
			},
			{
				key: 'vatusa-passed',
				label: 'VATUSA Academy course passed',
				state: passed ? 'done' : assigned ? 'current' : 'upcoming',
				date: request.vatusaCompletedOn ? formatCardDate(request.vatusaCompletedOn, 'long') : null,
				detail: null
			}
		);
	}

	const training = stateOf('training');
	steps.push({
		key: 'training',
		label: 'Training',
		state: training,
		date: null,
		detail:
			request.status === 'needs-catp'
				? 'A Corrective Action Training Plan is being put together.'
				: request.teacher && training !== 'upcoming'
					? `Teacher: ${request.teacher}`
					: null
	});

	// A course with an optional exam only shows the step once it is in one.
	if (afterTraining(request.course) === 'rating-exam' || current === 'exam') {
		const exam = stateOf('exam');
		steps.push({
			key: 'exam',
			label: 'Rating exam',
			state: exam,
			date: null,
			detail: request.examiner && exam === 'current' ? `Examiner: ${request.examiner}` : null
		});
	}

	steps.push({
		key: 'certification',
		label: 'Certification update',
		state: stateOf('certification'),
		date: request.certificationAppliedAt
			? formatDate(request.certificationAppliedAt, 'long')
			: null,
		detail: null
	});

	return steps;
}
