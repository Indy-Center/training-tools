import type { LarryBinding } from '@indy-center/indy-larry-worker';

/**
 * Larry's group methods, as this app calls them. larry turns the groups this
 * app serves (`TrainingRpc.getGroups()`) into Discord roles and rooms; this app
 * only tells it when to look again and asks it to post in a group's room.
 *
 * See decisions/0044-discord-lives-in-larry.md and decisions/0045-groups-contract.md
 */
export type { GroupNotice, GroupPostResult } from '@indy-center/indy-larry-worker';

/** This app's name in larry's group sources. */
export const GROUP_SOURCE = 'training';

/** The part of Larry that works on this app's groups. */
export type LarryGroups = Pick<LarryBinding, 'postToGroup' | 'syncMembers'>;

/**
 * The `LARRY` binding, typed. Undefined when it is not bound. `wrangler types`
 * only knows it as a bare Fetcher, hence the cast — the same one
 * `$lib/server/notify` makes.
 */
export function larryGroups(env: Partial<Env> | undefined): LarryGroups | undefined {
	return (env as { LARRY?: LarryBinding } | undefined)?.LARRY;
}

/** The most CIDs larry takes in one `syncMembers()` call. */
const SYNC_MEMBERS_MAX = 100;

/**
 * Tell larry these members' groups have just changed, so Discord catches up
 * within a minute instead of on its next run. Never throws: a failed call is
 * logged and left to that run, so it is never why a write here fails, and a
 * CID larry declines is logged too.
 */
export async function syncMembers(
	env: Partial<Env> | undefined,
	cids: Iterable<string>
): Promise<void> {
	const larry = larryGroups(env);
	const wanted = [
		...new Set([...cids].map((cid) => cid.trim()).filter((cid) => /^\d+$/.test(cid)))
	];
	if (!larry || wanted.length === 0) return;

	for (let start = 0; start < wanted.length; start += SYNC_MEMBERS_MAX) {
		const batch = wanted.slice(start, start + SYNC_MEMBERS_MAX);
		try {
			const answers = await larry.syncMembers(batch.map(Number));
			// Declined: synced moments ago, or nothing known to sync. larry has
			// still read the groups again, so a job of theirs not yet run sees it.
			const declined = (answers ?? []).filter((answer) => !answer.queued);
			if (declined.length > 0) {
				console.log('[training-tools] larry declined to sync', JSON.stringify(declined));
			}
		} catch (err) {
			console.error(
				'[training-tools] larry syncMembers failed; its next run catches up',
				batch,
				err instanceof Error ? err.message : err
			);
		}
	}
}
