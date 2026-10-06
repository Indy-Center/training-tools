<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Alert from '$lib/components/Alert.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import { NOTIFICATION_LABELS } from '$lib/enrollment-status';
	import { formatDate } from '$lib/format';
	import IconCheck from '~icons/mdi/check-circle';
	import IconOpen from '~icons/mdi/open-in-new';
	import IconTable from '~icons/mdi/table-account';

	let { data, form } = $props();

	/** The row being worked on, so only its controls show as busy. */
	let busyId = $state<string | null>(null);

	/** Narrow the table to one course; empty shows them all. */
	let course = $state('');
	const courses = $derived([...new Set(data.rows.map((row) => row.course))]);
	const rows = $derived(course ? data.rows.filter((row) => row.course === course) : data.rows);

	/** `YYYY-MM-DD`, as the card holds it, shown the way every other date is. */
	const cardDate = (value: string) => formatDate(new Date(`${value}T12:00:00Z`));

	function contact(preference: string | null) {
		return preference
			? (NOTIFICATION_LABELS[preference as keyof typeof NOTIFICATION_LABELS] ?? preference)
			: '—';
	}

	/** Run a row's action, then reload so the table shows what the card now says. */
	function working(id: string, question?: string) {
		return ({ cancel }: { cancel: () => void }) => {
			if (question && !confirm(question)) return cancel();
			busyId = id;
			return async ({ update }: { update: () => Promise<void> }) => {
				await update();
				await invalidateAll();
				busyId = null;
			};
		};
	}
</script>

<svelte:head>
	<title>Indy Center | Waitlist</title>
</svelte:head>

<div class="mb-8">
	<h1 class="text-3xl font-bold text-white">Waitlist</h1>
	<p class="mt-2 text-gray-400">
		Everyone waiting for training, by course and then by how long they have waited. A course that
		ends in a rating exam needs its VATUSA written course passed before a teacher can be assigned.
	</p>
</div>

{#if form?.sheetError}
	<Alert class="mb-6">{form.sheetError}</Alert>
{:else if form?.sheetDone}
	<p class="mb-6 flex items-center gap-2 text-sm text-green-400">
		<IconCheck class="h-4 w-4" />
		{form.sheetDone}
		{#if form.sheetNote}<span class="text-orange-300">{form.sheetNote}</span>{/if}
	</p>
{/if}

{#if !data.vatusaKeySet}
	<Alert tone="warning" class="mb-6">
		No VATUSA API key is set, so courses cannot be assigned on VATUSA from here and passes are not
		picked up automatically. The buttons still date the card.
	</Alert>
{/if}

<Panel title="{rows.length} waiting" icon={IconTable}>
	<div class="flex flex-wrap items-center gap-2 border-b border-slate-700/60 px-4 py-3 text-sm">
		<label for="course" class="text-gray-400">Course</label>
		<select
			id="course"
			bind:value={course}
			class="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
		>
			<option value="">All courses</option>
			{#each courses as code (code)}
				<option value={code}>{code}</option>
			{/each}
		</select>
	</div>

	{#if rows.length === 0}
		<p class="px-4 py-5 text-sm text-gray-400">Nobody is on the waitlist.</p>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead class="border-b border-slate-700/60 text-xs text-gray-400 uppercase">
					<tr>
						<th class="px-3 py-3 font-medium">#</th>
						<th class="px-3 py-3 font-medium">Student</th>
						<th class="px-3 py-3 font-medium">Course</th>
						<th class="px-3 py-3 font-medium">Waiting since</th>
						<th class="px-3 py-3 font-medium">Availability</th>
						<th class="px-3 py-3 font-medium">Contact</th>
						<th class="px-3 py-3 font-medium">VATUSA course</th>
						<th class="px-3 py-3 font-medium">Teacher</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-700/60">
					{#each rows as row (row.id)}
						<tr class="align-top transition-colors duration-200 hover:bg-white/5">
							<td class="px-3 py-3 font-mono text-gray-400">{row.position}</td>
							<td class="px-3 py-3">
								<a href="/certifications/{row.cid}" class="text-white hover:text-sky-300">
									{row.name}
								</a>
								<div class="mt-0.5 flex flex-wrap gap-2 font-mono text-xs text-gray-500">
									<span>{row.cid}</span>
									<span>{row.ratingShort ?? '—'}</span>
									{#if row.issueUrl}
										<a
											href={row.issueUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300"
										>
											{row.issueKey}
											<IconOpen class="h-3 w-3" />
										</a>
									{/if}
								</div>
							</td>
							<td class="px-3 py-3">
								<Badge size="sm" color="sky" label={row.course} />
							</td>
							<td class="px-3 py-3 whitespace-nowrap text-gray-300">
								{formatDate(row.waitlistedAt)}
							</td>
							<td class="max-w-xs px-3 py-3 text-xs whitespace-pre-line text-gray-400">
								{row.availability ?? '—'}
							</td>
							<td class="px-3 py-3 text-xs whitespace-nowrap text-gray-400">
								{contact(row.notificationPreference)}
							</td>

							<td class="px-3 py-3 text-xs">
								{#if !row.exam}
									<span class="text-gray-500">Not needed</span>
								{:else if row.vatusaCompletedOn}
									<span class="flex items-center gap-1 text-green-400">
										<IconCheck class="h-4 w-4" />
										Passed {cardDate(row.vatusaCompletedOn)}
									</span>
								{:else if row.vatusaAssignedOn}
									<p class="text-gray-300">
										{row.exam} assigned {cardDate(row.vatusaAssignedOn)}
									</p>
									<form
										method="POST"
										action="?/completeVatusa"
										class="mt-2"
										use:enhance={working(
											row.id,
											`Mark the VATUSA ${row.exam} course as passed for ${row.name}?\n\nThis dates the card today. It is normally picked up from VATUSA by itself.`
										)}
									>
										<input type="hidden" name="id" value={row.id} />
										<Button type="submit" size="sm" variant="secondary" disabled={busyId !== null}>
											{busyId === row.id ? 'Working…' : 'Mark passed'}
										</Button>
									</form>
								{:else}
									<form
										method="POST"
										action="?/assignVatusa"
										use:enhance={working(
											row.id,
											`Assign the VATUSA ${row.exam} course to ${row.name}?\n\nThis dates the card today${data.vatusaKeySet ? ' and, where VATUSA allows it, assigns the course there, which emails them' : ''}.`
										)}
									>
										<input type="hidden" name="id" value={row.id} />
										<Button type="submit" size="sm" disabled={busyId !== null}>
											{busyId === row.id ? 'Working…' : `Assign ${row.exam}`}
										</Button>
									</form>
								{/if}
							</td>

							<td class="px-3 py-3 text-xs">
								{#if !row.gate.open}
									<span class="text-gray-500">
										{row.gate.reason === 'not-assigned'
											? 'After the VATUSA course'
											: 'Once the VATUSA course is passed'}
									</span>
								{:else if row.teachers.length === 0}
									<span class="text-orange-300">No active teacher is qualified for this course</span
									>
								{:else}
									<form
										method="POST"
										action="?/assignTeacher"
										class="flex flex-wrap items-center gap-2"
										use:enhance={working(row.id)}
									>
										<input type="hidden" name="id" value={row.id} />
										<select
											name="teacher"
											required
											class="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
										>
											<option value="">Choose a teacher</option>
											{#each row.teachers as teacher (teacher.cid)}
												<option value={teacher.cid}>
													{teacher.label}
													{teacher.available === null
														? '(slots not set)'
														: teacher.available === 0
															? '(full)'
															: `(${teacher.available} open)`}
												</option>
											{/each}
										</select>
										<Button type="submit" size="sm" disabled={busyId !== null}>
											{busyId === row.id ? 'Working…' : 'Assign'}
										</Button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</Panel>
