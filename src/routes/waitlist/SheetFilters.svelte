<script lang="ts">
	import FilterChip from '$lib/components/ui/FilterChip.svelte';
	import { STATUS_LABELS } from '$lib/enrollment-status';
	import {
		countByStatus,
		SHEET_STATUSES,
		type StatusFilter,
		type WaitlistRow
	} from '$lib/waitlist';
	import IconChevronDown from '~icons/mdi/chevron-down';

	/**
	 * The sheet's filters: a chip per status, on until clicked off, and a course
	 * to narrow to. The counts are of everything, not of what is showing, so a
	 * status that is off still says how many it is hiding.
	 */
	let {
		rows,
		statuses = $bindable(),
		course = $bindable()
	}: {
		/** Every row, before filtering. */
		rows: WaitlistRow[];
		statuses: StatusFilter;
		/** A course code, or empty for all of them. */
		course: string;
	} = $props();

	const counts = $derived(countByStatus(rows));
	const courses = $derived([...new Set(rows.map((row) => row.course))]);
</script>

<div class="flex flex-wrap items-center gap-2 border-b border-slate-700/60 px-4 py-3 text-sm">
	{#each SHEET_STATUSES as status (status)}
		<FilterChip
			bind:pressed={statuses[status]}
			label={STATUS_LABELS[status]}
			count={counts[status]}
		/>
	{/each}

	<span class="ml-auto flex items-center gap-2">
		<label for="sheet-course" class="text-gray-400">Course</label>
		<!-- Our own arrow: the browser's is all but invisible on the dark background. -->
		<span class="relative">
			<select
				id="sheet-course"
				bind:value={course}
				class="cursor-pointer appearance-none rounded-lg border border-slate-600 bg-slate-800 py-1.5 pr-9 pl-3 text-sm text-white transition-colors hover:border-slate-500 focus:ring-2 focus:ring-sky-500 focus:outline-none"
			>
				<option value="">All courses</option>
				{#each courses as code (code)}
					<option value={code}>{code}</option>
				{/each}
			</select>
			<IconChevronDown
				class="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-gray-300"
			/>
		</span>
	</span>
</div>
