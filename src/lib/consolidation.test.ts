import { describe, expect, it } from 'vitest';
import { checkConsolidation, requiredConsolidationHours } from './consolidation';

const requirements = { S1: 10, S2: 15, S3: 20 };

describe('requiredConsolidationHours', () => {
	it('reads the configured requirement for a rating', () => {
		expect(requiredConsolidationHours('S2', requirements)).toBe(15);
	});

	it('normalizes the short code', () => {
		expect(requiredConsolidationHours(' s1 ', requirements)).toBe(10);
	});

	it('has no requirement for unlisted ratings', () => {
		expect(requiredConsolidationHours('OBS', requirements)).toBe(0);
		expect(requiredConsolidationHours('C1', requirements)).toBe(0);
		expect(requiredConsolidationHours(null, requirements)).toBe(0);
	});

	it('clamps a negative setting to zero', () => {
		expect(requiredConsolidationHours('S1', { S1: -5 })).toBe(0);
	});
});

describe('checkConsolidation', () => {
	it('is met without any hours when the rating carries no requirement', () => {
		expect(
			checkConsolidation({ ratingShort: 'OBS', hoursByRating: null, requirements })
		).toMatchObject({ status: 'met' });
	});

	it('counts only hours at the current rating', () => {
		// Plenty of S1 time does not consolidate S2.
		expect(
			checkConsolidation({ ratingShort: 'S2', hoursByRating: { s1: 80, s2: 4.5 }, requirements })
		).toEqual({ status: 'not-met', rating: 'S2', required: 15, logged: 4.5 });
	});

	it('is met at exactly the requirement', () => {
		expect(
			checkConsolidation({ ratingShort: 'S3', hoursByRating: { s3: 20 }, requirements })
		).toMatchObject({ status: 'met', rating: 'S3', required: 20 });
	});

	it('treats a missing rating key as no hours', () => {
		expect(
			checkConsolidation({ ratingShort: 'S1', hoursByRating: {}, requirements })
		).toMatchObject({
			status: 'not-met',
			logged: 0
		});
	});

	// A VATSIM outage must not let everyone through.
	it('fails closed when the hours could not be fetched', () => {
		expect(checkConsolidation({ ratingShort: 'S1', hoursByRating: null, requirements })).toEqual({
			status: 'unknown',
			rating: 'S1',
			required: 10
		});
	});
});
