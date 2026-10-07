<script lang="ts">
	import ActionForm from '$lib/components/forms/ActionForm.svelte';
	import TeacherSelect from '$lib/components/teachers/TeacherSelect.svelte';
	import type { WaitlistRow } from '$lib/waitlist';
	import RowMenu from './RowMenu.svelte';

	/**
	 * A student's teacher, and what staff can do with the request.
	 *
	 * The main button is the usual next step — give them a teacher, or change the
	 * one they have. Withdraw and Remove are behind the arrow beside it. Where
	 * there is no teacher to choose yet, the arrow stands alone as "Actions".
	 */
	let {
		row,
		courseName,
		busy = $bindable(null)
	}: {
		row: WaitlistRow;
		/** The course's name, for the wording of the confirmations. */
		courseName: string;
		busy?: string | null;
	} = $props();
</script>

{#if row.status !== 'waitlist'}
	<!-- Already has one: show who, and let it be changed. -->
	<div class="flex flex-wrap items-center">
		<ActionForm
			action="changeTeacher"
			label="Change"
			variant="secondary"
			split
			class="flex flex-wrap items-center gap-2"
			fields={{ id: row.id }}
			question={`Change ${row.name}'s teacher?`}
			bind:busy
		>
			<TeacherSelect
				teachers={row.teachers}
				current={row.teacherCid}
				currentLabel={row.teacher ?? 'No teacher'}
			/>
		</ActionForm>
		<RowMenu {row} {courseName} attached bind:busy />
	</div>
	{#if row.examiner}
		<p class="mt-1 text-gray-500">Examiner: {row.examiner}</p>
	{/if}
{:else if row.gate.open && row.teachers.length > 0}
	<div class="flex flex-wrap items-center">
		<ActionForm
			action="assignTeacher"
			label="Assign"
			split
			class="flex flex-wrap items-center gap-2"
			fields={{ id: row.id }}
			bind:busy
		>
			<TeacherSelect teachers={row.teachers} />
		</ActionForm>
		<RowMenu {row} {courseName} attached variant="primary" bind:busy />
	</div>
{:else}
	<!-- Nobody to choose yet: say why, and keep the other actions within reach. -->
	<div class="flex flex-wrap items-center gap-3">
		{#if !row.gate.open}
			<span class="text-gray-500">
				{row.gate.reason === 'not-assigned'
					? 'After the VATUSA course'
					: 'Once the VATUSA course is passed'}
			</span>
		{:else}
			<span class="text-orange-300">No active teacher is qualified for this course</span>
		{/if}
		<RowMenu {row} {courseName} bind:busy />
	</div>
{/if}
