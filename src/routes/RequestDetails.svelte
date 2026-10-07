<script lang="ts">
	import { enhance } from '$app/forms';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EnrollmentStatusBadge from '$lib/components/enrollment/EnrollmentStatusBadge.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import { findCourse } from '$lib/courses';
	import { TRAINING_TEXT } from '$lib/content/training';
	import { formatDate } from '$lib/format';
	import IconClipboard from '~icons/mdi/clipboard-text';

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
</script>

<!-- The same panel under every open request, whatever its status: what they
     asked for, and the way out. -->
<Panel title="Your training request" icon={IconClipboard}>
	<div class="space-y-5 px-4 py-5 text-sm text-gray-300">
		<div class="flex flex-wrap items-center gap-2">
			<Badge size="sm" color="sky" label={findCourse(request.course)?.label ?? request.course} />
			<EnrollmentStatusBadge status={request.status} />
		</div>

		<p>Requested {formatDate(request.createdAt, 'long')}.</p>

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
