<script lang="ts">
	import PageHero from '$lib/components/PageHero.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import { loginUrl } from '$lib/identity-links';
	import { page } from '$app/state';
	import IconClipboard from '~icons/mdi/clipboard-text';
	import IconChartBar from '~icons/mdi/chart-bar';
	import IconSchool from '~icons/mdi/school';
	import IconAccount from '~icons/mdi/account-circle';

	let { data } = $props();

	let returnUrl = $derived(page.url.href);
</script>

<svelte:head>
	<title>Indy Center | Training</title>
	<meta
		name="description"
		content="Enroll in controller training at Indy Center, track your progress, and see where you are on the waitlist."
	/>
</svelte:head>

<PageHero>
	<h1 class="text-4xl font-bold sm:text-5xl">Controller Training</h1>
	<p class="mx-auto mt-4 max-w-2xl text-gray-300">
		Enroll in training, follow your progress through each certification, and see where you stand on
		the waitlist.
	</p>
	<div class="mt-6 flex flex-wrap items-center justify-center gap-3">
		{#if data.user}
			<a
				href="/dashboard"
				class="flex cursor-pointer items-center space-x-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700"
			>
				<IconSchool class="h-5 w-5" />
				<span>Go to my training</span>
			</a>
		{:else}
			<a
				href={loginUrl(data.identityUrl, returnUrl)}
				data-sveltekit-reload
				class="flex cursor-pointer items-center space-x-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700"
			>
				<IconAccount class="h-5 w-5" />
				<span>Connect VATSIM Account</span>
			</a>
		{/if}
		<a
			href="/stats"
			class="flex cursor-pointer items-center space-x-2 rounded-lg border border-slate-600/50 px-5 py-2.5 text-sm font-medium text-gray-300 transition-colors duration-200 hover:bg-white/10 hover:text-white"
		>
			<IconChartBar class="h-5 w-5" />
			<span>View the waitlist</span>
		</a>
	</div>
</PageHero>

<div class="w-full bg-gray-900">
	<div class="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-3">
		<Panel title="Enroll" icon={IconClipboard}>
			<div class="px-4 py-4 text-sm text-gray-300">
				Request training for a new position. Your CID, name and rating come straight from your
				VATSIM account, so there is nothing to fill in twice.
			</div>
		</Panel>
		<Panel title="Track progress" icon={IconSchool}>
			<div class="px-4 py-4 text-sm text-gray-300">
				See completed lessons, instructor notes and what is left before your next certification.
			</div>
		</Panel>
		<Panel title="Know the wait" icon={IconChartBar}>
			<div class="px-4 py-4 text-sm text-gray-300">
				Current students in training, how many are waiting ahead of you, and a realistic estimate of
				how long each course takes.
			</div>
		</Panel>
	</div>
</div>
