<script lang="ts">
	import type { Snippet } from 'svelte';
	import Panel from '$lib/components/Panel.svelte';
	import type { CopyBlock } from '$lib/content/training';
	import IconOpenInNew from '~icons/mdi/open-in-new';

	type Props = {
		/** A block from `$lib/content/training` — title, body and buttons. */
		copy: CopyBlock;
		icon?: any;
		/** Data the page draws between the body and the buttons. */
		children?: Snippet;
	};

	let { copy, icon, children }: Props = $props();
</script>

<Panel title={copy.title} {icon}>
	<div class="space-y-4 px-4 py-5 text-sm text-gray-300">
		<!-- {@html} is safe here because the HTML is compiled at build time from
		     markdown in this repo — see vite.config.ts. -->
		<div class="prose prose-sm max-w-none prose-invert prose-a:text-sky-400">
			{@html copy.body}
		</div>

		{@render children?.()}

		{#if copy.actions?.length}
			<div class="flex flex-wrap gap-3">
				{#each copy.actions as action (action.href + action.label)}
					<a
						href={action.href}
						target={action.external ? '_blank' : undefined}
						rel={action.external ? 'noopener noreferrer' : undefined}
						class="inline-flex cursor-pointer items-center space-x-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors duration-200 {action.style ===
						'secondary'
							? 'border border-slate-600/50 text-gray-300 hover:bg-white/10 hover:text-white'
							: 'bg-sky-600 text-white hover:bg-sky-700'}"
					>
						<span>{action.label}</span>
						{#if action.external}
							<IconOpenInNew class="h-4 w-4" />
						{/if}
					</a>
				{/each}
			</div>
		{/if}
	</div>
</Panel>
