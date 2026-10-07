<script lang="ts">
	/**
	 * A filter that is either on or off, shown as a chip. On by default in most
	 * uses; struck through when off, so what is hidden stays visible as a choice.
	 */
	let {
		pressed = $bindable(true),
		label,
		count
	}: {
		pressed?: boolean;
		label: string;
		/** How many rows this filter covers, shown after the label. */
		count?: number;
	} = $props();
</script>

<button
	type="button"
	aria-pressed={pressed}
	onclick={() => (pressed = !pressed)}
	class="cursor-pointer rounded-lg border px-3 py-1 text-xs font-medium transition-colors duration-200 {pressed
		? 'border-sky-500/60 bg-sky-600/20 text-white'
		: 'border-slate-600 bg-transparent text-gray-500 line-through'}"
>
	{label}{#if count !== undefined}&nbsp;({count}){/if}
</button>
