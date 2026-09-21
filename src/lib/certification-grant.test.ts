import { describe, expect, it } from 'vitest';
import {
	inferEarnedRating,
	needsVatsimLookup,
	resolveArrivalGrant,
	type ArrivalFacts
} from './certification-grant';

const NOW = new Date('2026-09-21T12:00:00Z');

/** Controlled last week — current by any reading of the six-month window. */
const RECENT = new Date('2026-09-14T02:00:00Z');

function facts(overrides: Partial<ArrivalFacts> = {}): ArrivalFacts {
	return {
		ratingShort: 'S2',
		lastAtcSessionEnd: RECENT,
		atcHoursByRating: null,
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
		const decision = resolveArrivalGrant(facts({ ratingShort }), NOW);
		expect(decision.action).toBe('grant');
		if (decision.action !== 'grant') return;
		expect(decision.code).toBe(expected);
		// A rating read straight off the table is not an inference, so no flag.
		expect(decision.needsReview).toBe(false);
	});

	it('grants an OBS arrival nothing', () => {
		expect(resolveArrivalGrant(facts({ ratingShort: 'OBS' }), NOW).action).toBe('none');
	});

	// The roster genuinely contains OBS controllers, and a rating we have never
	// seen should stop rather than fall through to something plausible.
	it('grants nothing for an unrecognised rating', () => {
		const decision = resolveArrivalGrant(facts({ ratingShort: 'C2' }), NOW);
		expect(decision.action).toBe('none');
		if (decision.action !== 'none') return;
		expect(decision.reason).toContain('C2');
	});

	it('records what the decision was made from', () => {
		const decision = resolveArrivalGrant(facts({ ratingShort: 'S3' }), NOW);
		if (decision.action !== 'grant') throw new Error('expected a grant');
		expect(decision.note).toContain('S3');
		expect(decision.note).toContain('2026-09-14');
	});
});

describe('resolveArrivalGrant — already holds something', () => {
	// The leave-and-return case from DEV-115: a returning member must not have
	// their certification re-granted or duplicated.
	it('keeps an existing certification rather than re-granting it', () => {
		const decision = resolveArrivalGrant(facts({ ratingShort: 'C1', held: ['T-RC'] }), NOW);
		expect(decision.action).toBe('keep');
	});

	// Someone off the roster for a year and back again still holds what they
	// held, because only the currency job revokes. Stale activity must not
	// override that.
	it('keeps a certification even when the controller is no longer current', () => {
		const decision = resolveArrivalGrant(
			facts({ held: ['A-GC'], lastAtcSessionEnd: new Date('2024-01-01T00:00:00Z') }),
			NOW
		);
		expect(decision.action).toBe('keep');
	});

	// Endorsements sit alongside a certification, so holding one is not the same
	// as being certified — this arrival still gets its table grant.
	it('does not treat a lone endorsement as being certified', () => {
		const decision = resolveArrivalGrant(facts({ ratingShort: 'S1', held: ['T2-CTR'] }), NOW);
		expect(decision.action).toBe('grant');
	});
});

describe('resolveArrivalGrant — the six-month activity window', () => {
	it('grants nothing when the last session is outside the window', () => {
		const decision = resolveArrivalGrant(
			facts({ lastAtcSessionEnd: new Date('2026-01-01T00:00:00Z') }),
			NOW
		);
		expect(decision.action).toBe('none');
		if (decision.action !== 'none') return;
		expect(decision.reason).toContain('2026-01-01');
	});

	it('grants nothing when they have never controlled', () => {
		const decision = resolveArrivalGrant(facts({ lastAtcSessionEnd: null }), NOW);
		expect(decision.action).toBe('none');
		if (decision.action !== 'none') return;
		expect(decision.reason).toContain('No controlling history');
	});

	/**
	 * The case the requester raised: quiet for two months, then a six-month leave
	 * of absence, then back on the roster. They arrive holding nothing and are
	 * outside the window, so they get nothing and must re-earn it.
	 */
	it('grants nothing after a leave of absence long enough to lapse', () => {
		const decision = resolveArrivalGrant(
			facts({
				ratingShort: 'S3',
				held: [],
				lastAtcSessionEnd: new Date('2025-11-21T00:00:00Z')
			}),
			NOW
		);
		expect(decision.action).toBe('none');
	});

	it('still grants just inside the window', () => {
		// ~5 months back.
		const decision = resolveArrivalGrant(
			facts({ lastAtcSessionEnd: new Date('2026-04-21T00:00:00Z') }),
			NOW
		);
		expect(decision.action).toBe('grant');
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
		expect(inferEarnedRating(null)).toBeNull();
		expect(inferEarnedRating({})).toBeNull();
		expect(inferEarnedRating({ s1: 0, s2: 0 })).toBeNull();
	});
});

describe('resolveArrivalGrant — SUP and ADM', () => {
	it.each(['SUP', 'ADM'])('derives %s from logged hours and flags for review', (ratingShort) => {
		const decision = resolveArrivalGrant(
			facts({ ratingShort, atcHoursByRating: { s1: 53.5, s2: 80.9, s3: 96.4, c1: 771.3 } }),
			NOW
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
			facts({ ratingShort: 'SUP', atcHoursByRating: { s1: 200, s2: 40 } }),
			NOW
		);
		if (decision.action !== 'grant') throw new Error('expected a grant');
		// Highest tier with hours is S2, which the table maps to A-LC.
		expect(decision.code).toBe('A-LC');
		expect(decision.needsReview).toBe(true);
	});

	// DEV-115's stated fallback when the earned rating can't be worked out.
	it('falls back to E-RC and flags when there are no usable hours', () => {
		const decision = resolveArrivalGrant(
			facts({ ratingShort: 'SUP', atcHoursByRating: null }),
			NOW
		);
		if (decision.action !== 'grant') throw new Error('expected a grant');
		expect(decision.code).toBe('E-RC');
		expect(decision.needsReview).toBe(true);
		expect(decision.note).toContain('fallback');
	});

	// The activity window applies to supervisors too — a SUP who has not
	// controlled in a year gets nothing, hours notwithstanding.
	it('still requires recent activity', () => {
		const decision = resolveArrivalGrant(
			facts({
				ratingShort: 'SUP',
				atcHoursByRating: { c1: 771.3 },
				lastAtcSessionEnd: new Date('2025-01-01T00:00:00Z')
			}),
			NOW
		);
		expect(decision.action).toBe('none');
	});

	it('keeps an existing certification instead of re-deriving one', () => {
		const decision = resolveArrivalGrant(
			facts({ ratingShort: 'SUP', atcHoursByRating: { c1: 771.3 }, held: ['A-GC'] }),
			NOW
		);
		expect(decision.action).toBe('keep');
	});
});

describe('needsVatsimLookup', () => {
	// The point of the predicate: after the community-website import, most of the
	// roster is decidable without an HTTP call.
	it('skips the lookup for someone already certified', () => {
		expect(needsVatsimLookup('C1', ['T-RC'])).toBe(false);
	});

	it('skips the lookup for a rating that carries no certification', () => {
		expect(needsVatsimLookup('OBS', [])).toBe(false);
	});

	it('still looks up a rated controller holding nothing', () => {
		expect(needsVatsimLookup('S2', [])).toBe(true);
	});

	// An endorsement is not a certification, so it does not settle the question.
	it('still looks up someone holding only an endorsement', () => {
		expect(needsVatsimLookup('S1', ['S-LC'])).toBe(true);
	});

	// SUP is absent from the rating table, so `RATING_GRANTS[rating]` is
	// undefined rather than null — it must not be mistaken for "grants nothing".
	it('still looks up a supervisor', () => {
		expect(needsVatsimLookup('SUP', [])).toBe(true);
	});

	// Likewise an unknown rating: resolveArrivalGrant decides it, not this.
	it('still looks up an unrecognised rating', () => {
		expect(needsVatsimLookup('C2', [])).toBe(true);
	});

	it('agrees with resolveArrivalGrant on every case it skips', () => {
		for (const [ratingShort, held] of [
			['C1', ['T-RC']],
			['OBS', []],
			['S2', ['E-RC']]
		] as const) {
			if (needsVatsimLookup(ratingShort, held)) continue;
			// Skipping means the answer is the same with or without activity data.
			const withoutData = resolveArrivalGrant(
				facts({ ratingShort, held, lastAtcSessionEnd: null, atcHoursByRating: null }),
				NOW
			);
			const withData = resolveArrivalGrant(facts({ ratingShort, held }), NOW);
			expect(withoutData.action).toBe(withData.action);
			expect(withoutData.action).not.toBe('grant');
		}
	});
});

describe('resolveArrivalGrant — never grants an endorsement', () => {
	// DEV-115 is explicit that Tier 2 is earned through a self-led Moodle course.
	// community-website auto-adds T2-CTR alongside E-RC; we deliberately do not.
	it.each(['S1', 'S2', 'S3', 'C1', 'C3', 'I1', 'I3', 'SUP'])(
		'grants %s a certification only',
		(ratingShort) => {
			const decision = resolveArrivalGrant(
				facts({ ratingShort, atcHoursByRating: { c1: 500 } }),
				NOW
			);
			if (decision.action !== 'grant') throw new Error('expected a grant');
			expect(decision.code).not.toBe('T2-CTR');
			expect(decision.code).not.toBe('S-LC');
		}
	);
});
