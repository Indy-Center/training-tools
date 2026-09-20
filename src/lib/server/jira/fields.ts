/**
 * Custom field ids on the `Student Enrollment` issue type in Jira project TRK.
 *
 * Read from the create metadata on 2026-09-20. Jira identifies custom fields by
 * opaque id, not by name, so these are the contract — renaming a field in Jira
 * will not break us, but deleting and recreating one will.
 *
 * The full field inventory, including the ones only training staff write
 * (Teacher, Teacher Assigned, Training Completed, RE Completed, RE Instructor,
 * Certificate Updated, Removed), is in .ai/research/jira-student-tracking.md.
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
	waitlisted: 'customfield_10246'
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
