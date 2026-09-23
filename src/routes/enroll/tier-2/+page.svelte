<script lang="ts">
	import PageHero from '$lib/components/PageHero.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import IconSchool from '~icons/mdi/school';
	import IconInformation from '~icons/mdi/information-outline';
	import IconOpenInNew from '~icons/mdi/open-in-new';

	let { data } = $props();
</script>

<svelte:head>
	<title>Tier 2 Center | Indy Center Training</title>
</svelte:head>

<PageHero size="compact">
	<h1 class="text-3xl font-bold sm:text-4xl">Tier 2 Center</h1>
	<div class="mt-3 flex items-center justify-center gap-2">
		<Badge size="sm" color="sky" label={data.ratingShort} />
		<Badge size="sm" color="purple" label="Self-led course" />
	</div>
</PageHero>

<div class="w-full bg-gray-900">
	<div class="mx-auto max-w-3xl space-y-6 px-4 py-10">
		<Panel title="About this course" icon={IconInformation}>
			<div class="space-y-4 px-4 py-5 text-sm text-gray-300">
				<p>
					Some of our enroute sectors are designated Tier 2: they work differently enough from
					standard procedures that controllers need a specific endorsement to staff them, whatever
					their rating.
				</p>
				<p>
					The Tier 2 Center endorsement is earned through a self-led course on our learning site.
					There's no waitlist and no mentor to schedule with — work through the material at your own
					pace.
				</p>
				<p class="text-gray-400">
					Once you've completed the course, the training staff will add the endorsement to your
					record.
				</p>
			</div>
		</Panel>

		<Panel title="Get started" icon={IconSchool}>
			<div class="space-y-4 px-4 py-5 text-sm text-gray-300">
				{#if data.courseUrl}
					<a
						href={data.courseUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex cursor-pointer items-center space-x-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700"
					>
						<span>Open the Tier 2 course</span>
						<IconOpenInNew class="h-4 w-4" />
					</a>
				{:else}
					<p>
						The course isn't open for self sign-up yet. Ask the training staff on Discord and
						they'll get you access.
					</p>
				{/if}
				<p>
					<a href="/" class="text-sky-400 hover:text-sky-300">← Back to training home</a>
				</p>
			</div>
		</Panel>
	</div>
</div>
