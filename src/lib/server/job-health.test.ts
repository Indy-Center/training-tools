import { describe, expect, it } from 'vitest';
import { jobAlert, type JobRun } from './job-health';

const at = new Date('2026-10-02T12:00:00Z');
const failed: JobRun = { name: 'roster sync', at, ok: false, error: new Error('VATUSA down') };
const worked: JobRun = { name: 'roster sync', at, ok: true, summary: null };

describe('jobAlert', () => {
	it('warns when a job starts failing', () => {
		const notice = jobAlert(failed, 0);
		expect(notice).toMatchObject({ audience: 'training-admins', tone: 'warning' });
		expect(notice?.title).toContain('roster sync');
		expect(notice?.fields).toEqual([{ label: 'Error', value: 'VATUSA down' }]);
	});

	// A broken job runs every fifteen minutes; one message, not one per run.
	it('stays quiet while it keeps failing', () => {
		expect(jobAlert(failed, 1)).toBeNull();
		expect(jobAlert(failed, 12)).toBeNull();
	});

	it('says when it recovers, and after how many failures', () => {
		const notice = jobAlert(worked, 3);
		expect(notice?.title).toContain('recovered');
		expect(notice?.summary).toContain('3 failed runs');
		expect(jobAlert(worked, 1)?.summary).toContain('1 failed run.');
	});

	it('stays quiet for an ordinary good run', () => {
		expect(jobAlert(worked, 0)).toBeNull();
	});
});
