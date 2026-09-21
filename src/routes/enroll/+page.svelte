<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHero from '$lib/components/PageHero.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import { COURSES, findCourse } from '$lib/courses';
	import { ENROLLMENT_COPY } from '$lib/content/enrollment';
	import IconClipboard from '~icons/mdi/clipboard-text';
	import IconAccount from '~icons/mdi/account-circle';
	import IconClock from '~icons/mdi/clock-outline';
	import IconBell from '~icons/mdi/bell-outline';
	import IconCheck from '~icons/mdi/check-circle';
	import IconAlert from '~icons/mdi/alert-circle';
	import IconInformation from '~icons/mdi/information-outline';
	import IconHandshake from '~icons/mdi/handshake-outline';

	let { data, form } = $props();

	// `||`, not `??`: a failed submission with no course picked comes back as an
	// empty string, and falling back to the suggestion is kinder than showing
	// nothing selected.
	let selectedCourse = $derived(form?.values?.course || data.placement.suggested);

	let submitting = $state(false);

	// Mirrors the TRK workflow, which a student sees in their own terms.
	const STATUS_LABELS: Record<string, string> = {
		waitlist: 'On the waitlist',
		'in-training': 'In training',
		'rating-exam': 'Rating exam',
		'certification-update': 'Updating your certificate',
		completed: 'Completed',
		removed: 'Removed from the waitlist',
		withdrawn: 'Withdrawn'
	};

	const STATUS_COLORS: Record<string, 'yellow' | 'sky' | 'green' | 'gray'> = {
		waitlist: 'yellow',
		'in-training': 'sky',
		'rating-exam': 'sky',
		'certification-update': 'sky',
		completed: 'green',
		removed: 'gray',
		withdrawn: 'gray'
	};

	const STATUS_DETAIL: Record<string, string> = {
		waitlist: 'Training staff work the waitlist in order and will reach out when a mentor is free.',
		'in-training': 'You have a mentor assigned. They will arrange sessions with you directly.',
		'rating-exam': 'Your training is done and your rating exam is being arranged.',
		'certification-update': 'You passed — your certificate is being updated.',
		completed: 'This course is complete.',
		removed:
			'Training staff took this request off the waitlist. Ask them on Discord if this looks wrong.'
	};

	let statusDetail = $derived(
		STATUS_DETAIL[data.enrollment?.status ?? ''] ?? 'Training staff will reach out with next steps.'
	);

	let openCourse = $derived(data.enrollment ? findCourse(data.enrollment.course) : undefined);

	const dateFormat = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
</script>

<svelte:head>
	<title>Indy Center | Enroll</title>
</svelte:head>

<PageHero size="compact">
	<h1 class="text-3xl font-bold sm:text-4xl">Enroll in training</h1>
	<p class="mt-2 text-gray-300">Request training for a new position at Indy Center.</p>
</PageHero>

<div class="w-full bg-gray-900">
	<div class="mx-auto max-w-3xl px-4 py-10">
		{#if data.enrollment}
			<!-- One course at a time: someone with an open request sees where it
			     stands rather than a form that would be refused. -->
			<Panel title="Your training request" icon={IconCheck}>
				<div class="space-y-5 px-4 py-5 text-sm text-gray-300">
					<div class="flex flex-wrap items-center gap-2">
						<Badge size="sm" color="sky" label={openCourse?.label ?? data.enrollment.course} />
						<Badge
							size="sm"
							color={STATUS_COLORS[data.enrollment.status] ?? 'gray'}
							label={STATUS_LABELS[data.enrollment.status] ?? data.enrollment.status}
						/>
					</div>

					<p>
						Submitted {dateFormat.format(new Date(data.enrollment.createdAt))}. {statusDetail}
					</p>

					{#if data.enrollment.availability}
						<div>
							<h3 class="text-xs font-semibold tracking-wide text-gray-400 uppercase">
								Availability you gave us
							</h3>
							<p class="mt-1 whitespace-pre-line">{data.enrollment.availability}</p>
						</div>
					{/if}

					<div class="border-t border-slate-700/60 pt-4">
						<p class="text-gray-400">
							Picked the wrong course, or need to step away? Withdrawing frees your place and lets
							you submit a new request.
						</p>
						<form
							method="POST"
							action="?/withdraw"
							use:enhance
							onsubmit={(event) => {
								if (!confirm('Withdraw this training request?')) event.preventDefault();
							}}
							class="mt-3"
						>
							<input type="hidden" name="id" value={data.enrollment.id} />
							<button
								type="submit"
								class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600/50 px-4 py-2 text-sm font-medium text-gray-300 transition-colors duration-200 hover:bg-white/10 hover:text-white"
							>
								Withdraw this request
							</button>
						</form>
					</div>
				</div>
			</Panel>
		{:else}
			{#if form?.formError}
				<div
					class="mb-6 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
				>
					<IconAlert class="mt-0.5 h-5 w-5 shrink-0" />
					<span>{form.formError}</span>
				</div>
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
				<!-- DEV-119: read before choosing a course, not after. The agreement stays
				     last, right before submit. {@html} is safe here because the HTML is
				     compiled at build time from markdown in this repo — see vite.config.ts. -->
				<Panel title="Before you enroll" icon={IconInformation}>
					<div class="prose prose-sm max-w-none px-4 py-5 prose-invert prose-a:text-sky-400">
						{@html ENROLLMENT_COPY.whatHappensNext}
						{@html ENROLLMENT_COPY.writtenExam}
					</div>
				</Panel>

				<Panel title="Your details" icon={IconAccount}>
					<div class="px-4 py-5">
						<p class="text-sm text-gray-400">
							Taken from your VATSIM account and our roster — nothing to fill in twice.
						</p>
						<dl class="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
							<div>
								<dt class="text-xs tracking-wide text-gray-400 uppercase">Name</dt>
								<dd class="mt-1 text-white">{data.controller.name}</dd>
							</div>
							<div>
								<dt class="text-xs tracking-wide text-gray-400 uppercase">CID</dt>
								<dd class="mt-1 text-white">{data.controller.cid}</dd>
							</div>
							<div>
								<dt class="text-xs tracking-wide text-gray-400 uppercase">Rating</dt>
								<dd class="mt-1 text-white">{data.controller.rating ?? 'Unknown'}</dd>
							</div>
						</dl>
					</div>
				</Panel>

				<Panel title="Course of training" icon={IconClipboard}>
					<div class="px-4 py-5">
						{#if data.credentials.certification || data.credentials.endorsements.length > 0}
							<!-- The basis for the suggestion below. Without it, "we selected X"
							     asks the student to trust a conclusion they can't check. -->
							<div class="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-400">
								<span>You currently hold</span>
								{#if data.credentials.certification}
									<Badge size="sm" color="sky" label={data.credentials.certification} />
								{/if}
								{#each data.credentials.endorsements as endorsement (endorsement)}
									<Badge size="sm" color="purple" label={endorsement} />
								{/each}
							</div>
						{/if}

						{#if data.placement.suggested}
							<div
								class="flex items-start gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200"
							>
								<IconInformation class="mt-0.5 h-5 w-5 shrink-0" />
								<span>
									{data.placement.reason} We've selected it for you — pick something else if you think
									it's wrong, and training staff will confirm.
								</span>
							</div>
						{:else}
							<!-- No suggestion is an honest answer, not an error: say why. -->
							<p class="text-sm text-gray-400">{data.placement.reason}</p>
						{/if}

						{#if form?.errors?.course}
							<p class="mt-3 text-sm text-red-400">{form.errors.course}</p>
						{/if}

						<div class="mt-4 space-y-2">
							{#each COURSES as course (course.code)}
								<label
									class="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700/60 px-4 py-3 transition-colors duration-200 hover:bg-white/5 has-checked:border-sky-500/50 has-checked:bg-sky-500/10"
								>
									<input
										type="radio"
										name="course"
										value={course.code}
										checked={selectedCourse === course.code}
										required
										class="mt-1 border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/50"
									/>
									<span class="min-w-0">
										<span class="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
											{course.label}
											{#if course.code === data.placement.suggested}
												<Badge size="sm" color="sky" label="Suggested" />
											{/if}
										</span>
										<span class="mt-0.5 block text-sm text-gray-400">{course.description}</span>
									</span>
								</label>
							{/each}
						</div>
					</div>
				</Panel>

				<Panel title="Availability" icon={IconClock}>
					<div class="px-4 py-5">
						<label for="availability" class="block text-sm text-gray-400">
							Roughly when can you train? Days of the week and times work best — include your time
							zone.
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
							{#each [{ value: 'discord', label: 'Discord message' }, { value: 'email', label: 'Email' }] as option (option.value)}
								<label
									class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-700/60 px-4 py-3 transition-colors duration-200 hover:bg-white/5 has-checked:border-sky-500/50 has-checked:bg-sky-500/10"
								>
									<input
										type="radio"
										name="notificationPreference"
										value={option.value}
										checked={form?.values?.notificationPreference === option.value}
										required
										class="border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/50"
									/>
									<span class="text-sm text-white">{option.label}</span>
								</label>
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

						<label
							class="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700/60 px-4 py-3 transition-colors duration-200 hover:bg-white/5 has-checked:border-sky-500/50 has-checked:bg-sky-500/10"
						>
							<input
								type="checkbox"
								name="agreed"
								checked={form?.values?.agreed ?? false}
								required
								class="mt-0.5 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/50"
							/>
							<span class="text-sm text-white">
								I've read what's asked of me and what I can expect.
							</span>
						</label>
					</div>
				</Panel>

				<div class="flex items-center gap-4">
					<button
						type="submit"
						disabled={submitting}
						class="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-sky-600 px-6 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<IconClipboard class="h-5 w-5" />
						{submitting ? 'Submitting…' : 'Submit training request'}
					</button>
					<p class="text-sm text-gray-400">You can withdraw this at any time.</p>
				</div>
			</form>
		{/if}
	</div>
</div>
