<script lang="ts">
	import ActionForm from '$lib/components/forms/ActionForm.svelte';
	import { formatCardDate } from '$lib/format';
	import type { WaitlistRow } from '$lib/waitlist';
	import IconCheck from '~icons/mdi/check-circle';

	/**
	 * Where a student is with the VATUSA written course: not needed, to be
	 * assigned, assigned and awaited, or passed.
	 */
	let {
		row,
		vatusaKeySet,
		busy = $bindable(null)
	}: {
		row: WaitlistRow;
		/** Whether assigning also assigns it on VATUSA, which the confirmation says. */
		vatusaKeySet: boolean;
		busy?: string | null;
	} = $props();
</script>

{#if !row.exam}
	<span class="text-gray-500">Not needed</span>
{:else if row.vatusaCompletedOn}
	<span class="flex items-center gap-1 text-green-400">
		<IconCheck class="h-4 w-4" />
		Passed {formatCardDate(row.vatusaCompletedOn)}
	</span>
{:else if row.vatusaAssignedOn}
	<p class="text-gray-300">{row.exam} assigned {formatCardDate(row.vatusaAssignedOn)}</p>
	<ActionForm
		action="completeVatusa"
		label="Mark passed"
		variant="secondary"
		class="mt-2"
		fields={{ id: row.id }}
		question={`Manually mark the VATUSA ${row.exam} course as passed for ${row.name}?`}
		bind:busy
	/>
{:else}
	<ActionForm
		action="assignVatusa"
		label="Assign {row.exam}"
		fields={{ id: row.id }}
		question={`Assign the VATUSA ${row.exam} course to ${row.name}?`}
		bind:busy
	/>
{/if}
