import { describe, expect, it } from 'vitest';
import { reviewNeededNotice } from './notices';

const grant = {
	name: 'Jo Rivera',
	cid: '1234567',
	code: 'E-RC',
	note: 'SUP: C1 inferred from hours'
};

describe('reviewNeededNotice', () => {
	it('says nothing when no grant needs review', () => {
		expect(reviewNeededNotice([])).toBeNull();
	});

	it('names one arrival and links straight to them', () => {
		const notice = reviewNeededNotice([grant]);
		expect(notice?.audience).toBe('training-admins');
		expect(notice?.title).toBe('Certification to review: Jo Rivera');
		expect(notice?.link).toMatch(/\/certifications\/1234567$/);
		expect(notice?.fields).toEqual([
			{ label: 'Jo Rivera (1234567)', value: 'E-RC. SUP: C1 inferred from hours' }
		]);
	});

	it('lists several in one notice', () => {
		const notice = reviewNeededNotice([grant, { ...grant, name: 'Sam Lee', cid: '7654321' }]);
		expect(notice?.title).toBe('2 certifications to review');
		expect(notice?.link).toMatch(/\/certifications$/);
		expect(notice?.fields).toHaveLength(2);
	});
});
