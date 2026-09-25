<script lang="ts">
	import Panel from '$lib/components/Panel.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import { findCourse, formatWeeksRange } from '$lib/courses';
	import { NOTIFICATION_LABELS } from '$lib/enrollment-status';
	import IconChartBar from '~icons/mdi/chart-bar';
	import IconAccountClock from '~icons/mdi/account-clock';
	import IconInformation from '~icons/mdi/information-outline';

	let { data } = $props();

	const mine = $derived(data.mine);
	const myCourse = $derived(mine ? findCourse(mine.course) : undefined);
</script>

<svelte:head>
	<title>Indy Center | Waitlist</title>
	<meta
		name="description"
		content="How many controllers are waiting for and in training for each Indy Center course, and how long each course takes."
	/>
</svelte:head>

<div class="mb-8">
	<h1 class="text-3xl font-bold text-white">Waitlist</h1>
	<p class="mt-2 text-gray-400">
		How many controllers are waiting for each course, how many are in training now, and roughly how
		long each course takes once you start.
	</p>
</div>

<div class="space-y-6">
	{#if mine && myCourse}
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

	<Panel title="By course" icon={IconChartBar}>
		<ul class="divide-y divide-slate-700/60">
			{#each data.courses as course (course.code)}
				{@const isMine = mine?.course === course.code}
				<li class="px-4 py-4 {isMine ? 'bg-sky-600/10' : ''}">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-medium text-white">{course.label}</span>
						{#if isMine}
							<Badge size="sm" color="sky" label="Your course" />
						{/if}
					</div>
					<dl class="mt-3 grid grid-cols-3 gap-4 text-sm">
						<div>
							<dt class="text-gray-400">Waiting</dt>
							<dd class="mt-1 text-lg font-semibold text-white">{course.waiting}</dd>
						</div>
						<div>
							<dt class="text-gray-400">In training</dt>
							<dd class="mt-1 text-lg font-semibold text-white">{course.inTraining}</dd>
						</div>
						<div>
							<dt class="text-gray-400">Course length</dt>
							<dd class="mt-1 text-lg font-semibold text-white">
								{#if course.estimatedWeeks}
									{formatWeeksRange(course.estimatedWeeks)}
								{:else}
									<span class="text-sm font-normal text-gray-400">Not estimated yet</span>
								{/if}
							</dd>
						</div>
					</dl>
				</li>
			{/each}
		</ul>
	</Panel>

	<Panel title="Reading these numbers" icon={IconInformation}>
		<div class="space-y-3 px-4 py-5 text-sm text-gray-300">
			<p>
				<span class="font-medium text-white">Waiting</span> is everyone with a request for the course
				who doesn't have a teacher yet. The queue is generally first come, first served, but we also take
				into account other factors.
			</p>
			<p>
				<span class="font-medium text-white">In training</span> is everyone working with a teacher now,
				or waiting on their rating exam.
			</p>
			<p>
				<span class="font-medium text-white">Course length</span> is an estimate, not a measurement: it
				assumes one lesson a week, with some margin for missed weeks. How long it takes you depends on
				availability and the need to repeat lessons.
			</p>
		</div>
	</Panel>
</div>
