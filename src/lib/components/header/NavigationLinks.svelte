<script lang="ts">
	import type { User } from '@indy-center/identity';
	import { page } from '$app/state';
	import {
		canEditCertifications,
		canManageStudents,
		canManageTeachers
	} from '$lib/utils/permissions';
	import { COMMUNITY_URL } from '$lib/config';
	import { STUDENT_VIEW_HREF } from '$lib/training-flow';
	import IconHome from '~icons/mdi/home';
	import IconClipboard from '~icons/mdi/clipboard-text';
	import IconChartBar from '~icons/mdi/chart-bar';
	import IconSchool from '~icons/mdi/school';
	import IconCertificate from '~icons/mdi/certificate';
	import IconTeach from '~icons/mdi/human-male-board';
	import IconTeachers from '~icons/mdi/account-group';
	import IconTable from '~icons/mdi/table-account';

	let {
		user,
		roles,
		isTeacher = false,
		landsOnTeach = false,
		openEnrollmentStatus = null,
		mobile = false
	}: {
		user: User | undefined;
		roles: string[] | undefined;
		isTeacher?: boolean;
		/** The site opens on `/teach` for them, so `/` is linked by name to get past that. */
		landsOnTeach?: boolean;
		/** Status of their open request, or null when they have none. */
		openEnrollmentStatus?: string | null;
		mobile?: boolean;
	} = $props();

	// "Home" is the community site's home page, not this app's `/` — the same
	// place the logo goes. It is the one link that needs no session.
	const HOME_LINK = { label: 'Home', href: COMMUNITY_URL, icon: IconHome };

	// One link to `/`, the student view, named for what it will show: the way to
	// start a request, a request still waiting, or training under way.
	const studentHref = $derived(landsOnTeach ? STUDENT_VIEW_HREF : '/');
	const trainingLink = $derived(
		openEnrollmentStatus === null
			? { label: 'Enroll', href: studentHref, icon: IconClipboard }
			: openEnrollmentStatus === 'waitlist'
				? { label: 'My Enrollment', href: studentHref, icon: IconClipboard }
				: { label: 'My Training', href: studentHref, icon: IconSchool }
	);

	// Signed out, Home is all there is: every other destination is gated, so
	// advertising it would just bounce people to identity. `/` carries the
	// sign-in call to action.
	const links = $derived([
		HOME_LINK,
		...(user
			? [
					trainingLink,
					// On the teacher roster (VATUSA INS/MTR), not an identity role.
					...(isTeacher
						? [
								{
									label: 'Teach',
									href: '/teach',
									icon: IconTeach
								}
							]
						: []),
					{
						label: 'Waitlist',
						href: '/stats',
						icon: IconChartBar
					},
					// The staff side of the waitlist: everyone on it, and the way off it.
					...(canManageStudents(roles)
						? [
								{
									label: 'Manage Waitlist',
									href: '/waitlist',
									icon: IconTable
								}
							]
						: []),
					...(canEditCertifications(roles)
						? [
								{
									label: 'Certifications',
									href: '/certifications',
									icon: IconCertificate
								}
							]
						: []),
					...(canManageTeachers(roles)
						? [
								{
									label: 'Teachers',
									href: '/teachers',
									icon: IconTeachers
								}
							]
						: [])
				]
			: [])
	]);

	function isActive(href: string) {
		// By path alone: the student view's link may carry a query.
		const path = href.split('?')[0];
		// `/enroll/tier-2` is reached from the student view, so it lights the same link.
		if (path === '/') return page.url.pathname === '/' || page.url.pathname.startsWith('/enroll/');
		return page.url.pathname === path || page.url.pathname.startsWith(path + '/');
	}
</script>

{#if mobile}
	{#each links as link}
		{@const Icon = link.icon}
		<a
			href={link.href}
			class="flex cursor-pointer items-center space-x-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors duration-200 {isActive(
				link.href
			)
				? 'bg-sky-600/20 text-white'
				: 'text-gray-300 hover:bg-white/10 hover:text-white'}"
		>
			<Icon class="h-5 w-5" />
			<span>{link.label}</span>
		</a>
	{/each}
{:else}
	<nav class="flex space-x-2">
		{#each links as link}
			{@const Icon = link.icon}
			<a
				href={link.href}
				class="relative flex cursor-pointer items-center space-x-2 rounded-lg border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-all duration-200 ease-in-out
				{isActive(link.href)
					? 'border-sky-400 bg-sky-600/20 text-white shadow-lg'
					: 'text-gray-300 hover:scale-105 hover:bg-white/10 hover:text-white'}"
				aria-current={isActive(link.href) ? 'page' : undefined}
			>
				<Icon class="h-4 w-4" aria-hidden="true" />
				<span>{link.label}</span>
			</a>
		{/each}
	</nav>
{/if}
