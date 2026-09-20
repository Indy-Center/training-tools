import { describe, expect, it } from 'vitest';
import { AVAILABILITY_MAX_LENGTH, validateEnrollment } from './enrollment';

const valid = {
	course: 'S-GC',
	notificationPreference: 'discord',
	availability: 'Weeknights after 7pm eastern'
};

describe('validateEnrollment', () => {
	it('accepts a complete submission', () => {
		const result = validateEnrollment(valid);

		expect(result.ok).toBe(true);
		expect(result.ok && result.values).toEqual({
			course: 'S-GC',
			notificationPreference: 'discord',
			availability: 'Weeknights after 7pm eastern'
		});
	});

	it('rejects a course code that is not in the catalogue', () => {
		const result = validateEnrollment({ ...valid, course: 'S-XX' });

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.errors.course).toBeDefined();
	});

	// The form posts strings; anything else means a hand-rolled request.
	it('rejects a missing course rather than defaulting to one', () => {
		const result = validateEnrollment({ ...valid, course: undefined });

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.errors.course).toBeDefined();
	});

	it('rejects a notification preference outside discord/email', () => {
		const result = validateEnrollment({ ...valid, notificationPreference: 'carrier-pigeon' });

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.errors.notificationPreference).toBeDefined();
	});

	it('trims availability before storing it', () => {
		const result = validateEnrollment({ ...valid, availability: '  weekends  ' });

		expect(result.ok && result.values.availability).toBe('weekends');
	});

	it('rejects availability that is only whitespace', () => {
		const result = validateEnrollment({ ...valid, availability: '   ' });

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.errors.availability).toBeDefined();
	});

	it('rejects availability past the length cap', () => {
		const result = validateEnrollment({
			...valid,
			availability: 'a'.repeat(AVAILABILITY_MAX_LENGTH + 1)
		});

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.errors.availability).toBeDefined();
	});

	it('reports every problem at once, so the form can show them together', () => {
		const result = validateEnrollment({});

		expect(result.ok).toBe(false);
		expect(result.ok === false && Object.keys(result.errors).sort()).toEqual([
			'availability',
			'course',
			'notificationPreference'
		]);
	});
});
