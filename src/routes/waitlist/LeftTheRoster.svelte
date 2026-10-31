<script lang="ts">
	import EnrollmentStatusBadge from '$lib/components/enrollment/EnrollmentStatusBadge.svelte';
	import IssueLink from '$lib/components/enrollment/IssueLink.svelte';
	import ActionForm from '$lib/components/forms/ActionForm.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import { STATUS_LABELS } from '$lib/enrollment-status';
	import { formatCardDate } from '$lib/format';
	import type { LeftRosterRow } from '$lib/waitlist';
	import IconAccountArrowRight from '~icons/mdi/account-arrow-right';

	/**
	 * The sheet's **Left the roster** group: every request a roster removal took
	 * off and can still restore, soonest `restore_by` first (the load's order).
	 * Restore now puts it back at once; Close for good ends the window. Not drawn
	 * when nobody is in a window. See decisions/0037-roster-removal-and-restore.md
	 */
	let {
		rows,
		busy = $bindable(null)
	}: {
		rows: LeftRosterRow[];
		/** Shared with every other action on the sheet: see ActionForm. */
		busy?: string | null;
	} = $props();
</script>

{#if rows.length > 0}
	<Panel title="Left the roster: {rows.length}" icon={IconAccountArrowRight}>
		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead class="border-b border-slate-700/60 text-xs text-gray-400 uppercase">
					<tr>
						<th class="px-3 py-3 font-medium">Student</th>
						<th class="px-3 py-3 font-medium">Course</th>
						<th class="px-3 py-3 font-medium">Left from</th>
						<th class="px-3 py-3 font-medium">Teacher</th>
						<th class="px-3 py-3 font-medium">Left home</th>
						<th class="px-3 py-3 font-medium">Restore by</th>
						<th class="px-3 py-3 font-medium"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.id)}
						<tr
							class="border-t border-slate-700/60 align-top transition-colors duration-200 hover:bg-white/5"
						>
							<td class="px-3 py-3">
								<a href="/certifications/{row.cid}" class="text-white hover:text-sky-300">
									{row.name}
								</a>
								<div class="mt-0.5 flex flex-wrap gap-2 font-mono text-xs text-gray-500">
									<span>{row.cid}</span>
									<IssueLink issueKey={row.issueKey} url={row.issueUrl} />
								</div>
							</td>
							<td class="px-3 py-3 text-gray-300">
								{row.courseName}
								<span class="ml-1 font-mono text-xs text-gray-400">{row.course}</span>
							</td>
							<td class="px-3 py-3 whitespace-nowrap">
								<EnrollmentStatusBadge status={row.from} />
							</td>
							<td class="px-3 py-3 text-xs text-gray-300">{row.teacher ?? '—'}</td>
							<td class="px-3 py-3 whitespace-nowrap text-gray-300">
								{formatCardDate(row.leftHomeOn)}
							</td>
							<td class="px-3 py-3 whitespace-nowrap text-gray-300">
								{formatCardDate(row.restoreBy)}
							</td>
							<td class="px-3 py-3">
								<div class="flex flex-wrap items-center gap-2">
									<ActionForm
										action="restoreNow"
										label="Restore now"
										fields={{ id: row.id }}
										question={`Restore ${row.name} to ${STATUS_LABELS[row.from] ?? row.from} now?`}
										bind:busy
									/>
									<ActionForm
										action="closeForGood"
										label="Close for good"
										variant="secondary"
										fields={{ id: row.id }}
										question={`Close ${row.name}'s ${row.courseName} request for good? They would enroll again at the back.`}
										bind:busy
									/>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Panel>
{/if}
