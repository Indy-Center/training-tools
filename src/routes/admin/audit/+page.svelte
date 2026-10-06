<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import { findCourse } from '$lib/courses';
	import { formatDate } from '$lib/format';
	import IconArrowLeft from '~icons/mdi/arrow-left';
	import IconCheck from '~icons/mdi/check-circle';
	import IconClipboardCheck from '~icons/mdi/clipboard-check-outline';
	import IconOpen from '~icons/mdi/open-in-new';

	let { data, form } = $props();

	/** The request being closed, so only its button shows as busy. */
	let busyId = $state<string | null>(null);
</script>

<svelte:head>
	<title>Indy Center | Training audit</title>
</svelte:head>

<a href="/admin" class="inline-flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300">
	<IconArrowLeft class="h-4 w-4" />
	Admin
</a>

<div class="mt-4 mb-8">
	<h1 class="text-3xl font-bold text-white">Training audit</h1>
	<p class="mt-2 text-gray-400">
		Courses that are finished and waiting on your review. Each has had the certification it earns
		applied already. Check it, then mark the audit complete to move the card to Completed.
	</p>
</div>

{#if form?.auditError}
	<Alert class="mb-6">{form.auditError}</Alert>
{:else if form?.audited}
	<p class="mb-6 flex items-center gap-2 text-sm text-green-400">
		<IconCheck class="h-4 w-4" />
		Audit complete for {form.audited}.
	</p>
{/if}

<Panel title="Waiting for audit" icon={IconClipboardCheck}>
	{#if data.requests.length === 0}
		<p class="px-4 py-5 text-sm text-gray-400">Nothing is waiting for an audit.</p>
	{:else}
		<ul class="divide-y divide-slate-700/60">
			{#each data.requests as request (request.id)}
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
							{#if request.issueUrl}
								<a
									href={request.issueUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
								>
									{request.issueKey}
									<IconOpen class="h-3 w-3" />
								</a>
							{/if}
						</div>

						<p class="mt-1 text-xs text-gray-400">
							{findCourse(request.course)?.name ?? request.course} · taught by
							<span class="font-mono">{request.teacher ?? '—'}</span>
							{#if request.examiner}
								· examined by <span class="font-mono">{request.examiner}</span>
							{/if}
						</p>

						<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
							<span>Now holds</span>
							{#if request.certification}
								<Badge size="sm" color="sky" label={request.certification} />
							{:else}
								<span class="text-gray-500">no certification</span>
							{/if}
							{#each request.endorsements as endorsement (endorsement)}
								<Badge size="sm" color="purple" label={endorsement} />
							{/each}
							{#if request.appliedAt}
								<span>· applied {formatDate(request.appliedAt)}</span>
							{/if}
						</div>

						{#if request.missing.length > 0}
							<p class="mt-2 text-xs text-orange-300">
								On hold: the card is missing {request.missing.join(', ')}, so no certification has
								been applied. Fill it in on the card, or move the card back if it is here by
								mistake. It is checked again every 15 minutes.
							</p>
						{:else if !request.appliedAt}
							<p class="mt-2 text-xs text-orange-300">
								The certification for this course has not been applied yet. It is retried every 15
								minutes, and the audit can be completed once it has.
							</p>
						{/if}
					</div>

					<form
						method="POST"
						action="?/complete"
						use:enhance={({ cancel }) => {
							if (
								!confirm(
									`Audit complete for ${request.name}?\n\nThis moves the card to Completed and closes the request.`
								)
							) {
								return cancel();
							}
							busyId = request.id;
							return async ({ update }) => {
								await update();
								await invalidateAll();
								busyId = null;
							};
						}}
					>
						<input type="hidden" name="id" value={request.id} />
						<Button
							type="submit"
							size="sm"
							disabled={busyId !== null || !request.appliedAt}
							class="shrink-0"
						>
							{busyId === request.id ? 'Working…' : 'Audit complete'}
						</Button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</Panel>
