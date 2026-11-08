<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { CARD_DATE_FIELDS, type Card, type StageChoice } from '$lib/card-page';
	import { holdWarning } from '$lib/course-completion';

	type Props = {
		course: string;
		card: Pick<Card, 'status' | 'reInstructor' | 'dates'>;
		/** The card's stage and each move Jira offers it, Completed left out. */
		stages: StageChoice[];
		/** RE Instructor's options (Jira's select options). */
		examiners: { id: string; value: string }[];
	};

	let { course, card, stages, examiners }: Props = $props();

	// The form starts from the card; the page re-creates it when the card is read again.
	const initial = () => ({
		stage: card.status ?? '',
		examiner: card.reInstructor ?? '',
		trainingCompleted: card.dates.trainingCompleted ?? '',
		reCompleted: card.dates.reCompleted ?? '',
		reFailed: card.dates.reFailed ?? ''
	});
	let values = $state(initial());
	let busy = $state(false);

	// An examiner Jira no longer lists stays choosable, so a save leaves it alone.
	const examinerChoices = $derived(
		card.reInstructor &&
			!examiners.some((option) => option.value.toLowerCase() === card.reInstructor!.toLowerCase())
			? [{ id: '', value: card.reInstructor }, ...examiners]
			: examiners
	);

	const warning = $derived(
		stages.find((choice) => choice.name === values.stage)?.audit
			? holdWarning(course, {
					trainingCompleted: values.trainingCompleted || null,
					reFailed: values.reFailed || null,
					reCompleted: values.reCompleted || null,
					reInstructor: values.examiner || null
				})
			: null
	);

	const inputClasses =
		'w-full rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-sky-500 focus:ring-sky-500/50';
	const labelClasses = 'block text-sm font-medium text-gray-300';
</script>

<form
	method="POST"
	action="?/edit"
	class="space-y-4 px-4 py-4"
	use:enhance={() => {
		busy = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			// A move Jira refused may still have saved the fields: show the card as it is now.
			if (result.type === 'failure' && result.status === 409) await invalidateAll();
			busy = false;
		};
	}}
>
	<div class="grid gap-4 sm:grid-cols-2">
		<div>
			<label for="edit-stage" class={labelClasses}>Stage</label>
			<select id="edit-stage" name="stage" bind:value={values.stage} class="mt-2 {inputClasses}">
				{#each stages as choice (choice.name)}
					<option value={choice.name}>{choice.name}</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="edit-examiner" class={labelClasses}>RE Instructor</label>
			<select
				id="edit-examiner"
				name="examiner"
				bind:value={values.examiner}
				class="mt-2 font-mono {inputClasses}"
			>
				<option value="">None</option>
				{#each examinerChoices as option (option.value)}
					<option value={option.value}>{option.value}</option>
				{/each}
			</select>
		</div>
		{#each CARD_DATE_FIELDS as { key, label } (key)}
			<div>
				<label for="edit-{key}" class={labelClasses}>{label}</label>
				{#if key === 'trainingCompleted' || key === 'reCompleted' || key === 'reFailed'}
					<input
						id="edit-{key}"
						name={key}
						type="date"
						bind:value={values[key]}
						class="mt-2 {inputClasses}"
					/>
				{:else}
					<input
						id="edit-{key}"
						name={key}
						type="date"
						value={card.dates[key] ?? ''}
						class="mt-2 {inputClasses}"
					/>
				{/if}
			</div>
		{/each}
	</div>

	{#if warning}
		<Alert tone="warning">{warning}</Alert>
	{/if}

	<div class="flex justify-end">
		<Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
	</div>
</form>
