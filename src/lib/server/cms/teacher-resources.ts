import type { Database } from '$lib/server/db';
import {
	DEFAULT_TEACHER_RESOURCE_ICON,
	isTeacherResourceIcon,
	type TeacherResourceIconName
} from '$lib/teacher-resources';
import { d1Copies } from './copies';
import { CmsError, readCms, resolveCmsConfig } from './index';
import { readThroughCopy } from './read';

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
	/** Plain text, drawn as text. Null when blank or absent. */
	description: string | null;
	/** Always `https`. */
	url: string;
	newTab: boolean;
	/**
	 * The link icon when absent (rows saved, and copies kept, before icons) or
	 * not one this app knows.
	 */
	icon: TeacherResourceIconName;
};

/**
 * The teacher resources, in order. None while the CMS is not configured.
 * Read through the copy in D1; throws `CmsError` when the CMS cannot be read
 * and there is no copy.
 */
export async function getTeacherResources(
	env: Partial<Env> | undefined,
	db: Database
): Promise<TeacherResource[]> {
	const config = resolveCmsConfig(env);
	if (!config) return [];
	const cms = { read: (path: string) => readCms(config, path) };
	const document = await readThroughCopy(
		cms,
		d1Copies(db),
		'/api/training/resources',
		parseTeacherResources
	);
	return document.resources;
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
			if (row.description != null && typeof row.description !== 'string') {
				throw new CmsError(`Teacher resources: row ${i} has a description that is not text`);
			}
			return {
				title: row.title,
				description: row.description?.trim() ? row.description : null,
				url: row.url,
				newTab: row.newTab,
				icon: isTeacherResourceIcon(row.icon) ? row.icon : DEFAULT_TEACHER_RESOURCE_ICON
			};
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
