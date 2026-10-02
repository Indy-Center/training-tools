import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * The enrollment form moved onto `/`, which shows it to whoever may enroll and
 * the right thing to everyone else. This keeps old links and bookmarks working.
 * `/enroll/tier-2` is still its own page.
 */
export const GET: RequestHandler = () => redirect(302, '/');
