<script lang="ts">
	import Panel from '$lib/components/Panel.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import IconCertificate from '~icons/mdi/certificate';
	import IconMagnify from '~icons/mdi/magnify';
	import IconChevronRight from '~icons/mdi/chevron-right';

	let { data } = $props();
</script>

<svelte:head>
	<title>Indy Center | Certifications</title>
</svelte:head>

<div class="mb-8">
	<h1 class="text-3xl font-bold text-white">Certifications</h1>
	<p class="mt-2 text-gray-400">
		Search the roster to view or change a controller's certifications and endorsements.
	</p>
</div>

<Panel title="Find a controller" icon={IconMagnify}>
	<div class="px-4 py-5">
		<!-- A GET so a search is a shareable URL and the back button works. -->
		<form method="GET" class="flex flex-col gap-3 sm:flex-row">
			<label class="sr-only" for="q">Search by CID or name</label>
			<input
				id="q"
				name="q"
				type="search"
				value={data.query}
				placeholder="CID or name"
				class="block w-full rounded-lg border-slate-700/60 bg-slate-900/60 text-sm text-white placeholder:text-gray-500 focus:border-sky-500 focus:ring-sky-500/50"
			/>
			<button
				type="submit"
				class="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-sky-600 px-6 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700"
			>
				<IconMagnify class="h-4 w-4" />
				Search
			</button>
		</form>
		<!-- DEV-115 asks for search by operating initials too. Identity has no way to
		     look up another controller, so this is the honest limit for now. -->
		<p class="mt-3 text-xs text-gray-500">
			Matches CID, first name or last name. Operating initials are not searchable yet.
		</p>
	</div>
</Panel>

<div class="mt-6">
	<Panel title={data.query ? `Results for "${data.query}"` : 'Roster'} icon={IconCertificate}>
		{#if data.controllers.length === 0}
			<p class="px-4 py-5 text-sm text-gray-400">
				No active roster member matches that. Note this searches the ZID roster, so someone who has
				left will not appear even if they still hold a record.
			</p>
		{:else}
			<ul class="divide-y divide-slate-700/60">
				{#each data.controllers as controller (controller.cid)}
					<li>
						<a
							href="/certifications/{controller.cid}"
							class="flex items-center gap-4 px-4 py-3 transition-colors duration-200 hover:bg-white/5"
						>
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium text-white">{controller.name}</div>
								<div class="mt-0.5 font-mono text-xs text-gray-500">
									{controller.cid} · {controller.ratingShort} · {controller.membership === 'home'
										? 'Home'
										: 'Visiting'}
								</div>
							</div>

							<div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
								{#if controller.certification}
									<Badge size="sm" color="sky" label={controller.certification} />
								{:else}
									<span class="text-xs text-gray-500">No certification</span>
								{/if}
								{#each controller.endorsements as endorsement (endorsement)}
									<Badge size="sm" color="purple" label={endorsement} />
								{/each}
							</div>

							<IconChevronRight class="h-4 w-4 shrink-0 text-gray-500" />
						</a>
					</li>
				{/each}
			</ul>

			{#if data.truncated}
				<p class="border-t border-slate-700/60 px-4 py-3 text-xs text-gray-500">
					Showing the first {data.controllers.length}. Narrow the search to see more.
				</p>
			{/if}
		{/if}
	</Panel>
</div>
