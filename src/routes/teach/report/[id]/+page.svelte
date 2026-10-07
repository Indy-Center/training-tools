<script lang="ts">
	import { enhance } from '$app/forms';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ChoiceCard from '$lib/components/ui/ChoiceCard.svelte';
	import EnrollmentStatusBadge from '$lib/components/enrollment/EnrollmentStatusBadge.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import {
		EXAM_RESULT_DETAILS,
		FINISH_LABELS,
		MAX_NOTES_LENGTH,
		SESSION_LOCATIONS,
		type ReportValues
	} from '$lib/ctrs';
	import { formatDateTime } from '$lib/format';
	import { page } from '$app/state';
	import IconArrowLeft from '~icons/mdi/arrow-left';
	import IconCheck from '~icons/mdi/check-circle';
	import IconClipboard from '~icons/mdi/clipboard-text-clock';

	let { data, form } = $props();

	/**
	 * A report is written over a session that can run for hours, so what has been
	 * typed is kept in this browser until it is filed: a refresh, a closed tab or
	 * an expired sign-in does not lose it. One draft per student's request.
	 *
	 * The choices that move the card — the last-session tick and the exam result —
	 * are deliberately not kept: those are made at the end, looking at the form.
	 */
	const DRAFT_FIELDS = [
		'date',
		'time',
		'duration',
		'position',
		'location',
		'score',
		'notes'
	] as const;
	type Draft = Pick<ReportValues, (typeof DRAFT_FIELDS)[number]>;
	const draftKey = $derived(`training-report:${page.params.id}`);

	let draft = $state<{ values: Draft; savedAt: number } | null>(null);

	// Browser storage can be unavailable or full; a draft is a convenience, so
	// every use of it fails quietly.
	$effect(() => {
		try {
			const stored = JSON.parse(localStorage.getItem(draftKey) ?? 'null');
			if (stored?.values && typeof stored.savedAt === 'number') draft = stored;
		} catch {
			draft = null;
		}
	});

	function saveDraft(formElement: HTMLFormElement) {
		const fields = new FormData(formElement);
		const kept = Object.fromEntries(
			DRAFT_FIELDS.map((field) => [field, String(fields.get(field) ?? '')])
		);
		try {
			localStorage.setItem(draftKey, JSON.stringify({ values: kept, savedAt: Date.now() }));
		} catch {
			// Nothing to do: the form still works without it.
		}
	}

	function clearDraft() {
		draft = null;
		try {
			localStorage.removeItem(draftKey);
		} catch {
			// As above.
		}
	}

	/** What was typed, after a refusal; else an unsent draft; else a fresh form. */
	const values = $derived<ReportValues>(
		form?.values ?? (draft ? { ...data.blank, ...draft.values } : data.blank)
	);

	let sending = $state(false);

	/** Which ending is ticked, if any: it moves the card, so sending asks first. */
	let finish = $state('');
	$effect(() => {
		finish = values.finish;
	});

	/** The examiner's result, if one is chosen: it moves the card too. */
	let otsStatus = $state('0');
	$effect(() => {
		otsStatus = values.otsStatus || '0';
	});
	/** Short, for the cards; `OTS_STATUSES` has the long form VATUSA's record uses. */
	const EXAM_RESULT_LABELS: Record<number, string> = {
		0: 'Not an exam',
		1: 'Passed',
		2: 'Not passed'
	};
	const examResult = $derived(
		otsStatus === '1' ? 'passed' : otsStatus === '2' ? 'not-passed' : null
	);

	const inputClasses =
		'w-full rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-sky-500 focus:ring-sky-500/50';
	const labelClasses = 'block text-sm font-medium text-gray-300';
</script>

<svelte:head>
	<title>Indy Center | Training report for {data.student.name}</title>
</svelte:head>

<a
	href="/teach"
	class="mb-4 inline-flex items-center gap-1 text-sm text-sky-400 hover:text-sky-300"
>
	<IconArrowLeft class="h-4 w-4" />
	Teach
</a>

<div class="mb-8">
	<h1 class="text-3xl font-bold text-white">Training report</h1>
	<p class="mt-1 text-sm text-gray-400">Filed in VATUSA's training records (CTRS)</p>
</div>

{#if !data.keySet}
	<Alert tone="warning" class="mb-6">
		No VATUSA API key is set, so a report cannot be filed from here yet.
	</Alert>
{:else if data.mode === 'test'}
	<Alert tone="warning" class="mb-6">
		Test mode: VATUSA checks the report and says whether it would take it, but nothing is saved.
	</Alert>
{/if}

{#if form?.errors}
	<Alert class="mb-6">
		<ul>
			{#each form.errors as problem (problem)}
				<li>{problem}</li>
			{/each}
		</ul>
	</Alert>
{:else if form?.tested}
	<p class="mb-6 flex items-center gap-2 text-sm text-green-400">
		<IconCheck class="h-4 w-4" />
		VATUSA would accept this report. Nothing was saved.
	</p>
{/if}

<Panel title="Session" icon={IconClipboard}>
	<form
		method="POST"
		action="?/submit"
		class="space-y-5 px-4 py-5"
		use:enhance={({ cancel }) => {
			if (
				finish &&
				data.mode === 'live' &&
				!confirm(
					`File this report and ${finish === 'rating-exam' ? 'recommend' : 'complete the course for'} ${data.student.name}${finish === 'rating-exam' ? ' for a rating exam' : ''}?\n\nThis cannot be undone.`
				)
			) {
				return cancel();
			}
			if (
				examResult &&
				data.mode === 'live' &&
				!confirm(
					`File this report with the rating exam ${examResult === 'passed' ? 'passed' : 'not passed'} for ${data.student.name}?\n\n${EXAM_RESULT_DETAILS[examResult]}\n\nThis cannot be undone.`
				)
			) {
				return cancel();
			}
			sending = true;
			return async ({ result, update }) => {
				// Filed: the redirect back to /teach is the only success.
				if (result.type === 'redirect') clearDraft();
				// Never cleared: a refused report is corrected, not retyped.
				await update({ reset: false });
				sending = false;
			};
		}}
		oninput={(event) => saveDraft(event.currentTarget)}
	>
		{#if draft && !form}
			<p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
				<span>Picked up where you left off (saved {formatDateTime(draft.savedAt)}).</span>
				<button type="button" class="text-sky-400 hover:text-sky-300" onclick={clearDraft}>
					Start over
				</button>
			</p>
		{/if}
		<!-- Who it is about and who is filing it: fixed, and decided by the server. -->
		<dl class="grid gap-4 text-sm sm:grid-cols-2">
			<div>
				<dt class="text-gray-400">Student</dt>
				<dd class="mt-1 flex flex-wrap items-center gap-2 text-white">
					{data.student.name}
					<span class="font-mono text-xs text-gray-500">{data.student.cid}</span>
					<Badge size="sm" color="sky" label={data.student.course} />
					<EnrollmentStatusBadge status={data.student.status} />
				</dd>
			</div>
			<div>
				<dt class="text-gray-400">Filed by</dt>
				<dd class="mt-1 text-white">
					{data.instructor.name}
					<span class="font-mono text-xs text-gray-500">{data.instructor.cid}</span>
				</dd>
			</div>
		</dl>

		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div>
				<label for="date" class={labelClasses}>Date</label>
				<input
					id="date"
					name="date"
					type="date"
					required
					value={values.date}
					class="mt-2 {inputClasses}"
				/>
			</div>
			<div>
				<label for="time" class={labelClasses}>Started (Zulu)</label>
				<input
					id="time"
					name="time"
					type="time"
					required
					value={values.time}
					class="mt-2 {inputClasses}"
				/>
			</div>
			<div>
				<label for="duration" class={labelClasses}>Duration (HH:MM)</label>
				<input
					id="duration"
					name="duration"
					required
					inputmode="numeric"
					pattern="[0-9]{'{1,2}'}:[0-9]{'{2}'}"
					placeholder="01:00"
					value={values.duration}
					class="mt-2 font-mono {inputClasses}"
				/>
			</div>
			<div>
				<label for="position" class={labelClasses}>Position</label>
				<input
					id="position"
					name="position"
					required
					placeholder="IND_GND"
					value={values.position}
					class="mt-2 font-mono uppercase {inputClasses}"
				/>
			</div>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<div>
				<label for="location" class={labelClasses}>Where</label>
				<select id="location" name="location" required class="mt-2 {inputClasses}">
					{#each SESSION_LOCATIONS as choice (choice.value)}
						<option value={choice.value} selected={String(choice.value) === values.location}>
							{choice.label}
						</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="score" class={labelClasses}>Progress</label>
				<select id="score" name="score" class="mt-2 {inputClasses}">
					<option value="" selected={values.score === ''}>Not given</option>
					{#each ['1', '2', '3', '4', '5'] as score (score)}
						<option value={score} selected={values.score === score}>{score}</option>
					{/each}
				</select>
			</div>
		</div>

		<div>
			<label for="notes" class={labelClasses}>Notes</label>
			<textarea
				id="notes"
				name="notes"
				required
				rows="10"
				maxlength={MAX_NOTES_LENGTH}
				placeholder="What was covered and how it went."
				class="mt-2 {inputClasses}">{values.notes}</textarea
			>
			<p class="mt-1 text-xs text-gray-500">
				Please describe all areas you gave training on. The students have access to these notes.
			</p>
		</div>

		{#if data.otsChoices.length > 1}
			<!-- Only the examiner has a result to give, and giving one moves the card. -->
			<fieldset
				class="rounded-lg border border-slate-700/60 px-4 py-3"
				onchange={(event) => {
					if (event.target instanceof HTMLInputElement) otsStatus = event.target.value;
				}}
			>
				<legend class="px-1 text-sm font-medium text-gray-300">Rating exam result</legend>
				<div class="grid gap-3 sm:grid-cols-3">
					{#each data.otsChoices as choice (choice.value)}
						<ChoiceCard
							type="radio"
							name="otsStatus"
							value={String(choice.value)}
							checked={String(choice.value) === otsStatus}
							required
							align="start"
						>
							<span class="text-sm text-white">{EXAM_RESULT_LABELS[choice.value]}</span>
						</ChoiceCard>
					{/each}
				</div>
				<p class="mt-3 text-xs text-gray-400">
					{examResult
						? EXAM_RESULT_DETAILS[examResult]
						: 'An ordinary session: their enrollment does not change.'}
				</p>
				{#if data.mode === 'test'}
					<p class="mt-1 text-xs text-orange-300">
						In test mode the enrollment is not updated either.
					</p>
				{/if}
			</fieldset>
		{/if}

		{#if data.finishChoices.length > 0}
			<!-- Ends the training with this report. One box for a standard course;
			     Custom Training has both endings, and a box each, only one of which holds. -->
			<fieldset class="space-y-3 rounded-lg border border-slate-700/60 px-4 py-3">
				<legend class="px-1 text-sm font-medium text-gray-300">This was their last session</legend>
				{#each data.finishChoices as choice (choice)}
					<label class="flex items-start gap-3 text-sm text-gray-300">
						<input
							type="checkbox"
							name="finish"
							value={choice}
							checked={finish === choice}
							onchange={(event) => (finish = event.currentTarget.checked ? choice : '')}
							class="mt-0.5 rounded border-slate-600 bg-slate-900 text-sky-600 focus:ring-sky-500/50"
						/>
						<span>
							<span class="text-white">{FINISH_LABELS[choice].label}</span>
							<span class="block text-xs text-gray-400"
								>{FINISH_LABELS[choice].detail(data.student.course)}</span
							>
						</span>
					</label>
				{/each}
				{#if data.mode === 'test'}
					<p class="text-xs text-orange-300">In test mode the enrollment is not updated either.</p>
				{/if}
			</fieldset>
		{/if}

		<div class="flex flex-wrap items-center gap-3 border-t border-slate-700/60 pt-5">
			<Button type="submit" disabled={sending || !data.keySet}>
				{sending ? 'Sending…' : data.mode === 'test' ? 'Check with VATUSA' : 'File report'}
			</Button>
			<Button href="/teach" variant="secondary">Cancel</Button>
			{#if data.finishChoices.length === 0 && !examResult}
				<span class="text-xs text-gray-500">This does not change the student's enrollment.</span>
			{/if}
		</div>
	</form>
</Panel>
