<script lang="ts">
	import Alert from '$lib/components/ui/Alert.svelte';
	import IconCheck from '~icons/mdi/check-circle';

	/**
	 * What the last form action said: why it was refused, or what it did. Sits
	 * above whatever the action changed. Renders nothing when there is neither.
	 */
	let {
		error,
		done,
		note,
		class: className = 'mb-6'
	}: {
		error?: string | null;
		done?: string | null;
		/** Something the person still has to do themselves, shown beside `done`. */
		note?: string | null;
		class?: string;
	} = $props();
</script>

{#if error}
	<Alert class={className}>{error}</Alert>
{:else if done}
	<p class="flex flex-wrap items-center gap-2 text-sm text-green-400 {className}">
		<IconCheck class="h-4 w-4" />
		{done}
		{#if note}<span class="text-orange-300">{note}</span>{/if}
	</p>
{/if}
