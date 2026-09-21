<script lang="ts">
	import { enhance } from '$app/forms';
	import Panel from '$lib/components/Panel.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import IconAccount from '~icons/mdi/account-circle';
	import IconCertificate from '~icons/mdi/certificate';
	import IconSeal from '~icons/mdi/seal';
	import IconHistory from '~icons/mdi/history';
	import IconAlert from '~icons/mdi/alert-circle';
	import IconArrowLeft from '~icons/mdi/arrow-left';

	let { data, form } = $props();

	let saving = $state(false);

	function submitting() {
		saving = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			saving = false;
		};
	}

	function formatDate(value: Date | string | null) {
		if (!value) return '—';
		return new Date(value).toLocaleDateString();
	}

	const BASIS_LABELS: Record<string, string> = {
		'auto-arrival': 'Granted on arrival',
		imported: 'Imported from the community site',
		manual: 'Set by training staff'
	};
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
</div>

{#if form?.formError}
	<div
		class="mb-6 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
	>
		<IconAlert class="mt-0.5 h-5 w-5 shrink-0" />
		<span>{form.formError}</span>
	</div>
{/if}

{#if data.needsReview}
	<div
		class="mb-6 flex items-start gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-300"
	>
		<IconAlert class="mt-0.5 h-5 w-5 shrink-0" />
		<span>
			A certification here was worked out automatically rather than read from the rating table.
			Confirm it against the notes below and set it explicitly.
		</span>
	</div>
{/if}

<div class="grid gap-6 lg:grid-cols-2">
	<Panel title="Certification" icon={IconCertificate}>
		<div class="px-4 py-5">
			<p class="mb-4 text-sm text-gray-400">
				One at a time — a higher certification supersedes the ones below it.
			</p>

			<form method="POST" action="?/setCertification" use:enhance={submitting} class="space-y-3">
				{#each data.certifications as certification (certification.code)}
					<label
						class="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700/60 px-4 py-3 transition-colors duration-200 hover:bg-white/5 has-checked:border-sky-500/50 has-checked:bg-sky-500/10"
					>
						<input
							type="radio"
							name="certification"
							value={certification.code}
							checked={data.certification === certification.code}
							class="mt-1 border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/50"
						/>
						<span class="min-w-0">
							<span class="block text-sm font-medium text-white">
								{certification.name}
								<span class="font-mono text-xs text-gray-500">({certification.code})</span>
							</span>
							<span class="mt-0.5 block text-xs text-gray-400">{certification.description}</span>
						</span>
					</label>
				{/each}

				<label
					class="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700/60 px-4 py-3 transition-colors duration-200 hover:bg-white/5 has-checked:border-sky-500/50 has-checked:bg-sky-500/10"
				>
					<input
						type="radio"
						name="certification"
						value=""
						checked={data.certification === null}
						class="mt-1 border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/50"
					/>
					<span class="text-sm font-medium text-white">No certification</span>
				</label>

				<button
					type="submit"
					disabled={saving}
					class="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-sky-600 px-6 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{saving ? 'Saving…' : 'Save certification'}
				</button>
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
	<Panel title="History" icon={IconHistory}>
		{#if data.history.length === 0}
			<p class="px-4 py-5 text-sm text-gray-400">
				Nothing has ever been granted to this controller.
			</p>
		{:else}
			<ul class="divide-y divide-slate-700/60">
				{#each data.history as entry, index (entry.code + entry.grantedAt + index)}
					<li class="px-4 py-3">
						<div class="flex flex-wrap items-center gap-2">
							<Badge
								size="sm"
								color={entry.revokedAt ? 'gray' : entry.kind === 'endorsement' ? 'purple' : 'sky'}
								label={entry.code}
							/>
							{#if entry.revokedAt}
								<Badge size="sm" color="red" label="Revoked" />
							{/if}
							{#if entry.needsReview}
								<Badge size="sm" color="orange" label="Needs review" />
							{/if}
							<span class="text-xs text-gray-500">
								{BASIS_LABELS[entry.grantBasis] ?? entry.grantBasis} · {formatDate(entry.grantedAt)}
								{#if entry.grantedBy}
									· by <span class="font-mono">{entry.grantedBy}</span>
								{/if}
							</span>
						</div>

						{#if entry.grantNote}
							<p class="mt-1 text-xs text-gray-400">{entry.grantNote}</p>
						{/if}

						{#if entry.revokedAt}
							<p class="mt-1 text-xs text-gray-400">
								Revoked {formatDate(entry.revokedAt)}
								{#if entry.revokedBy}
									by <span class="font-mono">{entry.revokedBy}</span>
								{/if}
								{#if entry.revokedReason}
									— {entry.revokedReason}
								{/if}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Panel>
</div>
