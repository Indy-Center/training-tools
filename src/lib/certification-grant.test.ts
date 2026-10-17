import { describe, expect, it } from 'vitest';
import { endorsementsLostWith } from './certifications';
import {
	inferEarnedRating,
	needsVatsimLookup,
	resolveArrivalGrant,
	type ArrivalFacts
} from './certification-grant';

function facts(overrides: Partial<ArrivalFacts> = {}): ArrivalFacts {
	return {
		ratingShort: 'S2',
		held: [],
		...overrides
	};
}

describe('resolveArrivalGrant — the GCAP table', () => {
	it.each([
		['S1', 'S-GC'],
		['S2', 'A-LC'],
		['S3', 'T-RC'],
		['C1', 'E-RC'],
		['C3', 'E-RC'],
		['I1', 'E-RC'],
		['I3', 'E-RC']
	])('grants %s arrivals %s', (ratingShort, expected) => {
		const decision = resolveArrivalGrant(facts({ ratingShort }));
		expect(decision.action).toBe('grant');
		if (decision.action !== 'grant') return;
		expect(decision.code).toBe(expected);
		// A rating read straight off the table is not an inference, so no flag.
		expect(decision.needsReview).toBe(false);
	});

	it('grants an OBS arrival nothing', () => {
		expect(resolveArrivalGrant(facts({ ratingShort: 'OBS' })).action).toBe('none');
	});

	// The roster genuinely contains OBS controllers, and a rating we have never
	// seen should stop rather than fall through to something plausible.
	it('grants nothing for an unrecognised rating', () => {
		const decision = resolveArrivalGrant(facts({ ratingShort: 'C2' }));
		expect(decision.action).toBe('none');
		if (decision.action !== 'none') return;
		expect(decision.reason).toContain('C2');
	});

	it('records what the decision was made from', () => {
		const decision = resolveArrivalGrant(facts({ ratingShort: 'S3' }));
		if (decision.action !== 'grant') throw new Error('expected a grant');
		expect(decision.note).toContain('S3');
	});
});

describe('resolveArrivalGrant — already holds something', () => {
	// The leave-and-return case from DEV-115: a returning member must not have
	// their certification re-granted or duplicated.
	it('keeps an existing certification rather than re-granting it', () => {
		const decision = resolveArrivalGrant(facts({ ratingShort: 'C1', held: ['E-RC'] }));
		expect(decision.action).toBe('keep');
	});

	// Endorsements sit alongside a certification, so holding one is not the same
	// as being certified — this arrival still gets its table grant.
	it('does not treat a lone endorsement as being certified', () => {
		const decision = resolveArrivalGrant(facts({ ratingShort: 'S1', held: ['T2-CTR'] }));
		expect(decision.action).toBe('grant');
	});

	it('keeps a certification above what the rating grants', () => {
		const decision = resolveArrivalGrant(facts({ ratingShort: 'S2', held: ['T-RC'] }));
		expect(decision.action).toBe('keep');
	});

	// An S1 with S-LC transfers out, makes S2 elsewhere and comes back. They are
	// owed A-LC like any S2 arrival, and S-LC cannot be held with it.
	it('moves a returning member up to what a new rating grants', () => {
		const held = ['S-GC', 'S-LC'];
		const decision = resolveArrivalGrant(facts({ ratingShort: 'S2', held }));
		if (decision.action !== 'grant') throw new Error('expected a grant');
		expect(decision.code).toBe('A-LC');
		expect(decision.needsReview).toBe(false);
		expect(decision.note).toContain('S-GC');
		expect(endorsementsLostWith(decision.code, held).map((lost) => lost.code)).toEqual(['S-LC']);
	});

	it('drops S-LC from someone kept at A-LC or above', () => {
		const decision = resolveArrivalGrant(facts({ ratingShort: 'S2', held: ['A-LC', 'S-LC'] }));
		if (decision.action !== 'keep') throw new Error('expected a keep');
		expect(decision.drop).toEqual(['S-LC']);
	});

	it('drops nothing an existing certification can be held with', () => {
		const decision = resolveArrivalGrant(facts({ ratingShort: 'S1', held: ['A-GC', 'S-LC'] }));
		if (decision.action !== 'keep') throw new Error('expected a keep');
		expect(decision.drop).toEqual([]);
	});
});

describe('inferEarnedRating', () => {
	it('picks the highest tier with meaningful hours', () => {
		expect(inferEarnedRating({ s1: 53.5, s2: 80.9, s3: 96.4, c1: 771.3 })).toBe('C1');
	});

	// The sample that prompted this: hours stop at c1, with zeroes above.
	it('ignores tiers logged at zero', () => {
		expect(inferEarnedRating({ s1: 53.5, c1: 771.3, c3: 0, i1: 0, i3: 0 })).toBe('C1');
	});

	it('ignores a stray few minutes at a rating they never really held', () => {
		expect(inferEarnedRating({ s1: 40, s2: 0.2 })).toBe('S1');
	});

	it('reports nothing when there is nothing to go on', () => {
		expect(inferEarnedRating(undefined)).toBeNull();
		expect(inferEarnedRating({})).toBeNull();
		expect(inferEarnedRating({ s1: 0, s2: 0 })).toBeNull();
	});
});

describe('resolveArrivalGrant — SUP and ADM', () => {
	it.each(['SUP', 'ADM'])('derives %s from logged hours and flags for review', (ratingShort) => {
		const decision = resolveArrivalGrant(
			facts({ ratingShort, atcHoursByRating: { s1: 53.5, s2: 80.9, s3: 96.4, c1: 771.3 } })
		);
		expect(decision.action).toBe('grant');
		if (decision.action !== 'grant') return;
		expect(decision.code).toBe('E-RC');
		// Always flagged: however well-founded, it is still an inference.
		expect(decision.needsReview).toBe(true);
		expect(decision.note).toContain('771.3h');
		expect(decision.note).toContain('C1');
	});

	it('derives a lower certification when the hours say so', () => {
		const decision = resolveArrivalGrant(
			facts({ ratingShort: 'SUP', atcHoursByRating: { s1: 200, s2: 40 } })
		);
		if (decision.action !== 'grant') throw new Error('expected a grant');
		// Highest tier with hours is S2, which the table maps to A-LC.
		expect(decision.code).toBe('A-LC');
		expect(decision.needsReview).toBe(true);
	});

	// DEV-115's stated fallback when the earned rating can't be worked out.
	it('falls back to E-RC and flags when there are no usable hours', () => {
		const decision = resolveArrivalGrant(facts({ ratingShort: 'SUP', atcHoursByRating: {} }));
		if (decision.action !== 'grant') throw new Error('expected a grant');
		expect(decision.code).toBe('E-RC');
		expect(decision.needsReview).toBe(true);
		expect(decision.note).toContain('fallback');
	});

	it('keeps an existing certification instead of re-deriving one', () => {
		const decision = resolveArrivalGrant(
			facts({ ratingShort: 'SUP', atcHoursByRating: { c1: 771.3 }, held: ['A-GC'] })
		);
		expect(decision.action).toBe('keep');
	});
});

describe('needsVatsimLookup', () => {
	it('skips the lookup for someone already certified', () => {
		expect(needsVatsimLookup('SUP', ['T-RC'])).toBe(false);
	});

	// The rating alone decides these, however long since they last controlled.
	it.each(['OBS', 'S1', 'S2', 'S3', 'C1', 'C3', 'I1', 'I3', 'C2'])(
		'skips the lookup for a %s holding nothing',
		(ratingShort) => {
			expect(needsVatsimLookup(ratingShort, [])).toBe(false);
		}
	);

	it.each(['SUP', 'ADM'])('looks up a %s holding nothing', (ratingShort) => {
		expect(needsVatsimLookup(ratingShort, [])).toBe(true);
	});

	// An endorsement is not a certification, so it does not settle the question.
	it('still looks up a supervisor holding only an endorsement', () => {
		expect(needsVatsimLookup('SUP', ['T2-CTR'])).toBe(true);
	});

	// Skipping the lookup is only safe if the hours could not have changed the
	// answer. This keeps the two functions agreeing on who needs one.
	it.each([
		['C1', ['T-RC']],
		['SUP', ['A-GC']],
		['OBS', []],
		['S1', []],
		['C2', []]
	] as const)('decides a %s holding %j the same without hours', (ratingShort, held) => {
		expect(needsVatsimLookup(ratingShort, held)).toBe(false);
		const withHours = resolveArrivalGrant(
			facts({ ratingShort, held, atcHoursByRating: { s1: 200, c1: 771.3 } })
		);
		expect(resolveArrivalGrant(facts({ ratingShort, held }))).toEqual(withHours);
	});
});

describe('resolveArrivalGrant — never grants an endorsement', () => {
	// DEV-115 is explicit that Tier 2 is earned through a self-led Moodle course.
	// community-website auto-adds T2-CTR alongside E-RC; we deliberately do not.
	it.each(['S1', 'S2', 'S3', 'C1', 'C3', 'I1', 'I3', 'SUP'])(
		'grants %s a certification only',
		(ratingShort) => {
			const decision = resolveArrivalGrant(facts({ ratingShort, atcHoursByRating: { c1: 500 } }));
			if (decision.action !== 'grant') throw new Error('expected a grant');
			expect(decision.code).not.toBe('T2-CTR');
			expect(decision.code).not.toBe('S-LC');
		}
	);
});
