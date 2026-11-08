/**
 * Custom field ids on the `Student Enrollment` issue type in Jira project TRK.
 *
 * Read from the create metadata on 2026-09-20. Jira identifies custom fields by
 * opaque id, not by name, so these are the contract — renaming a field in Jira
 * will not break us, but deleting and recreating one will.
 *
 * `Teacher` and `RE Instructor` are in `./status.ts`, beside the code that reads
 * them back. The full inventory is in research/jira-student-tracking.md.
 */
export const JIRA_FIELDS = {
	/** Select. Options are the `jiraOptionId` values in $lib/courses.ts. */
	course: 'customfield_10241',
	/** Text. Required, and the join key for anything automated later. */
	cid: 'customfield_10242',
	/** Text. */
	name: 'customfield_10243',
	/** Select: "Discord Message" | "Email". Jira's own spelling is "Notification Prefrence". */
	notificationPreference: 'customfield_10244',
	/** Textarea. */
	availability: 'customfield_10245',
	/** Date. Queue position derives from this, so we always set it. */
	waitlisted: 'customfield_10246',
	/** Date. Stamped when the teacher marks the training complete. */
	trainingCompleted: 'customfield_10248',
	/** Date. Stamped when the certification the course earns is applied. */
	certificateUpdated: 'customfield_10249',
	/** Date. Stamped when the examiner marks the rating exam complete. */
	reCompleted: 'customfield_10253',
	/** Date. Stamped when the card is seen to move into In Training. */
	teacherAssigned: 'customfield_10247',
	/** Date. When the VATUSA written course for this rating was assigned. */
	vatusaAssigned: 'customfield_10289',
	/** Date. When they passed it. */
	vatusaCompleted: 'customfield_10288',
	/** Date. Stamped when the card is seen to move to Removed or Withdrawn. */
	removed: 'customfield_10251',
	/**
	 * Date. Stamped when the card is seen to move from In Training to Rating
	 * Exam, if empty. Recreated 2026-11-01; the old `customfield_10252` is gone.
	 */
	recommendedForRe: 'customfield_10326',
	/** Date. Stamped when the card is seen to move from Rating Exam to Needs CATP: the latest fail. */
	reFailed: 'customfield_10324',
	/**
	 * Number (Jira's `float`, read back as e.g. `2`). Goes up by one when the card
	 * is seen to leave Rating Exam for Audit or Needs CATP.
	 */
	reAttempts: 'customfield_10325',
	/**
	 * Select: why the card was removed (`REMOVAL_REASONS`). Written before the
	 * move to Removed; cleared when the card is seen to move back to an open stage.
	 */
	removalReason: 'customfield_10323'
} as const;

/**
 * Option ids on the `Removal Reason` select, by our own name for each, with
 * the label Jira shows. Read 2026-11-01; the select has no default. A drag on
 * the board leaves it empty, and a withdrawal has none.
 */
export const REMOVAL_REASONS = {
	/** Set only by the roster-removal pass, never chosen by an admin. */
	'roster-removal': { id: '10180', label: 'Roster removal' },
	'no-response': { id: '10181', label: 'No response' },
	'not-eligible': { id: '10182', label: 'Not eligible' },
	duplicate: { id: '10183', label: 'Duplicate or mistake' },
	other: { id: '10184', label: 'Other' }
} as const;

export type RemovalReason = keyof typeof REMOVAL_REASONS;

/** The reasons an admin chooses from, in the order the forms list them. */
export const ADMIN_REMOVAL_REASONS = ['no-response', 'not-eligible', 'duplicate', 'other'] as const;

export type AdminRemovalReason = (typeof ADMIN_REMOVAL_REASONS)[number];

/** A posted reason, if it is one an admin may choose; `roster-removal` is not. */
export function adminRemovalReason(value: unknown): AdminRemovalReason | null {
	return (ADMIN_REMOVAL_REASONS as readonly unknown[]).includes(value)
		? (value as AdminRemovalReason)
		: null;
}

/** The admin reasons as the forms list them: our name, and Jira's label. */
export const ADMIN_REMOVAL_REASON_CHOICES = ADMIN_REMOVAL_REASONS.map((name) => ({
	name,
	label: REMOVAL_REASONS[name].label
}));

/**
 * Option ids on the `Notification Prefrence` select.
 *
 * Note the upstream typo in the field name — matching it is not our call.
 */
export const JIRA_NOTIFICATION_OPTIONS = {
	discord: '10089', // "Discord Message"
	email: '10090' // "Email"
} as const;
