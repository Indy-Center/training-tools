<script lang="ts">
	import Panel from '$lib/components/ui/Panel.svelte';
	import { findCourse, formatWeeksRange } from '$lib/courses';
	import { NOTIFICATION_LABELS } from '$lib/enrollment-status';
	import type { NotificationPreference } from '$lib/db/schema/enrollments';
	import IconAccountClock from '~icons/mdi/account-clock';

	/**
	 * The viewer's own place in their course's queue. Always the first thing on
	 * `/waitlist` for someone who is waiting — including staff, who can be on the
	 * waitlist themselves.
	 */
	let {
		mine
	}: {
		mine: {
			course: string;
			notification: NotificationPreference | null;
			ahead: number;
			waiting: number;
		};
	} = $props();

	const myCourse = $derived(findCourse(mine.course));
</script>

{#if myCourse}
	<Panel title="Your place" icon={IconAccountClock}>
		<div class="px-4 py-5 text-sm text-gray-300">
			<p>
				You're
				<span class="font-medium text-white">#{mine.ahead + 1}</span>
				of {mine.waiting} waiting for {myCourse.label}.
				{#if myCourse.estimatedWeeks}
					Once you start, the course takes about
					<span class="font-medium text-white">{formatWeeksRange(myCourse.estimatedWeeks)}</span>.
				{/if}
			</p>
			<p class="mt-2 text-gray-400">
				Training staff will reach out when a teacher is assigned.
				{#if mine.notification}
					Preferred contact:
					<span class="text-gray-300">{NOTIFICATION_LABELS[mine.notification]}</span>.
				{/if}
			</p>
		</div>
	</Panel>
{/if}
