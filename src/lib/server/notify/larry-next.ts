import type { ChannelSend, LarryBinding } from '@indy-center/indy-larry-worker';

/**
 * What `@indy-center/indy-larry-worker` 1.2.0 adds: link buttons, and changing
 * or deleting a message Larry posted. Mirrored here because 1.2.0 is not
 * published yet (Indy-Center/indy-larry, branch `edit-messages`).
 *
 * **Temporary.** Once 1.2.0 is installed, delete this file and import these
 * from the package instead.
 *
 * Against a Larry still on 1.1.0 a button is ignored and an edit or a deletion
 * throws, which `$lib/server/notify` reports as `failed` like any other refusal.
 */

/** A button that opens a web address. */
export type LinkButton = { label: string; url: string };

export type ChannelSendWithButtons = ChannelSend & { buttons?: LinkButton[] };

export type ChannelEdit = ChannelSendWithButtons & { messageId: string };

export type MessageRef = { channel: string; messageId: string };

export type LarryNext = LarryBinding & {
	enqueueEdit(request: ChannelEdit): Promise<void>;
	enqueueDelete(request: MessageRef): Promise<void>;
};
