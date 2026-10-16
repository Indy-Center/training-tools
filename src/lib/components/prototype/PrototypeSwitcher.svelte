<script lang="ts">
	// PROTOTYPE — throwaway. Cycles `?variant=` on the current page. Never drawn in a build.
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { variants }: { variants: { key: string; name: string }[] } = $props();

	const current = $derived(page.url.searchParams.get('variant') ?? variants[0].key);
	const index = $derived(
		Math.max(
			0,
			variants.findIndex((v) => v.key === current)
		)
	);

	function go(step: number) {
		const next = variants[(index + step + variants.length) % variants.length];
		const url = new URL(page.url);
		url.searchParams.set('variant', next.key);
		goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	function onkeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable]')) return;
		if (event.key === 'ArrowLeft') go(-1);
		if (event.key === 'ArrowRight') go(1);
	}
</script>

<svelte:window {onkeydown} />

{#if dev}
	<div
		class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-1 text-sm font-medium text-white shadow-lg shadow-black/50"
	>
		<button class="rounded-full px-3 py-1 hover:bg-white/20" onclick={() => go(-1)}>←</button>
		<span class="px-2">
			PROTOTYPE · {variants[index].key} ({variants[index].name})
		</span>
		<button class="rounded-full px-3 py-1 hover:bg-white/20" onclick={() => go(1)}>→</button>
	</div>
{/if}
