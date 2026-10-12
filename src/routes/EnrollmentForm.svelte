<script lang="ts">
	import { enhance } from '$app/forms';
	import Panel from '$lib/components/ui/Panel.svelte';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ChoiceCard from '$lib/components/ui/ChoiceCard.svelte';
	import CopyPanel from '$lib/components/content/CopyPanel.svelte';
	import { formatWeeksRange, type Course } from '$lib/courses';
	import { ENROLLMENT_COPY } from '$lib/content/enrollment';
	import { SHARED_COPY, TRAINING_COPY } from '$lib/content/training';
	import { academyExamFor } from '$lib/vatusa-academy';
	import { NOTIFICATION_LABELS } from '$lib/enrollment-status';
	import { NOTIFICATION_PREFERENCES } from '$lib/db/schema/enrollments';
	import IconClipboard from '~icons/mdi/clipboard-text';
	import IconAccount from '~icons/mdi/account-circle';
	import IconClock from '~icons/mdi/clock-outline';
	import IconBell from '~icons/mdi/bell-outline';
	import IconInformation from '~icons/mdi/information-outline';
	import IconSchool from '~icons/mdi/school';
	import IconHandshake from '~icons/mdi/handshake-outline';
	import type { ActionData } from './$types';

	type Props = {
		/**
		 * The courses on offer: usually the one that is next, sometimes two that
		 * may be taken in either order. The first is selected. Never empty.
		 */
		courses: Course[];
		controller: { cid: string; name: string; rating: string | null };
		credentials: { certification: string | null; endorsements: string[] };
		form: ActionData;
	};

	let { courses, controller, credentials, form }: Props = $props();

	let submitting = $state(false);

	// The first course starts selected; what they chose comes back with a refused
	// form. Assigned to as they pick between two.
	let chosen = $derived(form?.values?.course || courses[0].code);
</script>

{#snippet courseSummary(course: Course)}
	{@const courseLength = formatWeeksRange(course.estimatedWeeks)}
	<span class="block text-sm font-medium text-white">{course.label}</span>
	<span class="mt-0.5 block text-sm text-gray-400">{course.description}</span>
	{#if courseLength}
		<span class="mt-2 block text-sm text-gray-400">
			Takes about <span class="text-gray-300">{courseLength}</span> once you start.
		</span>
	{/if}
{/snippet}

{#if form?.formError}
	<Alert>{form.formError}</Alert>
{/if}

<form
	method="POST"
	action="?/enroll"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}}
	class="space-y-6"
>
	<!-- DEV-119: read before filling anything in, not after. The agreement stays
	     last, right before submit. -->
	<CopyPanel copy={TRAINING_COPY.enroll} icon={IconInformation} />

	<Panel title="Your details" icon={IconAccount}>
		<div class="px-4 py-5">
			<p class="text-sm text-gray-400">
				Check this information is correct. If not, update your profile before submitting.
			</p>
			<dl class="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
				<div>
					<dt class="text-xs tracking-wide text-gray-400 uppercase">Name</dt>
					<dd class="mt-1 text-white">{controller.name}</dd>
				</div>
				<div>
					<dt class="text-xs tracking-wide text-gray-400 uppercase">CID</dt>
					<dd class="mt-1 text-white">{controller.cid}</dd>
				</div>
				<div>
					<dt class="text-xs tracking-wide text-gray-400 uppercase">Rating</dt>
					<dd class="mt-1 text-white">{controller.rating ?? 'Unknown'}</dd>
				</div>
			</dl>
		</div>
	</Panel>

	<Panel
		title={courses.length > 1 ? 'Choose your next course' : 'Your next course'}
		icon={IconClipboard}
	>
		<div class="px-4 py-5">
			{#if credentials.certification || credentials.endorsements.length > 0}
				<!-- The basis for the course below. Without it, "your next course is X"
				     asks the student to trust a conclusion they can't check. -->
				<div class="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-400">
					<span>You currently hold</span>
					{#if credentials.certification}
						<Badge size="sm" color="sky" label={credentials.certification} />
					{/if}
					{#each credentials.endorsements as endorsement (endorsement)}
						<Badge size="sm" color="purple" label={endorsement} />
					{/each}
				</div>
			{/if}

			{#if courses.length === 1}
				<!-- One course, not a choice: the server accepts only what it offers,
				     whatever this field says. -->
				<input type="hidden" name="course" value={courses[0].code} />
				<div class="rounded-lg border border-sky-500/50 bg-sky-500/10 px-4 py-3">
					{@render courseSummary(courses[0])}
				</div>
			{:else}
				<!-- Side by side, the first selected: the order is theirs to choose. -->
				<p class="mb-3 text-sm text-gray-400">
					You can take these in either order. Choose the one you want to start with.
				</p>
				<fieldset
					class="grid gap-3 sm:grid-cols-2"
					onchange={(event) => {
						if (event.target instanceof HTMLInputElement) chosen = event.target.value;
					}}
				>
					<legend class="sr-only">Your next course</legend>
					{#each courses as course (course.code)}
						<ChoiceCard
							type="radio"
							name="course"
							value={course.code}
							checked={chosen === course.code}
							required
							align="start"
						>
							<span class="min-w-0">{@render courseSummary(course)}</span>
						</ChoiceCard>
					{/each}
				</fieldset>
			{/if}

			{#if form?.errors?.course}
				<p class="mt-3 text-sm text-red-400">{form.errors.course}</p>
			{/if}
		</div>
	</Panel>

	{#if academyExamFor(chosen)}
		<!-- Under the course it belongs to, so it follows the choice. -->
		<CopyPanel copy={SHARED_COPY.academyCourse} icon={IconSchool} />
	{/if}

	<Panel title="Availability" icon={IconClock}>
		<div class="px-4 py-5">
			<label for="availability" class="block text-sm text-gray-400">
				Roughly when can you train? Days of the week and times work best — include your time zone.
			</label>

			{#if form?.errors?.availability}
				<p class="mt-2 text-sm text-red-400">{form.errors.availability}</p>
			{/if}

			<textarea
				id="availability"
				name="availability"
				rows="4"
				required
				maxlength="1000"
				placeholder="e.g. Weeknights after 7pm eastern, and most of Sunday afternoon."
				class="mt-3 block w-full rounded-lg border-slate-700/60 bg-slate-900/60 text-sm text-white placeholder:text-gray-500 focus:border-sky-500 focus:ring-sky-500/50"
				>{form?.values?.availability ?? ''}</textarea
			>
		</div>
	</Panel>

	<Panel title="How should we reach you?" icon={IconBell}>
		<div class="px-4 py-5">
			{#if form?.errors?.notificationPreference}
				<p class="mb-3 text-sm text-red-400">{form.errors.notificationPreference}</p>
			{/if}

			<div class="space-y-2">
				{#each NOTIFICATION_PREFERENCES.map( (value) => ({ value, label: NOTIFICATION_LABELS[value] }) ) as option (option.value)}
					<ChoiceCard
						type="radio"
						name="notificationPreference"
						value={option.value}
						checked={form?.values?.notificationPreference === option.value}
						required
					>
						<span class="text-sm text-white">{option.label}</span>
					</ChoiceCard>
				{/each}
			</div>
		</div>
	</Panel>

	<!-- Last before submit, so what they are agreeing to is what they just
	     read. The version they saw is recorded on the enrollment. -->
	<Panel title="Our agreement" icon={IconHandshake}>
		<div class="px-4 py-5">
			<div class="prose prose-sm max-w-none prose-invert prose-a:text-sky-400">
				{@html ENROLLMENT_COPY.agreement}
			</div>

			{#if form?.agreedError}
				<p class="mt-4 text-sm text-red-400">{form.agreedError}</p>
			{/if}

			<ChoiceCard
				type="checkbox"
				name="agreed"
				checked={form?.values?.agreed ?? false}
				required
				align="start"
				class="mt-5"
			>
				<span class="text-sm text-white"> I've read what's asked of me. </span>
			</ChoiceCard>
		</div>
	</Panel>

	<div class="flex items-center gap-4">
		<Button type="submit" size="lg" disabled={submitting}>
			<IconClipboard class="h-5 w-5" />
			{submitting ? 'Submitting…' : 'Submit training request'}
		</Button>
		<p class="text-sm text-gray-400">You can withdraw this at any time.</p>
	</div>
</form>
