<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import { formatWeeksRange, type WeeksRange } from '$lib/courses';
	import IconChartBar from '~icons/mdi/chart-bar';
	import IconInformation from '~icons/mdi/information-outline';

	/** Headcounts per course, for any signed-in member: nobody is named. */
	let {
		courses,
		myCourse = null
	}: {
		courses: {
			code: string;
			label: string;
			waiting: number;
			inTraining: number;
			estimatedWeeks: WeeksRange | null;
		}[];
		/** The viewer's own course, to pick it out. */
		myCourse?: string | null;
	} = $props();
</script>

<Panel title="By course" icon={IconChartBar}>
	<ul class="divide-y divide-slate-700/60">
		{#each courses as course (course.code)}
			{@const isMine = myCourse === course.code}
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
			<span class="font-medium text-white">Waiting</span> is everyone with a request for the course who
			doesn't have a teacher yet. The queue is generally first come, first served, but we also take into
			account other factors.
		</p>
		<p>
			<span class="font-medium text-white">In training</span> is everyone working with a teacher now,
			or waiting on their rating exam.
		</p>
		<p>
			<span class="font-medium text-white">Course length</span> is an estimate, not a measurement: it
			assumes one lesson a week, with some margin for missed weeks. How long it takes you depends on availability
			and the need to repeat lessons.
		</p>
	</div>
</Panel>
