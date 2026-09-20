<script lang="ts">
	import Panel from '$lib/components/Panel.svelte';
	import IconChartBar from '~icons/mdi/chart-bar';
</script>

<svelte:head>
	<title>Indy Center | Waitlist</title>
</svelte:head>

<div class="mb-8">
	<h1 class="text-3xl font-bold text-white">Waitlist</h1>
	<p class="mt-2 text-gray-400">
		How many controllers are in training and waiting for each course, and roughly how long the wait
		is.
	</p>
</div>

<Panel title="Not published yet" icon={IconChartBar}>
	<div class="px-4 py-6 text-sm text-gray-300">
		<p>
			Waitlist numbers are still tracked manually. This page will show students in training, queue
			depth per course, and expected time to complete once DEV-111 lands.
		</p>
		<p class="mt-3 text-gray-400">
			This page stays readable without signing in — the point is that people deciding whether to
			enroll can see the wait first.
		</p>
	</div>
</Panel>
