<script lang="ts">
	import ActionForm from '$lib/components/forms/ActionForm.svelte';
	import EnrollmentStatusBadge from '$lib/components/enrollment/EnrollmentStatusBadge.svelte';
	import IssueLink from '$lib/components/enrollment/IssueLink.svelte';
	import { notificationLabel } from '$lib/enrollment-status';
	import { formatDate } from '$lib/format';
	import type { WaitlistRow } from '$lib/waitlist';
	import TeacherCell from './TeacherCell.svelte';
	import VatusaCourseCell from './VatusaCourseCell.svelte';

	/** One student's request on the sheet: who, where they are, and what can be done next. */
	let {
		row,
		courseName,
		vatusaKeySet,
		busy = $bindable(null)
	}: {
		row: WaitlistRow;
		/** The course's name, for the wording of the confirmations. */
		courseName: string;
		vatusaKeySet: boolean;
		/** Shared with every other row: see ActionForm. */
		busy?: string | null;
	} = $props();
</script>

<tr class="align-top transition-colors duration-200 hover:bg-white/5">
	<td class="px-3 py-3">
		<a href="/certifications/{row.cid}" class="text-white hover:text-sky-300">{row.name}</a>
		<div class="mt-0.5 flex flex-wrap gap-2 font-mono text-xs text-gray-500">
			<span>{row.cid}</span>
			<span>{row.ratingShort ?? '—'}</span>
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

	<td class="max-w-xs px-3 py-3 text-xs whitespace-pre-line text-gray-400">
		{row.availability ?? '—'}
	</td>

	<td class="px-3 py-3 text-xs whitespace-nowrap text-gray-400">
		{notificationLabel(row.notificationPreference)}
	</td>

	<td class="px-3 py-3 text-xs">
		<VatusaCourseCell {row} {vatusaKeySet} bind:busy />
	</td>

	<td class="px-3 py-3 text-xs">
		<TeacherCell {row} bind:busy />
	</td>

	<td class="px-3 py-3 text-xs whitespace-nowrap">
		<div class="flex gap-2">
			<ActionForm
				action="withdrawStudent"
				label="Withdraw"
				variant="secondary"
				fields={{ id: row.id }}
				question={`Withdraw ${row.name} from ${courseName}?\n\nFor a student who has asked to stop. The card moves to Withdrawn and the request closes.`}
				bind:busy
			/>
			<ActionForm
				action="removeStudent"
				label="Remove"
				variant="secondary"
				fields={{ id: row.id }}
				question={`Remove ${row.name} from ${courseName}?\n\nFor a request staff are ending. The card moves to Removed and the request closes.`}
				bind:busy
			/>
		</div>
	</td>
</tr>
