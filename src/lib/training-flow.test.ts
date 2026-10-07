import { describe, expect, it } from 'vitest';
import {
	asksForStudentView,
	hasFinishedTraining,
	isDueTier2,
	isOpenEnrollmentStatus,
	isRatedController,
	OPEN_ENROLLMENT_STATUSES,
	resolveTrainingFlow,
	STUDENT_VIEW_HREF
} from './training-flow';
import type { Consolidation } from './consolidation';
import { CLOSED_ENROLLMENT_STATUSES, ENROLLMENT_STATUSES } from './db/schema/enrollments';

const met: Consolidation = { status: 'met', course: 'T-RC', required: 50 };
const notMet: Consolidation = { status: 'not-met', course: 'T-RC', required: 50, logged: 3 };
const unknown: Consolidation = { status: 'unknown', course: 'T-RC', required: 50 };

describe('resolveTrainingFlow with no open request', () => {
	it('sends consolidated home controllers to enrollment', () => {
		expect(resolveTrainingFlow({ membership: 'home', ratingId: 3, consolidation: met })).toBe(
			'enroll'
		);
	});

	it('holds back home controllers who have not consolidated', () => {
		expect(resolveTrainingFlow({ membership: 'home', ratingId: 3, consolidation: notMet })).toBe(
			'consolidating'
		);
	});

	it('holds back home controllers whose hours could not be checked', () => {
		expect(resolveTrainingFlow({ membership: 'home', ratingId: 3, consolidation: unknown })).toBe(
			'consolidating'
		);
	});

	it('fails closed when no consolidation check was made', () => {
		expect(resolveTrainingFlow({ membership: 'home', ratingId: 3 })).toBe('consolidating');
	});

	// Nothing left to enroll in, so consolidation is never consulted.
	it('sends home controllers holding the highest certification to extra courses', () => {
		expect(resolveTrainingFlow({ membership: 'home', ratingId: 5, held: ['E-RC'] })).toBe(
			'extra-courses'
		);
		expect(
			resolveTrainingFlow({
				membership: 'home',
				ratingId: 5,
				held: ['E-RC', 'T2-CTR'],
				consolidation: notMet
			})
		).toBe('extra-courses');
	});

	it('keeps a home controller below the highest certification on the enrollment path', () => {
		expect(
			resolveTrainingFlow({ membership: 'home', ratingId: 4, held: ['T-RC'], consolidation: met })
		).toBe('enroll');
	});

	// The live ZID roster contains OBS controllers, so rating must not be
	// consulted before roster membership.
	it('keeps a rostered OBS controller on the enrollment path', () => {
		expect(
			resolveTrainingFlow({
				membership: 'home',
				ratingId: 1,
				ratingShort: 'OBS',
				consolidation: { status: 'met', course: 'S-GC', required: 0 }
			})
		).toBe('enroll');
	});

	// Tier 2 is offered on the visitor view, not a view of its own.
	it('sends every visiting controller to the visitor copy', () => {
		expect(resolveTrainingFlow({ membership: 'visit', ratingId: 4, ratingShort: 'S3' })).toBe(
			'visiting-controller'
		);
		expect(resolveTrainingFlow({ membership: 'visit', ratingId: 5, held: ['E-RC'] })).toBe(
			'visiting-controller'
		);
		expect(
			resolveTrainingFlow({ membership: 'visit', ratingId: 5, held: ['E-RC', 'T2-CTR'] })
		).toBe('visiting-controller');
	});

	it('sends unrostered, rated VATUSA controllers to transfer-or-visit', () => {
		expect(
			resolveTrainingFlow({ membership: null, ratingId: 4, ratingShort: 'S3', inVatusa: true })
		).toBe('transfer-or-visit');
	});

	// Still in the academy: on no facility's roster yet.
	it('sends unrostered VATUSA observers to become-controller', () => {
		expect(
			resolveTrainingFlow({ membership: null, ratingId: 1, ratingShort: 'OBS', inVatusa: true })
		).toBe('become-controller');
	});

	// Rated, but in another division: they have to join VATUSA before either
	// transferring or visiting means anything.
	it('sends rated controllers outside VATUSA to become-controller', () => {
		expect(
			resolveTrainingFlow({ membership: null, ratingId: 5, ratingShort: 'C1', inVatusa: false })
		).toBe('become-controller');
	});

	it('treats an unknown division as outside VATUSA', () => {
		expect(resolveTrainingFlow({ membership: null, ratingId: 5, ratingShort: 'C1' })).toBe(
			'become-controller'
		);
	});

	it('falls back to become-controller when the rating is unknown', () => {
		expect(resolveTrainingFlow({ membership: null, inVatusa: true })).toBe('become-controller');
		expect(
			resolveTrainingFlow({ membership: null, ratingId: null, ratingShort: null, inVatusa: true })
		).toBe('become-controller');
	});
});

describe('resolveTrainingFlow with an open request', () => {
	it('shows the request by its status', () => {
		for (const status of OPEN_ENROLLMENT_STATUSES) {
			expect(resolveTrainingFlow({ membership: 'home', ratingId: 3, openStatus: status })).toBe(
				status
			);
		}
	});

	// Consolidation gates starting a request, not seeing one already open.
	it('shows it whatever their consolidation says', () => {
		expect(
			resolveTrainingFlow({
				membership: 'home',
				ratingId: 3,
				consolidation: notMet,
				openStatus: 'waitlist'
			})
		).toBe('waitlist');
	});

	it('shows it ahead of extra courses', () => {
		expect(
			resolveTrainingFlow({
				membership: 'home',
				ratingId: 5,
				held: ['E-RC'],
				openStatus: 'in-training'
			})
		).toBe('in-training');
	});

	// A request outlives a roster change: its owner still has to be able to see
	// it and withdraw it.
	it('shows it to someone who has since left the home roster', () => {
		expect(resolveTrainingFlow({ membership: 'visit', ratingId: 3, openStatus: 'waitlist' })).toBe(
			'waitlist'
		);
		expect(
			resolveTrainingFlow({
				membership: null,
				ratingId: 3,
				inVatusa: true,
				openStatus: 'rating-exam'
			})
		).toBe('rating-exam');
	});

	it('ignores a status that is not open', () => {
		for (const status of CLOSED_ENROLLMENT_STATUSES) {
			expect(
				resolveTrainingFlow({
					membership: 'home',
					ratingId: 3,
					consolidation: met,
					openStatus: status
				})
			).toBe('enroll');
		}
	});
});

describe('isOpenEnrollmentStatus', () => {
	// Guards the two lists drifting apart when a status is added to the schema.
	it('splits every stored status into open or closed', () => {
		const closed: readonly string[] = CLOSED_ENROLLMENT_STATUSES;
		for (const status of ENROLLMENT_STATUSES) {
			expect(isOpenEnrollmentStatus(status)).toBe(!closed.includes(status));
		}
	});

	it('is false for nothing at all', () => {
		expect(isOpenEnrollmentStatus(null)).toBe(false);
		expect(isOpenEnrollmentStatus(undefined)).toBe(false);
		expect(isOpenEnrollmentStatus('')).toBe(false);
	});
});

describe('isRatedController', () => {
	it('treats S1 and above as rated', () => {
		expect(isRatedController(2)).toBe(true);
		expect(isRatedController(5)).toBe(true);
		expect(isRatedController(12)).toBe(true);
	});

	it('treats OBS and below as unrated', () => {
		expect(isRatedController(1)).toBe(false);
		expect(isRatedController(0)).toBe(false);
		expect(isRatedController(-1)).toBe(false);
	});

	it('prefers the numeric id over the short code', () => {
		expect(isRatedController(1, 'C1')).toBe(false);
		expect(isRatedController(5, 'OBS')).toBe(true);
	});

	it('falls back to the short code when no id is supplied', () => {
		expect(isRatedController(null, 'S2')).toBe(true);
		expect(isRatedController(undefined, 'OBS')).toBe(false);
		expect(isRatedController(null, 'obs')).toBe(false);
		expect(isRatedController(null, '  S1  ')).toBe(true);
	});

	it('treats suspended and inactive as unrated', () => {
		expect(isRatedController(null, 'SUS')).toBe(false);
		expect(isRatedController(null, 'INA')).toBe(false);
	});
});

describe('hasFinishedTraining', () => {
	it('is true at the highest certification with Tier 2 and no request open', () => {
		expect(hasFinishedTraining({ hasOpenRequest: false, held: ['E-RC', 'T2-CTR'] })).toBe(true);
	});

	// Tier 2 is offered on `/`, so they are not sent away from it yet.
	it('is false while Tier 2 is still due', () => {
		expect(hasFinishedTraining({ hasOpenRequest: false, held: ['E-RC'] })).toBe(false);
	});

	it('is false below the highest certification', () => {
		expect(hasFinishedTraining({ hasOpenRequest: false, held: ['T-RC'] })).toBe(false);
		expect(hasFinishedTraining({ hasOpenRequest: false, held: [] })).toBe(false);
	});

	// An open request always shows, whatever they hold.
	it('is false with a request open', () => {
		expect(hasFinishedTraining({ hasOpenRequest: true, held: ['E-RC', 'T2-CTR'] })).toBe(false);
	});
});

describe('asksForStudentView', () => {
	const at = (path: string) => new URL(path, 'https://training.flyindycenter.com');

	// The header's link has to be the one the redirect lets through.
	it('is true for the link the header uses', () => {
		expect(asksForStudentView(at(STUDENT_VIEW_HREF))).toBe(true);
	});

	it('is false for the bare default, or any other view', () => {
		expect(asksForStudentView(at('/'))).toBe(false);
		expect(asksForStudentView(at('/?view=teach'))).toBe(false);
	});
});

describe('isDueTier2', () => {
	it('is due with E-RC and without T2-CTR', () => {
		expect(isDueTier2(['E-RC'])).toBe(true);
		expect(isDueTier2(['E-RC', 'S-LC'])).toBe(true);
	});

	it('is not due without E-RC, or once T2-CTR is held', () => {
		expect(isDueTier2([])).toBe(false);
		expect(isDueTier2(['T-RC'])).toBe(false);
		expect(isDueTier2(['E-RC', 'T2-CTR'])).toBe(false);
	});
});
