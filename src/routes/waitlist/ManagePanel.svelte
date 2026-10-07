<script lang="ts">
	import ActionResult from '$lib/components/forms/ActionResult.svelte';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import { findCourse } from '$lib/courses';
	import { allStatuses, filterRows, groupByCourse, type WaitlistRow } from '$lib/waitlist';
	import IconTable from '~icons/mdi/table-account';
	import SheetFilters from './SheetFilters.svelte';
	import StudentRow from './StudentRow.svelte';

	/**
	 * Every request staff are still working, as a sheet: filters, then one group
	 * of rows per course.
	 *
	 * Only rendered for someone with `training:students:manage` — and the rows
	 * only ever reach the browser for them, which is the load's job, not this
	 * component's.
	 */
	let {
		rows: all,
		vatusaKeySet,
		form
	}: {
		rows: WaitlistRow[];
		/** Whether VATUSA can be asked to assign a course, or only the card dated. */
		vatusaKeySet: boolean;
		form: { sheetError?: string; sheetDone?: string; sheetNote?: string | null } | null | undefined;
	} = $props();

	/** Which statuses are showing, and which course; everything to begin with. */
	let statuses = $state(allStatuses());
	let course = $state('');

	/** The action form that is working, shared so every button waits for it. */
	let busy = $state<string | null>(null);

	const rows = $derived(filterRows(all, { statuses, course }));
	const groups = $derived(groupByCourse(rows));

	/** Columns in the table, for the course heading that spans them. */
	const COLUMNS = 6;
</script>

<ActionResult error={form?.sheetError} done={form?.sheetDone} note={form?.sheetNote} />

{#if !vatusaKeySet}
	<Alert tone="warning" class="mb-6">
		No VATUSA API key is set, so courses cannot be assigned on VATUSA from here and passes are not
		picked up automatically. The buttons still date the card.
	</Alert>
{/if}

<Panel title="Students: {rows.length} of {all.length} showing" icon={IconTable}>
	<SheetFilters rows={all} bind:statuses bind:course />

	{#if rows.length === 0}
		<p class="px-4 py-5 text-sm text-gray-400">
			{all.length === 0 ? 'Nobody has an open request.' : 'Nothing matches these filters.'}
		</p>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead class="border-b border-slate-700/60 text-xs text-gray-400 uppercase">
					<tr>
						<th class="px-3 py-3 font-medium">Student</th>
						<th class="px-3 py-3 font-medium">Status</th>
						<th class="px-3 py-3 font-medium">Since</th>
						<th class="px-3 py-3 font-medium">Contact</th>
						<th class="px-3 py-3 font-medium">VATUSA course</th>
						<th class="px-3 py-3 font-medium">Teacher</th>
					</tr>
				</thead>

				{#each groups as group (group.code)}
					{@const courseName = findCourse(group.code)?.name ?? group.code}
					<!-- No divide-y: each student draws their own line, so an entry of two rows has one. -->
					<tbody>
						<tr class="bg-slate-800/60">
							<th colspan={COLUMNS} scope="colgroup" class="px-3 py-2 text-left text-sm text-white">
								{courseName}
								<span class="ml-1 font-mono text-xs font-normal text-gray-400">{group.code}</span>
								<span class="ml-2 text-xs font-normal text-gray-400">{group.rows.length}</span>
							</th>
						</tr>

						{#each group.rows as row (row.id)}
							<StudentRow {row} {courseName} {vatusaKeySet} columns={COLUMNS} bind:busy />
						{/each}
					</tbody>
				{/each}
			</table>
		</div>
	{/if}
</Panel>
