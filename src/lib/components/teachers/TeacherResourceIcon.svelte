<script lang="ts">
	import type { Component } from 'svelte';
	import type { SVGAttributes } from 'svelte/elements';
	import type { TeacherResourceIconName } from '$lib/teacher-resources';
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

	let { name, class: className }: { name: TeacherResourceIconName; class?: string } = $props();

	/**
	 * One static import per name: unplugin-icons compiles icons at build time,
	 * so the list is closed (decisions/0036). Typed by the list, so a name added
	 * there without an icon here fails the typecheck.
	 */
	const ICONS: Record<TeacherResourceIconName, Component<SVGAttributes<SVGSVGElement>>> = {
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

	// The CMS reader has already turned an unknown name into the link icon.
	const Icon = $derived(ICONS[name]);
</script>

<Icon class={className} />
