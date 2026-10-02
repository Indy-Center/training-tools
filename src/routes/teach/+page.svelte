<script lang="ts">
	import Alert from '$lib/components/Alert.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import EnrollmentStatusBadge from '$lib/components/EnrollmentStatusBadge.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import TeacherStatusBadge from '$lib/components/TeacherStatusBadge.svelte';
	import { QUALIFICATION_LEVEL_LABELS } from '$lib/teachers';
	import IconAccountMultiple from '~icons/mdi/account-multiple-check';
	import IconCalendarClock from '~icons/mdi/calendar-clock';
	import IconSeal from '~icons/mdi/seal';
	import IconPencil from '~icons/mdi/pencil';
	import IconOpen from '~icons/mdi/open-in-new';

	let { data } = $props();
</script>

<svelte:head>
	<title>Indy Center | Teach</title>
</svelte:head>

<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
	<div>
		<h1 class="text-3xl font-bold text-white">Teach</h1>
		<p class="mt-2 text-gray-400">
			Your students, and what you have told training staff you can take on.
		</p>
	</div>
	<Button href="/teachers/{data.teacher.cid}" size="sm">
		<IconPencil class="h-4 w-4" />
		Edit availability and slots
	</Button>
</div>

{#if data.teacher.status === 'loa'}
	<Alert tone="warning" class="mb-6">
		You are on LOA, so you are not offered new students. Your slots stay visible here so you can
		show you are ready when you come back; they are not counted as open anywhere else.
	</Alert>
{/if}

{#if data.selfAssigned}
	<Alert class="mb-6">
		Your own enrollment is assigned to you on the TRK board. You cannot teach yourself — ask
		training staff to assign another teacher.
	</Alert>
{/if}

<div class="grid gap-6 lg:grid-cols-3">
	<div class="lg:col-span-2">
		<Panel title="Your students" icon={IconAccountMultiple}>
			{#if data.students.length === 0}
				<p class="px-4 py-5 text-sm text-gray-400">
					Nobody is assigned to you right now. Students appear here once training staff set you as
					their Teacher on the TRK board.
				</p>
			{:else}
				<ul class="divide-y divide-slate-700/60">
					{#each data.students as student (student.enrollmentId)}
						<li class="px-4 py-3">
							<div class="flex flex-wrap items-center gap-2">
								<span class="text-sm font-medium text-white">{student.name}</span>
								<span class="font-mono text-xs text-gray-500">{student.cid}</span>
								<Badge size="sm" color="sky" label={student.course} />
								<EnrollmentStatusBadge status={student.status} />
								{#if student.issueUrl}
									<a
										href={student.issueUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
									>
										{student.issueKey}
										<IconOpen class="h-3 w-3" />
									</a>
								{/if}
							</div>
							{#if student.availability}
								<p class="mt-1 text-xs whitespace-pre-line text-gray-400">
									{student.availability}
								</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</Panel>
	</div>

	<div class="space-y-6">
		<Panel title="Slots" icon={IconCalendarClock}>
			<dl class="divide-y divide-slate-700/60 text-sm">
				<div class="flex items-center justify-between px-4 py-3">
					<dt class="text-gray-400">Status</dt>
					<dd>
						<TeacherStatusBadge status={data.teacher.status} />
					</dd>
				</div>
				<div class="flex items-center justify-between px-4 py-3">
					<dt class="text-gray-400">Students in training</dt>
					<dd class="text-white">
						{data.slots.used}{#if data.slots.total !== null}
							<span class="text-gray-500"> of {data.slots.total}</span>{/if}
					</dd>
				</div>
				<div class="flex items-center justify-between px-4 py-3">
					<dt class="text-gray-400">Open slots</dt>
					<dd class="text-white">
						{#if data.slots.available === null}
							<span class="text-gray-500">Set your slots</span>
						{:else}
							{data.slots.available}
						{/if}
					</dd>
				</div>
				<div class="px-4 py-3">
					<dt class="text-gray-400">Availability</dt>
					<dd class="mt-1 whitespace-pre-line text-white">
						{data.teacher.availability ?? 'Not set'}
					</dd>
				</div>
			</dl>
		</Panel>

		<Panel title="Your qualifications" icon={IconSeal}>
			<ul class="divide-y divide-slate-700/60 text-sm">
				{#each data.qualifications as qualification (qualification.code)}
					<li class="flex items-center justify-between gap-3 px-4 py-2">
						<span class="text-gray-300">
							{qualification.name}
							<span class="font-mono text-xs text-gray-500">({qualification.code})</span>
						</span>
						<span class={qualification.level ? 'text-white' : 'text-gray-500'}>
							{QUALIFICATION_LEVEL_LABELS[qualification.level ?? 'none']}
						</span>
					</li>
				{/each}
			</ul>
		</Panel>
	</div>
</div>
