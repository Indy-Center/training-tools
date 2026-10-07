import { FACILITY_TIME_ZONE } from '$lib/config';
import { findCourse } from '$lib/courses';
import type { Message } from '@indy-center/indy-larry-worker';

/**
 * What a student and their teacher are told when they are paired, posted in the
 * teacher's channel. Pure, so the wording and who it can ping are tested.
 *
 * The wording is the training team's own, from the message they used to write
 * by hand.
 */

const TRAINING_POLICY_URL = 'https://wiki.flyindycenter.com/en/policies/training';

/** Discord's limit on a message's text. */
const CONTENT_LIMIT = 2000;

/** Discord user IDs are 17–20 digits. Anything else is written as a name. */
const DISCORD_ID = /^\d{17,20}$/;

/** How a contact preference reads here. Never an address: the teacher can look that up. */
const CONTACT_LABELS: Record<string, string> = { discord: 'Discord', email: 'Email' };

export type Pairing = {
	student: { name: string; discordId: string | null };
	teacher: { name: string; discordId: string | null };
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

/** A ping when we hold their Discord ID, otherwise their name in bold. */
function address(person: Pairing['student']): string {
	return person.discordId && DISCORD_ID.test(person.discordId)
		? `<@${person.discordId}>`
		: `**${person.name}**`;
}

export function buildPairingMessage(pairing: Pairing, now: Date): Message {
	const course = findCourse(pairing.course);
	const mentions = [pairing.student.discordId, pairing.teacher.discordId].filter(
		(id): id is string => !!id && DISCORD_ID.test(id)
	);

	const opening = [
		`${greeting(now)} ${address(pairing.student)} and ${address(pairing.teacher)},`,
		'',
		`You’ve been paired together to continue training for ${course?.code ?? pairing.course}! Please coordinate training availability, questions and discussions. Training is normally accomplished on the Indy Center TeamSpeak server. Training expectations can be found in the [Indy Center Training Policy](<${TRAINING_POLICY_URL}>) and specific lesson information can be found in the Facility Teacher Guide. Please don’t hesitate to reach out to the training staff or your assigned teacher if you have any questions!`,
		'',
		`**Student:** ${pairing.student.name}`,
		`**Teacher:** ${pairing.teacher.name}`,
		`**Course:** ${course ? `${course.name} (${course.code})` : pairing.course}`,
		`**Preferred Student Contact:** ${CONTACT_LABELS[pairing.notificationPreference ?? ''] ?? 'Not given'}`
	].join('\n');

	// Availability is whatever the student typed, and the only part without a
	// bound of its own, so it is what gives way to Discord's limit.
	const label = '\n**Student Availability:** ';
	const room = CONTENT_LIMIT - opening.length - label.length;
	const availability = pairing.availability?.trim() || 'Not given';
	const clipped =
		availability.length <= room ? availability : `${availability.slice(0, Math.max(0, room - 1))}…`;

	return {
		content: `${opening}${label}${clipped}`,
		// Only the two of them, and never anyone else: availability is typed text,
		// so "@everyone" or a pasted mention in it must stay words.
		allowedMentions: { parse: [], users: [...new Set(mentions)] }
	};
}
