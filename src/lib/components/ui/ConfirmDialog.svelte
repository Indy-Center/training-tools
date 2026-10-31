<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from './Button.svelte';
	import { dialogOutcome, type DialogAction } from '$lib/confirm-dialog';

	/**
	 * Asks before a step that cannot be undone from the page, in place of the
	 * browser's `confirm()`.
	 *
	 * Put it **inside the form it confirms**: the confirm button posts that form,
	 * with any inputs in the body (radios, say) as part of it. Cancel and Escape
	 * close it and post nothing (`dialogOutcome()`). Focus starts on the body's
	 * first input, else on the confirm button — on Cancel in the `danger` tone —
	 * and goes back to whatever opened it when it closes.
	 *
	 * The site's own, in its stock Tailwind style. It stands in for Indy
	 * Centerline's `ConfirmDialog` until the site moves to Centerline.
	 */
	type Props = {
		open: boolean;
		title: string;
		confirmLabel: string;
		cancelLabel?: string;
		/** `danger` for a step that goes against the student: red, and Cancel is focused first. */
		tone?: 'default' | 'danger';
		/** False keeps the confirm button disabled, while the body still needs an answer. */
		ready?: boolean;
		children: Snippet;
	};

	let {
		open = $bindable(false),
		title,
		confirmLabel,
		cancelLabel = 'Cancel',
		tone = 'default',
		ready = true,
		children
	}: Props = $props();

	const titleId = $props.id();

	let dialog: HTMLDialogElement;
	/** What had focus when the dialog opened, to hand it back on close. */
	let opener: HTMLElement | null = null;

	$effect(() => {
		if (open && !dialog.open) {
			opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			dialog.showModal();
			const start =
				tone === 'danger'
					? dialog.querySelector<HTMLElement>('[data-dialog-cancel]')
					: (dialog.querySelector<HTMLElement>('input:not([disabled]), select, textarea') ??
						dialog.querySelector<HTMLElement>('[data-dialog-confirm]'));
			start?.focus();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	function act(action: DialogAction) {
		const outcome = dialogOutcome(action, ready);
		if (outcome === 'stay') return;
		// Posted before closing: the form is read as it is submitted, while the
		// body's inputs are still there.
		if (outcome === 'submit') dialog.closest('form')?.requestSubmit();
		dialog.close();
	}

	function closed() {
		open = false;
		opener?.focus();
		opener = null;
	}
</script>

<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	class="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-700/60 bg-slate-800 p-0 text-gray-300 shadow-xl backdrop:bg-slate-950/70"
	oncancel={(event) => {
		event.preventDefault();
		act('escape');
	}}
	onclose={closed}
>
	{#if open}
		<div class="p-5">
			<h2 id={titleId} class="text-lg font-semibold text-white">{title}</h2>
			<div class="mt-3 space-y-3 text-sm">
				{@render children()}
			</div>
			<div class="mt-6 flex flex-wrap justify-end gap-3">
				<Button
					type="button"
					size="sm"
					variant="secondary"
					data-dialog-cancel
					onclick={() => act('cancel')}
				>
					{cancelLabel}
				</Button>
				<Button
					type="button"
					size="sm"
					variant={tone === 'danger' ? 'danger' : 'primary'}
					disabled={!ready}
					data-dialog-confirm
					onclick={() => act('confirm')}
				>
					{confirmLabel}
				</Button>
			</div>
		</div>
	{/if}
</dialog>
