<script lang="ts">
	import { slotsLabel, type TeacherChoice } from '$lib/waitlist';

	/**
	 * A dropdown of teachers a student could be given, each with their open
	 * slots. Posts the chosen teacher's CID as `name`.
	 *
	 * The slots are for choosing between teachers, so the one chosen is listed by
	 * name alone — which is also what the closed dropdown shows on the page.
	 */
	let {
		teachers,
		name = 'teacher',
		current = null,
		currentLabel = null
	}: {
		teachers: TeacherChoice[];
		name?: string;
		/** The CID of the teacher they have now, to start on. Null when they have none. */
		current?: string | null;
		/**
		 * What the board calls their current teacher. Shown, and selected, when that
		 * is not one of `teachers` — `VATUSA`, say, or someone who has since left.
		 */
		currentLabel?: string | null;
	} = $props();

	const known = $derived(teachers.some((teacher) => teacher.cid === current));
	/** The CID picked, starting on their current teacher; empty for none of ours. */
	let chosen = $derived(known ? (current ?? '') : '');
</script>

<select
	{name}
	required
	bind:value={chosen}
	class="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
>
	{#if !known}
		<option value="">{currentLabel ?? 'Choose a teacher'}</option>
	{/if}
	{#each teachers as teacher (teacher.cid)}
		<option value={teacher.cid}>
			{teacher.label}{teacher.cid === chosen ? '' : ` ${slotsLabel(teacher.available)}`}
		</option>
	{/each}
</select>
