<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import { TEACHER_STATUS_LABELS, type TeacherStatus } from '$lib/teachers';

	/** Active or on LOA. */
	let { status }: { status: TeacherStatus } = $props();
</script>

<Badge
	size="sm"
	color={status === 'loa' ? 'orange' : 'green'}
	label={TEACHER_STATUS_LABELS[status]}
/>
