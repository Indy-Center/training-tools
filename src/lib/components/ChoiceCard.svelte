<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		type: 'radio' | 'checkbox';
		name: string;
		value?: string;
		checked?: boolean;
		required?: boolean;
		/** `start` when the label runs to more than one line. */
		align?: 'center' | 'start';
		/** Tighter, for a short row of options side by side. */
		compact?: boolean;
		/** Layout only — usually a margin. */
		class?: string;
		/** The label, beside the input. */
		children: Snippet;
	};

	let {
		type,
		name,
		value,
		checked = false,
		required = false,
		align = 'center',
		compact = false,
		class: className = '',
		children
	}: Props = $props();
</script>

<!-- The whole card is the label, so anywhere on it selects the option; it
     highlights itself once its input is checked. -->
<label
	class="flex cursor-pointer rounded-lg border border-slate-700/60 px-4 has-checked:border-sky-500/50 has-checked:bg-sky-500/10
	{align === 'start' ? 'items-start' : 'items-center'}
	{compact ? 'gap-2 py-2' : 'gap-3 py-3 transition-colors duration-200 hover:bg-white/5'}
	{className}"
>
	<input
		{type}
		{name}
		{value}
		{checked}
		{required}
		class="border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/50
		{type === 'checkbox' ? 'rounded' : ''}
		{align === 'start' ? (type === 'checkbox' ? 'mt-0.5' : 'mt-1') : ''}"
	/>
	{@render children()}
</label>
