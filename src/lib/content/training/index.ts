/**
 * The copy on `/`: one block per view a member can land on.
 *
 * **To change wording, edit the `.md` file. To change a panel's title or its
 * buttons, edit the entry below.** Nothing else needs touching — the page
 * renders whatever is here.
 *
 * `TRAINING_COPY` is keyed by `TrainingFlow`, and `satisfies` makes a view
 * without copy a type error rather than a blank page. The shape — title, body,
 * actions — is deliberately what a CMS record would hold, so moving this out of
 * the repo means swapping where these objects come from, not rewriting the page.
 *
 * Bodies are rendered to HTML at build time (see vite.config.ts) and shown with
 * `{@html}`, which is safe only because the markdown is ours. A CMS changes
 * that: its content needs a runtime renderer and sanitising. See
 * decisions/0011-site-copy-in-repo-course-content-elsewhere.md
 *
 * What the page draws itself, around this copy: anything that is data rather
 * than prose — the place in the queue, consolidation hours, the assigned
 * teacher, the course, and the enrollment form.
 */
import { COMMUNITY_URL } from '$lib/config';
import type { TrainingFlow } from '$lib/training-flow';
import { ENROLLMENT_COPY } from '$lib/content/enrollment';
import becomeController from './become-controller.md';
import certificationUpdate from './certification-update.md';
import consolidating from './consolidating.md';
import consolidationUnknown from './consolidation-unknown.md';
import extraCourses from './extra-courses.md';
import inTraining from './in-training.md';
import needsCatp from './needs-catp.md';
import ratingExam from './rating-exam.md';
import signedOut from './signed-out.md';
import tier2 from './tier-2.md';
import transferOrVisit from './transfer-or-visit.md';
import visitingController from './visiting-controller.md';
import waitlist from './waitlist.md';

export type CopyAction = {
	label: string;
	href: string;
	/** Opens in a new tab, with the "leaving this site" icon. */
	external?: boolean;
	/** `secondary` is the outlined button, for a link that is not the main next step. */
	style?: 'primary' | 'secondary';
};

export type CopyBlock = {
	/** The panel's heading. */
	title: string;
	/** Trusted HTML, compiled from the block's markdown file. */
	body: string;
	/** Buttons under the body, in order. */
	actions?: readonly CopyAction[];
};

const BECOME_CONTROLLER_URL = `${COMMUNITY_URL}/visit/become-a-controller`;

export const TRAINING_COPY = {
	// --- No open request -----------------------------------------------------
	'become-controller': {
		title: 'Become a VATUSA controller',
		body: becomeController,
		actions: [
			{
				label: 'How to become an Indy Center controller',
				href: BECOME_CONTROLLER_URL,
				external: true
			}
		]
	},
	'transfer-or-visit': {
		title: 'Control with Indy Center',
		body: transferOrVisit,
		actions: [
			{ label: 'Transfer or visit Indy Center', href: BECOME_CONTROLLER_URL, external: true }
		]
	},
	'visiting-controller': {
		title: "You're visiting Indy Center",
		body: visitingController,
		actions: [
			{
				label: 'Read about transferring to Indy',
				href: BECOME_CONTROLLER_URL,
				external: true,
				style: 'secondary'
			}
		]
	},
	'extra-courses': {
		title: 'Extra courses',
		body: extraCourses
	},
	consolidating: {
		title: 'Consolidate your rating',
		body: consolidating
	},
	// The form's own introduction. The agreement it ends with is `ENROLLMENT_COPY.agreement`.
	enroll: {
		title: 'Before you enroll',
		body: ENROLLMENT_COPY.whatHappensNext + ENROLLMENT_COPY.writtenExam
	},

	// --- An open request, by status ------------------------------------------
	waitlist: {
		title: "You're on the waitlist",
		body: waitlist,
		actions: [{ label: 'See the waitlist', href: '/stats' }]
	},
	'in-training': {
		title: "You're in training",
		body: inTraining
	},
	'rating-exam': {
		title: 'Your rating exam',
		body: ratingExam
	},
	'needs-catp': {
		title: 'Further training',
		body: needsCatp
	},
	'certification-update': {
		title: 'Updating your certificate',
		body: certificationUpdate
	}
} as const satisfies Record<TrainingFlow, CopyBlock>;

/** Blocks that are not a view of their own. */
export const SHARED_COPY = {
	/** The landing page for anyone not signed in. `title` is the page heading. */
	signedOut: {
		title: 'Controller Training',
		body: signedOut
	},
	/** Replaces the consolidation copy when VATSIM could not give us their hours. */
	consolidationUnknown: {
		title: 'Consolidate your rating',
		body: consolidationUnknown
	},
	/** Offered beneath the extra-courses and visitor copy to anyone due Tier 2. */
	tier2: {
		title: 'Next up: Tier 2 Center',
		body: tier2,
		actions: [{ label: 'Start the Tier 2 course', href: '/enroll/tier-2' }]
	}
} as const satisfies Record<string, CopyBlock>;

/** Short strings that are not worth a markdown file each. */
export const TRAINING_TEXT = {
	signInButton: 'Connect VATSIM Account',
	/** Beside Teacher / Instructor, before staff have set one on the board. */
	notAssignedYet: 'Not assigned yet',
	/** In training, when the course has no Moodle link in `MOODLE_COURSE_URLS`. */
	noCourseLink:
		'Your teacher will point you to the course material to work through between sessions.',
	openCourseButton: 'Open your course',
	/** The enroll view, in the unlikely case we cannot work out their next course. */
	noNextCourse:
		"We couldn't work out which course is next for you. Please contact the training staff on Discord.",
	withdraw: {
		intro:
			'Not quite ready? Withdrawing lets someone else take your place in line. You can submit a new request any time.',
		button: 'Withdraw this request',
		confirm: 'Withdraw this training request?'
	}
} as const;
