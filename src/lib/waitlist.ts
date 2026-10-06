import type { TeacherGate } from './vatusa-academy';

/**
 * The staff waitlist's rows, as `/waitlist` draws them. Here rather than under
 * `$lib/server/` because a component uses the types; the rows themselves are
 * built in `$lib/server/enrollments/waitlist.ts`.
 */

/** A teacher someone on the waitlist could be given. */
export type TeacherChoice = {
	cid: string;
	label: string;
	/** Open slots, or null when they have not said how many they take. */
	available: number | null;
};

export type WaitlistRow = {
	id: string;
	cid: string;
	name: string;
	ratingShort: string | null;
	course: string;
	courseName: string;
	/** 1 is next, within their course. */
	position: number;
	waitlistedAt: Date;
	availability: string | null;
	notificationPreference: string | null;
	/** The written exam this course needs, or null when it needs none. */
	exam: string | null;
	vatusaAssignedOn: string | null;
	vatusaCompletedOn: string | null;
	gate: TeacherGate;
	issueKey: string | null;
	issueUrl: string | null;
	/** Active teachers who may teach this course. */
	teachers: TeacherChoice[];
};
