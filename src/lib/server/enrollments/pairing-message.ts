import { FACILITY_TIME_ZONE } from '$lib/config';
import { findCourse } from '$lib/courses';
import type { GroupNotice } from '$lib/server/discord/larry';

/**
 * What a student and their teacher are told when they are paired, posted in the
 * teacher's room. Pure, so the wording is tested.
 *
 * A plain notice: no chat markup and no mentions. larry escapes it and mentions
 * the two of them itself, so nothing the student typed can ping anyone.
 *
 * The wording is the training team's own, from the message they used to write
 * by hand.
 */

const TRAINING_POLICY_URL = 'https://wiki.flyindycenter.com/en/policies/training';
const TEACHER_GUIDE_URL = 'https://wiki.flyindycenter.com/en/training/facility-teacher-guide';

/**
 * A field's limit in Discord, which larry checks once it has escaped the text:
 * each formatting character it escapes counts twice. A notice over it is
 * refused, and would be retried every pass.
 */
const FIELD_LIMIT = 1024;
const ESCAPED = /[\\`*_~|>#[\]()<@-]/;

/**
 * `text`, cut with an ellipsis so that escaped it fits in `limit`. Measured in
 * UTF-16 units, as larry measures it, never cutting a character in half.
 */
function clip(text: string, limit: number): string {
	const cost = (char: string) => (ESCAPED.test(char) ? 2 : char.length);
	const chars = [...text];
	if (chars.reduce((sum, char) => sum + cost(char), 0) <= limit) return text;

	let used = 1; // the ellipsis
	let end = 0;
	while (end < chars.length && used + cost(chars[end]) <= limit) used += cost(chars[end++]);
	return `${chars.slice(0, end).join('')}…`;
}

/** How a contact preference reads here. Never an address: the teacher can look that up. */
const CONTACT_LABELS: Record<string, string> = { discord: 'Discord', email: 'Email' };

export type Pairing = {
	student: { name: string };
	teacher: { name: string };
	/** The teacher's own words for their students, from their profile. */
	teacherMessage: string | null;
	course: string;
	notificationPreference: string | null;
	availability: string | null;
};

/** "Good morning", "Good afternoon" or "Good evening", by the facility's clock. */
export function greeting(now: Date, timeZone: string = FACILITY_TIME_ZONE): string {
	const hour = Number(
		new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now)
	);
	return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function buildPairingMessage(pairing: Pairing, now: Date): GroupNotice {
	const course = findCourse(pairing.course);
	const teacherMessage = pairing.teacherMessage?.trim();

	// Availability is whatever the student typed, and the only part without a
	// bound of its own, so it is what gives way.
	const clipped = clip(pairing.availability?.trim() || 'Not given', FIELD_LIMIT);

	return {
		title: `${greeting(now)} ${pairing.student.name} and ${pairing.teacher.name}`,
		body: [
			`You’ve been paired together to continue training for ${course?.code ?? pairing.course}! Please coordinate training availability, questions and discussions. Training is normally accomplished on the Indy Center TeamSpeak server.`,
			'',
			`Training expectations can be found in the Indy Center Training Policy (${TRAINING_POLICY_URL}) and specific lesson information can be found in the Facility Teacher Guide (${TEACHER_GUIDE_URL}). Please don’t hesitate to reach out to the training staff or your assigned teacher if you have any questions!`
		].join('\n'),
		fields: [
			{ name: 'Student', value: pairing.student.name },
			{ name: 'Teacher', value: pairing.teacher.name },
			{ name: 'Course', value: course ? `${course.name} (${course.code})` : pairing.course },
			{
				name: 'Preferred Student Contact',
				value: CONTACT_LABELS[pairing.notificationPreference ?? ''] ?? 'Not given'
			},
			// Bounded where it is saved (`STUDENT_MESSAGE_MAX_LENGTH`).
			...(teacherMessage ? [{ name: `From ${pairing.teacher.name}`, value: teacherMessage }] : []),
			{ name: 'Student Availability', value: clipped }
		]
	};
}
