<script lang="ts">
	import type { User } from '@indy-center/identity';
	import { page } from '$app/state';
	import {
		canEditCertifications,
		canManageTeachers,
		isTrainingAdmin
	} from '$lib/utils/permissions';
	import IconClipboard from '~icons/mdi/clipboard-text';
	import IconChartBar from '~icons/mdi/chart-bar';
	import IconSchool from '~icons/mdi/school';
	import IconCertificate from '~icons/mdi/certificate';
	import IconCog from '~icons/mdi/cog';
	import IconTeach from '~icons/mdi/human-male-board';
	import IconTeachers from '~icons/mdi/account-group';

	let {
		user,
		roles,
		isTeacher = false,
		hasOpenEnrollment = false,
		mobile = false
	}: {
		user: User | undefined;
		roles: string[] | undefined;
		isTeacher?: boolean;
		hasOpenEnrollment?: boolean;
		mobile?: boolean;
	} = $props();

	// Signed out there is nothing to list: every destination is gated, so
	// advertising it would just bounce people to identity. `/` carries the
	// sign-in call to action, and the logo leads back to the community site.
	const links = $derived(
		user
			? [
					// One link to `/`, the default view, named for what it will show:
					// a request in flight, or the way to start one.
					hasOpenEnrollment
						? { label: 'My Training', href: '/', icon: IconSchool }
						: { label: 'Enroll', href: '/', icon: IconClipboard },
					{
						label: 'Waitlist',
						href: '/stats',
						icon: IconChartBar
					},
					...(canEditCertifications(roles)
						? [
								{
									label: 'Certifications',
									href: '/certifications',
									icon: IconCertificate
								}
							]
						: []),
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
					...(canManageTeachers(roles)
						? [
								{
									label: 'Teachers',
									href: '/teachers',
									icon: IconTeachers
								}
							]
						: []),
					...(isTrainingAdmin(roles)
						? [
								{
									label: 'Admin',
									href: '/admin',
									icon: IconCog
								}
							]
						: [])
				]
			: []
	);

	function isActive(href: string) {
		// `/enroll/tier-2` is reached from the default view, so it lights the same link.
		if (href === '/') return page.url.pathname === '/' || page.url.pathname.startsWith('/enroll/');
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
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
