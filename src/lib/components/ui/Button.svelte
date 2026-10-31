<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Props = {
		/**
		 * `primary` is the one main action; `secondary` is the outlined alternative;
		 * `danger` confirms a step that goes against the student, such as a failed exam.
		 */
		variant?: 'primary' | 'secondary' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		/** Given an `href` this renders a link; without one, a button. */
		href?: string;
		/** Layout only — margins, `shrink-0`. Colour and padding come from the props above. */
		class?: string;
		children: Snippet;
	} & Omit<HTMLButtonAttributes & HTMLAnchorAttributes, 'class' | 'href' | 'children'>;

	let {
		variant = 'primary',
		size = 'md',
		href,
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const VARIANTS = {
		primary: 'bg-sky-600 text-white hover:bg-sky-700',
		secondary: 'border border-slate-600/50 text-gray-300 hover:bg-white/10 hover:text-white',
		danger: 'bg-red-600 text-white hover:bg-red-700'
	};

	const SIZES = {
		sm: 'px-4 py-2',
		md: 'px-5 py-2.5',
		lg: 'px-6 py-3'
	};

	const classes = $derived(
		`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`
	);
</script>

{#if href}
	<a {href} class={classes} {...rest}>
		{@render children()}
	</a>
{:else}
	<button class={classes} {...rest}>
		{@render children()}
	</button>
{/if}
