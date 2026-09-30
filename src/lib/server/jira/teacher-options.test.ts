import { describe, expect, it } from 'vitest';
import { isDriftEmpty, planDropdownDrift } from './teacher-options';

describe('planDropdownDrift', () => {
	it('is empty when the dropdown matches', () => {
		const drift = planDropdownDrift({
			options: ['CT', 'JR', 'VATUSA'],
			wanted: ['CT', 'JR'],
			known: ['CT', 'JR']
		});
		expect(isDriftEmpty(drift)).toBe(true);
	});

	it('asks for a missing teacher to be added', () => {
		expect(
			planDropdownDrift({ options: ['CT'], wanted: ['CT', 'SC'], known: ['CT', 'SC'] }).add
		).toEqual(['SC']);
	});

	// A teacher with no initials yet is offered by CID.
	it('adds a CID when that is what stands for them', () => {
		expect(planDropdownDrift({ options: [], wanted: ['1530662'], known: ['1530662'] }).add).toEqual(
			['1530662']
		);
	});

	it('asks for one of our teachers who should not be offered to be removed', () => {
		expect(
			planDropdownDrift({ options: ['CT', 'SC'], wanted: ['CT'], known: ['CT', 'SC'] }).remove
		).toEqual(['SC']);
	});

	// `VATUSA` on RE Instructor, or anyone staff added by hand, is not ours.
	it('never touches options it does not recognise', () => {
		const drift = planDropdownDrift({
			options: ['CT', 'VATUSA', 'ZZ'],
			wanted: ['CT'],
			known: ['CT']
		});
		expect(drift.remove).toEqual([]);
	});

	// Found on the live board: RE Instructor offers "Sw" for SW.
	it('reports a case difference as a rename, not an add and a remove', () => {
		const drift = planDropdownDrift({
			options: ['HI', 'Sw', 'YG', 'VATUSA'],
			wanted: ['HI', 'SW', 'YG'],
			known: ['HI', 'SW', 'YG']
		});
		expect(drift).toEqual({ add: [], remove: [], rename: [{ from: 'Sw', to: 'SW' }] });
	});

	it("removes a teacher's old initials after they change", () => {
		const drift = planDropdownDrift({
			options: ['JR'],
			wanted: ['JB'],
			known: ['JB', 'JR']
		});
		expect(drift).toEqual({ add: ['JB'], remove: ['JR'], rename: [] });
	});
});
