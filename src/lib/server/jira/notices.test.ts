import { describe, expect, it } from 'vitest';
import { boardProblemsNotice } from './notices';

describe('boardProblemsNotice', () => {
	it('says nothing for a clean board', () => {
		expect(boardProblemsNotice([])).toBeNull();
	});

	// A status renamed on the board hits every card sitting in it at once.
	it('groups cards by the status the app does not know, and asks if it was renamed', () => {
		const notice = boardProblemsNotice(
			[
				{ issueKey: 'TRK-7', reason: 'unknown-status', detail: 'Audit' },
				{ issueKey: 'TRK-9', reason: 'unknown-status', detail: 'Audit' }
			],
			'https://jira.test/'
		);
		expect(notice?.audience).toBe('tech-team');
		expect(notice?.tone).toBe('warning');
		expect(notice?.summary).toMatch(/renamed/);
		expect(notice?.fields).toEqual([
			{
				label: 'Status the app does not know: Audit',
				value: '[TRK-7](https://jira.test/browse/TRK-7), [TRK-9](https://jira.test/browse/TRK-9)'
			}
		]);
	});

	it('lists each other kind of card it cannot import', () => {
		const notice = boardProblemsNotice([
			{ issueKey: 'TRK-1', reason: 'no-cid', detail: null },
			{ issueKey: 'TRK-2', reason: 'unknown-course', detail: 'Oceanic' },
			{ issueKey: 'TRK-3', reason: 'no-date', detail: null }
		]);
		expect(notice?.summary).not.toMatch(/renamed/);
		expect(notice?.fields).toEqual([
			{ label: 'No usable CID', value: 'TRK-1' },
			{ label: 'Course the app does not know: Oceanic', value: 'TRK-2' },
			{ label: 'No Waitlisted or created date', value: 'TRK-3' }
		]);
	});
});
