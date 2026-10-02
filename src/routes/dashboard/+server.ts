import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * "My Training" is `/` now: a member with a request open sees it there. This
 * keeps old links and bookmarks working.
 */
export const GET: RequestHandler = () => redirect(302, '/');
