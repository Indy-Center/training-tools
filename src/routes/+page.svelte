<script lang="ts">
	import PageHero from '$lib/components/PageHero.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import { loginUrl } from '$lib/identity-links';
	import { displayName } from '$lib/user';
	import { page } from '$app/state';
	import IconAccount from '~icons/mdi/account-circle';
	import IconClipboard from '~icons/mdi/clipboard-text';
	import IconSchool from '~icons/mdi/school';
	import IconAirplaneTakeoff from '~icons/mdi/airplane-takeoff';
	import IconAccountSwitch from '~icons/mdi/account-switch';
	import IconOpenInNew from '~icons/mdi/open-in-new';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconChartBar from '~icons/mdi/chart-bar';
	import { findCourse } from '$lib/courses';
	import { STATUS_COLORS, STATUS_LABELS, statusDetail } from '$lib/enrollment-status';

	let { data } = $props();

	function formatHours(hours: number): string {
		return `${hours.toFixed(1)} hours`;
	}

	let returnUrl = $derived(page.url.href);

	const COMMUNITY_URL = 'https://flyindycenter.com';
	const BECOME_CONTROLLER_URL = `${COMMUNITY_URL}/visit/become-a-controller`;
</script>

<svelte:head>
	<title>Indy Center | Training</title>
	<meta
		name="description"
		content="Controller training at Indy Center — enroll, track your progress, and see where you are on the waitlist."
	/>
</svelte:head>

{#if !data.user}
	<!-- Signed out: a sign-in call to action and nothing else. Everything this
	     app does needs to know who you are. -->
	<PageHero>
		<h1 class="text-4xl font-bold sm:text-5xl">Controller Training</h1>
		<p class="mx-auto mt-4 max-w-xl text-gray-300">
			Sign in with your VATSIM account to enroll in training, follow your progress, and see where
			you are on the waitlist.
		</p>
		<div class="mt-8 flex justify-center">
			<a
				href={loginUrl(data.identityUrl, returnUrl)}
				data-sveltekit-reload
				class="flex cursor-pointer items-center space-x-2 rounded-lg bg-sky-600 px-6 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700"
			>
				<IconAccount class="h-5 w-5" />
				<span>Connect VATSIM Account</span>
			</a>
		</div>
	</PageHero>
{:else}
	<PageHero size="compact">
		<h1 class="text-3xl font-bold sm:text-4xl">Welcome, {displayName(data.user)}</h1>
		{#if data.rosterMember}
			<div class="mt-3 flex items-center justify-center gap-2">
				<Badge size="sm" color="sky" label={data.rosterMember.ratingShort} />
				<Badge
					size="sm"
					color={data.rosterMember.membership === 'home' ? 'green' : 'purple'}
					label={data.rosterMember.membership === 'home'
						? `${data.rosterMember.facility} home controller`
						: `Visiting ${data.rosterMember.facility}`}
				/>
			</div>
		{/if}
	</PageHero>

	<div class="w-full bg-gray-900">
		<div class="mx-auto max-w-3xl px-4 py-10">
			{#if data.flow === 'enroll'}
				<!-- Rostered home controller: the one branch that can actually train here. -->
				{#if data.request}
					{@const request = data.request}
					<!-- A request is open: say where it is, not just "view it". -->
					<Panel title="Your training request" icon={IconClipboard}>
						<div class="space-y-4 px-4 py-5 text-sm text-gray-300">
							<div class="flex flex-wrap items-center gap-2">
								<Badge
									size="sm"
									color="sky"
									label={findCourse(request.course)?.label ?? request.course}
								/>
								<Badge
									size="sm"
									color={STATUS_COLORS[request.status] ?? 'gray'}
									label={STATUS_LABELS[request.status] ?? request.status}
								/>
							</div>

							{#if request.status === 'waitlist' && request.waitlist}
								<p>
									{#if request.waitlist.ahead === 0}
										You're <span class="font-medium text-white">next in line</span> for this course.
									{:else}
										There {request.waitlist.ahead === 1 ? 'is' : 'are'}
										<span class="font-medium text-white">{request.waitlist.ahead}</span>
										{request.waitlist.ahead === 1 ? 'controller' : 'controllers'} ahead of you, of
										{request.waitlist.waiting} waiting for this course.
									{/if}
									Training staff will reach out when a mentor is assigned.
								</p>
								<a
									href="/stats"
									class="inline-flex cursor-pointer items-center space-x-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700"
								>
									<IconChartBar class="h-5 w-5" />
									<span>See the waitlist</span>
								</a>
							{:else if request.status === 'in-training'}
								<p>{statusDetail(request.status)}</p>
								{#if request.moodleUrl}
									<a
										href={request.moodleUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex cursor-pointer items-center space-x-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700"
									>
										<IconSchool class="h-5 w-5" />
										<span>Open your course</span>
										<IconOpenInNew class="h-4 w-4" />
									</a>
								{:else}
									<p class="text-gray-400">
										Your mentor will point you to the course material to work through between
										sessions.
									</p>
								{/if}
							{:else}
								<!-- Rating exam and certificate update: nothing to do but wait. -->
								<p>{statusDetail(request.status)}</p>
								<p class="text-gray-400">There's nothing you need to do here in the meantime.</p>
							{/if}

							<p>
								<a href="/enroll" class="text-sky-400 hover:text-sky-300"
									>View or withdraw your request →</a
								>
							</p>
						</div>
					</Panel>
				{:else}
					<Panel title="Enroll in training" icon={IconClipboard}>
						<div class="space-y-4 px-4 py-5 text-sm text-gray-300">
							<p>Ready to enroll in training?</p>
							<a
								href="/enroll"
								class="inline-flex cursor-pointer items-center space-x-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700"
							>
								<IconClipboard class="h-5 w-5" />
								<span>Start an enrollment request</span>
							</a>
						</div>
					</Panel>
				{/if}

				<div class="mt-6">
					<Panel title="Already training?" icon={IconSchool}>
						<div class="px-4 py-5 text-sm text-gray-300">
							<a href="/dashboard" class="text-sky-400 hover:text-sky-300"
								>View your training progress →</a
							>
						</div>
					</Panel>
				</div>
			{:else if data.flow === 'consolidating'}
				<!-- Home controller, but not yet eligible for their next course. -->
				<Panel title="Consolidate your rating" icon={IconClockOutline}>
					<div class="space-y-4 px-4 py-5 text-sm text-gray-300">
						{#if data.consolidation?.status === 'not-met'}
							<p>
								Before you enroll in your next course, the training policy asks you to consolidate
								your {data.consolidation.rating} rating with at least
								<span class="font-medium text-white">{data.consolidation.required} hours</span>
								of controlling at {data.consolidation.rating}.
							</p>
							<div>
								<div class="mb-1 flex justify-between text-xs text-gray-400">
									<span>{formatHours(data.consolidation.logged)} logged</span>
									<span>{data.consolidation.required} hours required</span>
								</div>
								<div class="h-2 w-full overflow-hidden rounded-full bg-gray-800">
									<div
										class="h-full rounded-full bg-sky-600"
										style="width: {Math.min(
											100,
											(data.consolidation.logged / data.consolidation.required) * 100
										)}%"
									></div>
								</div>
							</div>
							<p class="text-gray-400">
								Hours come from your VATSIM statistics, so they can take a little while to update
								after a session. Come back once you've reached the requirement to enroll.
							</p>
						{:else}
							<p>
								We couldn't check your controlling hours with VATSIM just now, so we can't confirm
								you've consolidated your {data.consolidation?.rating ?? ''} rating yet.
							</p>
							<p class="text-gray-400">
								This is usually temporary — try again in a few minutes. If it keeps happening, let
								the training staff know on Discord.
							</p>
						{/if}
					</div>
				</Panel>

				<div class="mt-6">
					<Panel title="Already training?" icon={IconSchool}>
						<div class="px-4 py-5 text-sm text-gray-300">
							<a href="/dashboard" class="text-sky-400 hover:text-sky-300"
								>View your training progress →</a
							>
						</div>
					</Panel>
				</div>
			{:else if data.flow === 'tier-2'}
				<!-- Holds E-RC but not T2-CTR, home or visiting: the next step is self-led. -->
				<Panel title="Next up: Tier 2 Center" icon={IconSchool}>
					<div class="space-y-4 px-4 py-5 text-sm text-gray-300">
						<p>
							You're certified on our enroute sectors. Our Tier 2 sectors also need the Tier 2
							Center endorsement, and that's the one thing left for you to earn here.
						</p>
						<p>
							Tier 2 is a self-led course you complete online, at your own pace. You don't need a
							training slot or a mentor for it.
						</p>
						<a
							href="/enroll/tier-2"
							class="inline-flex cursor-pointer items-center space-x-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700"
						>
							<IconSchool class="h-5 w-5" />
							<span>Start the Tier 2 course</span>
						</a>
					</div>
				</Panel>
			{:else if data.flow === 'visiting-controller'}
				<!-- Rostered, but visiting. On the roster, so not a recruitment pitch. -->
				<Panel title="You're visiting Indy Center" icon={IconAirplaneTakeoff}>
					<div class="space-y-4 px-4 py-5 text-sm text-gray-300">
						<p>
							Thanks for controlling with us. Visiting controllers are welcome on our airspace with
							the certifications you already hold.
						</p>
						<p>
							Formal training slots are reserved for home controllers, so visiting controllers can't
							enroll through this app. If you'd like to train with Indy Center, the next step is
							transferring your home facility to us.
						</p>
						<p class="text-gray-400">
							Questions about what you're cleared to control as a visitor are best taken to the
							training staff on Discord.
						</p>
						<a
							href={BECOME_CONTROLLER_URL}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex cursor-pointer items-center space-x-2 rounded-lg border border-slate-600/50 px-5 py-2.5 text-sm font-medium text-gray-300 transition-colors duration-200 hover:bg-white/10 hover:text-white"
						>
							<span>Read about transferring to Indy</span>
							<IconOpenInNew class="h-4 w-4" />
						</a>
					</div>
				</Panel>
			{:else if data.flow === 'transfer-or-visit'}
				<!-- Rated, but not ours: the pitch is transfer or visit. -->
				<Panel title="Control with Indy Center" icon={IconAccountSwitch}>
					<div class="space-y-4 px-4 py-5 text-sm text-gray-300">
						<p>
							You already hold a controller rating, but you're not on the Indy Center roster yet.
							There are two ways to join us:
						</p>
						<ul class="ml-5 list-disc space-y-2">
							<li>
								<span class="font-medium text-white">Transfer</span> — make Indy Center your home facility
								and train with us toward our certifications.
							</li>
							<li>
								<span class="font-medium text-white">Visit</span> — keep your current home facility and
								control our airspace alongside it.
							</li>
						</ul>
						<p class="text-gray-400">
							Both have VATUSA eligibility requirements around rating, hours and time since your
							last transfer.
						</p>
						<a
							href={BECOME_CONTROLLER_URL}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex cursor-pointer items-center space-x-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700"
						>
							<span>Transfer or visit Indy Center</span>
							<IconOpenInNew class="h-4 w-4" />
						</a>
					</div>
				</Panel>
			{:else}
				<!-- Unrated: they need to become a controller before training here. -->
				<Panel title="Become a controller" icon={IconSchool}>
					<div class="space-y-4 px-4 py-5 text-sm text-gray-300">
						<p>
							You're signed in with your VATSIM account, but you don't hold a controller rating yet,
							so there's nothing to enroll in here just yet.
						</p>
						<p>
							Controllers start at a VATSIM training organisation, where you'll complete the basic
							exam and your first rating. Once you're rated and on our roster, come back here to
							enroll in Indy Center training.
						</p>
						<a
							href={BECOME_CONTROLLER_URL}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex cursor-pointer items-center space-x-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-700"
						>
							<span>How to become an Indy Center controller</span>
							<IconOpenInNew class="h-4 w-4" />
						</a>
					</div>
				</Panel>
			{/if}
		</div>
	</div>
{/if}
