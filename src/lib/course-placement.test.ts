import { describe, expect, it } from 'vitest';
import { divergesFromSuggestion, resolvePlacement } from './course-placement';

describe('resolvePlacement', () => {
	it('starts a controller with nothing at simple ground', () => {
		const placement = resolvePlacement({ held: [] });
		expect(placement.suggested).toBe('S-GC');
	});

	// A new controller being told "you hold no certifications" is discouraging
	// and tells them nothing useful.
	it('does not phrase the first suggestion as a deficit', () => {
		const reason = resolvePlacement({ held: [] }).reason;
		expect(reason).not.toMatch(/no certification|nothing/i);
	});

	it('moves simple ground on to advanced ground', () => {
		expect(resolvePlacement({ held: ['S-GC'] }).suggested).toBe('A-GC');
	});

	/**
	 * The case the ladder exists for. A-LC requires A-GC *and* S-LC, so an
	 * advanced-ground controller is due S-LC next — not A-LC. Hand-writing a
	 * course sequence would have skipped it; walking `requires` does not.
	 */
	it('routes advanced ground to simple local before advanced local', () => {
		expect(resolvePlacement({ held: ['S-GC', 'A-GC'] }).suggested).toBe('S-LC');
	});

	it('moves on to advanced local once the endorsement is held', () => {
		expect(resolvePlacement({ held: ['S-GC', 'A-GC', 'S-LC'] }).suggested).toBe('A-LC');
	});

	it('climbs through the radar certifications in order', () => {
		expect(resolvePlacement({ held: ['A-GC', 'S-LC', 'A-LC'] }).suggested).toBe('T-RC');
		expect(resolvePlacement({ held: ['A-GC', 'S-LC', 'A-LC', 'T-RC'] }).suggested).toBe('E-RC');
	});

	// T2-CTR is the only thing left after E-RC and it is self-led on Moodle, so
	// there is no course to enroll in.
	it('suggests nothing once the top certification is held', () => {
		const placement = resolvePlacement({ held: ['A-GC', 'S-LC', 'A-LC', 'T-RC', 'E-RC'] });
		expect(placement.suggested).toBeNull();
		expect(placement.reason).toMatch(/not taught as a course|training staff/i);
	});

	it('suggests nothing when everything is held', () => {
		const placement = resolvePlacement({
			held: ['S-GC', 'A-GC', 'S-LC', 'A-LC', 'T-RC', 'E-RC', 'T2-CTR']
		});
		expect(placement.suggested).toBeNull();
		expect(placement.reason).toContain('E-RC');
	});

	/**
	 * An arrival granted A-LC straight off the GCAP table holds no ground
	 * certification and no S-LC, because `requires` governs enrollment
	 * eligibility rather than arrival equivalency. Placement must still produce
	 * something sensible rather than pushing them back to S-GC.
	 */
	it('handles a rated arrival who skipped the ladder', () => {
		const placement = resolvePlacement({ held: ['A-LC'] });
		expect(placement.suggested).toBe('T-RC');
		expect(placement.reason).toContain('A-LC');
	});

	it('always names a real course code when it suggests one', () => {
		for (const held of [[], ['S-GC'], ['S-GC', 'A-GC'], ['A-LC'], ['T-RC']]) {
			const placement = resolvePlacement({ held });
			if (placement.suggested === null) continue;
			expect(placement.reason.length).toBeGreaterThan(0);
		}
	});
});

describe('divergesFromSuggestion', () => {
	it('flags a choice that differs from the suggestion', () => {
		expect(divergesFromSuggestion(resolvePlacement({ held: [] }), 'E-RC')).toBe(true);
	});

	it('does not flag a choice that matches', () => {
		expect(divergesFromSuggestion(resolvePlacement({ held: [] }), 'S-GC')).toBe(false);
	});

	// Nothing to diverge from, so nothing to tell staff about.
	it('does not flag anything when we had no suggestion', () => {
		expect(divergesFromSuggestion({ suggested: null, reason: '' }, 'E-RC')).toBe(false);
	});

	it('does not flag a missing choice', () => {
		expect(divergesFromSuggestion(resolvePlacement({ held: [] }), null)).toBe(false);
	});
});
