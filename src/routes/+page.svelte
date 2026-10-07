<script lang="ts">
	import PageHero from '$lib/components/ui/PageHero.svelte';
	import Panel from '$lib/components/ui/Panel.svelte';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CopyPanel from '$lib/components/content/CopyPanel.svelte';
	import EnrollmentForm from './EnrollmentForm.svelte';
	import RequestDetails from './RequestDetails.svelte';
	import { loginUrl } from '$lib/identity-links';
	import { displayName } from '$lib/user';
	import { page } from '$app/state';
	import { findCourse, formatWeeksRange } from '$lib/courses';
	import { academyExamFor } from '$lib/vatusa-academy';
	import { SHARED_COPY, TRAINING_COPY, TRAINING_TEXT } from '$lib/content/training';
	import { NOTIFICATION_LABELS } from '$lib/enrollment-status';
	import IconAccount from '~icons/mdi/account-circle';
	import IconAccountClock from '~icons/mdi/account-clock';
	import IconAccountSwitch from '~icons/mdi/account-switch';
	import IconAirplaneTakeoff from '~icons/mdi/airplane-takeoff';
	import IconBook from '~icons/mdi/book-open-variant';
	import IconCertificate from '~icons/mdi/certificate';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconOpenInNew from '~icons/mdi/open-in-new';
	import IconSchool from '~icons/mdi/school';
	import IconStar from '~icons/mdi/star-outline';

	let { data, form } = $props();

	let returnUrl = $derived(page.url.href);

	/** "Jo Rivera (JR)", or just what the board holds when it is not one of our teachers. */
	function assigneeLabel(assignee: { value: string; name: string | null } | null): string {
		if (!assignee) return TRAINING_TEXT.notAssignedYet;
		return assignee.name ? `${assignee.name} (${assignee.value})` : assignee.value;
	}
</script>

<svelte:head>
	<title>Indy Center | Training</title>
	<meta
		name="description"
		content="Controller training at Indy Center — enroll and track your progress."
	/>
</svelte:head>

<!-- A label and its value, for the data a view draws beside its copy. -->
{#snippet fact(label: string, value: string)}
	<div class="flex items-center justify-between gap-4 px-4 py-3">
		<dt class="text-gray-400">{label}</dt>
		<dd class="text-right font-medium text-white">{value}</dd>
	</div>
{/snippet}

{#if !data.user || !data.flow}
	<!-- Signed out: a sign-in call to action and nothing else. Everything this
	     app does needs to know who you are. -->
	<PageHero>
		<h1 class="text-4xl font-bold sm:text-5xl">{SHARED_COPY.signedOut.title}</h1>
		<div class="mx-auto mt-4 max-w-xl text-gray-300">
			{@html SHARED_COPY.signedOut.body}
		</div>
		<div class="mt-8 flex justify-center">
			<Button href={loginUrl(data.identityUrl, returnUrl)} size="lg" data-sveltekit-reload>
				<IconAccount class="h-5 w-5" />
				{TRAINING_TEXT.signInButton}
			</Button>
		</div>
	</PageHero>
{:else}
	<PageHero size="compact">
		<h1 class="text-3xl font-bold sm:text-4xl">Welcome, {displayName(data.user)}</h1>
		{#if data.rosterMember}
			<div class="mt-3 flex items-center justify-center gap-2">
				<Badge size="sm" color="sky" label={data.rosterMember.ratingShort} />
				{#if data.rosterMember.membership === 'visit'}
					<Badge size="sm" color="purple" label="Visiting from {data.rosterMember.facility}" />
				{/if}
			</div>
		{/if}
	</PageHero>

	<div class="w-full bg-gray-900">
		<div class="mx-auto max-w-3xl space-y-6 px-4 py-10">
			{#if data.request}
				<!-- A request is open: where it stands, whatever else has changed. -->
				{@const request = data.request}
				{@const course = findCourse(request.course)}

				{#if request.status === 'waitlist'}
					<CopyPanel copy={TRAINING_COPY.waitlist} icon={IconAccountClock}>
						{#if request.waitlist}
							<dl class="divide-y divide-slate-700/60 rounded-lg border border-slate-700/60">
								{@render fact(
									'Your place',
									`#${request.waitlist.ahead + 1} of ${request.waitlist.waiting} waiting`
								)}
								{#if course?.estimatedWeeks}
									{@render fact(
										'Course length, once you start',
										formatWeeksRange(course.estimatedWeeks) ?? ''
									)}
								{/if}
								{#if request.notificationPreference}
									{@render fact(
										"We'll contact you by",
										NOTIFICATION_LABELS[request.notificationPreference]
									)}
								{/if}
							</dl>
						{/if}
					</CopyPanel>
				{:else if request.status === 'in-training'}
					<CopyPanel copy={TRAINING_COPY['in-training']} icon={IconSchool}>
						<dl class="divide-y divide-slate-700/60 rounded-lg border border-slate-700/60">
							{@render fact('Your teacher', assigneeLabel(request.teacher))}
						</dl>
					</CopyPanel>

					<!-- Scheduling and the student's next lesson belong between these two
					     panels once lessons are recorded here. -->

					<Panel title="Your course" icon={IconBook}>
						<div class="space-y-4 px-4 py-5 text-sm text-gray-300">
							<div>
								<div class="font-medium text-white">{course?.label ?? request.course}</div>
								{#if course}
									<p class="mt-0.5 text-gray-400">{course.description}</p>
								{/if}
							</div>
							{#if course?.estimatedWeeks}
								<p>
									Takes about
									<span class="font-medium text-white"
										>{formatWeeksRange(course.estimatedWeeks)}</span
									>, assuming one lesson a week.
								</p>
							{/if}
							{#if request.moodleUrl}
								<Button href={request.moodleUrl} target="_blank" rel="noopener noreferrer">
									<IconSchool class="h-5 w-5" />
									{TRAINING_TEXT.openCourseButton}
									<IconOpenInNew class="h-4 w-4" />
								</Button>
							{:else}
								<p class="text-gray-400">{TRAINING_TEXT.noCourseLink}</p>
							{/if}
						</div>
					</Panel>
				{:else if request.status === 'rating-exam'}
					<CopyPanel copy={TRAINING_COPY['rating-exam']} icon={IconCertificate}>
						<dl class="divide-y divide-slate-700/60 rounded-lg border border-slate-700/60">
							{@render fact('Your examiner', assigneeLabel(request.instructor))}
						</dl>
					</CopyPanel>
				{:else if request.status === 'needs-catp'}
					<CopyPanel copy={TRAINING_COPY['needs-catp']} icon={IconSchool} />
				{:else}
					<CopyPanel copy={TRAINING_COPY['certification-update']} icon={IconCertificate} />
				{/if}

				<RequestDetails {request} error={form?.formError} />
			{:else if data.flow === 'enroll' && data.enroll}
				<!-- Home controller, consolidated, with a course left to take. -->
				{@const course = data.nextCourse ? findCourse(data.nextCourse) : undefined}
				{#if course}
					<EnrollmentForm
						intro={academyExamFor(course.code) ? SHARED_COPY.enrollAcademy : TRAINING_COPY.enroll}
						{course}
						controller={data.enroll.controller}
						credentials={data.enroll.credentials}
						{form}
					/>
				{:else}
					<Alert>{TRAINING_TEXT.noNextCourse}</Alert>
				{/if}
			{:else if data.flow === 'consolidating'}
				<!-- Home controller with a course left to take, but not yet eligible for it. -->
				{@const consolidation = data.consolidation}
				{@const course = data.nextCourse ? findCourse(data.nextCourse) : undefined}
				{#if consolidation?.status === 'not-met'}
					<CopyPanel copy={TRAINING_COPY.consolidating} icon={IconClockOutline}>
						<div>
							<div class="mb-1 flex justify-between text-xs text-gray-400">
								<span>{consolidation.logged.toFixed(1)} qualifying hours logged</span>
								<span>{consolidation.required} hours required</span>
							</div>
							<div class="h-2 w-full overflow-hidden rounded-full bg-gray-800">
								<div
									class="h-full rounded-full bg-sky-600"
									style="width: {Math.min(
										100,
										(consolidation.logged / consolidation.required) * 100
									)}%"
								></div>
							</div>
						</div>
						{#if course}
							<p>
								Your next course: <span class="font-medium text-white">{course.label}</span>
							</p>
						{/if}
					</CopyPanel>
				{:else}
					<CopyPanel copy={SHARED_COPY.consolidationUnknown} icon={IconClockOutline} />
				{/if}
			{:else if data.flow === 'extra-courses'}
				<!-- Home controller at the top of the ladder: nothing left to enroll in. -->
				<CopyPanel copy={TRAINING_COPY['extra-courses']} icon={IconStar} />
				{#if data.tier2Due}
					<CopyPanel copy={SHARED_COPY.tier2} icon={IconSchool} />
				{/if}
			{:else if data.flow === 'visiting-controller'}
				<!-- Rostered, but visiting. On the roster, so not a recruitment pitch. -->
				<CopyPanel copy={TRAINING_COPY['visiting-controller']} icon={IconAirplaneTakeoff} />
				{#if data.tier2Due}
					<CopyPanel copy={SHARED_COPY.tier2} icon={IconSchool} />
				{/if}
			{:else if data.flow === 'transfer-or-visit'}
				<!-- A rated VATUSA controller, but not ours: the pitch is transfer or visit. -->
				<CopyPanel copy={TRAINING_COPY['transfer-or-visit']} icon={IconAccountSwitch} />
			{:else}
				<!-- Not a rated VATUSA controller yet. -->
				<CopyPanel copy={TRAINING_COPY['become-controller']} icon={IconSchool} />
			{/if}
		</div>
	</div>
{/if}
