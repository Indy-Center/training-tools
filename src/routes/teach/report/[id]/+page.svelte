<script lang="ts">
	import { enhance } from '$app/forms';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EnrollmentStatusBadge from '$lib/components/enrollment/EnrollmentStatusBadge.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import { MAX_NOTES_LENGTH, SESSION_LOCATIONS } from '$lib/ctrs';
	import IconArrowLeft from '~icons/mdi/arrow-left';
	import IconCheck from '~icons/mdi/check-circle';
	import IconClipboard from '~icons/mdi/clipboard-text-clock';

	let { data, form } = $props();

	/** What was typed, after a refusal; otherwise a fresh form for this student. */
	const values = $derived(form?.values ?? data.blank);

	let sending = $state(false);

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
	<p class="mt-1 text-sm text-gray-400">
		Filed in VATUSA's training records (CTRS) for the student, in your name.
	</p>
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
		use:enhance={() => {
			sending = true;
			return async ({ update }) => {
				// Never cleared: a refused report is corrected, not retyped.
				await update({ reset: false });
				sending = false;
			};
		}}
	>
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
				<dt class="text-gray-400">Instructor</dt>
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

		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
				<label for="otsStatus" class={labelClasses}>Rating exam</label>
				<select id="otsStatus" name="otsStatus" required class="mt-2 {inputClasses}">
					{#each data.otsChoices as choice (choice.value)}
						<option value={choice.value} selected={String(choice.value) === values.otsStatus}>
							{choice.label}
						</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="score" class={labelClasses}>Score</label>
				<select id="score" name="score" class="mt-2 {inputClasses}">
					<option value="" selected={values.score === ''}>Not scored</option>
					{#each ['1', '2', '3', '4', '5'] as score (score)}
						<option value={score} selected={values.score === score}>{score}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="movements" class={labelClasses}>Movements</label>
				<input
					id="movements"
					name="movements"
					type="number"
					min="0"
					step="1"
					placeholder="Optional"
					value={values.movements}
					class="mt-2 {inputClasses}"
				/>
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
				placeholder="What was covered, how it went, and what to work on next."
				class="mt-2 {inputClasses}">{values.notes}</textarea
			>
			<p class="mt-1 text-xs text-gray-500">The student can read this on VATUSA.</p>
		</div>

		<label class="flex items-center gap-2 text-sm text-gray-300">
			<input
				type="checkbox"
				name="soloGranted"
				checked={values.soloGranted}
				class="rounded border-slate-600 bg-slate-900 text-sky-600 focus:ring-sky-500/50"
			/>
			A solo certification was granted in this session
		</label>

		<div class="flex flex-wrap items-center gap-3 border-t border-slate-700/60 pt-5">
			<Button type="submit" disabled={sending || !data.keySet}>
				{sending ? 'Sending…' : data.mode === 'test' ? 'Check with VATUSA' : 'File report'}
			</Button>
			<Button href="/teach" variant="secondary">Cancel</Button>
			<span class="text-xs text-gray-500">
				This does not move the student's card. Mark training or an exam complete from Teach.
			</span>
		</div>
	</form>
</Panel>
