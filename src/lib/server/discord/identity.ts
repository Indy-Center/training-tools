/**
 * The two identity calls the Discord sync needs, by CID: a teacher's preferred
 * name, and writing their operating initials.
 *
 * **Not part of identity's published interface.** `IdentityRpc` 1.0.0 exposes
 * only `getSessionContext()`; `getUserByCid()` and `setAttributes()` exist on
 * the Worker and its own docs say unexposed methods are "callable at runtime
 * but not visible to typed consumers, by design". So this is the one place
 * that reaches past the contract, kept small so it is one file to change when
 * identity publishes them.
 *
 * Identity only has a user for someone who has signed in to an identity app.
 * Everyone else comes back null and is left alone.
 */

type IdentityUser = {
	id: string;
	cid: string;
	attributes: { preferredName?: string; operatingInitials?: string };
};

type IdentityUsers = {
	getUserByCid(cid: string): Promise<IdentityUser | null>;
	setAttributes(userId: string, patch: { operatingInitials?: string | null }): Promise<unknown>;
};

function identity(env: Partial<Env> | undefined): IdentityUsers | undefined {
	return (env as { IDENTITY?: IdentityUsers } | undefined)?.IDENTITY;
}

export type IdentityTeacher = { preferredName: string | null; initials: string | null };

export type IdentityLookup = {
	/** By CID, for everyone identity knows. */
	known: Map<string, IdentityTeacher & { userId: string }>;
	/** CIDs with no identity user: they have never signed in. */
	unknown: string[];
};

/** Look each CID up. A failed lookup counts as unknown: a name is not worth failing the sync for. */
export async function lookUpTeachers(
	env: Partial<Env> | undefined,
	cids: readonly string[]
): Promise<IdentityLookup> {
	const binding = identity(env);
	const lookup: IdentityLookup = { known: new Map(), unknown: [] };
	if (!binding) return { ...lookup, unknown: [...cids] };

	for (const cid of cids) {
		try {
			const user = await binding.getUserByCid(cid);
			if (!user) {
				lookup.unknown.push(cid);
				continue;
			}
			lookup.known.set(cid, {
				userId: user.id,
				preferredName: user.attributes.preferredName?.trim() || null,
				initials: user.attributes.operatingInitials?.trim() || null
			});
		} catch (err) {
			console.error('[training-tools] identity lookup failed for', cid, err);
			lookup.unknown.push(cid);
		}
	}

	return lookup;
}

/** Write a teacher's initials to identity. Throws if identity refuses. */
export async function writeInitials(
	env: Partial<Env> | undefined,
	userId: string,
	initials: string
): Promise<void> {
	const binding = identity(env);
	if (!binding) throw new Error('IDENTITY binding unavailable');
	await binding.setAttributes(userId, { operatingInitials: initials });
}
