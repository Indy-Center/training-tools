<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';

	/**
	 * One button that posts to a named form action.
	 *
	 * Every page with row actions needs the same four things: the hidden fields
	 * that say which row, an "are you sure?" for a step that changes a card, a
	 * busy state so nothing is pressed twice, and a reload afterwards so the page
	 * shows what the server now holds. This is those four, once.
	 *
	 * `busy` is shared by every ActionForm on a page (`bind:busy`): while one is
	 * working they are all disabled, and only the one that was pressed says so.
	 */
	let {
		action,
		label,
		fields = {},
		question,
		variant = 'primary',
		busy = $bindable(null),
		busyKey,
		class: className = '',
		children
	}: {
		/** The named action, without `?/`. */
		action: string;
		label: string;
		/** Hidden fields sent with the form, e.g. `{ id }`. */
		fields?: Record<string, string>;
		/** Asked before posting. Leave it out for a step that needs no confirmation. */
		question?: string;
		variant?: 'primary' | 'secondary';
		/** The key of whichever form on the page is working, or null. */
		busy?: string | null;
		/** This form's own key. Defaults to its action and fields together. */
		busyKey?: string;
		/** Layout only. */
		class?: string;
		/** Extra inputs, such as a select, placed before the button. */
		children?: Snippet;
	} = $props();

	const key = $derived(busyKey ?? `${action}:${Object.values(fields).join(':')}`);
</script>

<form
	method="POST"
	action="?/{action}"
	class={className}
	use:enhance={({ cancel }) => {
		if (question && !confirm(question)) return cancel();
		busy = key;
		return async ({ update }) => {
			await update();
			// A refused step can still have changed what is on the card, and
			// `update()` only reloads on success.
			await invalidateAll();
			busy = null;
		};
	}}
>
	{#each Object.entries(fields) as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
	{@render children?.()}
	<Button type="submit" size="sm" {variant} disabled={busy !== null}>
		{busy === key ? 'Working…' : label}
	</Button>
</form>
