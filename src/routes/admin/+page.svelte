<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import DiscordRoomsPanel from '$lib/components/admin/DiscordRoomsPanel.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import { findCourse } from '$lib/courses';
	import { formatAgo, formatDate, formatDateTime } from '$lib/format';
	import {
		CRON_INTERVAL_MINUTES,
		JOB_HEALTH_LABELS,
		needsAttention,
		type JobHealthState
	} from '$lib/job-health';
	import IconClipboardAlert from '~icons/mdi/clipboard-alert-outline';
	import IconClipboardCheck from '~icons/mdi/clipboard-check-outline';
	import IconCheck from '~icons/mdi/check-circle';
	import IconCog from '~icons/mdi/cog';
	import IconHeartPulse from '~icons/mdi/heart-pulse';
	import IconWebhook from '~icons/mdi/webhook';

	let { data, form } = $props();

	/** The request being retried, so only its button shows as busy. */
	let retryingId = $state<string | null>(null);

	const STATE_COLORS: Record<JobHealthState, 'green' | 'red' | 'orange' | 'gray'> = {
		ok: 'green',
		failing: 'red',
		stale: 'orange',
		never: 'gray'
	};

	type Report = (typeof data.jobs)[number];

	const ago = (value: Date) => formatAgo(value, data.now);

	/** A job's counts as "fetched 157 · added 2", or the stored text if it is not JSON. */
	function summarise(json: string): string {
		try {
			return Object.entries(JSON.parse(json) as Record<string, unknown>)
				.map(
					([key, value]) => `${key} ${typeof value === 'object' ? JSON.stringify(value) : value}`
				)
				.join(' · ');
		} catch {
			return json;
		}
	}

	const unhealthy = $derived(
		[...data.jobs, data.webhook].filter((report) => needsAttention(report.state))
	);
	const unset = $derived(data.config.filter((item) => !item.set));
</script>

<svelte:head>
	<title>Indy Center | Admin</title>
</svelte:head>

<div class="mb-8">
	<h1 class="text-3xl font-bold text-white">Admin</h1>
	<p class="mt-2 text-gray-400">
		Whether everything behind the scenes is working: requests that never reached the TRK board, and
		the background jobs that keep this app, VATUSA and Jira in step.
	</p>
</div>

<!-- The TA's own work lives on its own page; this is the way in. -->
<div
	class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700/60 bg-slate-800/60 px-4 py-3"
>
	<div class="flex items-center gap-3 text-sm">
		<IconClipboardCheck class="h-5 w-5 text-gray-400" />
		<span class="text-gray-300">
			{#if data.awaitingAudit === 0}
				No finished courses are waiting for an audit.
			{:else}
				<span class="font-medium text-white">{data.awaitingAudit}</span>
				finished {data.awaitingAudit === 1 ? 'course is' : 'courses are'} waiting for an audit.
			{/if}
		</span>
	</div>
	<Button
		href="/admin/audit"
		size="sm"
		variant={data.awaitingAudit === 0 ? 'secondary' : 'primary'}
	>
		Training audit
	</Button>
</div>

{#if data.stuck.length > 0 || unhealthy.length > 0 || unset.length > 0}
	<Alert tone="warning" class="mb-6">
		<ul class="space-y-1">
			{#if data.stuck.length > 0}
				<li>
					{data.stuck.length}
					{data.stuck.length === 1 ? 'request has' : 'requests have'} not reached the TRK board and
					{data.stuck.length === 1 ? 'is' : 'are'} no longer being retried.
				</li>
			{/if}
			{#each unhealthy as report (report.name)}
				<li>
					<span class="font-medium">{report.name}</span>:
					{JOB_HEALTH_LABELS[report.state].toLowerCase()}.
				</li>
			{/each}
			{#each unset as item (item.label)}
				<li><span class="font-medium">{item.label}</span> is not set.</li>
			{/each}
		</ul>
	</Alert>
{:else}
	<p class="mb-6 flex items-center gap-2 text-sm text-gray-400">
		<IconCheck class="h-4 w-4 text-green-400" />
		Nothing needs attention.
	</p>
{/if}

<!-- When a job last ran, what it last did, and what went wrong if it did. -->
{#snippet health(report: Report)}
	<div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
		<div class="min-w-0">
			<div class="text-sm font-medium text-white">{report.name}</div>
			<p class="mt-0.5 text-xs text-gray-400">{report.description}</p>
		</div>
		<div class="flex shrink-0 items-center gap-3">
			{#if report.lastRunAt}
				<span class="text-xs text-gray-400" title={formatDateTime(report.lastRunAt)}>
					ran {ago(report.lastRunAt)}
				</span>
			{/if}
			<Badge size="sm" color={STATE_COLORS[report.state]} label={JOB_HEALTH_LABELS[report.state]} />
		</div>
	</div>

	{#if report.lastError && report.lastFailureAt}
		{#if report.failuresInARow > 0}
			<p class="mt-2 text-xs text-red-300">
				Failed {report.failuresInARow === 1
					? 'on its last run'
					: `${report.failuresInARow} runs in a row`}{#if report.lastSuccessAt}, last worked
					{ago(report.lastSuccessAt)}{/if}:
				<span class="font-mono break-words">{report.lastError}</span>
			</p>
		{:else}
			<!-- Recovered. Kept because "it failed this morning and is fine now" is
			     worth being able to see. -->
			<p class="mt-2 text-xs text-gray-500" title={formatDateTime(report.lastFailureAt)}>
				Last failed {ago(report.lastFailureAt)}:
				<span class="font-mono break-words">{report.lastError}</span>
			</p>
		{/if}
	{/if}

	{#if report.lastSummary && report.lastSummaryAt}
		<p class="mt-2 text-xs text-gray-500" title={formatDateTime(report.lastSummaryAt)}>
			Last did something {ago(report.lastSummaryAt)}:
			<span class="font-mono break-words text-gray-400">{summarise(report.lastSummary)}</span>
		</p>
	{/if}
{/snippet}

<div class="space-y-6">
	<Panel title="Requests not on the TRK board" icon={IconClipboardAlert}>
		{#if form?.retryError}
			<div class="px-4 pt-4">
				<Alert>{form.retryError}</Alert>
			</div>
		{:else if form?.retried}
			<p class="flex items-center gap-2 px-4 pt-4 text-sm text-green-400">
				<IconCheck class="h-4 w-4" /> Filed on the board.
			</p>
		{/if}

		{#if data.stuck.length === 0 && data.retrying.length === 0}
			<p class="px-4 py-5 text-sm text-gray-400">Every open request has reached the board.</p>
		{:else}
			{#if data.stuck.length > 0}
				<p class="px-4 pt-4 text-sm text-gray-400">
					Filing these failed {data.maxAttempts} times, so they are no longer retried. Staff cannot see
					them on the board. Fix what the error describes, then retry.
				</p>
				<ul class="mt-3 divide-y divide-slate-700/60 border-t border-slate-700/60">
					{#each data.stuck as request (request.id)}
						<li class="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<a
										href="/certifications/{request.cid}"
										class="text-sm font-medium text-white hover:text-sky-300"
									>
										{request.name}
									</a>
									<span class="font-mono text-xs text-gray-500">{request.cid}</span>
									<Badge size="sm" color="sky" label={request.course} />
								</div>
								<p class="mt-1 text-xs text-gray-400">
									{findCourse(request.course)?.name ?? request.course} · requested
									{formatDate(request.createdAt)}
								</p>
								{#if request.error}
									<p class="mt-1 font-mono text-xs break-words text-red-300">{request.error}</p>
								{/if}
							</div>

							<form
								method="POST"
								action="?/retry"
								use:enhance={() => {
									retryingId = request.id;
									return async ({ update }) => {
										await update();
										// A failed retry changes the row too — its error and where it
										// sits — and `update()` only reloads after a success.
										await invalidateAll();
										retryingId = null;
									};
								}}
							>
								<input type="hidden" name="id" value={request.id} />
								<Button
									type="submit"
									variant="secondary"
									size="sm"
									disabled={retryingId !== null}
									class="shrink-0"
								>
									{retryingId === request.id ? 'Retrying…' : 'Retry now'}
								</Button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}

			{#if data.retrying.length > 0}
				<p
					class="px-4 pt-4 text-sm text-gray-400 {data.stuck.length > 0
						? 'border-t border-slate-700/60'
						: ''}"
				>
					Not filed yet, and retried automatically every {CRON_INTERVAL_MINUTES} minutes. Nothing to do
					unless one stays here.
				</p>
				<ul class="mt-3 divide-y divide-slate-700/60 border-t border-slate-700/60">
					{#each data.retrying as request (request.id)}
						<li class="px-4 py-3">
							<div class="flex flex-wrap items-center gap-2">
								<span class="text-sm text-white">{request.name}</span>
								<span class="font-mono text-xs text-gray-500">{request.cid}</span>
								<Badge size="sm" color="sky" label={request.course} />
								<span class="text-xs text-gray-400">
									requested {ago(request.createdAt)} · {request.attempts} of {data.maxAttempts} attempts
								</span>
							</div>
							{#if request.error}
								<p class="mt-1 font-mono text-xs break-words text-gray-400">{request.error}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</Panel>

	<Panel title="Scheduled jobs" icon={IconHeartPulse}>
		<p class="px-4 pt-4 text-sm text-gray-400">
			These run every {CRON_INTERVAL_MINUTES} minutes, in this order. A job that fails is tried again
			on the next run.
		</p>
		<ul class="mt-3 divide-y divide-slate-700/60 border-t border-slate-700/60">
			{#each data.jobs as report (report.name)}
				<li class="px-4 py-3">{@render health(report)}</li>
			{/each}
		</ul>
	</Panel>

	<Panel title="Jira webhook" icon={IconWebhook}>
		<div class="px-4 py-3">
			{@render health(data.webhook)}
			<p class="mt-2 text-xs text-gray-500">
				Runs when staff change an issue, so a quiet board means no recent run. The status sweep
				above catches anything it misses.
			</p>
		</div>
	</Panel>

	<Panel title="Configuration" icon={IconCog}>
		<ul class="divide-y divide-slate-700/60">
			{#each data.config as item (item.label)}
				<li class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
					<div class="min-w-0">
						<div class="text-sm text-white">{item.label}</div>
						{#if !item.set}
							<p class="mt-0.5 text-xs text-orange-300">{item.missing}</p>
						{/if}
					</div>
					<Badge
						size="sm"
						color={item.set ? 'green' : 'orange'}
						label={item.set ? 'Set' : 'Not set'}
					/>
				</li>
			{/each}
		</ul>
	</Panel>

	{#if data.discord}
		<DiscordRoomsPanel discord={data.discord} />
	{/if}
</div>
