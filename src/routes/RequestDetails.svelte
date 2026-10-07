<script lang="ts">
	import { enhance } from '$app/forms';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import { findCourse } from '$lib/courses';
	import { TRAINING_TEXT } from '$lib/content/training';
	import { requestTimeline } from '$lib/request-timeline';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconCircleOutline from '~icons/mdi/circle-outline';
	import IconClipboard from '~icons/mdi/clipboard-text';
	import IconRecordCircle from '~icons/mdi/record-circle';

	/** A teacher or examiner as the board holds them, with their name when they are one of ours. */
	type Assignee = { value: string; name: string | null } | null;

	type Props = {
		request: {
			id: string;
			course: string;
			status: string;
			createdAt: Date;
			availability: string | null;
			teacher: Assignee;
			instructor: Assignee;
			vatusaAssignedOn: string | null;
			vatusaCompletedOn: string | null;
			certificationAppliedAt: Date | null;
		};
		/** From a failed `?/withdraw`. */
		error?: string;
	};

	let { request, error }: Props = $props();

	function assigneeLabel(assignee: Assignee): string | null {
		if (!assignee) return null;
		return assignee.name ? `${assignee.name} (${assignee.value})` : assignee.value;
	}

	const steps = $derived(
		requestTimeline({
			course: request.course,
			status: request.status,
			createdAt: request.createdAt,
			teacher: assigneeLabel(request.teacher),
			examiner: assigneeLabel(request.instructor),
			vatusaAssignedOn: request.vatusaAssignedOn,
			vatusaCompletedOn: request.vatusaCompletedOn,
			certificationAppliedAt: request.certificationAppliedAt
		})
	);

	const STEP_ICONS = {
		done: { icon: IconCheckCircle, color: 'text-green-400' },
		current: { icon: IconRecordCircle, color: 'text-sky-400' },
		upcoming: { icon: IconCircleOutline, color: 'text-gray-600' }
	} as const;
</script>

<!-- The same panel under every open request, whatever its status: what they
     asked for, how far along it is, and the way out. -->
<Panel title="Your training request" icon={IconClipboard}>
	<div class="space-y-5 px-4 py-5 text-sm text-gray-300">
		<Badge size="sm" color="sky" label={findCourse(request.course)?.label ?? request.course} />

		<ol>
			{#each steps as step, index (step.key)}
				{@const Icon = STEP_ICONS[step.state].icon}
				<li class="relative flex gap-3 pb-5 last:pb-0">
					{#if index < steps.length - 1}
						<span class="absolute top-6 bottom-0.5 left-2.5 w-px bg-slate-700" aria-hidden="true"
						></span>
					{/if}
					<Icon class="h-5 w-5 shrink-0 {STEP_ICONS[step.state].color}" aria-hidden="true" />
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-baseline justify-between gap-x-3">
							<span class={step.state === 'upcoming' ? 'text-gray-500' : 'font-medium text-white'}>
								{step.label}
								{#if step.state === 'done'}
									<span class="sr-only">(done)</span>
								{:else if step.state === 'current'}
									<span class="sr-only">(current step)</span>
								{/if}
							</span>
							{#if step.date}
								<span class="text-xs text-gray-400">{step.date}</span>
							{/if}
						</div>
						{#if step.detail}
							<p class="mt-0.5 text-xs text-gray-400">{step.detail}</p>
						{/if}
					</div>
				</li>
			{/each}
		</ol>

		{#if request.availability}
			<div>
				<h3 class="text-xs font-semibold tracking-wide text-gray-400 uppercase">
					Availability you gave us
				</h3>
				<p class="mt-1 whitespace-pre-line">{request.availability}</p>
			</div>
		{/if}

		<div class="border-t border-slate-700/60 pt-4">
			<p class="text-gray-400">{TRAINING_TEXT.withdraw.intro}</p>

			{#if error}
				<Alert class="mt-3">{error}</Alert>
			{/if}

			<form
				method="POST"
				action="?/withdraw"
				use:enhance
				onsubmit={(event) => {
					if (!confirm(TRAINING_TEXT.withdraw.confirm)) event.preventDefault();
				}}
				class="mt-3"
			>
				<input type="hidden" name="id" value={request.id} />
				<Button type="submit" variant="secondary" size="sm">
					{TRAINING_TEXT.withdraw.button}
				</Button>
			</form>
		</div>
	</div>
</Panel>
