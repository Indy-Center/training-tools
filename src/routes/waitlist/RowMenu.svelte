<script lang="ts">
	import ActionForm from '$lib/components/forms/ActionForm.svelte';
	import DropdownMenu from '$lib/components/ui/DropdownMenu.svelte';
	import type { WaitlistRow } from '$lib/waitlist';

	/**
	 * What else can be done with a student, behind an arrow: withdraw them, or
	 * remove them. Kept out of the way because each closes the request.
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
