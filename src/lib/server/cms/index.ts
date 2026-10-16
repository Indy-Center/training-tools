/**
 * The one way training-tools reads from the CMS (payload). See
 * decisions/0036-teacher-resources-from-the-cms.md.
 *
 * Config comes from `platform.env`: `CMS_URL` is a var in wrangler.jsonc,
 * `TRAINING_API_TOKEN` a Worker secret, the same value as payload's own
 * `TRAINING_API_TOKEN`.
 */

export type CmsConfig = { baseUrl: string; token: string };

/**
 * Null until both are set: a missing token hides what the CMS feeds rather
 * than failing a page.
 */
export function resolveCmsConfig(env: Partial<Env> | undefined): CmsConfig | null {
	const baseUrl = env?.CMS_URL?.trim().replace(/\/$/, '');
	const token = env?.TRAINING_API_TOKEN?.trim();
	return baseUrl && token ? { baseUrl, token } : null;
}

/**
 * Thrown when the CMS does not answer, answers with anything but a JSON 200,
 * or answers with a document that breaks its contract.
 */
export class CmsError extends Error {
	constructor(
		message: string,
		readonly status?: number
	) {
		super(message);
		this.name = 'CmsError';
	}
}

/** Long enough for a cold payload, short enough not to hold a page that waits on it. */
const TIMEOUT_MS = 5000;

/**
 * Fetch one of payload's training endpoints as JSON. Throws `CmsError`; the
 * caller decides what a page shows instead.
 */
export async function readCms(config: CmsConfig, path: string): Promise<unknown> {
	let response: Response;
	try {
		response = await fetch(`${config.baseUrl}${path}`, {
			headers: { authorization: `Bearer ${config.token}` },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch (err) {
		throw new CmsError(`CMS ${path} did not answer: ${err}`);
	}
	if (!response.ok) {
		throw new CmsError(`CMS ${path} answered ${response.status}`, response.status);
	}
	try {
		return await response.json();
	} catch {
		throw new CmsError(`CMS ${path} answered with something other than JSON`, response.status);
	}
}
