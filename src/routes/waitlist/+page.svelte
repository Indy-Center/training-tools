<script lang="ts">
	import CourseCounts from './CourseCounts.svelte';
	import ManagePanel from './ManagePanel.svelte';
	import YourPlace from './YourPlace.svelte';

	let { data, form } = $props();
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
	{#if !data.sheet}
		<p class="mt-2 text-gray-400">
			How many controllers are waiting for each course, how many are in training now, and roughly
			how long each course takes once you start.
		</p>
	{/if}
</div>

<div class="space-y-6">
	<!-- First, always: staff can be on the waitlist too. -->
	{#if data.mine}
		<YourPlace mine={data.mine} />
	{/if}

	<!-- Present only for training:students:manage; the load sends nobody else the rows. -->
	{#if data.sheet}
		<div>
			<ManagePanel rows={data.sheet.rows} vatusaKeySet={data.sheet.vatusaKeySet} {form} />
		</div>
	{/if}

	<!-- The counts are for members deciding whether to enroll; the sheet already
	     says more, so staff are not shown both. -->
	{#if !data.sheet}
		<CourseCounts courses={data.courses} myCourse={data.mine?.course ?? null} />
	{/if}
</div>
