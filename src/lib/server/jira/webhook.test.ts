import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { issueKeyFromDelivery, verifyJiraSignature } from './webhook';

const SECRET = 'test-secret';
const BODY = '{"webhookEvent":"jira:issue_updated","issue":{"key":"TRK-42"}}';

/** Signs the way Jira does, via Node's own HMAC — an independent implementation. */
function sign(body: string, secret = SECRET): string {
	return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('verifyJiraSignature', () => {
	it('accepts a correct signature', async () => {
		expect(await verifyJiraSignature(SECRET, BODY, sign(BODY))).toBe(true);
	});

	it('accepts an upper-case method and hex', async () => {
		expect(await verifyJiraSignature(SECRET, BODY, sign(BODY).toUpperCase())).toBe(true);
	});

	it('rejects a body that was changed after signing', async () => {
		expect(await verifyJiraSignature(SECRET, BODY.replace('42', '43'), sign(BODY))).toBe(false);
	});

	it('rejects a signature made with another secret', async () => {
		expect(await verifyJiraSignature(SECRET, BODY, sign(BODY, 'other'))).toBe(false);
	});

	it('rejects a missing or malformed header', async () => {
		expect(await verifyJiraSignature(SECRET, BODY, null)).toBe(false);
		expect(await verifyJiraSignature(SECRET, BODY, '')).toBe(false);
		expect(await verifyJiraSignature(SECRET, BODY, 'sha256=')).toBe(false);
		expect(await verifyJiraSignature(SECRET, BODY, 'nonsense')).toBe(false);
	});

	// A forger must not get to pick a weaker algorithm.
	it('rejects any method other than sha256', async () => {
		const sha1 = `sha1=${createHmac('sha1', SECRET).update(BODY).digest('hex')}`;
		expect(await verifyJiraSignature(SECRET, BODY, sha1)).toBe(false);
	});

	it('refuses to verify against an empty secret', async () => {
		expect(await verifyJiraSignature('', BODY, sign(BODY, ''))).toBe(false);
	});
});

describe('issueKeyFromDelivery', () => {
	it('reads the issue key', () => {
		expect(issueKeyFromDelivery(JSON.parse(BODY), 'TRK')).toBe('TRK-42');
	});

	it('ignores issues in other projects', () => {
		expect(issueKeyFromDelivery({ issue: { key: 'DEV-42' } }, 'TRK')).toBeNull();
		expect(issueKeyFromDelivery({ issue: { key: 'XTRK-42' } }, 'TRK')).toBeNull();
	});

	it('ignores deliveries that are not about an issue', () => {
		expect(issueKeyFromDelivery({ webhookEvent: 'project_updated' }, 'TRK')).toBeNull();
		expect(issueKeyFromDelivery(null, 'TRK')).toBeNull();
		expect(issueKeyFromDelivery({ issue: { key: 42 } }, 'TRK')).toBeNull();
	});
});
