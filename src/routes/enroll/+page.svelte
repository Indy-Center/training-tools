<script lang="ts">
	import Panel from '$lib/components/Panel.svelte';
	import IconClipboard from '~icons/mdi/clipboard-text';
</script>

<svelte:head>
	<title>Indy Center | Enroll</title>
</svelte:head>

<div class="mb-8">
	<h1 class="text-3xl font-bold text-white">Enroll in training</h1>
	<p class="mt-2 text-gray-400">Request training for a new position at Indy Center.</p>
</div>

<Panel title="Not open yet" icon={IconClipboard}>
	<div class="px-4 py-6 text-sm text-gray-300">
		<p>
			The enrollment form is still being built (DEV-108). Until it lands, enrollment still goes
			through the existing Google Form — the training staff on Discord can point you at it.
		</p>
		<p class="mt-3 text-gray-400">
			When it ships, your CID, name, rating and Discord ID will be filled in automatically from your
			VATSIM account.
		</p>
	</div>
</Panel>
