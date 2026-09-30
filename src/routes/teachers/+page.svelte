<script lang="ts">
	import Panel from '$lib/components/Panel.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import {
		QUALIFICATION_LEVEL_LABELS,
		QUALIFICATION_LEVEL_SHORT,
		TEACHER_STATUS_LABELS,
		type QualificationLevel
	} from '$lib/teachers';
	import IconAccountGroup from '~icons/mdi/account-group';
	import IconHistory from '~icons/mdi/history';
	import IconAlert from '~icons/mdi/alert-circle';
	import IconCheck from '~icons/mdi/check-circle';

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
	<p class="mt-2 text-gray-400">
		Everyone holding ZID INS or MTR on VATUSA. {data.totals.teachers} on the roster, {data.totals
			.onLoa} on LOA,
		<span class="text-white">{data.totals.openSlots} open slots</span>{#if data.totals.notSet > 0}; {data
				.totals.notSet} have not set their slots{/if}. Slots of teachers on LOA are never counted as
		open.
	</p>
</div>

{#if data.dropdowns}
	{@const drift = [
		...data.dropdowns.teacher.map((line) => `Teacher — ${line}`),
		...data.dropdowns.reInstructor.map((line) => `RE Instructor — ${line}`)
	]}
	{#if drift.length > 0}
		<div
			class="mb-6 flex items-start gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-300"
		>
			<IconAlert class="mt-0.5 h-5 w-5 shrink-0" />
			<div>
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
					Checked {new Date(data.dropdowns.checkedAt).toLocaleString()}.
				</p>
			</div>
		</div>
	{:else}
		<p class="mb-6 flex items-center gap-2 text-sm text-gray-400">
			<IconCheck class="h-4 w-4 text-green-400" />
			TRK's Teacher and RE Instructor dropdowns match the roster (checked
			{new Date(data.dropdowns.checkedAt).toLocaleString()}).
		</p>
	{/if}
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
							<Badge
								size="sm"
								color={teacher.status === 'loa' ? 'orange' : 'green'}
								label={TEACHER_STATUS_LABELS[teacher.status]}
							/>
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
	<p class="border-t border-slate-700/60 px-4 py-3 text-xs text-gray-500">
		Trn = Training · T = Teacher · T+E = Teacher and Evaluator · · = No Qual
	</p>
</Panel>

{#if data.former.length > 0}
	<div class="mt-6">
		<Panel title="Former teachers" icon={IconHistory}>
			<p class="px-4 pt-3 text-xs text-gray-500">
				Qualifications are kept for six months after someone leaves the teacher roster, then end.
			</p>
			<ul class="divide-y divide-slate-700/60">
				{#each data.former as teacher (teacher.cid)}
					<li class="flex items-center justify-between gap-3 px-4 py-3 text-sm">
						<a href="/teachers/{teacher.cid}" class="text-gray-300 hover:text-sky-300">
							{teacher.name}
							<span class="font-mono text-xs text-gray-500">{teacher.cid}</span>
						</a>
						<span class="text-xs text-gray-500">
							Left {teacher.removedAt ? new Date(teacher.removedAt).toLocaleDateString() : '—'}
						</span>
					</li>
				{/each}
			</ul>
		</Panel>
	</div>
{/if}
