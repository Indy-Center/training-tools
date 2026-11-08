<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ActionForm from '$lib/components/forms/ActionForm.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import DropdownMenu from '$lib/components/ui/DropdownMenu.svelte';
	import type { RemovalReasonChoice } from '$lib/card-page';
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
		removalReasons,
		variant = 'secondary',
		busy = $bindable(null)
	}: {
		row: WaitlistRow;
		/** The course's name, for the wording of the confirmations. */
		courseName: string;
		/** What Remove asks for: the reasons an admin may choose. */
		removalReasons: RemovalReasonChoice[];
		/** The arrow half of a split button; otherwise a button that says "Actions". */
		attached?: boolean;
		variant?: 'primary' | 'secondary';
		busy?: string | null;
	} = $props();

	/** Remove's dialog, and the reason chosen in it: none until one is picked. */
	let removing = $state(false);
	let reason = $state('');
	// The key ActionForm would give it, so the page's other forms wait the same way.
	const removeKey = $derived(`removeStudent:${row.id}`);
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
	<!-- Opens the dialog below, which asks why; opening it closes the menu. -->
	<button
		type="button"
		role="menuitem"
		disabled={busy !== null}
		onclick={() => {
			reason = '';
			removing = true;
		}}
		class="flex w-full cursor-pointer items-center gap-2 border-t border-slate-700 px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
	>
		{busy === removeKey ? 'Working…' : 'Remove'}
	</button>
</DropdownMenu>

<!-- Outside the menu, so the dialog outlives it. -->
<form
	method="POST"
	action="?/removeStudent"
	class="contents"
	use:enhance={() => {
		busy = removeKey;
		return async ({ update }) => {
			await update();
			// A refused step can still have changed what is on the card.
			await invalidateAll();
			busy = null;
		};
	}}
>
	<input type="hidden" name="id" value={row.id} />
	<ConfirmDialog
		bind:open={removing}
		title={`Remove ${row.name} from ${courseName}?`}
		confirmLabel="Remove"
		tone="danger"
		ready={reason !== ''}
	>
		<p>
			Remove is for a request staff are ending: no response, not eligible, a duplicate or mistake,
			or another reason. The reason goes on the card. If the student is giving it up, use Withdraw.
		</p>
		<div>
			<label for="remove-reason-{row.id}" class="block text-sm font-medium text-gray-300">
				Reason
			</label>
			<select
				id="remove-reason-{row.id}"
				name="reason"
				required
				bind:value={reason}
				class="mt-2 w-full rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-sky-500 focus:ring-sky-500/50"
			>
				<option value="" disabled>Choose a reason</option>
				{#each removalReasons as choice (choice.name)}
					<option value={choice.name}>{choice.label}</option>
				{/each}
			</select>
		</div>
	</ConfirmDialog>
</form>
