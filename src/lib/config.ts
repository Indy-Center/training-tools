/** The ARTCC this app manages training for. */
export const FACILITY_ID = 'ZID';

/**
 * The facility's own timezone, for dates written onto the TRK board. Indiana
 * has its own zone name; it has kept Eastern time, with daylight saving, since 2006.
 */
export const FACILITY_TIME_ZONE = 'America/Indiana/Indianapolis';

/** The community website: where the header logo and the "how to join us" links go. */
export const COMMUNITY_URL = 'https://flyindycenter.com';

/** VATSIM's id for the VATUSA division, as identity's VATSIM profile carries it. */
export const VATUSA_DIVISION_ID = 'USA';

/** VATSIM rating ids. Anything below S1 cannot control. */
export const RATING_OBS = 1;
export const RATING_S1 = 2;
/** S3 and above may be granted evaluator on S-GC as a mentor (DEV-175). */
export const RATING_S3 = 4;

/**
 * Consolidation: hours a home controller must log at their current rating
 * before they can enroll in the next course. Keyed by VATSIM short rating.
 *
 * Counted from VATSIM's per-rating stats, so hours are network-wide rather than
 * ZID-only — VATSIM does not break them down by facility.
 *
 * A rating that is absent (or 0) has no requirement. OBS has nothing to
 * consolidate, and there is no course after E-RC, so C1 and above are left out.
 *
 * **These numbers are the training team's to set.** The values here are
 * placeholders until the training policy states them.
 */
export const CONSOLIDATION_HOURS: Readonly<Record<string, number>> = {
	S1: 10,
	S2: 15,
	S3: 20
};

/**
 * Moodle course per credential, keyed by credential code (`S-GC` … `E-RC`,
 * `T2-CTR`).
 *
 * The home page links a student in training to their course's entry, and
 * `/enroll/tier-2` links to `T2-CTR`'s. A missing entry falls back to copy
 * pointing at their mentor or the training staff, so this can fill in one
 * course at a time as `indy-moodle` publishes them.
 */
export const MOODLE_COURSE_URLS: Readonly<Partial<Record<string, string>>> = {};

/**
 * Who `$lib/server/notify` can tell, and the Discord channel each goes to.
 *
 * The values are channel **names** from Larry's `SEND_CHANNELS` setting (the
 * `ENV_SEND_CHANNELS` variable in Indy-Center/indy-larry), not IDs: a channel
 * moves by changing that setting, with no change here. Larry refuses a name it
 * does not know, which is logged.
 */
export const NOTIFY_CHANNELS = {
	/** Training admins: teacher changes, finished courses to audit, failed exams, things stuck. */
	'training-admins': 'training-admin-alerts',
	/** The tech team: things only they can fix — jobs failing, the board and the app out of step. */
	'tech-team': 'tech-team-alerts',
	/** Instructors and evaluators: rating exams waiting to be claimed. */
	instructors: 'instructor-actions'
} as const;

/**
 * The category teacher channels live under: a **name** from Larry's
 * `CHANNEL_CATEGORIES` setting, like the channel names above.
 */
export const DISCORD_TEACHER_CATEGORY = 'training';

/**
 * How long a teacher's Discord role and channel outlive them leaving the
 * teacher roster. Deleting a channel takes its messages with it and cannot be
 * undone, and a teacher can drop off the VATUSA roster by mistake; this is the
 * window in which coming back loses nothing.
 */
export const DISCORD_ROOM_GRACE_HOURS = 1;

/** Where this app lives, for links in messages sent from outside a request (the cron). */
export const SITE_URL = 'https://training.flyindycenter.com';
