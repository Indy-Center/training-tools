<script lang="ts">
	import { enhance } from '$app/forms';
	import Panel from '$lib/components/Panel.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import { findCourse } from '$lib/courses';
	import { TRAINING_TEXT } from '$lib/content/training';
	import { STATUS_COLORS, STATUS_LABELS } from '$lib/enrollment-status';
	import IconClipboard from '~icons/mdi/clipboard-text';
	import IconAlert from '~icons/mdi/alert-circle';

	type Props = {
		request: {
			id: string;
			course: string;
			status: string;
			createdAt: Date;
			availability: string | null;
		};
		/** From a failed `?/withdraw`. */
		error?: string;
	};

	let { request, error }: Props = $props();

	const dateFormat = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
</script>

<!-- The same panel under every open request, whatever its status: what they
     asked for, and the way out. -->
<Panel title="Your training request" icon={IconClipboard}>
	<div class="space-y-5 px-4 py-5 text-sm text-gray-300">
		<div class="flex flex-wrap items-center gap-2">
			<Badge size="sm" color="sky" label={findCourse(request.course)?.label ?? request.course} />
			<Badge
				size="sm"
				color={STATUS_COLORS[request.status] ?? 'gray'}
				label={STATUS_LABELS[request.status] ?? request.status}
			/>
		</div>

		<p>Requested {dateFormat.format(new Date(request.createdAt))}.</p>

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
				<p class="mt-3 flex items-start gap-2 text-red-300">
					<IconAlert class="mt-0.5 h-4 w-4 shrink-0" />
					<span>{error}</span>
				</p>
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
				<button
					type="submit"
					class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600/50 px-4 py-2 text-sm font-medium text-gray-300 transition-colors duration-200 hover:bg-white/10 hover:text-white"
				>
					{TRAINING_TEXT.withdraw.button}
				</button>
			</form>
		</div>
	</div>
</Panel>
