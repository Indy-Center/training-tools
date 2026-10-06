import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * The counts moved to `/waitlist`, which shows them to every member and the
 * staff sheet to those who work it. This keeps old links and bookmarks working.
 */
export const GET: RequestHandler = () => redirect(302, '/waitlist');
