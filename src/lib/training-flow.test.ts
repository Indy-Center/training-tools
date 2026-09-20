import { describe, expect, it } from 'vitest';
import { isRatedController, resolveTrainingFlow } from './training-flow';

describe('resolveTrainingFlow', () => {
	it('sends rostered home controllers to enrollment', () => {
		expect(resolveTrainingFlow({ membership: 'home', ratingId: 3 })).toBe('enroll');
	});

	it('sends rostered visiting controllers to the visitor copy', () => {
		expect(resolveTrainingFlow({ membership: 'visit', ratingId: 5 })).toBe('visiting-controller');
	});

	// The live ZID roster contains OBS controllers, so rating must not be
	// consulted before roster membership.
	it('keeps a rostered OBS controller on the enrollment path', () => {
		expect(resolveTrainingFlow({ membership: 'home', ratingId: 1, ratingShort: 'OBS' })).toBe(
			'enroll'
		);
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
