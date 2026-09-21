/**
 * The copy shown on `/enroll` before a student submits.
 *
 * These are **general** blocks — the same text whatever course someone is
 * enrolling in. Anything course-specific belongs in `$lib/courses.ts`, which is
 * the single record the future course generator writes to; adding per-course
 * markdown here would give that generator a second place to keep in step.
 *
 * Rendered to HTML at build time (see vite.config.ts), so `marked` never
 * reaches the Worker bundle and no sanitiser is needed.
 *
 * **The wording is the training team's, not engineering's.** What is in these
 * files today is placeholder drafted to show the shape.
 */
import agreement from './agreement.md';
import whatHappensNext from './what-happens-next.md';
import writtenExam from './written-exam.md';

/**
 * Identifies the terms a student accepted, stored on their enrollment row.
 *
 * **Bump this whenever `agreement.md` changes what someone is agreeing to.**
 * Without that, the record claims an acceptance of wording the student never
 * saw — which defeats the point of storing it at all.
 *
 * A date rather than a number so that "which terms did they accept" is
 * answerable from the value itself, without a lookup table.
 */
export const TERMS_VERSION = '2026-09-21';

export const ENROLLMENT_COPY = {
	whatHappensNext,
	writtenExam,
	agreement
} as const;
