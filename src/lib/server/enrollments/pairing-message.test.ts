import { describe, expect, it } from 'vitest';
import { buildPairingMessage, greeting, type Pairing } from './pairing-message';

const STUDENT = '123456789012345678';
const TEACHER = '234567890123456789';
/** 2pm in Indianapolis. */
const AFTERNOON = new Date('2026-10-07T18:00:00Z');

const pairing: Pairing = {
	student: { name: 'Nick Bottoms', discordId: STUDENT },
	teacher: { name: 'Jim Reburn', discordId: TEACHER },
	course: 'S-GC',
	notificationPreference: 'discord',
	availability: 'Most days after 11pm Eastern.'
};

describe('greeting', () => {
	it('goes by the facility’s clock, not UTC', () => {
		expect(greeting(new Date('2026-10-07T13:00:00Z'))).toBe('Good morning');
		expect(greeting(AFTERNOON)).toBe('Good afternoon');
		// 9pm in Indianapolis is already tomorrow in UTC.
		expect(greeting(new Date('2026-10-08T01:00:00Z'))).toBe('Good evening');
	});
});

describe('buildPairingMessage', () => {
	it('greets and pings the student and the teacher, and nobody else', () => {
		const message = buildPairingMessage(pairing, AFTERNOON);

		expect(message.content).toMatch(
			new RegExp(`^Good afternoon <@${STUDENT}> and <@${TEACHER}>,\\n\\nYou’ve been paired`)
		);
		expect(message.allowedMentions).toEqual({ parse: [], users: [STUDENT, TEACHER] });
	});

	it('lists who, which course, how to reach the student and when they can train', () => {
		const { content } = buildPairingMessage(pairing, AFTERNOON);

		expect(content).toContain('continue training for S-GC!');
		expect(content).toContain(
			'[Indy Center Training Policy](<https://wiki.flyindycenter.com/en/policies/training>)'
		);
		expect(content).toContain(
			'[Facility Teacher Guide](<https://wiki.flyindycenter.com/en/training/facility-teacher-guide>)'
		);
		expect(content).toContain('**Student:** Nick Bottoms');
		expect(content).toContain('**Teacher:** Jim Reburn');
		expect(content).toContain('**Course:** Simple Ground Control (S-GC)');
		expect(content).toContain('**Preferred Student Contact:** Discord');
		expect(content).toContain('**Student Availability:** Most days after 11pm Eastern.');
	});

	// The teacher can look the address up; it is never posted.
	it('says Email for a student who prefers it, without an address', () => {
		const { content } = buildPairingMessage(
			{ ...pairing, notificationPreference: 'email' },
			AFTERNOON
		);

		expect(content).toContain('**Preferred Student Contact:** Email');
		expect(content).not.toContain('@gmail');
		expect(content).not.toMatch(/[\w.]+@[\w.]+\.\w+/);
	});

	it('names someone we hold no Discord ID for, and does not ping them', () => {
		const message = buildPairingMessage(
			{ ...pairing, student: { name: 'Nick Bottoms', discordId: null } },
			AFTERNOON
		);

		expect(message.content).toContain(`Good afternoon **Nick Bottoms** and <@${TEACHER}>,`);
		expect(message.allowedMentions).toEqual({ parse: [], users: [TEACHER] });
	});

	it('cannot be made to ping by what the student typed', () => {
		const message = buildPairingMessage(
			{ ...pairing, availability: '@everyone weekends <@999999999999999999>' },
			AFTERNOON
		);

		expect(message.allowedMentions?.users).toEqual([STUDENT, TEACHER]);
		expect(message.allowedMentions?.parse).toEqual([]);
	});

	it('stays within Discord’s limit however much the student wrote', () => {
		const message = buildPairingMessage({ ...pairing, availability: 'x'.repeat(5000) }, AFTERNOON);

		expect(message.content?.length).toBe(2000);
		expect(message.content?.endsWith('…')).toBe(true);
	});

	it('says so when nothing was given', () => {
		const { content } = buildPairingMessage(
			{ ...pairing, notificationPreference: null, availability: null },
			AFTERNOON
		);

		expect(content).toContain('**Preferred Student Contact:** Not given');
		expect(content).toContain('**Student Availability:** Not given');
	});
});
