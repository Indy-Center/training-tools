/**
 * The part of Larry's RPC surface this app uses.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TEMPORARY — STAND-IN FOR \`@indy-center/larry\`.                          │
 * │                                                                          │
 * │ Mirrors Larry 1.0.0's \`worker/src/client/api.ts\` until the package is   │
 * │ published (Indy-Center/indy-larry#15). Then: \`npm i @indy-center/larry\`,│
 * │ import \`LarryBinding\` from it in \`./index.ts\` and \`src/app.d.ts\`, and   │
 * │ delete this file.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Only what \`notify\` calls is here. Larry's \`embeds\` are Discord's
 * \`APIEmbed\`; \`Embed\` below is the subset we build, which is assignable to it.
 */

export type Embed = {
	title?: string;
	description?: string;
	url?: string;
	color?: number;
	timestamp?: string;
	fields?: { name: string; value: string; inline?: boolean }[];
};

export type AllowedMentions = {
	parse?: ('users' | 'roles' | 'everyone')[];
	users?: string[];
	roles?: string[];
};

export type ChannelSend = {
	/** A channel name from Larry's `SEND_CHANNELS`. */
	channel: string;
	content?: string;
	embeds?: Embed[];
	allowedMentions?: AllowedMentions;
};

export interface LarryRpc extends Rpc.WorkerEntrypointBranded {
	/**
	 * Queue a post and return once it is queued. Larry retries rate limits and
	 * Discord outages; a message Discord refuses is logged there and dropped.
	 * Throws straight away for an unknown channel or an invalid message.
	 */
	enqueue(request: ChannelSend): Promise<void>;
}

/** The binding's type: `LARRY` in `wrangler.jsonc`. */
export type LarryBinding = Service<LarryRpc>;
