<script lang="ts">
	import type { User } from '@indy-center/identity';
	import { page } from '$app/state';
	import { isInstructor, isTrainingAdmin } from '$lib/utils/permissions';
	import IconHome from '~icons/mdi/home';
	import IconClipboard from '~icons/mdi/clipboard-text';
	import IconChartBar from '~icons/mdi/chart-bar';
	import IconSchool from '~icons/mdi/school';
	import IconCog from '~icons/mdi/cog';

	let {
		user,
		roles,
		mobile = false
	}: { user: User | undefined; roles: string[] | undefined; mobile?: boolean } = $props();

	const BASE_LINKS = [
		{
			label: 'Home',
			href: '/',
			icon: IconHome
		},
		{
			label: 'Enroll',
			href: '/enroll',
			icon: IconClipboard
		},
		{
			label: 'Waitlist',
			href: '/stats',
			icon: IconChartBar
		}
	];

	// Signed out, every destination here is gated, so advertising them would just
	// bounce people to identity. The landing page's sign-in CTA is the whole
	// navigation until they're authenticated.
	const links = $derived([
		...(user ? BASE_LINKS : []),
		...(user
			? [
					{
						label: 'My Training',
						href: '/dashboard',
						icon: IconSchool
					}
				]
			: []),
		...(user && isInstructor(roles)
			? [
					{
						label: 'Students',
						href: '/students',
						icon: IconSchool
					}
				]
			: []),
		...(user && isTrainingAdmin(roles)
			? [
					{
						label: 'Admin',
						href: '/admin',
						icon: IconCog
					}
				]
			: [])
	]);

	function isActive(href: string) {
		if (href === '/') return page.url.pathname === '/';
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
