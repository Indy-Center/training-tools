/**
 * Minimal Jira Cloud REST client.
 *
 * Jira is reached over plain HTTPS with an Atlassian API token, unlike identity
 * which uses a service binding — Atlassian is not on our Cloudflare account, so
 * there is no binding to use.
 *
 * Config comes from `platform.env`: `JIRA_BASE_URL` and `JIRA_PROJECT_KEY` are
 * vars in wrangler.jsonc, `JIRA_USER_EMAIL` and `JIRA_API_TOKEN` are secrets.
 */

export type JiraConfig = {
	baseUrl: string;
	projectKey: string;
	email: string;
	apiToken: string;
};

/** Thrown for any non-2xx response, carrying enough to diagnose from a log. */
export class JiraError extends Error {
	constructor(
		message: string,
		readonly status?: number
	) {
		super(message);
		this.name = 'JiraError';
	}
}

/**
 * Read Jira config out of the Worker env.
 *
 * Returns null when it is not fully configured rather than throwing, so a
 * missing token degrades to "the enrollment is saved but not filed" instead of
 * failing the student's submission. Callers record that and let the cron retry.
 */
export function resolveJiraConfig(env: Partial<Env> | undefined): JiraConfig | null {
	// Trimmed because these are pasted by hand into .dev.vars or `wrangler secret
	// put`, and a stray leading space is easy to introduce and miserable to
	// diagnose: it produces a 401 that Jira reports as "project does not exist or
	// you lack permission", which reads like a permissions problem rather than a
	// malformed credential.
	const baseUrl = env?.JIRA_BASE_URL?.trim();
	const projectKey = env?.JIRA_PROJECT_KEY?.trim();
	const email = env?.JIRA_USER_EMAIL?.trim();
	const apiToken = env?.JIRA_API_TOKEN?.trim();

	if (!baseUrl || !projectKey || !email || !apiToken) return null;

	return {
		baseUrl: baseUrl.replace(/\/$/, ''),
		projectKey,
		email,
		apiToken
	};
}

function authorization({ email, apiToken }: JiraConfig): string {
	// btoa is available in workerd; the token is ASCII so no encoding dance.
	return `Basic ${btoa(`${email}:${apiToken}`)}`;
}

export async function jiraRequest<T>(
	config: JiraConfig,
	path: string,
	init: { method: string; body?: unknown }
): Promise<T> {
	let response: Response;

	try {
		response = await fetch(`${config.baseUrl}/rest/api/3${path}`, {
			method: init.method,
			headers: {
				authorization: authorization(config),
				accept: 'application/json',
				'content-type': 'application/json'
			},
			body: init.body === undefined ? undefined : JSON.stringify(init.body)
		});
	} catch (err) {
		// Network-level failure: DNS, TLS, Atlassian unreachable.
		throw new JiraError(`Jira request failed: ${err instanceof Error ? err.message : String(err)}`);
	}

	if (!response.ok) {
		// Jira puts the useful part in the body — a field id we got wrong, a
		// permission problem — so keep it, trimmed to stay log-sized.
		const detail = await response.text().catch(() => '');
		throw new JiraError(
			`Jira ${init.method} ${path} returned ${response.status}: ${detail.slice(0, 500)}`,
			response.status
		);
	}

	if (response.status === 204) return undefined as T;

	return (await response.json()) as T;
}
