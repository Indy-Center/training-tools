<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import { STATUS_COLORS, STATUS_LABELS } from '$lib/enrollment-status';

	/** An enrollment's status as the student and their teacher both read it. */
	let { status }: { status: string } = $props();
</script>

<Badge size="sm" color={STATUS_COLORS[status] ?? 'gray'} label={STATUS_LABELS[status] ?? status} />
