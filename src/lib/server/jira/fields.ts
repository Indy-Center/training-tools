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
	reAttempts: 'customfield_10325'
} as const;

/**
 * Option ids on the `Notification Prefrence` select.
 *
 * Note the upstream typo in the field name — matching it is not our call.
 */
export const JIRA_NOTIFICATION_OPTIONS = {
	discord: '10089', // "Discord Message"
	email: '10090' // "Email"
} as const;
