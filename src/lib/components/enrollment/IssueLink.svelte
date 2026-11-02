<script lang="ts">
	import { page } from '$app/state';
	import { cardPagePath } from '$lib/card-page';
	import { isTrainingAdmin } from '$lib/utils/permissions';
	import IconOpen from '~icons/mdi/open-in-new';

	/**
	 * A request's TRK card. For a training admin the key opens the card page,
	 * with the card on Jira beside it in a new tab; for anyone else, who can't
	 * open the card page, the key opens the card on Jira. Renders nothing
	 * without a key, nor, for anyone but an admin, without Jira's address.
	 */
	let { issueKey, url }: { issueKey: string | null; url: string | null } = $props();

	// The root layout's load puts the viewer's roles on every page.
	const admin = $derived(isTrainingAdmin(page.data.roles));
</script>

{#if issueKey && admin}
	<span class="inline-flex items-center gap-1">
		<a href={cardPagePath(issueKey)} class="text-sky-400 hover:text-sky-300">{issueKey}</a>
		{#if url}
			<a
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				class="text-sky-400 hover:text-sky-300"
				aria-label="{issueKey} on Jira"
				title="Open on Jira"
			>
				<IconOpen class="h-3 w-3" />
			</a>
		{/if}
	</span>
{:else if url && issueKey}
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
