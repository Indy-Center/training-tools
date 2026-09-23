import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readDelivery, verifyJiraSignature } from './webhook';
import { TEACHER_FIELD } from './status';

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

describe('readDelivery', () => {
	// Shaped like TRK-52's Assign Teacher delivery on 2026-09-23.
	const transition = {
		timestamp: 1790173973400,
		webhookEvent: 'jira:issue_updated',
		issue: {
			key: 'TRK-52',
			fields: {
				status: { name: 'In Training' },
				[TEACHER_FIELD]: { value: 'HI' },
				updated: '2026-09-23T10:32:53.283-0400'
			}
		}
	};

	it('reads the issue as delivered, ordered by its own updated time', () => {
		const delivery = readDelivery(transition, 'TRK');
		expect(delivery?.key).toBe('TRK-52');
		expect(delivery?.issue?.fields?.status?.name).toBe('In Training');
		expect(delivery?.observedAt?.toISOString()).toBe('2026-09-23T14:32:53.283Z');
	});

	it('falls back to the event timestamp when the issue has no updated time', () => {
		const { updated: _, ...fields } = transition.issue.fields;
		const delivery = readDelivery({ ...transition, issue: { key: 'TRK-52', fields } }, 'TRK');
		expect(delivery?.observedAt?.getTime()).toBe(1790173973400);
	});

	it('asks the caller to read from Jira when the body carries no status', () => {
		const delivery = readDelivery({ issue: { key: 'TRK-52' } }, 'TRK');
		expect(delivery).toEqual({ key: 'TRK-52', issue: null, observedAt: null });
	});

	it('ignores issues in other projects', () => {
		expect(readDelivery({ issue: { key: 'DEV-42' } }, 'TRK')).toBeNull();
		expect(readDelivery({ issue: { key: 'XTRK-42' } }, 'TRK')).toBeNull();
	});

	it('ignores deliveries that are not about an issue', () => {
		expect(readDelivery({ webhookEvent: 'project_updated' }, 'TRK')).toBeNull();
		expect(readDelivery(null, 'TRK')).toBeNull();
		expect(readDelivery({ issue: { key: 42 } }, 'TRK')).toBeNull();
	});
});
