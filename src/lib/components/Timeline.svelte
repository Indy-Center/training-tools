<script lang="ts">
	import Panel from '$lib/components/Panel.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import IconTimeline from '~icons/mdi/timeline-clock-outline';
	import IconAccountGroup from '~icons/mdi/account-group';
	import IconSchool from '~icons/mdi/school';
	import IconSeal from '~icons/mdi/seal';
	import IconCertificate from '~icons/mdi/certificate';

	type Entry = {
		at: Date | string;
		kind: 'roster' | 'teacher' | 'qualification' | 'certification';
		title: string;
		detail: string | null;
		actor: string | null;
		tag: string | null;
		flag: string | null;
	};

	let {
		entries,
		names = {},
		empty = 'Nothing has been recorded for this controller yet.'
	}: {
		entries: Entry[];
		/** CID → display name, for whoever made each change. */
		names?: Record<string, string>;
		empty?: string;
	} = $props();

	const KINDS = {
		roster: { icon: IconAccountGroup, color: 'gray' },
		teacher: { icon: IconSchool, color: 'blue' },
		qualification: { icon: IconSeal, color: 'green' },
		certification: { icon: IconCertificate, color: 'sky' }
	} as const;

	function formatDate(value: Date | string) {
		return new Date(value).toLocaleDateString();
	}
</script>

<Panel title="Timeline" icon={IconTimeline}>
	{#if entries.length === 0}
		<p class="px-4 py-5 text-sm text-gray-400">{empty}</p>
	{:else}
		<ul class="divide-y divide-slate-700/60">
			{#each entries as entry, index (index)}
				{@const Icon = KINDS[entry.kind].icon}
				<li class="flex gap-3 px-4 py-3">
					<Icon class="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							{#if entry.tag}
								<Badge size="sm" color={KINDS[entry.kind].color} label={entry.tag} />
							{/if}
							<span class="text-sm text-white">{entry.title}</span>
							{#if entry.flag}
								<Badge size="sm" color="orange" label={entry.flag} />
							{/if}
						</div>
						{#if entry.detail}
							<p class="mt-1 text-xs whitespace-pre-line text-gray-400">{entry.detail}</p>
						{/if}
						<p class="mt-1 text-xs text-gray-500">
							{formatDate(entry.at)} ·
							{#if entry.actor}
								{names[entry.actor] ?? ''}
								<span class="font-mono">{entry.actor}</span>
							{:else}
								Automatic
							{/if}
						</p>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</Panel>
