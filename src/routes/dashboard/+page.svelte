<script lang="ts">
	import Panel from '$lib/components/Panel.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import { atcRating, displayName, operatingInitials } from '$lib/user';
	import IconAccount from '~icons/mdi/account-circle';
	import IconSchool from '~icons/mdi/school';
	import IconHeadset from '~icons/mdi/headset';

	let { data } = $props();

	let name = $derived(displayName(data.user));
	let initials = $derived(operatingInitials(data.user));
	let atc = $derived(atcRating(data.user));
</script>

<svelte:head>
	<title>Indy Center | My Training</title>
</svelte:head>

<div class="mb-8">
	<h1 class="text-3xl font-bold text-white">My Training</h1>
	<p class="mt-2 text-gray-400">
		Signed in as {name}. Lessons and progress arrive with the next release.
	</p>
</div>

<div class="grid gap-6 md:grid-cols-2">
	<Panel title="Your account" icon={IconAccount}>
		<dl class="divide-y divide-slate-700/60 text-sm">
			<div class="flex items-center justify-between px-4 py-3">
				<dt class="text-gray-400">Name</dt>
				<dd class="text-white">{name}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-3">
				<dt class="text-gray-400">CID</dt>
				<dd class="font-mono text-white">{data.user.cid}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-3">
				<dt class="text-gray-400">Rating</dt>
				<dd class="flex gap-2">
					{#if atc}
						<Badge size="sm" color="sky" label={atc} />
					{:else}
						<span class="text-gray-500">Unknown</span>
					{/if}
				</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-3">
				<dt class="text-gray-400">Operating initials</dt>
				<dd class="font-mono text-white">{initials ?? '—'}</dd>
			</div>
			<div class="flex items-center justify-between px-4 py-3">
				<dt class="text-gray-400">Session expires</dt>
				<dd class="text-white">{new Date(data.sessionExpiresAt).toLocaleString()}</dd>
			</div>
		</dl>
	</Panel>

	<Panel title="Roles" icon={IconSchool}>
		<div class="px-4 py-4">
			{#if data.roles.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each data.roles as role}
						<Badge size="sm" color="gray" label={role} />
					{/each}
				</div>
			{:else}
				<p class="text-sm text-gray-400">
					No roles granted. Training staff permissions are granted in identity.
				</p>
			{/if}
		</div>
	</Panel>

	{#if data.activeSession}
		<Panel title="Currently controlling" icon={IconHeadset}>
			<div class="px-4 py-4 text-sm text-gray-300">
				<div class="font-mono text-white">{data.activeSession.vatsimData.callsign}</div>
				<div class="mt-1 text-gray-400">
					{data.activeSession.primaryFacilityId} · since {new Date(
						data.activeSession.loginTime
					).toLocaleTimeString()}
				</div>
			</div>
		</Panel>
	{/if}
</div>
