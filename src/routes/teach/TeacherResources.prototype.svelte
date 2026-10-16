<!--
	PROTOTYPE — throwaway, never merge. Question: what should the teacher-resources
	panel on /teach look like? (tickets/teacher-resources, 0036)

	Three variants in the panel's agreed slot (last in the left column), switched
	with ?variant=A|B|C and the pink bar at the bottom. The data is a stub in this
	file: no CMS, no D1. ?resources=1 shows a list of one, ?resources=0 hides it.
-->
<script lang="ts">
	import { page } from '$app/state';
	import Panel from '$lib/components/ui/Panel.svelte';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import IconBookshelf from '~icons/mdi/bookshelf';
	import IconOpen from '~icons/mdi/open-in-new';
	import IconLinkVariant from '~icons/mdi/link-variant';
	import IconFileDocument from '~icons/mdi/file-document';
	import IconBookOpenVariant from '~icons/mdi/book-open-variant';
	import IconGoogleDrive from '~icons/mdi/google-drive';
	import IconTable from '~icons/mdi/table';
	import IconFormSelect from '~icons/mdi/form-select';
	import IconVideo from '~icons/mdi/video';
	import IconYoutube from '~icons/mdi/youtube';
	import IconCalendar from '~icons/mdi/calendar';
	import IconHeadset from '~icons/mdi/headset';
	import IconDiscord from '~icons/mdi/discord';
	import IconMap from '~icons/mdi/map';
	import IconRadar from '~icons/mdi/radar';
	import IconAirplane from '~icons/mdi/airplane';
	import IconSchool from '~icons/mdi/school';
	import IconClipboardText from '~icons/mdi/clipboard-text';
	import IconWeb from '~icons/mdi/web';
	import IconHelpCircle from '~icons/mdi/help-circle';

	const ICONS: Record<string, typeof IconLinkVariant> = {
		'link-variant': IconLinkVariant,
		'file-document': IconFileDocument,
		'book-open-variant': IconBookOpenVariant,
		'google-drive': IconGoogleDrive,
		table: IconTable,
		'form-select': IconFormSelect,
		video: IconVideo,
		youtube: IconYoutube,
		calendar: IconCalendar,
		headset: IconHeadset,
		discord: IconDiscord,
		map: IconMap,
		radar: IconRadar,
		airplane: IconAirplane,
		school: IconSchool,
		'clipboard-text': IconClipboardText,
		web: IconWeb,
		'help-circle': IconHelpCircle
	};
	const iconFor = (name: string) => ICONS[name] ?? IconLinkVariant;

	type Resource = {
		title: string;
		description: string | null;
		url: string;
		newTab: boolean;
		icon: string;
	};

	// Stub: what a Training Admin might plausibly put in the Global.
	const STUB: Resource[] = [
		{
			title: 'Training Order',
			description: 'The facility training order. What every rating and endorsement requires.',
			url: 'https://example.com/training-order.pdf',
			newTab: true,
			icon: 'book-open-variant'
		},
		{
			title: 'Lesson plans',
			description: 'Shared folder of lesson plans, by course.',
			url: 'https://drive.google.com/example',
			newTab: true,
			icon: 'google-drive'
		},
		{
			title: 'OTS evaluation checklist',
			description: null,
			url: 'https://example.com/ots-checklist',
			newTab: true,
			icon: 'clipboard-text'
		},
		{
			title: 'Mentor sign-up sheet',
			description:
				'Put your name against the sessions you can cover next month. The training admin assigns from this sheet on the 25th, so please fill it in before then.',
			url: 'https://docs.google.com/spreadsheets/example',
			newTab: true,
			icon: 'table'
		},
		{
			title: 'vNAS training scenarios',
			description: 'Scenario files for the sweatbox, with the traffic each one loads.',
			url: 'https://example.com/scenarios',
			newTab: true,
			icon: 'radar'
		},
		{
			title: 'Instructor meeting recordings',
			description: null,
			url: 'https://youtube.com/example',
			newTab: true,
			icon: 'youtube'
		},
		{
			title: 'A row with an icon payload no longer offers',
			description: 'Draws link-variant.',
			url: 'https://example.com',
			newTab: false,
			icon: 'something-retired'
		}
	];

	const resources = $derived.by(() => {
		const count = page.url.searchParams.get('resources');
		return count === null ? STUB : STUB.slice(0, Number(count));
	});

	const variant = $derived(page.url.searchParams.get('variant') ?? 'A');

	const linkAttrs = (resource: Resource) =>
		resource.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {};
</script>

{#if resources.length > 0}
	{#if variant === 'A'}
		<!-- A: the spec as written. A Panel of rows: icon, title link, description beneath. -->
		<div class="mt-6">
			<Panel title="Teacher resources" icon={IconBookshelf}>
				<ul class="divide-y divide-slate-700/60">
					{#each resources as resource, i (i)}
						{@const Icon = iconFor(resource.icon)}
						<li class="flex gap-3 px-4 py-3">
							<Icon class="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
							<div class="min-w-0">
								<a
									href={resource.url}
									{...linkAttrs(resource)}
									class="inline-flex items-center gap-1 text-sm font-medium text-sky-400 hover:text-sky-300"
								>
									{resource.title}
									{#if resource.newTab}
										<IconOpen class="h-3.5 w-3.5 opacity-60" />
									{/if}
								</a>
								{#if resource.description}
									<p class="mt-1 text-xs text-gray-400">{resource.description}</p>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</Panel>
		</div>
	{:else if variant === 'B'}
		<!-- B: a grid of tiles. The whole tile is the link; the icon leads; the description is clamped. -->
		<div class="mt-6">
			<Panel title="Teacher resources" icon={IconBookshelf}>
				<div class="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
					{#each resources as resource, i (i)}
						{@const Icon = iconFor(resource.icon)}
						<a
							href={resource.url}
							{...linkAttrs(resource)}
							title={resource.description ?? undefined}
							class="group flex flex-col gap-2 rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 transition-colors hover:border-sky-500/60 hover:bg-slate-900/80"
						>
							<div class="flex items-start justify-between">
								<span class="rounded-md bg-sky-500/10 p-2 text-sky-400">
									<Icon class="h-5 w-5" />
								</span>
								{#if resource.newTab}
									<IconOpen class="h-4 w-4 text-gray-600 group-hover:text-gray-400" />
								{/if}
							</div>
							<span class="text-sm font-medium text-white group-hover:text-sky-300">
								{resource.title}
							</span>
							{#if resource.description}
								<span class="line-clamp-2 text-xs text-gray-400">{resource.description}</span>
							{/if}
						</a>
					{/each}
				</div>
			</Panel>
		</div>
	{:else if variant === 'C'}
		<!-- C: no Panel. A quiet strip of quick links under the panels; descriptions on hover only. -->
		<section class="mt-8 border-t border-slate-700/60 pt-4">
			<h2
				class="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-400 uppercase"
			>
				<IconBookshelf class="h-4 w-4" />
				Teacher resources
			</h2>
			<ul class="flex flex-wrap gap-2">
				{#each resources as resource, i (i)}
					{@const Icon = iconFor(resource.icon)}
					<li>
						<a
							href={resource.url}
							{...linkAttrs(resource)}
							title={resource.description ?? undefined}
							class="inline-flex items-center gap-2 rounded-full border border-slate-600/50 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-sky-500/60 hover:bg-white/5 hover:text-white"
						>
							<Icon class="h-4 w-4 text-sky-400" />
							{resource.title}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}

<PrototypeSwitcher
	variants={[
		{ key: 'A', name: 'List rows' },
		{ key: 'B', name: 'Tile grid' },
		{ key: 'C', name: 'Link strip' }
	]}
/>
