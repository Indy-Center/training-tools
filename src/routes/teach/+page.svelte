<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EnrollmentStatusBadge from '$lib/components/enrollment/EnrollmentStatusBadge.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import TeacherStatusBadge from '$lib/components/teachers/TeacherStatusBadge.svelte';
	import { QUALIFICATION_LEVEL_LABELS } from '$lib/teachers';
	import IconAccountMultiple from '~icons/mdi/account-multiple-check';
	import IconCalendarClock from '~icons/mdi/calendar-clock';
	import IconSeal from '~icons/mdi/seal';
	import IconPencil from '~icons/mdi/pencil';
	import IconOpen from '~icons/mdi/open-in-new';
	import IconCertificate from '~icons/mdi/certificate';
	import IconCheck from '~icons/mdi/check-circle';
	import IconClipboard from '~icons/mdi/clipboard-text-clock';
	import { page } from '$app/state';

	let { data, form } = $props();

	/** The request a step is running for, so only its button shows as busy. */
	let busyId = $state<string | null>(null);

	/** Set by the report form when it sends someone back here: VATUSA's record number. */
	const reported = $derived(page.url.searchParams.get('reported'));
	/** Whether that report was also meant to move the card, and did. */
	const card = $derived(page.url.searchParams.get('card'));
</script>

<svelte:head>
	<title>Indy Center | Teach</title>
</svelte:head>

<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
	<div>
		<h1 class="text-3xl font-bold text-white">Teach</h1>
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

{#if reported !== null && !form}
	<p class="mb-6 flex items-center gap-2 text-sm text-green-400">
		<IconCheck class="h-4 w-4" />
		Training report filed with VATUSA{reported ? ` (record ${reported})` : ''}{card === 'moved'
			? ', and the card moved on'
			: ''}.
	</p>
	{#if card === 'stuck'}
		<Alert tone="warning" class="mb-6">
			The report is filed, but the student's card could not be moved. Use the button beside them
			below; do not file the report again.
		</Alert>
	{/if}
{/if}

{#if form?.flowError}
	<Alert class="mb-6">{form.flowError}</Alert>
{:else if form?.flowDone}
	<p class="mb-6 flex items-center gap-2 text-sm text-green-400">
		<IconCheck class="h-4 w-4" />
		{form.flowDone}
	</p>
{/if}

<!-- One step at the end of a course: a button that asks first, because each of
     these moves a card on the staff board and none can be undone from here. -->
{#snippet step(
	action: string,
	id: string,
	label: string,
	question: string,
	variant: 'primary' | 'secondary' = 'primary',
	next: string | null = null
)}
	<form
		method="POST"
		action="?/{action}"
		class="mt-3"
		use:enhance={({ cancel }) => {
			if (!confirm(question)) return cancel();
			busyId = id;
			return async ({ update }) => {
				await update();
				// A refused step can still have changed what is on the card — someone
				// else took the exam first — and `update()` only reloads on success.
				await invalidateAll();
				busyId = null;
			};
		}}
	>
		<input type="hidden" name="id" value={id} />
		{#if next}
			<input type="hidden" name="next" value={next} />
		{/if}
		<Button type="submit" size="sm" {variant} disabled={busyId !== null}>
			{busyId === id ? 'Working…' : label}
		</Button>
	</form>
{/snippet}

<!-- Opens the CTRS form for one student, with who they are already filled in. -->
{#snippet report(id: string)}
	<Button href="/teach/report/{id}" size="sm" variant="secondary" class="mt-3">
		<IconClipboard class="h-4 w-4" />
		File training report
	</Button>
{/snippet}

<div class="grid gap-6 lg:grid-cols-3">
	<div class="lg:col-span-2">
		<Panel title="Your students" icon={IconAccountMultiple}>
			{#if data.students.length === 0}
				<p class="px-4 py-5 text-sm text-gray-400">Nobody is in training with you right now.</p>
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
							{@render report(student.enrollmentId)}
							{#if student.canComplete && student.next.length === 1}
								{@const leadsTo =
									student.next[0] === 'rating-exam'
										? 'This dates the card and moves it to Rating Exam, where an examiner takes it.'
										: 'This dates the card, applies the certification and sends it to the TA to audit.'}
								{@render step(
									'completeTraining',
									student.enrollmentId,
									'Mark training complete',
									`Mark training complete for ${student.name}?\n\n${leadsTo}`
								)}
							{:else if student.canComplete}
								<!-- The teacher's call: this training may or may not need examining. -->
								<div class="flex flex-wrap gap-2">
									{@render step(
										'completeTraining',
										student.enrollmentId,
										'Training complete: needs a rating exam',
										`Mark training complete for ${student.name}, with a rating exam to follow?\n\nThis dates the card and moves it to Rating Exam, where an examiner takes it.`,
										'primary',
										'rating-exam'
									)}
									{@render step(
										'completeTraining',
										student.enrollmentId,
										'Training complete: no exam',
										`Mark training complete for ${student.name}, with no rating exam?\n\nThis dates the card and sends it to the TA to audit.`,
										'secondary',
										'certification-update'
									)}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</Panel>

		{#if data.evaluates || data.exams.length > 0}
			<div class="mt-6">
				<Panel title="Rating Exams" icon={IconCertificate}>
					{#if data.exams.length === 0}
						<p class="px-4 py-5 text-sm text-gray-400">
							Nobody is waiting on a rating exam for a course you evaluate.
						</p>
					{:else}
						<ul class="divide-y divide-slate-700/60">
							{#each data.exams as exam (exam.enrollmentId)}
								<li class="px-4 py-3">
									<div class="flex flex-wrap items-center gap-2">
										<span class="text-sm font-medium text-white">{exam.name}</span>
										<span class="font-mono text-xs text-gray-500">{exam.cid}</span>
										<Badge size="sm" color="sky" label={exam.course} />
										{#if exam.issueUrl}
											<a
												href={exam.issueUrl}
												target="_blank"
												rel="noopener noreferrer"
												class="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
											>
												{exam.issueKey}
												<IconOpen class="h-3 w-3" />
											</a>
										{/if}
									</div>
									<p class="mt-1 text-xs text-gray-400">
										Taught by <span class="font-mono">{exam.taughtBy ?? '—'}</span> ·
										{#if exam.canComplete}
											you are the examiner
										{:else if exam.examiner}
											examiner <span class="font-mono">{exam.examiner}</span>
										{:else}
											no examiner yet
										{/if}
									</p>
									{#if exam.availability}
										<p class="mt-1 text-xs whitespace-pre-line text-gray-400">
											{exam.availability}
										</p>
									{/if}
									{#if exam.canComplete || exam.taughtByYou}
										{@render report(exam.enrollmentId)}
									{/if}
									{#if exam.taughtByYou}
										<!-- Not a form: the same button, greyed out, so it is plain the
										     exam exists and why this teacher cannot take it. -->
										<div class="mt-3 flex flex-wrap items-center gap-3">
											<Button
												type="button"
												size="sm"
												disabled
												title="Another evaluator examines the students you taught."
											>
												Claim this exam
											</Button>
											<span class="text-xs text-gray-400">Your student</span>
										</div>
									{:else if exam.canClaim}
										{@render step(
											'claimExam',
											exam.enrollmentId,
											'Claim this exam',
											`Claim the rating exam for ${exam.name}?\n\nYou go on the card as its examiner, and arrange the exam with them directly.`
										)}
									{:else if exam.canComplete}
										<div class="flex flex-wrap gap-2">
											{@render step(
												'completeExam',
												exam.enrollmentId,
												'Passed: mark exam complete',
												`Mark the rating exam passed for ${exam.name}?\n\nThis dates the card, applies the certification and sends it to the TA to audit.`
											)}
											{@render step(
												'failExam',
												exam.enrollmentId,
												'Not passed',
												`Record that ${exam.name} did not pass the rating exam?\n\nThe card moves to Needs CATP and its Training Completed date is cleared. The TA decides what further training they get.`,
												'secondary'
											)}
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Panel>
			</div>
		{/if}
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
						{data.slots.used}
						{#if data.slots.total !== null}
							<span class="text-gray-500">of {data.slots.total}</span>
						{/if}
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
