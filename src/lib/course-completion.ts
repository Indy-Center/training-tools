/**
 * The end of a course of training: who may move it on, where it goes, and what
 * it earns.
 *
 * Pure, like `$lib/training-flow.ts`, so every rule is testable without Jira or
 * a database. The Jira writes are in `$lib/server/enrollments/completion.ts`.
 *
 *   In Training ──teacher: training complete──┬─(course has a rating exam)─> Rating Exam
 *        ▲                                    │                                   │
 *        │                                    │        examiner: claim, then passed │ not passed
 *        │                                    │                                   │      │
 *        │                                    └─(no exam)──> Certification Update <┘      ▼
 *        │                                                          │                Needs CATP
 *        │                                         certification applied automatically    │
 *        │                                                          │                     │
 *        │                                               TA: audit complete ──> Completed │
 *        └──────────────────────── TA returns it to training, on the board ───────────────┘
 *
 * See .ai/decisions/0021-end-of-course-flows.md
 */
import { findCredential, highestCertification } from './certifications';
import { hasEvaluation, isAssignedTo, type QualificationLevel } from './teachers';

/** Where a course goes when its teacher marks the training complete. */
export function afterTraining(course: string): 'rating-exam' | 'certification-update' {
	return hasEvaluation(course) ? 'rating-exam' : 'certification-update';
}

export type CredentialChange =
	/** Replaces the certification they hold: the ladder is one at a time. */
	| { action: 'set-certification'; code: string }
	/** Held alongside their certification. */
	| { action: 'grant-endorsement'; code: string }
	| {
			action: 'none';
			reason:
				| 'already-held'
				/** They already hold a certification above this one; never move someone down. */
				| 'holds-higher'
				/** The course is not in the credential catalogue. */
				| 'no-credential';
	  };

/**
 * What finishing a course does to what a controller holds.
 *
 * A course earns the credential of the same code. A certification only ever
 * moves someone **up**: a card for S-GC arriving for someone who already holds
 * A-LC — a hand-filed issue, a late paperwork catch-up — changes nothing,
 * rather than quietly taking their higher certification away.
 */
export function credentialChangeFor(course: string, held: readonly string[]): CredentialChange {
	const credential = findCredential(course);
	if (!credential) return { action: 'none', reason: 'no-credential' };

	if (held.includes(credential.code)) return { action: 'none', reason: 'already-held' };

	if (credential.kind === 'endorsement') {
		return { action: 'grant-endorsement', code: credential.code };
	}

	const currentRank = highestCertification(held)?.rank ?? 0;
	if (currentRank > credential.rank) return { action: 'none', reason: 'holds-higher' };

	return { action: 'set-certification', code: credential.code };
}

/** Something a card must carry before its course's certification is applied. */
export type CompletionEvidence = 'training-completed' | 're-instructor' | 're-completed';

/** Each by the name of its field on the TRK card, which is where it gets fixed. */
export const COMPLETION_EVIDENCE_LABELS: Record<CompletionEvidence, string> = {
	'training-completed': 'Training Completed',
	're-instructor': 'RE Instructor',
	're-completed': 'RE Completed'
};

/** The fields on a TRK card that show a course was finished. */
export type CardEvidence = {
	trainingCompleted: string | null;
	reInstructor: string | null;
	reCompleted: string | null;
};

/**
 * What a card at Certification Update still lacks, for its course.
 *
 * Every course needs `Training Completed`. The four that end in a rating exam
 * also need an examiner and `RE Completed`. A card that reached Certification
 * Update without them was dragged there — past the exam, or before the training
 * was done — and certifying from it would grant something nobody earned. Every
 * step taken through this app writes its field before it moves the card, so a
 * card moved here never lacks one.
 */
export function missingEvidence(course: string, card: CardEvidence): CompletionEvidence[] {
	const missing: CompletionEvidence[] = [];

	if (!card.trainingCompleted) missing.push('training-completed');
	if (afterTraining(course) === 'rating-exam') {
		if (!card.reInstructor) missing.push('re-instructor');
		if (!card.reCompleted) missing.push('re-completed');
	}

	return missing;
}

/** As stored on a request (`certification_hold`): the keys, comma-separated. */
export function formatHold(missing: readonly CompletionEvidence[]): string | null {
	return missing.length > 0 ? missing.join(',') : null;
}

/** A stored hold, as the field names an admin has to fill in. */
export function holdLabels(hold: string | null): string[] {
	if (!hold) return [];
	return hold
		.split(',')
		.flatMap((key) =>
			key in COMPLETION_EVIDENCE_LABELS
				? [COMPLETION_EVIDENCE_LABELS[key as CompletionEvidence]]
				: []
		);
}

type Request = {
	/** The student. */
	cid: string;
	course: string;
	status: string;
	/** TRK's `Teacher` value. */
	teacher: string | null;
	/** TRK's `RE Instructor` value. */
	reInstructor: string | null;
};

type Teacher = { cid: string; initials: string | null };

/**
 * Nobody signs off their own training. A teacher can be a student, but the app
 * never lists their own request as theirs to act on.
 */
function isOwn(request: Request, teacher: Teacher): boolean {
	return request.cid === teacher.cid;
}

/** The assigned teacher marks training complete. */
export function canCompleteTraining(request: Request, teacher: Teacher): boolean {
	return (
		request.status === 'in-training' &&
		!isOwn(request, teacher) &&
		isAssignedTo(request.teacher, teacher)
	);
}

/**
 * The rating exam is an independent check of the training, so the teacher who
 * gave it can never be the one who examines it — whatever they are qualified
 * for, and whoever is on the card.
 */
function taughtThem(request: Request, teacher: Teacher): boolean {
	return isAssignedTo(request.teacher, teacher);
}

/**
 * Anyone qualified to evaluate the course may claim an exam nobody has claimed
 * yet, unless they taught the student. Claiming puts them on the card as its
 * RE Instructor.
 */
export function canClaimExam(
	request: Request,
	teacher: Teacher,
	levels: ReadonlyMap<string, QualificationLevel>
): boolean {
	return (
		request.status === 'rating-exam' &&
		!request.reInstructor &&
		!isOwn(request, teacher) &&
		!taughtThem(request, teacher) &&
		levels.get(request.course) === 'evaluator'
	);
}

/**
 * Only the examiner on the card records the result, passed or not — and never
 * the student's own teacher, even if staff put them on the card by hand.
 */
export function canCompleteExam(request: Request, teacher: Teacher): boolean {
	return (
		request.status === 'rating-exam' &&
		!isOwn(request, teacher) &&
		!taughtThem(request, teacher) &&
		isAssignedTo(request.reInstructor, teacher)
	);
}
