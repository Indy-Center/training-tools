<script lang="ts">
	import { enhance } from '$app/forms';
	import Panel from '$lib/components/Panel.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Timeline from '$lib/components/Timeline.svelte';
	import { STATUS_COLORS, STATUS_LABELS } from '$lib/enrollment-status';
	import {
		MAX_STUDENT_SLOTS,
		QUALIFICATION_LEVEL_LABELS,
		TEACHER_STATUS_LABELS
	} from '$lib/teachers';
	import { AVAILABILITY_MAX_LENGTH } from '$lib/enrollment';
	import IconArrowLeft from '~icons/mdi/arrow-left';
	import IconCalendarClock from '~icons/mdi/calendar-clock';
	import IconCog from '~icons/mdi/cog';
	import IconSeal from '~icons/mdi/seal';
	import IconAccountMultiple from '~icons/mdi/account-multiple-check';
	import IconAlert from '~icons/mdi/alert-circle';
	import IconCheck from '~icons/mdi/check-circle';
	import IconOpen from '~icons/mdi/open-in-new';

	let { data, form } = $props();

	let saving = $state(false);

	function submitting() {
		saving = true;
		return async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
			// Keep what was typed on the form after saving; it is the saved value.
			await update({ reset: false });
			saving = false;
		};
	}

	const canEditProfile = $derived(data.teacher.onRoster && (data.manager || data.self));
	const canAdmin = $derived(data.teacher.onRoster && data.manager);

	const inputClasses =
		'w-full rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-sky-500 focus:ring-sky-500/50';
	const buttonClasses =
		'inline-flex cursor-pointer items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60';
</script>

<svelte:head>
	<title>Indy Center | {data.teacher.name}</title>
</svelte:head>

{#if data.manager}
	<a
		href="/teachers"
		class="inline-flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300"
	>
		<IconArrowLeft class="h-4 w-4" />
		Teacher roster
	</a>
{:else}
	<a href="/teach" class="inline-flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300">
		<IconArrowLeft class="h-4 w-4" />
		Back to Teach
	</a>
{/if}

<div class="mt-4 mb-8">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-3xl font-bold text-white">{data.teacher.name}</h1>
		<Badge
			size="sm"
			color={data.teacher.status === 'loa' ? 'orange' : 'green'}
			label={TEACHER_STATUS_LABELS[data.teacher.status]}
		/>
		{#if !data.teacher.onRoster}
			<Badge size="sm" color="gray" label="Not on the teacher roster" />
		{/if}
	</div>
	<p class="mt-2 font-mono text-sm text-gray-400">
		{data.teacher.cid} · {data.teacher.ratingShort} · {data.teacher.roles.length > 0
			? `ZID ${data.teacher.roles.join(' + ')}`
			: 'no ZID teaching role'} · initials {data.teacher.initials ?? 'not set'}
	</p>
	{#if !data.teacher.onRoster && data.teacher.removedAt}
		<p class="mt-2 text-sm text-gray-400">
			Left the teacher roster {new Date(data.teacher.removedAt).toLocaleDateString()}. Their
			qualifications are kept for six months in case they return, then end. Nothing here can be
			edited until they are back.
		</p>
	{/if}
</div>

<div class="grid gap-6 lg:grid-cols-2">
	<Panel title="Availability and slots" icon={IconCalendarClock}>
		<div class="px-4 py-5">
			<p class="mb-4 text-sm text-gray-400">
				{data.slots.used} in training{#if data.slots.total !== null}
					of {data.slots.total} slots{/if}.
				{#if data.teacher.status === 'loa'}
					On LOA: these slots are shown but not counted as open.
				{:else if data.slots.available !== null}
					{data.slots.available} open.
				{/if}
				Training admins are told when this changes.
			</p>

			{#if form?.profileSaved}
				<p class="mb-4 flex items-center gap-2 text-sm text-green-400">
					<IconCheck class="h-4 w-4" /> Saved.
				</p>
			{/if}
			{#if form?.profileError}
				<p class="mb-4 text-sm text-red-400">{form.profileError}</p>
			{/if}

			{#if canEditProfile}
				<form method="POST" action="?/updateProfile" use:enhance={submitting} class="space-y-4">
					<div>
						<label for="studentSlots" class="block text-sm text-gray-400">
							Students you can take at once
						</label>
						<input
							id="studentSlots"
							name="studentSlots"
							type="number"
							min="0"
							max={MAX_STUDENT_SLOTS}
							step="1"
							value={data.teacher.studentSlots ?? ''}
							placeholder="Not set"
							class="mt-2 w-32 {inputClasses}"
						/>
						{#if form?.profileErrors?.studentSlots}
							<p class="mt-2 text-sm text-red-400">{form.profileErrors.studentSlots}</p>
						{/if}
					</div>

					<div>
						<label for="availability" class="block text-sm text-gray-400">
							When you can teach
						</label>
						<textarea
							id="availability"
							name="availability"
							rows="4"
							maxlength={AVAILABILITY_MAX_LENGTH}
							placeholder="e.g. Weeknights after 7pm Eastern, most Sundays"
							class="mt-2 {inputClasses}">{data.teacher.availability ?? ''}</textarea
						>
						{#if form?.profileErrors?.availability}
							<p class="mt-2 text-sm text-red-400">{form.profileErrors.availability}</p>
						{/if}
					</div>

					<button type="submit" disabled={saving} class={buttonClasses}>
						{saving ? 'Saving…' : 'Save'}
					</button>
				</form>
			{:else}
				<p class="text-sm whitespace-pre-line text-white">
					{data.teacher.availability ?? 'No availability set.'}
				</p>
			{/if}
		</div>
	</Panel>

	{#if data.manager}
		<Panel title="Status and initials" icon={IconCog}>
			<div class="px-4 py-5">
				<p class="mb-4 text-sm text-gray-400">
					Initials are what TRK's Teacher dropdown shows for them; without any, their CID is used.
					Going on LOA with students assigned warns training admins.
				</p>

				{#if form?.adminSaved}
					<p class="mb-4 flex items-center gap-2 text-sm text-green-400">
						<IconCheck class="h-4 w-4" /> Saved.
					</p>
				{/if}
				{#if form?.adminError}
					<p class="mb-4 text-sm text-red-400">{form.adminError}</p>
				{/if}

				<form method="POST" action="?/updateAdmin" use:enhance={submitting} class="space-y-4">
					<fieldset disabled={!canAdmin} class="space-y-4">
						<div>
							<span class="block text-sm text-gray-400">Status</span>
							<div class="mt-2 flex gap-3">
								{#each ['active', 'loa'] as const as status (status)}
									<label
										class="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700/60 px-4 py-2 text-sm text-white has-checked:border-sky-500/50 has-checked:bg-sky-500/10"
									>
										<input
											type="radio"
											name="status"
											value={status}
											checked={data.teacher.status === status}
											class="border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/50"
										/>
										{TEACHER_STATUS_LABELS[status]}
									</label>
								{/each}
							</div>
						</div>

						<div>
							<label for="initials" class="block text-sm text-gray-400">Operating initials</label>
							<input
								id="initials"
								name="initials"
								maxlength="2"
								value={data.teacher.initials ?? ''}
								placeholder="e.g. SC"
								class="mt-2 w-24 font-mono uppercase {inputClasses}"
							/>
							<!-- TODO(identity): read these from identity's operatingInitials once
							     community-website is on identity (DEV-5). -->
						</div>

						<button type="submit" disabled={saving} class={buttonClasses}>
							{saving ? 'Saving…' : 'Save'}
						</button>
					</fieldset>
				</form>
			</div>
		</Panel>
	{/if}
</div>

<div class="mt-6 grid gap-6 lg:grid-cols-2">
	<Panel title="Qualifications" icon={IconSeal}>
		<div class="px-4 py-5">
			<p class="mb-4 text-sm text-gray-400">
				Evaluations are the rating exams: S-GC (S1), A-LC (S2), T-RC (S3) and E-RC (C1). Instructors
				evaluate all four automatically; an S3+ mentor may be made an evaluator on S-GC only.
			</p>

			{#if form?.qualificationsSaved}
				<p class="mb-4 flex items-center gap-2 text-sm text-green-400">
					<IconCheck class="h-4 w-4" /> Saved.
				</p>
			{/if}
			{#if form?.qualificationErrors}
				<div
					class="mb-4 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
				>
					<IconAlert class="mt-0.5 h-5 w-5 shrink-0" />
					<ul>
						{#each form.qualificationErrors as problem (problem)}
							<li>{problem}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<form method="POST" action="?/setQualifications" use:enhance={submitting}>
				<fieldset disabled={!canAdmin}>
					<ul class="divide-y divide-slate-700/60">
						{#each data.qualifications as qualification (qualification.code)}
							<li class="flex flex-wrap items-center justify-between gap-3 py-2">
								<label for="level-{qualification.code}" class="min-w-0 text-sm text-white">
									{qualification.name}
									<span class="font-mono text-xs text-gray-500">({qualification.code})</span>
								</label>
								{#if qualification.automatic}
									<span class="text-sm text-green-300">
										{QUALIFICATION_LEVEL_LABELS.evaluator}
										<span class="block text-right text-xs text-gray-500">automatic</span>
									</span>
								{:else if canAdmin}
									<select
										id="level-{qualification.code}"
										name="level:{qualification.code}"
										class="rounded-lg border border-slate-600/50 bg-slate-900/60 py-1.5 text-sm text-white focus:border-sky-500 focus:ring-sky-500/50"
									>
										<option value="" selected={qualification.level === null}>
											{QUALIFICATION_LEVEL_LABELS.none}
										</option>
										{#each qualification.allowed as level (level)}
											<option value={level} selected={qualification.level === level}>
												{QUALIFICATION_LEVEL_LABELS[level]}
											</option>
										{/each}
									</select>
								{:else}
									<span
										class={qualification.level ? 'text-sm text-white' : 'text-sm text-gray-500'}
									>
										{QUALIFICATION_LEVEL_LABELS[qualification.level ?? 'none']}
									</span>
								{/if}
							</li>
						{/each}
					</ul>

					{#if canAdmin}
						<button type="submit" disabled={saving} class="mt-4 {buttonClasses}">
							{saving ? 'Saving…' : 'Save qualifications'}
						</button>
					{/if}
				</fieldset>
			</form>
		</div>
	</Panel>

	<Panel title="Students" icon={IconAccountMultiple}>
		{#if data.students.length === 0}
			<p class="px-4 py-5 text-sm text-gray-400">Nobody is assigned right now.</p>
		{:else}
			<ul class="divide-y divide-slate-700/60">
				{#each data.students as student (student.enrollmentId)}
					<li class="flex flex-wrap items-center gap-2 px-4 py-3">
						<span class="text-sm text-white">{student.name}</span>
						<span class="font-mono text-xs text-gray-500">{student.cid}</span>
						<Badge size="sm" color="sky" label={student.course} />
						<Badge
							size="sm"
							color={STATUS_COLORS[student.status] ?? 'gray'}
							label={STATUS_LABELS[student.status] ?? student.status}
						/>
						{#if student.issueUrl}
							<a
								href={student.issueUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
							>
								{student.issueKey}
								<IconOpen class="h-3 w-3" />
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Panel>
</div>

<div class="mt-6">
	<Timeline entries={data.timeline} names={data.names} />
</div>
