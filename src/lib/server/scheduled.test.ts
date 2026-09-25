import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '$lib/server/db';
import { runScheduledJobs, scheduledJobs, type ScheduledJob } from './scheduled';

afterEach(() => vi.restoreAllMocks());

describe('scheduledJobs', () => {
	// Three of these depend on running after another; see the comments on each.
	it('runs in dependency order', () => {
		const names = scheduledJobs({} as Database, {} as Env).map((job) => job.name);
		expect(names).toEqual([
			'roster sync',
			'arrival certifications',
			'jira board import',
			'enrollment reconcile',
			'enrollment status sweep'
		]);
	});
});

describe('runScheduledJobs', () => {
	it('keeps going after a job fails, then rethrows the first failure', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const ran: string[] = [];
		const first = new Error('VATUSA down');
		const jobs: ScheduledJob[] = [
			{
				name: 'a',
				run: async () => {
					ran.push('a');
					throw first;
				}
			},
			{
				name: 'b',
				run: async () => {
					ran.push('b');
					return null;
				}
			},
			{
				name: 'c',
				run: async () => {
					ran.push('c');
					throw new Error('Jira down');
				}
			}
		];

		await expect(runScheduledJobs(jobs)).rejects.toBe(first);
		expect(ran).toEqual(['a', 'b', 'c']);
	});

	it('logs a summary, and stays quiet for null', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});

		await runScheduledJobs([
			{ name: 'noisy', run: async () => ({ imported: 2 }) },
			{ name: 'quiet', run: async () => null }
		]);

		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith('[training-tools] noisy', '{"imported":2}');
	});
});
