import { describe, expect, it } from 'vitest';
import { teacherRoomName, type NamedTeacher } from './teacher-groups';

// Made-up people; nothing here is a real controller.
const teacher = (overrides: Partial<NamedTeacher> = {}): NamedTeacher => ({
	cid: '100',
	preferredName: null,
	rosterName: { first: 'Joanna', last: 'Rivera' },
	namePrivacy: false,
	...overrides
});

describe('teacherRoomName', () => {
	it('names the room for the roster name, falling back to first name and CID', () => {
		expect(teacherRoomName(teacher())).toEqual({
			name: 'Joanna Rivera',
			fallbackName: 'Joanna 100'
		});
	});

	it('uses a preferred name over the roster name', () => {
		expect(teacherRoomName(teacher({ preferredName: ' Jo Rivera ' }))).toEqual({
			name: 'Jo Rivera',
			fallbackName: 'Jo 100'
		});
	});

	it('uses a preferred name that is just their full name, without name privacy', () => {
		expect(teacherRoomName(teacher({ preferredName: 'joanna rivera' }))?.name).toBe(
			'joanna rivera'
		);
	});

	it('has no name for someone with neither a preferred nor a roster name', () => {
		expect(teacherRoomName(teacher({ rosterName: null }))).toBeNull();
		expect(teacherRoomName(teacher({ rosterName: { first: ' ', last: '' } }))).toBeNull();
	});

	describe('with name privacy set', () => {
		// A name that already holds the CID can't clash, so it is its own fallback.
		it('names the room by first name and CID', () => {
			expect(teacherRoomName(teacher({ namePrivacy: true }))).toEqual({
				name: 'Joanna 100',
				fallbackName: 'Joanna 100'
			});
		});

		it('still uses a preferred name they chose', () => {
			expect(teacherRoomName(teacher({ namePrivacy: true, preferredName: ' Jane ' }))).toEqual({
				name: 'Jane',
				fallbackName: 'Jane 100'
			});
		});

		// Other apps pre-fill a preferred name with the full name: not a choice to show it.
		it('ignores a preferred name that is just their full name', () => {
			for (const preferredName of ['joanna  RIVERA', 'Joánna Rivera']) {
				expect(teacherRoomName(teacher({ namePrivacy: true, preferredName }))?.name).toBe(
					'Joanna 100'
				);
			}
		});

		// Both reduce to nothing, which is not the same as being the same name.
		it('keeps a preferred name with no Latin letters', () => {
			const named = teacherRoomName(
				teacher({
					namePrivacy: true,
					preferredName: '李娜',
					rosterName: { first: '王', last: '芳' }
				})
			);
			expect(named).toEqual({ name: '李娜', fallbackName: '李娜 100' });
		});

		it('has no name without a first name on the roster', () => {
			expect(teacherRoomName(teacher({ namePrivacy: true, rosterName: null }))).toBeNull();
		});
	});
});
