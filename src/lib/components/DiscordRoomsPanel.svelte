<script lang="ts">
	import Alert from '$lib/components/Alert.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import { formatDateTime } from '$lib/format';
	import type { RoomsPanel } from '$lib/discord-rooms';
	import IconForum from '~icons/mdi/forum-outline';

	/**
	 * What the last Discord sync did to each teacher's role and channel — or, in
	 * a dry run, what it would do. Shown at the bottom of `/admin`.
	 */
	let { discord }: { discord: RoomsPanel } = $props();

	const live = $derived(discord.mode === 'live');
	const will = (done: string, would: string) => (live ? done : would);
</script>

<Panel title="Discord roles and channels" icon={IconForum}>
	<div class="space-y-3 px-4 py-4 text-sm">
		<p class="text-gray-400">
			{#if live}
				Each teacher's role and channel, as of {formatDateTime(discord.at)}.
			{:else}
				<span class="font-medium text-orange-300">Dry run.</span> Nothing in Discord has been
				changed. This is what would happen, as of {formatDateTime(discord.at)}.
			{/if}
		</p>

		{#if !discord.canSeeMembers}
			<Alert tone="warning">
				Larry cannot list the server's members, so nobody is being removed from a teacher's role.
				Switch on Server Members Intent for the bot.
			</Alert>
		{/if}

		<ul class="divide-y divide-slate-700/60">
			{#each discord.rooms as room (room.cid)}
				<li class="py-3">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-medium text-white">{room.teacher}</span>
						<Badge
							size="sm"
							color={room.role === 'failed' ? 'orange' : room.role === 'found' ? 'sky' : 'purple'}
							label="@{room.roleName}: {room.role}"
						/>
						<Badge
							size="sm"
							color={room.channel === 'failed'
								? 'orange'
								: room.channel === 'found'
									? 'sky'
									: 'purple'}
							label="#{room.channelName}: {room.channel}"
						/>
					</div>
					<ul class="mt-1 space-y-0.5 text-xs text-gray-400">
						{#if room.roleRenamedFrom}
							<li>Role {will('renamed', 'would be renamed')} from @{room.roleRenamedFrom}.</li>
						{/if}
						{#if room.channelRenamedFrom}
							<li>
								Channel {will('renamed', 'would be renamed')} from #{room.channelRenamedFrom}.
							</li>
						{/if}
						{#if room.added.length > 0}
							<li>
								{will('Given the role', 'Would be given the role')}: {room.added.join(', ')}.
							</li>
						{/if}
						{#if room.removed.length > 0}
							<li class="text-orange-300">
								{will(`@${room.roleName} taken from`, `Would lose @${room.roleName}`)}: {room.removed.join(
									', '
								)}. They are not this teacher or one of their current students.
							</li>
						{/if}
						{#if room.notInServer.length > 0}
							<li>Not in the Discord server: {room.notInServer.join(', ')}.</li>
						{/if}
						{#if room.noDiscord.length > 0}
							<li>No Discord ID on the roster: {room.noDiscord.join(', ')}.</li>
						{/if}
						{#each room.errors as error (error)}
							<li class="text-orange-300">{error}</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ul>

		{#each discord.deleted as gone (gone.cid)}
			<p class="text-xs text-orange-300">
				{gone.teacher} has left the teacher roster: role {gone.role}, channel {gone.channel}.
				{gone.errors.join(' ')}
			</p>
		{/each}

		{#if discord.skipped.length > 0}
			<p class="text-xs text-gray-400">
				No role or channel for:
				{discord.skipped
					.map(
						(skip) => `${skip.name} (${skip.reason === 'no-initials' ? 'no initials' : 'no name'})`
					)
					.join(', ')}.
			</p>
		{/if}
	</div>
</Panel>
