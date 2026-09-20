<script lang="ts">
	import type { User } from '@indy-center/identity';
	import { page } from '$app/state';
	import { atcRating, displayName, operatingInitials, pilotRating } from '$lib/user';
	import { loginUrl, logoutUrl } from '$lib/identity-links';
	import IconAirplane from '~icons/mdi/airplane';
	import IconRating from '~icons/mdi/radar';
	import IconLogout from '~icons/mdi/logout';
	import IconAccount from '~icons/mdi/account-circle';
	import IconChevronDown from '~icons/mdi/chevron-down';

	let {
		user,
		identityUrl
	}: {
		user: User | undefined;
		identityUrl: string;
	} = $props();

	// Absolute URL — identity rejects bare paths with a 400, and page.url.href is
	// correct during SSR where window.location is not available.
	let returnUrl = $derived(page.url.href);

	let showDropdown = $state(false);

	function toggle(event: Event) {
		event.stopPropagation();
		showDropdown = !showDropdown;
	}

	function closeDropdown() {
		showDropdown = false;
	}
</script>

<svelte:document
	onclick={(e: Event) => {
		const target = e.target as HTMLElement;
		if (!target.closest('.user-dropdown')) {
			closeDropdown();
		}
	}}
/>

<div class="hidden md:block">
	{#if user}
		{@const initials = operatingInitials(user)}
		{@const atc = atcRating(user)}
		{@const pilot = pilotRating(user)}
		<div class="user-dropdown relative">
			<button
				type="button"
				onclick={toggle}
				aria-expanded={showDropdown}
				aria-haspopup="menu"
				aria-label="User menu"
				class="flex cursor-pointer items-center space-x-3 px-4 py-2 text-sm font-medium transition-all duration-200 ease-in-out {showDropdown
					? 'rounded-t-lg rounded-b-none border border-b-0 border-slate-600/30 bg-sky-600/20 text-white'
					: 'rounded-lg text-gray-300 hover:bg-slate-700/50 hover:text-white'}"
			>
				{#if initials}
					<span
						class="rounded-md bg-slate-600/50 px-2 py-1 font-mono text-xs tracking-wide text-gray-200"
					>
						{initials}
					</span>
				{/if}
				<div class="flex items-center space-x-2">
					<span class="font-medium">{displayName(user)}</span>
					<div class="flex items-center space-x-1">
						{#if atc}
							<div
								class="flex items-center gap-1 rounded-md bg-sky-600/30 px-2 py-1 font-mono text-xs text-sky-200"
							>
								<IconRating class="h-3 w-3" />
								{atc}
							</div>
						{/if}
						{#if pilot}
							<div
								class="flex items-center gap-1 rounded-md bg-pink-600/30 px-2 py-1 font-mono text-xs text-pink-200"
							>
								<IconAirplane class="h-3 w-3" />
								{pilot}
							</div>
						{/if}
					</div>
				</div>
				<IconChevronDown
					class="h-4 w-4 transition-transform duration-200 {showDropdown ? 'rotate-180' : ''}"
				/>
			</button>

			{#if showDropdown}
				<div
					role="menu"
					class="absolute top-full right-0 left-0 z-[9999] rounded-t-none rounded-b-lg border border-t-0 border-slate-600/30 bg-slate-800/95 shadow-xl backdrop-blur-lg"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => e.stopPropagation()}
					tabindex="-1"
				>
					<div class="space-y-1 p-3">
						<div class="px-3 py-1 font-mono text-xs text-gray-400">CID: {user.cid}</div>

						<!-- Divider -->
						<div class="my-2 border-t border-white/50"></div>

						<!-- Sign Out — identity owns the session cookie, so this leaves the app -->
						<a
							href={logoutUrl(identityUrl, returnUrl)}
							role="menuitem"
							data-sveltekit-reload
							onclick={closeDropdown}
							class="flex w-full cursor-pointer items-center space-x-2 rounded-lg px-3 py-2 text-sm text-red-300 transition-colors duration-200 hover:bg-red-600/20 hover:text-red-200"
						>
							<IconLogout class="h-4 w-4" />
							<span>Sign Out</span>
						</a>
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Sign in for non-authenticated users — handled entirely by identity -->
		<a
			href={loginUrl(identityUrl, returnUrl)}
			data-sveltekit-reload
			class="flex cursor-pointer items-center space-x-1.5 rounded-md bg-sky-400/30 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-sky-500/40 hover:text-gray-100"
		>
			<IconAccount class="h-5 w-5" />
			<span>Connect VATSIM Account</span>
		</a>
	{/if}
</div>
