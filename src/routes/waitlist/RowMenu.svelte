<script lang="ts">
	import ActionForm from '$lib/components/forms/ActionForm.svelte';
	import DropdownMenu from '$lib/components/ui/DropdownMenu.svelte';
	import type { WaitlistRow } from '$lib/waitlist';

	/**
	 * What else can be done with a student, behind an arrow: withdraw them, or
	 * remove them. Kept out of the way because each closes the request. For a
	 * student off the home roster, Keep in line (or Stop keeping in line) too.
	 */
	let {
		row,
		courseName,
		attached = false,
		variant = 'secondary',
		busy = $bindable(null)
	}: {
		row: WaitlistRow;
		/** The course's name, for the wording of the confirmations. */
		courseName: string;
		/** The arrow half of a split button; otherwise a button that says "Actions". */
		attached?: boolean;
		variant?: 'primary' | 'secondary';
		busy?: string | null;
	} = $props();
</script>

<DropdownMenu
	label="More actions for {row.name}"
	text={attached ? undefined : 'Actions'}
	{attached}
	{variant}
>
	<!-- Roster removal's exemption: only while it applies (decisions/0037). -->
	{#if row.keptInLineBy}
		<ActionForm
			action="stopKeepingInLine"
			label="Stop keeping in line"
			variant="menu"
			class="border-b border-slate-700"
			fields={{ id: row.id }}
			question={`Stop keeping ${row.name} in line? If they have been off the home roster for 24 hours, the next pass removes their request, and closes it for good if it has been 30 days.`}
			bind:busy
		/>
	{:else if row.mayKeepInLine}
		<ActionForm
			action="keepInLine"
			label="Keep in line"
			variant="menu"
			class="border-b border-slate-700"
			fields={{ id: row.id }}
			bind:busy
		/>
	{/if}
	<ActionForm
		action="withdrawStudent"
		label="Withdraw"
		variant="menu"
		fields={{ id: row.id }}
		question={`Withdraw ${row.name} from ${courseName}?`}
		bind:busy
	/>
	<ActionForm
		action="removeStudent"
		label="Remove"
		variant="menu"
		class="border-t border-slate-700"
		fields={{ id: row.id }}
		question={`Remove ${row.name} from ${courseName}?`}
		bind:busy
	/>
</DropdownMenu>
