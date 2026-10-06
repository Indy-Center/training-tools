<script lang="ts">
	import Alert from '$lib/components/Alert.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import TeacherStatusBadge from '$lib/components/TeacherStatusBadge.svelte';
	import { formatDate, formatDateTime } from '$lib/format';
	import {
		QUALIFICATION_LEVEL_LABELS,
		QUALIFICATION_LEVEL_SHORT,
		type QualificationLevel
	} from '$lib/teachers';
	import IconAccountGroup from '~icons/mdi/account-group';
	import IconHistory from '~icons/mdi/history';
	import IconCheck from '~icons/mdi/check-circle';
	import IconForum from '~icons/mdi/forum-outline';

	let { data } = $props();

	const LEVEL_CLASSES: Record<QualificationLevel, string> = {
		training: 'bg-yellow-500/10 text-yellow-300',
		teacher: 'bg-sky-500/10 text-sky-300',
		evaluator: 'bg-green-500/10 text-green-300'
	};

	function slotsLabel(slots: { total: number | null; used: number }) {
		return slots.total === null ? `${slots.used} / —` : `${slots.used} / ${slots.total}`;
	}
</script>

<svelte:head>
	<title>Indy Center | Teachers</title>
</svelte:head>

<div class="mb-8">
	<h1 class="text-3xl font-bold text-white">Teachers</h1>
</div>

{#if data.dropdowns}
	{@const drift = [
		...data.dropdowns.teacher.map((line) => `Teacher — ${line}`),
		...data.dropdowns.reInstructor.map((line) => `RE Instructor — ${line}`)
	]}
	{#if drift.length > 0}
		<Alert tone="warning" class="mb-6">
			<p>
				TRK's dropdowns do not match the teacher roster. Jira cannot be updated from here for this
				project, so make these changes by hand on the Student Enrollment issue type:
			</p>
			<ul class="mt-2 list-disc pl-5">
				{#each drift as line (line)}
					<li>{line}</li>
				{/each}
			</ul>
			<p class="mt-2 text-xs text-orange-300/70">
				Checked {formatDateTime(data.dropdowns.checkedAt)}.
			</p>
		</Alert>
	{:else}
		<p class="mb-6 flex items-center gap-2 text-sm text-gray-400">
			<IconCheck class="h-4 w-4 text-green-400" />
			TRK's Teacher and RE Instructor dropdowns match the roster (checked
			{formatDateTime(data.dropdowns.checkedAt)}).
		</p>
	{/if}
{/if}

{#if data.discord}
	{@const live = data.discord.mode === 'live'}
	{@const will = (done: string, would: string) => (live ? done : would)}
	<div class="mb-6">
		<Panel title="Discord roles and channels" icon={IconForum}>
			<div class="space-y-3 px-4 py-4 text-sm">
				<p class="text-gray-400">
					{#if live}
						Each teacher's role and channel, as of {formatDateTime(data.discord.at)}.
					{:else}
						<span class="font-medium text-orange-300">Dry run.</span> Nothing in Discord has been
						changed. This is what would happen, as of {formatDateTime(data.discord.at)}.
					{/if}
				</p>

				{#if !data.discord.canSeeMembers}
					<Alert tone="warning">
						Larry cannot list the server's members, so nobody is being removed from a teacher's
						role. Switch on Server Members Intent for the bot.
					</Alert>
				{/if}

				<ul class="divide-y divide-slate-700/60">
					{#each data.discord.rooms as room (room.cid)}
						<li class="py-3">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium text-white">{room.teacher}</span>
								<Badge
									size="sm"
									color={room.role === 'failed'
										? 'orange'
										: room.role === 'found'
											? 'sky'
											: 'purple'}
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
										{will('Role taken from', 'Would lose the role')} (Discord IDs): {room.removed.join(
											', '
										)}.
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

				{#if data.discord.skipped.length > 0}
					<p class="text-xs text-gray-400">
						No role or channel for:
						{data.discord.skipped
							.map(
								(skip) =>
									`${skip.name} (${skip.reason === 'no-initials' ? 'no initials' : 'no name'})`
							)
							.join(', ')}.
					</p>
				{/if}
			</div>
		</Panel>
	</div>
{/if}

<Panel title="Teacher roster" icon={IconAccountGroup}>
	<div class="overflow-x-auto">
		<table class="w-full text-left text-sm">
			<thead class="border-b border-slate-700/60 text-xs text-gray-400 uppercase">
				<tr>
					<th class="px-4 py-3 font-medium">Teacher</th>
					<th class="px-4 py-3 font-medium">Status</th>
					<th class="px-4 py-3 font-medium">Students</th>
					<th class="px-4 py-3 font-medium" title="In training / slots set">Slots</th>
					{#each data.credentials as code (code)}
						<th class="px-2 py-3 text-center font-mono font-medium">{code}</th>
					{/each}
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-700/60">
				{#each data.current as teacher (teacher.cid)}
					<tr class="transition-colors duration-200 hover:bg-white/5">
						<td class="px-4 py-3">
							<a href="/teachers/{teacher.cid}" class="text-white hover:text-sky-300">
								{teacher.name}
							</a>
							<div class="mt-0.5 flex gap-2 font-mono text-xs text-gray-500">
								<span>{teacher.initials ?? '—'}</span>
								<span>{teacher.cid}</span>
								<span>{teacher.ratingShort}</span>
								<span>{teacher.roles.join('+')}</span>
							</div>
						</td>
						<td class="px-4 py-3">
							<TeacherStatusBadge status={teacher.status} />
						</td>
						<td class="px-4 py-3 text-white">{teacher.assigned}</td>
						<td class="px-4 py-3 font-mono text-white">
							{slotsLabel(teacher.slots)}
							{#if teacher.status === 'loa' && teacher.slots.total !== null}
								<span class="block text-xs text-orange-400">not open</span>
							{/if}
						</td>
						{#each data.credentials as code (code)}
							{@const level = teacher.levels[code]}
							<td class="px-2 py-3 text-center">
								{#if level}
									<span
										class="rounded px-1.5 py-0.5 font-mono text-xs {LEVEL_CLASSES[level]}"
										title={QUALIFICATION_LEVEL_LABELS[level]}
									>
										{QUALIFICATION_LEVEL_SHORT[level]}
									</span>
								{:else}
									<span class="text-gray-600" title={QUALIFICATION_LEVEL_LABELS.none}>·</span>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</Panel>

{#if data.former.length > 0}
	<div class="mt-6">
		<Panel title="Former teachers" icon={IconHistory}>
			<ul class="divide-y divide-slate-700/60">
				{#each data.former as teacher (teacher.cid)}
					<li class="flex items-center justify-between gap-3 px-4 py-3 text-sm">
						<a href="/teachers/{teacher.cid}" class="text-gray-300 hover:text-sky-300">
							{teacher.name}
							<span class="font-mono text-xs text-gray-500">{teacher.cid}</span>
						</a>
						<span class="text-xs text-gray-500">
							Left {teacher.removedAt ? formatDate(teacher.removedAt) : '—'}
						</span>
					</li>
				{/each}
			</ul>
		</Panel>
	</div>
{/if}
