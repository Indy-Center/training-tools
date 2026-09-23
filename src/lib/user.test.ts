import { describe, expect, it } from 'vitest';
import type { User } from '@indy-center/identity';
import { atcRating, displayName, operatingInitials } from './user';

function makeUser(overrides: Partial<User> = {}): User {
	return {
		id: 'usr_1',
		cid: '1234567',
		email: 'controller@example.com',
		isActive: true,
		vatsimData: {
			cid: '1234567',
			personal: { name_first: 'Jo', name_last: 'Rivera', name_full: 'Jo Rivera', email: 'x@y.z' },
			vatsim: { rating: { id: 3, short: 'S2', long: 'Student 2' } }
		},
		attributes: {},
		createdAt: 0,
		updatedAt: 0,
		...overrides
	};
}

describe('displayName', () => {
	it('prefers the preferred name', () => {
		const user = makeUser({ attributes: { preferredName: 'Joey' } });
		expect(displayName(user)).toBe('Joey');
	});

	it('falls back to the full VATSIM name', () => {
		expect(displayName(makeUser())).toBe('Jo Rivera');
	});

	it('falls back to first + last when no full name is supplied', () => {
		const user = makeUser({
			vatsimData: {
				cid: '1234567',
				personal: { name_first: 'Jo', name_last: 'Rivera', email: 'x@y.z' }
			}
		});
		expect(displayName(user)).toBe('Jo Rivera');
	});

	it('falls back to the CID when VATSIM supplied no name at all', () => {
		const user = makeUser({
			vatsimData: { cid: '1234567', personal: { email: 'x@y.z' } }
		});
		expect(displayName(user)).toBe('1234567');
	});

	it('ignores a preferred name that is only whitespace', () => {
		const user = makeUser({ attributes: { preferredName: '   ' } });
		expect(displayName(user)).toBe('Jo Rivera');
	});
});

describe('ratings', () => {
	it('reads the short ATC rating', () => {
		expect(atcRating(makeUser())).toBe('S2');
	});

	// `vatsim`, `rating` and `short` are each optional in identity's types, so the
	// whole chain has to survive a profile that has none of them.
	it('returns undefined when VATSIM supplied no ratings', () => {
		const user = makeUser({
			vatsimData: { cid: '1234567', personal: { email: 'x@y.z' } }
		});
		expect(atcRating(user)).toBeUndefined();
	});
});

describe('operatingInitials', () => {
	it('returns initials when assigned', () => {
		expect(operatingInitials(makeUser({ attributes: { operatingInitials: 'JR' } }))).toBe('JR');
	});

	it('returns undefined when unassigned or blank', () => {
		expect(operatingInitials(makeUser())).toBeUndefined();
		expect(operatingInitials(makeUser({ attributes: { operatingInitials: '' } }))).toBeUndefined();
	});
});
