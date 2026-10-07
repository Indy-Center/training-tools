<script lang="ts">
	import EnrollmentStatusBadge from '$lib/components/enrollment/EnrollmentStatusBadge.svelte';
	import IssueLink from '$lib/components/enrollment/IssueLink.svelte';
	import { notificationLabel } from '$lib/enrollment-status';
	import { formatDate } from '$lib/format';
	import type { WaitlistRow } from '$lib/waitlist';
	import TeacherCell from './TeacherCell.svelte';
	import VatusaCourseCell from './VatusaCourseCell.svelte';

	/**
	 * One student's request on the sheet: who, where they are, and what can be
	 * done next — and, on a line of its own underneath, when they are available,
	 * which is a sentence or three and would crush the columns beside it.
	 */
	let {
		row,
		courseName,
		vatusaKeySet,
		columns,
		busy = $bindable(null)
	}: {
		row: WaitlistRow;
		/** The course's name, for the wording of the confirmations. */
		courseName: string;
		vatusaKeySet: boolean;
		/** How many columns the table has, for the availability line to span. */
		columns: number;
		/** Shared with every other row: see ActionForm. */
		busy?: string | null;
	} = $props();
</script>

<!-- One line above each student, drawn here. The availability line below has
     none, so the two read as one entry. -->
<tr class="border-t border-slate-700/60 align-top transition-colors duration-200 hover:bg-white/5">
	<td class="px-3 py-3">
		<a href="/certifications/{row.cid}" class="text-white hover:text-sky-300">{row.name}</a>
		<div class="mt-0.5 flex flex-wrap gap-2 font-mono text-xs text-gray-500">
			<span>{row.cid}</span>
			<IssueLink issueKey={row.issueKey} url={row.issueUrl} />
		</div>
	</td>

	<td class="px-3 py-3 whitespace-nowrap">
		<EnrollmentStatusBadge status={row.status} />
		{#if row.position !== null}
			<span class="ml-1 font-mono text-xs text-gray-400">#{row.position}</span>
		{/if}
	</td>

	<td class="px-3 py-3 whitespace-nowrap text-gray-300">{formatDate(row.waitlistedAt)}</td>

	<td class="px-3 py-3 text-xs whitespace-nowrap text-gray-400">
		{notificationLabel(row.notificationPreference)}
		{#if row.contactEmail}
			<a href="mailto:{row.contactEmail}" class="block text-sky-400 hover:text-sky-300">
				{row.contactEmail}
			</a>
		{/if}
	</td>

	<td class="px-3 py-3 text-xs">
		<VatusaCourseCell {row} {vatusaKeySet} bind:busy />
	</td>

	<td class="px-3 py-3 text-xs">
		<TeacherCell {row} {courseName} bind:busy />
	</td>
</tr>

{#if row.availability}
	<!-- Part of the row above: the full width of the table, tucked up under it. -->
	<tr>
		<td colspan={columns} class="px-3 pt-0 pb-3 text-xs whitespace-pre-line text-gray-400">
			<span class="text-gray-500">Availability:</span>
			{row.availability}
		</td>
	</tr>
{/if}
