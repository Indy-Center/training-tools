<script lang="ts">
	import IconOpen from '~icons/mdi/open-in-new';

	/** A request's TRK card, opened in a new tab. Renders nothing without an address. */
	let { issueKey, url }: { issueKey: string | null; url: string | null } = $props();
</script>

{#if url && issueKey}
	<a
		href={url}
		target="_blank"
		rel="noopener noreferrer"
		class="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300"
	>
		{issueKey}
		<IconOpen class="h-3 w-3" />
	</a>
{/if}
