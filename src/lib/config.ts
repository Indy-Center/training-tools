/** The ARTCC this app manages training for. */
export const FACILITY_ID = 'ZID';

/** VATSIM rating ids. Anything below S1 cannot control. */
export const RATING_OBS = 1;
export const RATING_S1 = 2;

/**
 * Consolidation: hours a home controller must log at their current rating
 * before they can enroll in the next course. Keyed by VATSIM short rating.
 *
 * Counted from VATSIM's per-rating stats, so hours are network-wide rather than
 * ZID-only — VATSIM does not break them down by facility.
 *
 * A rating that is absent (or 0) has no requirement. OBS has nothing to
 * consolidate, and there is no course after E-RC, so C1 and above are left out.
 *
 * **These numbers are the training team's to set.** The values here are
 * placeholders until the training policy states them.
 */
export const CONSOLIDATION_HOURS: Readonly<Record<string, number>> = {
	S1: 10,
	S2: 15,
	S3: 20
};

/**
 * Moodle course per credential, keyed by credential code (`S-GC` … `E-RC`,
 * `T2-CTR`).
 *
 * The home page links a student in training to their course's entry, and
 * `/enroll/tier-2` links to `T2-CTR`'s. A missing entry falls back to copy
 * pointing at their mentor or the training staff, so this can fill in one
 * course at a time as `indy-moodle` publishes them.
 */
export const MOODLE_COURSE_URLS: Readonly<Partial<Record<string, string>>> = {};
