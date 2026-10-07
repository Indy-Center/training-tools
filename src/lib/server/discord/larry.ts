import type { LarryBinding } from '@indy-center/indy-larry-worker';

/**
 * Larry's role and channel methods, as this app calls them. The types come
 * from `@indy-center/indy-larry-worker` (1.1.0 added them).
 */
export type {
	ChannelSyncResult,
	ChannelsResult,
	DeleteResult,
	Deletion,
	ManagedChannel,
	RoleSync,
	RoleSyncResult,
	RolesResult
} from '@indy-center/indy-larry-worker';

/** The part of Larry that manages roles and channels. */
export type LarryGuild = Pick<
	LarryBinding,
	'syncRoles' | 'syncChannels' | 'deleteRoles' | 'deleteChannels' | 'setMemberRole'
>;

/**
 * The `LARRY` binding, typed. Undefined when it is not bound. `wrangler types`
 * only knows it as a bare Fetcher, hence the cast — the same one
 * `$lib/server/notify` makes.
 */
export function larryGuild(env: Partial<Env> | undefined): LarryGuild | undefined {
	return (env as { LARRY?: LarryBinding } | undefined)?.LARRY;
}
