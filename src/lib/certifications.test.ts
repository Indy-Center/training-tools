import { describe, expect, it } from 'vitest';
import {
	ACTIVITY_WINDOW_MONTHS,
	CERTIFICATIONS,
	CREDENTIALS,
	CREDENTIAL_CODES,
	ENDORSEMENTS,
	RATING_GRANTS,
	canHold,
	findCredential,
	highestCertification,
	isCertificationCode,
	isCredentialCode
} from './certifications';
import { findCourse } from './courses';

describe('credential catalogue', () => {
	it('covers the certifications and endorsements ZID issues', () => {
		expect(CERTIFICATIONS.map((c) => c.code)).toEqual(['S-GC', 'A-GC', 'A-LC', 'T-RC', 'E-RC']);
		expect(ENDORSEMENTS.map((c) => c.code)).toEqual(['S-LC', 'T2-CTR']);
	});

	it('gives every credential a distinct code', () => {
		expect(new Set(CREDENTIAL_CODES).size).toBe(CREDENTIAL_CODES.length);
	});

	// S-LC is listed as a certification in DEV-115, and is modelled as an
	// endorsement here on purpose: it means the top-down "hold only your highest
	// certification" rule needs no exception, and the story's requirement to show
	// S-LC beside the held ground certification falls out for free.
	it('models S-LC as an endorsement so the top-down rule needs no exception', () => {
		expect(findCredential('S-LC')?.kind).toBe('endorsement');
		expect(findCredential('S-LC')?.rank).toBeNull();
	});

	it('ranks certifications uniquely and in ascending order', () => {
		const ranks = CERTIFICATIONS.map((c) => c.rank);
		expect(ranks).toEqual([...ranks].sort((a, b) => a! - b!));
		expect(new Set(ranks).size).toBe(ranks.length);
		expect(ranks.every((rank) => typeof rank === 'number')).toBe(true);
	});

	it('leaves endorsements unranked, since they sit alongside a certification', () => {
		expect(ENDORSEMENTS.every((c) => c.rank === null)).toBe(true);
	});

	it('resolves every requirement to a real credential', () => {
		for (const credential of CREDENTIALS) {
			for (const requirement of credential.requires) {
				const codes = typeof requirement === 'string' ? [requirement] : requirement;
				for (const code of codes) {
					expect(findCredential(code), `${credential.code} requires unknown ${code}`).toBeDefined();
				}
			}
		}
	});

	// A cycle would hang any walk of the ladder — including DEV-119's course
	// placement, which climbs it to pick the next course.
	it('has no requirement cycles', () => {
		function reachable(code: string, seen = new Set<string>()): Set<string> {
			for (const requirement of findCredential(code)?.requires ?? []) {
				const codes = typeof requirement === 'string' ? [requirement] : requirement;
				for (const next of codes) {
					if (seen.has(next)) continue;
					seen.add(next);
					reachable(next, seen);
				}
			}
			return seen;
		}

		for (const credential of CREDENTIALS) {
			expect(reachable(credential.code).has(credential.code)).toBe(false);
		}
	});

	it('points every course-backed credential at a real course', () => {
		for (const credential of CREDENTIALS) {
			if (credential.courseCode === null) continue;
			expect(findCourse(credential.courseCode), credential.code).toBeDefined();
		}
	});

	// Tier 2 is earned through a self-led Moodle course, so it has no course in
	// the TRK catalogue to enroll in.
	it('leaves T2-CTR without a course', () => {
		expect(findCredential('T2-CTR')?.courseCode).toBeNull();
	});

	it('looks credentials up by code, and reports unknown ones', () => {
		expect(findCredential('T-RC')?.name).toBe('Terminal Radar Control');
		expect(findCredential('S-XX')).toBeUndefined();
		expect(isCredentialCode('E-RC')).toBe(true);
		expect(isCredentialCode('nonsense')).toBe(false);
		expect(isCertificationCode('E-RC')).toBe(true);
		expect(isCertificationCode('S-LC')).toBe(false);
	});

	// Guards any query built from this list against D1's 100-bound-parameter
	// limit, which is how the roster sync broke.
	it('keeps the code list small enough to bind', () => {
		expect(CREDENTIAL_CODES.length).toBeLessThan(100);
	});
});

describe('canHold', () => {
	it('lets anyone start at the entry-level certification', () => {
		expect(canHold('S-GC', [])).toBe(true);
	});

	it('requires the one prerequisite where there is only one', () => {
		expect(canHold('A-GC', [])).toBe(false);
		expect(canHold('A-GC', ['S-GC'])).toBe(true);
	});

	// A-LC is the case that made `requires` an all-of list with any-of groups
	// rather than a flat list: it needs advanced ground *and* the simple local
	// endorsement.
	it('requires every entry, not just one, for A-LC', () => {
		expect(canHold('A-LC', ['A-GC'])).toBe(false);
		expect(canHold('A-LC', ['S-LC'])).toBe(false);
		expect(canHold('A-LC', ['A-GC', 'S-LC'])).toBe(true);
	});

	// S-LC is the any-of case: either ground certification opens it.
	it('accepts any member of a group for S-LC', () => {
		expect(canHold('S-LC', [])).toBe(false);
		expect(canHold('S-LC', ['S-GC'])).toBe(true);
		expect(canHold('S-LC', ['A-GC'])).toBe(true);
	});

	it('gates T2-CTR behind E-RC', () => {
		expect(canHold('T2-CTR', ['T-RC'])).toBe(false);
		expect(canHold('T2-CTR', ['E-RC'])).toBe(true);
	});

	it('refuses an unknown code rather than waving it through', () => {
		expect(canHold('S-XX', ['S-GC', 'A-GC', 'A-LC'])).toBe(false);
	});
});

describe('highestCertification', () => {
	it('picks the highest-ranked certification held', () => {
		expect(highestCertification(['S-GC', 'A-GC'])?.code).toBe('A-GC');
		expect(highestCertification(['E-RC', 'S-GC'])?.code).toBe('E-RC');
	});

	it('ignores endorsements, which do not supersede a certification', () => {
		expect(highestCertification(['S-GC', 'S-LC'])?.code).toBe('S-GC');
		expect(highestCertification(['S-LC', 'T2-CTR'])).toBeUndefined();
	});

	it('returns nothing for a controller holding nothing', () => {
		expect(highestCertification([])).toBeUndefined();
	});
});

describe('arrival rating grants', () => {
	// Every rating_short seen on the live ZID roster on 2026-09-20. SUP is
	// deliberately absent: it is not a controller rating, so the earned rating is
	// inferred from logged hours instead.
	it('covers every controller rating on the roster', () => {
		for (const rating of ['OBS', 'S1', 'S2', 'S3', 'C1', 'C3', 'I1', 'I3']) {
			expect(RATING_GRANTS, rating).toHaveProperty(rating);
		}
		expect(RATING_GRANTS).not.toHaveProperty('SUP');
		expect(RATING_GRANTS).not.toHaveProperty('ADM');
	});

	it('matches the GCAP table in DEV-115', () => {
		expect(RATING_GRANTS.OBS).toBeNull();
		expect(RATING_GRANTS.S1).toBe('S-GC');
		expect(RATING_GRANTS.S2).toBe('A-LC');
		expect(RATING_GRANTS.S3).toBe('T-RC');
		expect(RATING_GRANTS.C1).toBe('E-RC');
		expect(RATING_GRANTS.C3).toBe('E-RC');
		expect(RATING_GRANTS.I1).toBe('E-RC');
		expect(RATING_GRANTS.I3).toBe('E-RC');
	});

	it('only ever grants a real certification', () => {
		for (const code of Object.values(RATING_GRANTS)) {
			if (code === null) continue;
			expect(isCertificationCode(code), code).toBe(true);
		}
	});

	// DEV-115 is explicit that Tier 2 is earned through a self-led Moodle course
	// and is never handed out on arrival. community-website auto-adds it with
	// E-RC, so this is a deliberate divergence worth pinning.
	it('never grants an endorsement on arrival, T2-CTR least of all', () => {
		expect(Object.values(RATING_GRANTS)).not.toContain('T2-CTR');
		expect(Object.values(RATING_GRANTS)).not.toContain('S-LC');
	});

	it('uses the six-month window the story specifies', () => {
		expect(ACTIVITY_WINDOW_MONTHS).toBe(6);
	});
});
