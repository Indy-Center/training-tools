import { describe, expect, it } from 'vitest';
import { loginUrl, logoutUrl } from './identity-links';

const IDENTITY = 'https://auth.flyindycenter.com';

describe('identity links', () => {
	it('encodes the return URL so query strings survive the round trip', () => {
		const url = loginUrl(IDENTITY, 'https://training.flyindycenter.com/enroll?course=gnd');
		expect(url).toBe(
			'https://auth.flyindycenter.com/login?return_url=https%3A%2F%2Ftraining.flyindycenter.com%2Fenroll%3Fcourse%3Dgnd'
		);
	});

	it('builds a logout URL against the same identity base', () => {
		expect(logoutUrl(IDENTITY, 'https://training.flyindycenter.com/')).toBe(
			'https://auth.flyindycenter.com/logout?return_url=https%3A%2F%2Ftraining.flyindycenter.com%2F'
		);
	});

	it('round-trips the return URL exactly', () => {
		const returnUrl = 'https://training.flyindycenter.com/dashboard';
		const parsed = new URL(loginUrl(IDENTITY, returnUrl));
		expect(parsed.searchParams.get('return_url')).toBe(returnUrl);
	});
});
