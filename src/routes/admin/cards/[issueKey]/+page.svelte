<script lang="ts">
	import EnrollmentStatusBadge from '$lib/components/enrollment/EnrollmentStatusBadge.svelte';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import { CARD_DATE_FIELDS } from '$lib/card-page';
	import { findCourse } from '$lib/courses';
	import { formatDateTime } from '$lib/format';
	import IconArrowLeft from '~icons/mdi/arrow-left';
	import IconCardText from '~icons/mdi/card-text-outline';
	import IconComment from '~icons/mdi/comment-text-multiple-outline';
	import IconOpen from '~icons/mdi/open-in-new';

	let { data } = $props();

	const course = $derived(findCourse(data.enrollment.course));
</script>

<svelte:head>
	<title>Indy Center | {data.issueKey}</title>
</svelte:head>

<a href="/admin" class="inline-flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300">
	<IconArrowLeft class="h-4 w-4" />
	Admin
</a>

<div class="mt-4 mb-8">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-3xl font-bold text-white">{data.enrollment.name}</h1>
		<span class="font-mono text-sm text-gray-500">{data.enrollment.cid}</span>
	</div>
	<div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-400">
		<Badge size="sm" color="sky" label={data.enrollment.course} />
		<span>{course?.name ?? data.enrollment.course}</span>
		<span>·</span>
		{#if data.card?.status}
			<span class="text-white">{data.card.status}</span>
		{:else}
			<EnrollmentStatusBadge status={data.enrollment.status} />
		{/if}
		<span>·</span>
		{#if data.jiraUrl}
			<a
				href={data.jiraUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-1 font-mono text-sky-400 hover:text-sky-300"
			>
				{data.issueKey}
				<IconOpen class="h-3 w-3" />
			</a>
		{:else}
			<span class="font-mono">{data.issueKey}</span>
		{/if}
	</div>
</div>

{#if data.jiraError}
	<Alert class="mb-6">{data.jiraError}</Alert>
{/if}

{#if data.hold.length > 0}
	<Alert tone="warning" class="mb-6">
		Certification on hold: the card is missing {data.hold.join(', ')}.
	</Alert>
{/if}

{#if data.card}
	<div class="grid gap-6 lg:grid-cols-2">
		<Panel title="On the card" icon={IconCardText}>
			<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 px-4 py-4 text-sm">
				<dt class="text-gray-400">Teacher</dt>
				<dd class="font-mono text-white">{data.card.teacher ?? '—'}</dd>
				<dt class="text-gray-400">RE Instructor</dt>
				<dd class="font-mono text-white">{data.card.reInstructor ?? '—'}</dd>
				{#each CARD_DATE_FIELDS as { key, label } (key)}
					<dt class="text-gray-400">{label}</dt>
					<dd class="font-mono text-white">{data.card.dates[key] ?? '—'}</dd>
				{/each}
			</dl>
		</Panel>

		<Panel title="Latest comments" icon={IconComment}>
			{#if data.comments.length === 0}
				<p class="px-4 py-5 text-sm text-gray-400">No comments on the card.</p>
			{:else}
				<ul class="divide-y divide-slate-700/60">
					{#each data.comments as comment (comment.id)}
						<li class="px-4 py-3">
							<p class="text-xs text-gray-500">
								{comment.author ?? 'Unknown'}
								{#if comment.created}
									· {formatDateTime(comment.created)}
								{/if}
							</p>
							<p class="mt-1 text-sm whitespace-pre-line text-gray-300">{comment.text}</p>
						</li>
					{/each}
				</ul>
			{/if}
		</Panel>
	</div>
{/if}
