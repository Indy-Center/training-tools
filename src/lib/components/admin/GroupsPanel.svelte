<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import type { GroupsPanel } from '$lib/groups';
	import type { HoldReason } from '$lib/teacher-groups';
	import IconAccountGroup from '~icons/mdi/account-group-outline';

	/**
	 * The groups this app serves larry (`TrainingRpc.getGroups()`): one per
	 * credential and one per teacher. Read-only, and only this app's side: what
	 * larry made of them in Discord is in larry's logs. Shown at the bottom of
	 * `/admin`.
	 */
	let { groups }: { groups: GroupsPanel } = $props();

	const WHY: Record<HoldReason, string> = {
		'no-initials': 'no initials entered',
		'no-name': 'no usable name',
		'name-uncertain': 'identity could not be asked for their name'
	};
</script>

<Panel title="Groups" icon={IconAccountGroup}>
	<div class="space-y-3 px-4 py-4 text-sm">
		<p class="text-gray-400">
			Who this app says belongs together. Larry gives each group a Discord role, and each teacher's
			group a room. A held group is kept exactly as it is in Discord until it can be served again.
		</p>

		<ul class="divide-y divide-slate-700/60">
			{#each groups as group (group.key)}
				<li class="py-3">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-medium text-white">{group.name}</span>
						{#if group.room}
							<Badge size="sm" color="sky" label="#{group.room}" />
						{/if}
						<span class="text-xs text-gray-400">
							{group.members.length}
							{group.members.length === 1 ? 'member' : 'members'}
						</span>
						{#if group.held}
							<Badge size="sm" color="orange" label="Held: {WHY[group.held]}" />
						{/if}
					</div>
					{#if group.members.length > 0}
						<p class="mt-1 text-xs text-gray-400">{group.members.join(', ')}</p>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
</Panel>
