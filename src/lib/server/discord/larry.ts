/**
 * Larry's role and channel methods, as this app calls them.
 *
 * **Temporary.** These mirror `@indy-center/indy-larry-worker` 1.1.0, which is
 * not on npm yet (Indy-Center/indy-larry, branch `training-rooms`). Once it is
 * published: bump the dependency, import these types from the package, and
 * delete this file's type declarations. The published `LarryBinding` then has
 * the methods and the cast in `larryGuild()` goes too.
 */

export type RoleSync = {
	key: string;
	id?: string | null;
	name: string;
	rename?: boolean;
	members: string[];
	exclusive: boolean;
};

export type RoleSyncResult = {
	key: string;
	roleId: string | null;
	role: 'found' | 'created' | 'would-create';
	renamedFrom?: string;
	added: string[];
	removed: string[];
	notInServer: string[];
	error?: string;
};

export type RolesResult = { dryRun: boolean; canSeeMembers: boolean; roles: RoleSyncResult[] };

export type ManagedChannel = {
	key: string;
	category: string;
	id?: string | null;
	name: string;
	rename?: boolean;
	visibleTo: string[];
};

export type ChannelSyncResult = {
	key: string;
	channelId: string | null;
	channelName: string;
	channel: 'found' | 'created' | 'would-create';
	renamedFrom?: string;
	error?: string;
};

export type ChannelsResult = { dryRun: boolean; channels: ChannelSyncResult[] };

export type LarryGuild = {
	syncRoles(request: { roles: RoleSync[]; dryRun?: boolean }): Promise<RolesResult>;
	syncChannels(request: { channels: ManagedChannel[]; dryRun?: boolean }): Promise<ChannelsResult>;
};

/** The `LARRY` binding, as something that manages roles and channels. Undefined when it is not bound. */
export function larryGuild(env: Partial<Env> | undefined): LarryGuild | undefined {
	return (env as { LARRY?: LarryGuild } | undefined)?.LARRY;
}
