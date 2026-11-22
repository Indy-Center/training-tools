import { describe, expect, it } from 'vitest';
import { buildPairingMessage, greeting, type Pairing } from './pairing-message';

/** 2pm in Indianapolis. */
const AFTERNOON = new Date('2026-10-07T18:00:00Z');

const pairing: Pairing = {
	student: { name: 'Nick Bottoms' },
	teacher: { name: 'Jim Reburn' },
	teacherMessage: null,
	course: 'S-GC',
	notificationPreference: 'discord',
	availability: 'Most days after 11pm Eastern.'
};

const field = (name: string, value: Pairing) =>
	buildPairingMessage(value, AFTERNOON).fields?.find((entry) => entry.name === name)?.value;

describe('greeting', () => {
	it('goes by the facility’s clock, not UTC', () => {
		expect(greeting(new Date('2026-10-07T13:00:00Z'))).toBe('Good morning');
		expect(greeting(AFTERNOON)).toBe('Good afternoon');
		// 9pm in Indianapolis is already tomorrow in UTC.
		expect(greeting(new Date('2026-10-08T01:00:00Z'))).toBe('Good evening');
	});
});

describe('buildPairingMessage', () => {
	it('greets the student and the teacher by name', () => {
		const notice = buildPairingMessage(pairing, AFTERNOON);

		expect(notice.title).toBe('Good afternoon Nick Bottoms and Jim Reburn');
		expect(notice.body).toMatch(/^You’ve been paired together to continue training for S-GC!/);
	});

	it('lists who, which course, how to reach the student and when they can train', () => {
		const notice = buildPairingMessage(pairing, AFTERNOON);

		expect(notice.body).toContain('https://wiki.flyindycenter.com/en/policies/training');
		expect(notice.body).toContain(
			'https://wiki.flyindycenter.com/en/training/facility-teacher-guide'
		);
		expect(notice.fields).toEqual([
			{ name: 'Student', value: 'Nick Bottoms' },
			{ name: 'Teacher', value: 'Jim Reburn' },
			{ name: 'Course', value: 'Simple Ground Control (S-GC)' },
			{ name: 'Preferred Student Contact', value: 'Discord' },
			{ name: 'Student Availability', value: 'Most days after 11pm Eastern.' }
		]);
	});

	it('has no chat markup or mentions of its own', () => {
		const { title, body } = buildPairingMessage(pairing, AFTERNOON);

		expect(`${title}\n${body}`).not.toMatch(/<@|\*\*|\]\(/);
	});

	// The teacher can look the address up; it is never posted.
	it('says Email for a student who prefers it, without an address', () => {
		const notice = buildPairingMessage({ ...pairing, notificationPreference: 'email' }, AFTERNOON);

		expect(
			field('Preferred Student Contact', { ...pairing, notificationPreference: 'email' })
		).toBe('Email');
		expect(JSON.stringify(notice)).not.toMatch(/[\w.]+@[\w.]+\.\w+/);
	});

	it('fits Discord’s field limit once larry has escaped it, however much the student wrote', () => {
		// Each `*` is escaped to two characters.
		const value = field('Student Availability', { ...pairing, availability: '*'.repeat(5000) })!;

		expect(value.endsWith('…')).toBe(true);
		expect(value.replace(/\*/g, '\\*').length).toBeLessThanOrEqual(1024);
		expect(value.length).toBe(512);
	});

	// larry measures in UTF-16 units, as JavaScript does: each emoji is two.
	it('fits the limit with characters outside the basic plane', () => {
		const value = field('Student Availability', { ...pairing, availability: '😀'.repeat(1000) })!;

		expect(value.endsWith('…')).toBe(true);
		expect(value.length).toBeLessThanOrEqual(1024);
		expect(value.length).toBe(1023);
	});

	it('passes on what the teacher wrote for their students', () => {
		const withMessage = { ...pairing, teacherMessage: ' Book with me at https://example.com/jim ' };

		expect(field('From Jim Reburn', withMessage)).toBe('Book with me at https://example.com/jim');
		expect(field('From Jim Reburn', pairing)).toBeUndefined();
	});

	it('says so when nothing was given', () => {
		const nothing = { ...pairing, notificationPreference: null, availability: null };

		expect(field('Preferred Student Contact', nothing)).toBe('Not given');
		expect(field('Student Availability', nothing)).toBe('Not given');
	});
});
