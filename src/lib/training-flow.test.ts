import { describe, expect, it } from 'vitest';
import { isDueTier2, isRatedController, resolveTrainingFlow } from './training-flow';
import type { Consolidation } from './consolidation';

const met: Consolidation = { status: 'met', rating: 'S2', required: 15 };
const notMet: Consolidation = { status: 'not-met', rating: 'S2', required: 15, logged: 3 };
const unknown: Consolidation = { status: 'unknown', rating: 'S2', required: 15 };

describe('resolveTrainingFlow', () => {
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

	// Consolidation gates starting a request, not seeing one already open.
	it('always shows an open request', () => {
		expect(
			resolveTrainingFlow({
				membership: 'home',
				ratingId: 3,
				consolidation: notMet,
				hasOpenEnrollment: true
			})
		).toBe('enroll');
	});

	it('sends lower-rated visiting controllers to the visitor copy', () => {
		expect(resolveTrainingFlow({ membership: 'visit', ratingId: 4, ratingShort: 'S3' })).toBe(
			'visiting-controller'
		);
	});

	it('sends visitors holding E-RC but not Tier 2 to the Tier 2 course', () => {
		expect(resolveTrainingFlow({ membership: 'visit', ratingId: 5, held: ['E-RC'] })).toBe(
			'tier-2'
		);
	});

	// The credential decides, not the rating: a C1 not yet certified E-RC here
	// has nothing we can train them in.
	it('sends a visiting C1 without E-RC to the visitor copy', () => {
		expect(resolveTrainingFlow({ membership: 'visit', ratingId: 5, held: [] })).toBe(
			'visiting-controller'
		);
	});

	it('sends visitors who already hold Tier 2 to the visitor copy', () => {
		expect(
			resolveTrainingFlow({ membership: 'visit', ratingId: 5, held: ['E-RC', 'T2-CTR'] })
		).toBe('visiting-controller');
	});

	it('sends home controllers holding E-RC but not Tier 2 to the Tier 2 course', () => {
		// No consolidation check needed to get there.
		expect(resolveTrainingFlow({ membership: 'home', ratingId: 5, held: ['E-RC'] })).toBe('tier-2');
	});

	it('shows a home controller their open request before Tier 2', () => {
		expect(
			resolveTrainingFlow({
				membership: 'home',
				ratingId: 5,
				held: ['E-RC'],
				hasOpenEnrollment: true
			})
		).toBe('enroll');
	});

	it('lets a home controller with Tier 2 back to enrollment once consolidated', () => {
		expect(
			resolveTrainingFlow({
				membership: 'home',
				ratingId: 5,
				held: ['E-RC', 'T2-CTR'],
				consolidation: { status: 'met', rating: 'C1', required: 0 }
			})
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
				consolidation: { status: 'met', rating: 'OBS', required: 0 }
			})
		).toBe('enroll');
	});

	it('sends unrostered rated controllers to transfer-or-visit', () => {
		expect(resolveTrainingFlow({ membership: null, ratingId: 4, ratingShort: 'S3' })).toBe(
			'transfer-or-visit'
		);
	});

	it('sends unrostered observers to become-controller', () => {
		expect(resolveTrainingFlow({ membership: null, ratingId: 1, ratingShort: 'OBS' })).toBe(
			'become-controller'
		);
	});

	it('falls back to become-controller when the rating is unknown', () => {
		expect(resolveTrainingFlow({ membership: null })).toBe('become-controller');
		expect(resolveTrainingFlow({ membership: null, ratingId: null, ratingShort: null })).toBe(
			'become-controller'
		);
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
