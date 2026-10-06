<script lang="ts">
	import ActionForm from '$lib/components/forms/ActionForm.svelte';
	import TeacherSelect from '$lib/components/teachers/TeacherSelect.svelte';
	import type { WaitlistRow } from '$lib/waitlist';

	/**
	 * A student's teacher: the one they have, with a way to change it; or, on the
	 * waitlist, a way to give them one — once the VATUSA course allows it.
	 */
	let { row, busy = $bindable(null) }: { row: WaitlistRow; busy?: string | null } = $props();
</script>

{#if row.status !== 'waitlist'}
	<!-- Already has one: show who, and let it be changed. -->
	<ActionForm
		action="changeTeacher"
		label="Change"
		variant="secondary"
		class="flex flex-wrap items-center gap-2"
		fields={{ id: row.id }}
		question={`Change ${row.name}'s teacher?\n\nOnly the Teacher on the card changes. They stay where they are in the course.`}
		bind:busy
	>
		<TeacherSelect
			teachers={row.teachers}
			current={row.teacherCid}
			currentLabel={row.teacher ?? 'No teacher'}
		/>
	</ActionForm>
	{#if row.examiner}
		<p class="mt-1 text-gray-500">Examiner: {row.examiner}</p>
	{/if}
{:else if !row.gate.open}
	<span class="text-gray-500">
		{row.gate.reason === 'not-assigned'
			? 'After the VATUSA course'
			: 'Once the VATUSA course is passed'}
	</span>
{:else if row.teachers.length === 0}
	<span class="text-orange-300">No active teacher is qualified for this course</span>
{:else}
	<ActionForm
		action="assignTeacher"
		label="Assign"
		class="flex flex-wrap items-center gap-2"
		fields={{ id: row.id }}
		bind:busy
	>
		<TeacherSelect teachers={row.teachers} />
	</ActionForm>
{/if}
