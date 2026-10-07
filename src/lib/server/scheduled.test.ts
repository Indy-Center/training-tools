import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '$lib/server/db';
import type { JobRun } from '$lib/server/job-health';
import { runScheduledJobs, scheduledJobs, type ScheduledJob } from './scheduled';

afterEach(() => vi.restoreAllMocks());

function job(name: string, run: ScheduledJob['run']): ScheduledJob {
	return { name, description: `${name} does something`, run };
}

describe('scheduledJobs', () => {
	// Nine of these depend on running after another; see the comments on each.
	it('runs in dependency order', () => {
		const names = scheduledJobs({} as Database, {} as Env).map((job) => job.name);
		expect(names).toEqual([
			'roster sync',
			'arrival certifications',
			'teacher roster sync',
			'jira teacher dropdowns',
			'jira board import',
			'enrollment reconcile',
			'enrollment status sweep',
			'examiner cleanup',
			'certification updates',
			'vatusa course completions',
			'vatusa course reminders',
			'discord teacher rooms',
			'announcements'
		]);
	});

	// `/admin` lists every job by its description.
	it('describes every job', () => {
		for (const { description } of scheduledJobs({} as Database, {} as Env)) {
			expect(description.trim()).not.toBe('');
		}
	});
});

describe('runScheduledJobs', () => {
	it('keeps going after a job fails, then rethrows the first failure', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const ran: string[] = [];
		const first = new Error('VATUSA down');
		const jobs: ScheduledJob[] = [
			job('a', async () => {
				ran.push('a');
				throw first;
			}),
			job('b', async () => {
				ran.push('b');
				return null;
			}),
			job('c', async () => {
				ran.push('c');
				throw new Error('Jira down');
			})
		];

		await expect(runScheduledJobs(jobs)).rejects.toBe(first);
		expect(ran).toEqual(['a', 'b', 'c']);
	});

	it('logs a summary, and stays quiet for null', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});

		await runScheduledJobs([
			job('noisy', async () => ({ imported: 2 })),
			job('quiet', async () => null)
		]);

		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith('[training-tools] noisy', '{"imported":2}');
	});

	it('records how every job went, failures included', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const down = new Error('Jira down');
		const recorded: JobRun[] = [];

		await expect(
			runScheduledJobs(
				[
					job('noisy', async () => ({ imported: 2 })),
					job('quiet', async () => null),
					job('broken', async () => {
						throw down;
					})
				],
				async (run) => {
					recorded.push(run);
				}
			)
		).rejects.toBe(down);

		expect(recorded).toMatchObject([
			{ name: 'noisy', ok: true, summary: { imported: 2 } },
			{ name: 'quiet', ok: true, summary: null },
			{ name: 'broken', ok: false, error: down }
		]);
	});

	// Recording is bookkeeping: it must not turn a good run into a failed one,
	// or stop the jobs after it.
	it('carries on when recording fails', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const ran: string[] = [];

		await expect(
			runScheduledJobs(
				[
					job('a', async () => {
						ran.push('a');
						return null;
					}),
					job('b', async () => {
						ran.push('b');
						return null;
					})
				],
				async () => {
					throw new Error('D1 down');
				}
			)
		).resolves.toBeUndefined();

		expect(ran).toEqual(['a', 'b']);
		expect(error).toHaveBeenCalledTimes(2);
	});
});
