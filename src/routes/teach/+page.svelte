<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ChoiceCard from '$lib/components/ui/ChoiceCard.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { advancedTo, chosenStep, courseTraining } from '$lib/mark-training-complete';
	import type { SubmitFunction } from '@sveltejs/kit';
	import EnrollmentStatusBadge from '$lib/components/enrollment/EnrollmentStatusBadge.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import TeacherStatusBadge from '$lib/components/teachers/TeacherStatusBadge.svelte';
	import { vatusaEvaluationUrl } from '$lib/config';
	import { QUALIFICATION_LEVEL_LABELS } from '$lib/teachers';
	import { notificationLabel } from '$lib/enrollment-status';
	import IconAccountMultiple from '~icons/mdi/account-multiple-check';
	import IconCalendarClock from '~icons/mdi/calendar-clock';
	import IconSeal from '~icons/mdi/seal';
	import IconPencil from '~icons/mdi/pencil';
	import IconOpen from '~icons/mdi/open-in-new';
	import IconCertificate from '~icons/mdi/certificate';
	import IconCheck from '~icons/mdi/check-circle';
	import IconClipboard from '~icons/mdi/clipboard-text-clock';
	import IconBookshelf from '~icons/mdi/bookshelf';
	import TeacherResourceIcon from '$lib/components/teachers/TeacherResourceIcon.svelte';
	import { page } from '$app/state';

	let { data, form } = $props();

	/** The request a step is running for, so only its button shows as busy. */
	let busyId = $state<string | null>(null);

	/** The one confirmation open, as `action:id`. */
	let openFor = $state<string | null>(null);
	/** Custom Training's radio in each open "Mark training complete?", by request. */
	let chosen = $state<Record<string, string | null>>({});

	/** Open one step's dialog. Its choice starts afresh each time. */
	function ask(action: string, id: string) {
		chosen[id] = null;
		openFor = `${action}:${id}`;
	}

	/**
	 * Each step moves a card on the staff board, and none can be undone from
	 * here, so it is posted only from its dialog. Only its own button shows as busy.
	 */
	const step =
		(id: string): SubmitFunction =>
		() => {
			busyId = id;
			return async ({ update }) => {
				await update();
				// A refused step can still have changed what is on the card — someone
				// else took the exam first — and `update()` only reloads on success.
				await invalidateAll();
				busyId = null;
			};
		};

	/** Set by the report form when it sends someone back here: VATUSA's record number. */
	const reported = $derived(page.url.searchParams.get('reported'));
	/** Whether that report was also meant to move the card, and did. */
	const card = $derived(page.url.searchParams.get('card'));
	/** The student an examiner has just reported on: their VATUSA evaluation form comes next. */
	const evaluate = $derived.by(() => {
		const cid = page.url.searchParams.get('evaluate');
		return cid && /^\d+$/.test(cid) ? cid : null;
	});
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
		Your own enrollment is assigned to you. You cannot teach yourself — ask training staff to assign
		another teacher.
	</Alert>
{/if}

{#if reported !== null && !form}
	<p class="mb-6 flex items-center gap-2 text-sm text-green-400">
		<IconCheck class="h-4 w-4" />
		Training report filed with VATUSA{reported ? ` (record ${reported})` : ''}{card === 'moved'
			? ", and the student's enrollment was updated"
			: ''}.
	</p>
	{#if card === 'stuck'}
		<Alert tone="warning" class="mb-6">
			The report is filed, but the student's enrollment was not updated. Report this to the training
			admin; do not file the report again.
		</Alert>
	{/if}
	{#if evaluate}
		<div class="mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-300">
			<span>
				Next, fill in the evaluation on VATUSA, and submit the promotion there if they passed.
			</span>
			<Button
				href={vatusaEvaluationUrl(evaluate)}
				target="_blank"
				rel="noopener noreferrer"
				size="sm"
			>
				VATUSA evaluation form
				<IconOpen class="h-4 w-4" />
			</Button>
		</div>
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

<!-- Opens the CTRS form for one student, with who they are already filled in. -->
{#snippet report(id: string, className = 'mt-3')}
	<Button href="/teach/report/{id}" size="sm" variant="secondary" class={className}>
		<IconClipboard class="h-4 w-4" />
		File training report
	</Button>
{/snippet}

<!-- The button that opens a step's dialog; the dialog posts the form. -->
{#snippet opens(action: string, id: string, label: string)}
	<Button type="button" size="sm" disabled={busyId !== null} onclick={() => ask(action, id)}>
		{busyId === id ? 'Working…' : label}
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
							</div>
							{#if student.availability}
								<p class="mt-1 text-xs whitespace-pre-line text-gray-400">
									{student.availability}
								</p>
							{/if}
							{#if student.notificationPreference}
								<p class="mt-1 text-xs text-gray-400">
									Preferred contact: {notificationLabel(student.notificationPreference)}
									{#if student.contactEmail}
										·
										<a href="mailto:{student.contactEmail}" class="text-sky-400 hover:text-sky-300">
											{student.contactEmail}
										</a>
									{/if}
								</p>
							{/if}
							<div class="mt-3 flex flex-wrap items-center gap-2">
								{@render report(student.enrollmentId, '')}
								{#if student.canComplete}
									{@const id = student.enrollmentId}
									{@const next = chosenStep(student.next, chosen[id] ?? null)}
									<form method="POST" action="?/completeTraining" use:enhance={step(id)}>
										<input type="hidden" name="id" value={id} />
										{@render opens('completeTraining', id, 'Mark training complete')}
										<ConfirmDialog
											bind:open={
												() => openFor === `completeTraining:${id}`,
												(value) => (openFor = value ? `completeTraining:${id}` : null)
											}
											title="Mark training complete?"
											confirmLabel="Mark complete"
											ready={next !== null}
										>
											<p>
												{student.name}'s {courseTraining(student.course)} will be marked complete, and
												the enrollment advanced to {advancedTo(next)}.
												<strong class="text-white">No training report is filed.</strong>
												If you haven't filed one yet do that first.
											</p>
											{#if student.next.length > 1}
												<fieldset
													class="space-y-2"
													onchange={(event) =>
														(chosen[id] = (event.target as HTMLInputElement).value)}
												>
													<ChoiceCard type="radio" name="next" value="rating-exam" compact>
														Rating exam required
													</ChoiceCard>
													<ChoiceCard type="radio" name="next" value="certification-update" compact>
														No rating exam required
													</ChoiceCard>
												</fieldset>
											{/if}
										</ConfirmDialog>
									</form>
								{/if}
							</div>
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
									{#if exam.canComplete}
										{@render report(exam.enrollmentId)}
									{/if}
									{#if exam.canComplete}
										<Button
											href={vatusaEvaluationUrl(exam.cid)}
											target="_blank"
											rel="noopener noreferrer"
											size="sm"
											variant="secondary"
											class="mt-3"
										>
											VATUSA evaluation form
											<IconOpen class="h-4 w-4" />
										</Button>
									{/if}
									{#if exam.canClaim}
										{@const id = exam.enrollmentId}
										<form method="POST" action="?/claimExam" class="mt-3" use:enhance={step(id)}>
											<input type="hidden" name="id" value={id} />
											{@render opens('claimExam', id, 'Claim this exam')}
											<ConfirmDialog
												bind:open={
													() => openFor === `claimExam:${id}`,
													(value) => (openFor = value ? `claimExam:${id}` : null)
												}
												title="Claim the rating exam for {exam.name}?"
												confirmLabel="Claim this exam"
											>
												<p>You become their examiner, and arrange the exam with them directly.</p>
											</ConfirmDialog>
										</form>
									{:else if exam.canComplete}
										<p class="mt-3 text-xs text-gray-400">
											File the training report with the result. Then fill in the evaluation on
											VATUSA.
										</p>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Panel>
			</div>
		{/if}

		<!-- Kept by the Training Admin in the CMS; not shown when there are none or the CMS is down. -->
		<!-- Streamed: drawn when the read finishes, so the rest of the page never waits on the CMS. -->
		{#await data.resources then resources}
			{#if resources.length > 0}
				<div class="mt-6">
					<Panel title="Teacher resources" icon={IconBookshelf}>
						<ul class="divide-y divide-slate-700/60">
							{#each resources as resource}
								<li class="flex gap-3 px-4 py-3">
									<TeacherResourceIcon
										name={resource.icon}
										class="mt-0.5 h-5 w-5 shrink-0 text-sky-400"
									/>
									<div class="min-w-0">
										<a
											href={resource.url}
											target={resource.newTab ? '_blank' : undefined}
											rel={resource.newTab ? 'noopener noreferrer' : undefined}
											class="inline-flex items-center gap-1 text-sm font-medium text-sky-400 hover:text-sky-300"
										>
											{resource.title}
											{#if resource.newTab}
												<IconOpen class="h-3.5 w-3.5 opacity-60" />
											{/if}
										</a>
										<!-- Admin-supplied plain text: always as text, never {@html} (decisions/0036). -->
										{#if resource.description}
											<!-- One line: pre-line keeps the CMS's line breaks, and would draw any Prettier adds. -->
											<!-- prettier-ignore -->
											<p class="mt-0.5 text-xs whitespace-pre-line text-gray-400">{resource.description}</p>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					</Panel>
				</div>
			{/if}
		{/await}
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
						<span class="font-mono text-gray-300">
							{qualification.code}
							<span class="font-sans text-xs text-gray-500">({qualification.name})</span>
						</span>
						<span
							class="shrink-0 text-right {qualification.level ? 'text-white' : 'text-gray-500'}"
						>
							{QUALIFICATION_LEVEL_LABELS[qualification.level ?? 'none']}
						</span>
					</li>
				{/each}
			</ul>
		</Panel>
	</div>
</div>
