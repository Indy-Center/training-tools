<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconAlert from '~icons/mdi/alert-circle';

	type Props = {
		/** `error` for something that failed; `warning` for something to act on. */
		tone?: 'error' | 'warning';
		/** Layout only — usually a margin. */
		class?: string;
		children: Snippet;
	};

	let { tone = 'error', class: className = '', children }: Props = $props();

	const TONES = {
		error: 'border-red-500/30 bg-red-500/10 text-red-300',
		warning: 'border-orange-500/30 bg-orange-500/10 text-orange-300'
	};
</script>

<div class="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm {TONES[tone]} {className}">
	<IconAlert class="mt-0.5 h-5 w-5 shrink-0" />
	<div class="min-w-0">
		{@render children()}
	</div>
</div>
