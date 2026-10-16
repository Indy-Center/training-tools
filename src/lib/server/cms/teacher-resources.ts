import { CmsError, readCms, resolveCmsConfig } from './index';

/**
 * What payload serves at `GET /api/training/resources`. A hand copy of
 * payload's contract; keep the two in step.
 */
export type TeacherResourcesDocument = {
	/** In the Training Admin's order, which is the order they are shown in. */
	resources: TeacherResource[];
};

export type TeacherResource = {
	title: string;
	/** Always `https`. */
	url: string;
	newTab: boolean;
};

/**
 * The teacher resources, in order. None while the CMS is not configured.
 * Throws `CmsError` when the CMS cannot be read.
 */
export async function getTeacherResources(
	env: Partial<Env> | undefined
): Promise<TeacherResource[]> {
	const config = resolveCmsConfig(env);
	if (!config) return [];
	return parseTeacherResources(await readCms(config, '/api/training/resources')).resources;
}

/**
 * Check a document against the contract before anything uses it. One bad row
 * rejects the whole document: these become links on the page, and a list with
 * a row quietly missing is harder to notice than no list at all.
 */
export function parseTeacherResources(body: unknown): TeacherResourcesDocument {
	const rows = (body as { resources?: unknown } | null)?.resources;
	if (!Array.isArray(rows)) throw new CmsError('Teacher resources: no list of resources');

	return {
		resources: rows.map((row: Partial<Record<keyof TeacherResource, unknown>>, i) => {
			if (typeof row?.title !== 'string' || row.title.trim() === '') {
				throw new CmsError(`Teacher resources: row ${i} has no title`);
			}
			if (!isHttps(row.url)) {
				throw new CmsError(`Teacher resources: row ${i} is not an https link`);
			}
			if (typeof row.newTab !== 'boolean') {
				throw new CmsError(`Teacher resources: row ${i} has no new-tab setting`);
			}
			return { title: row.title, url: row.url, newTab: row.newTab };
		})
	};
}

/**
 * Payload allows only `https`; anything else (`javascript:` above all) never
 * becomes a link here.
 */
function isHttps(url: unknown): url is string {
	if (typeof url !== 'string') return false;
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' && parsed.hostname !== '';
	} catch {
		return false;
	}
}
