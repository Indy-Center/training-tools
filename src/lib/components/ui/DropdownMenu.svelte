<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconChevronDown from '~icons/mdi/chevron-down';

	/**
	 * A small menu behind an arrow, after the community site's feedback menus
	 * (`AcceptActions`, `FollowUpMenu`): the same button, chevron and panel.
	 *
	 * On its own it is a button with a label. `attached` makes it the arrow half
	 * of a split button: put it straight after the main button, which should lose
	 * its right-hand corners (`rounded-r-none`).
	 *
	 * Where it differs from the original is how the panel is placed. Those sit
	 * `absolute` under their button, which works on a card; ours sit in a table
	 * inside a Panel, and both clip what hangs outside them. So the panel is a
	 * popover: the browser draws it above everything, and closes it on a click
	 * elsewhere or Escape.
	 */
	let {
		label,
		text,
		attached = false,
		variant = 'secondary',
		children
	}: {
		/** What the arrow opens, for a screen reader: "More actions for Jo Rivera". */
		label: string;
		/** Words beside the arrow. Leave out for an arrow alone. */
		text?: string;
		/** The arrow half of a split button, flush against the button before it. */
		attached?: boolean;
		/** Matches the button it is attached to. */
		variant?: 'primary' | 'secondary';
		/** The menu's items. */
		children: Snippet;
	} = $props();

	const id = $props.id();

	let trigger: HTMLButtonElement;
	let panel: HTMLDivElement;
	let open = $state(false);
	/** Under the arrow, the panel's right edge on the arrow's. */
	let place = $state({ top: 0, right: 0 });

	function beforeToggle(event: ToggleEvent) {
		if (event.newState !== 'open') return;
		const box = trigger.getBoundingClientRect();
		place = {
			top: box.bottom + 4,
			right: document.documentElement.clientWidth - box.right
		};
	}

	/** It is placed against the window, so a scroll would leave it behind. */
	function close() {
		if (open) panel.hidePopover();
	}

	const VARIANTS = {
		primary: 'bg-sky-600 text-white hover:bg-sky-700 border-l border-sky-800/60',
		secondary: 'border border-slate-600/50 text-gray-300 hover:bg-white/10 hover:text-white'
	};
</script>

<svelte:window onscrollcapture={close} onresize={close} />

<button
	type="button"
	bind:this={trigger}
	popovertarget={id}
	aria-label={label}
	aria-haspopup="menu"
	aria-expanded={open}
	class="inline-flex cursor-pointer items-center gap-1 text-sm font-medium transition-colors duration-200 focus:ring-2 focus:ring-sky-500 focus:outline-none focus:ring-inset {VARIANTS[
		variant
	]} {attached
		? `self-stretch rounded-r-lg px-2 py-2 ${variant === 'secondary' ? 'border-l-0' : ''}`
		: 'rounded-lg px-3 py-2'}"
>
	{#if text}{text}{/if}
	<IconChevronDown class="h-4 w-4 transition-transform {open ? 'rotate-180' : ''}" />
</button>

<!-- Always in the page, shown by the browser: a form inside it must outlive the
     click that closes the menu. -->
<div
	{id}
	popover="auto"
	role="menu"
	bind:this={panel}
	onbeforetoggle={beforeToggle}
	ontoggle={(event) => (open = event.newState === 'open')}
	onsubmit={close}
	class="m-0 w-56 overflow-hidden rounded-lg border border-slate-600 bg-slate-800 p-0 shadow-xl"
	style="inset: auto; top: {place.top}px; right: {place.right}px;"
>
	{@render children()}
</div>
