<script lang="ts">
	import { enhance } from '$app/forms';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ChoiceCard from '$lib/components/ui/ChoiceCard.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import Timeline from '$lib/components/controller/Timeline.svelte';
	import IconCertificate from '~icons/mdi/certificate';
	import IconSeal from '~icons/mdi/seal';
	import IconArrowLeft from '~icons/mdi/arrow-left';
	import IconEmail from '~icons/mdi/email-outline';
	import IconDiscord from '~icons/mdi/discord';

	let { data, form } = $props();

	let saving = $state(false);

	function submitting() {
		saving = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			saving = false;
		};
	}
</script>

<svelte:head>
	<title>Indy Center | {data.controller.name}</title>
</svelte:head>

<a
	href="/certifications"
	class="inline-flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300"
>
	<IconArrowLeft class="h-4 w-4" />
	Back to search
</a>

<div class="mt-4 mb-8">
	<h1 class="text-3xl font-bold text-white">{data.controller.name}</h1>
	<p class="mt-2 font-mono text-sm text-gray-400">
		{data.controller.cid} · {data.controller.ratingShort} · {data.controller.membership === 'home'
			? 'Home controller'
			: 'Visiting controller'}
	</p>
	<dl class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
		<div class="flex items-center gap-2">
			<dt class="text-gray-500"><IconEmail class="h-4 w-4" /><span class="sr-only">Email</span></dt>
			<dd>
				{#if data.controller.email}
					<a href="mailto:{data.controller.email}" class="text-sky-400 hover:text-sky-300">
						{data.controller.email}
					</a>
				{:else}
					<span class="text-gray-500">Recorded the first time they sign in here</span>
				{/if}
			</dd>
		</div>
		<div class="flex items-center gap-2">
			<dt class="text-gray-500">
				<IconDiscord class="h-4 w-4" /><span class="sr-only">Discord id</span>
			</dt>
			<dd>
				{#if data.controller.discordId}
					<span class="font-mono text-gray-300">{data.controller.discordId}</span>
				{:else}
					<span class="text-gray-500">Not linked on VATUSA</span>
				{/if}
			</dd>
		</div>
	</dl>
</div>

{#if form?.formError}
	<Alert class="mb-6">{form.formError}</Alert>
{/if}

{#if data.needsReview}
	<Alert tone="warning" class="mb-6">
		A certification here was worked out automatically rather than read from the rating table.
		Confirm it against the notes below and set it explicitly.
	</Alert>
{/if}

<div class="grid gap-6 lg:grid-cols-2">
	<Panel title="Certification" icon={IconCertificate}>
		<div class="px-4 py-5">
			<p class="mb-4 text-sm text-gray-400">
				One at a time — a higher certification supersedes the ones below it.
			</p>

			<form method="POST" action="?/setCertification" use:enhance={submitting} class="space-y-3">
				{#each data.certifications as certification (certification.code)}
					<ChoiceCard
						type="radio"
						name="certification"
						value={certification.code}
						checked={data.certification === certification.code}
						align="start"
					>
						<span class="min-w-0">
							<span class="block text-sm font-medium text-white">
								{certification.name}
								<span class="font-mono text-xs text-gray-500">({certification.code})</span>
							</span>
							<span class="mt-0.5 block text-xs text-gray-400">{certification.description}</span>
						</span>
					</ChoiceCard>
				{/each}

				<ChoiceCard
					type="radio"
					name="certification"
					value=""
					checked={data.certification === null}
					align="start"
				>
					<span class="text-sm font-medium text-white">No certification</span>
				</ChoiceCard>

				<Button type="submit" size="lg" disabled={saving}>
					{saving ? 'Saving…' : 'Save certification'}
				</Button>
			</form>
		</div>
	</Panel>

	<Panel title="Endorsements" icon={IconSeal}>
		<div class="px-4 py-5">
			<p class="mb-4 text-sm text-gray-400">
				Held alongside a certification rather than replacing it.
			</p>

			<div class="space-y-3">
				{#each data.endorsements as endorsement (endorsement.code)}
					<form
						method="POST"
						action="?/toggleEndorsement"
						use:enhance={submitting}
						class="flex items-start justify-between gap-3 rounded-lg border px-4 py-3 {endorsement.held
							? 'border-purple-500/40 bg-purple-500/10'
							: 'border-slate-700/60'}"
					>
						<input type="hidden" name="endorsement" value={endorsement.code} />
						<span class="min-w-0">
							<span class="block text-sm font-medium text-white">
								{endorsement.name}
								<span class="font-mono text-xs text-gray-500">({endorsement.code})</span>
							</span>
							<span class="mt-0.5 block text-xs text-gray-400">{endorsement.description}</span>
							{#if !endorsement.held && !endorsement.eligible}
								<!-- Guidance, not a block: staff record what is true, and the
								     training path is not always walked in order. -->
								<span class="mt-1 block text-xs text-orange-400">
									Prerequisites not met for the usual training path.
								</span>
							{/if}
						</span>
						<button
							type="submit"
							disabled={saving}
							class="shrink-0 cursor-pointer rounded-lg border border-slate-600/50 px-4 py-2 text-xs font-medium text-gray-300 transition-colors duration-200 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
						>
							{endorsement.held ? 'Remove' : 'Grant'}
						</button>
					</form>
				{/each}
			</div>
		</div>
	</Panel>
</div>

<div class="mt-6">
	<Timeline entries={data.timeline} names={data.names} />
</div>
