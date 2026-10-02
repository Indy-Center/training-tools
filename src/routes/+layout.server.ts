import { resolveIdentityUrl } from '$lib/server/identity';
import { getHeldCredentials } from '$lib/server/certifications';
import { getOwnOpenEnrollment } from '$lib/server/enrollments';
import { getActiveTeacher } from '$lib/server/teachers';
import { hasFinishedTraining } from '$lib/training-flow';
import type { LayoutServerLoad } from './$types';

/**
 * Header data only. Nothing here gates anything — per ADR 0004 a layout load
 * is the wrong place for that, and every route checks access itself.
 */
export const load: LayoutServerLoad = async ({ locals, platform }) => {
	const session = locals.session;

	const [teacher, openEnrollment] = session
		? await Promise.all([
				getActiveTeacher(locals.db, session.user.cid),
				getOwnOpenEnrollment(locals)
			])
		: [null, null];

	// Only teachers are ever sent from `/` to `/teach`, so only they need their
	// credentials read here.
	const landsOnTeach =
		session !== null &&
		teacher !== null &&
		hasFinishedTraining({
			hasOpenRequest: openEnrollment !== null,
			held: (await getHeldCredentials(locals.db, session.user.cid)).map((row) => row.code)
		});

	return {
		user: session?.user,
		roles: session?.roles ?? [],
		// So the header can offer /teach. Being a teacher comes from the VATUSA
		// roster, not an identity role, so the roles above cannot say it.
		isTeacher: teacher !== null,
		// A teacher with nothing left to take as a student: for them the site opens
		// on `/teach`, so the header links to the student view by name instead of
		// to the bare `/`, which would bounce.
		landsOnTeach,
		// So the header can name its link to `/` for what is there: "Enroll", "My
		// Enrollment" or "My Training". Shared with the page beneath, so it costs no
		// second query. Submitting and withdrawing both invalidate this load, so
		// the label follows the page.
		openEnrollmentStatus: openEnrollment?.status ?? null,
		// The header renders outbound /login and /logout links, so the client
		// needs to know where identity lives.
		identityUrl: resolveIdentityUrl(platform)
	};
};
