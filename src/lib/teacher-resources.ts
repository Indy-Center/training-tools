/**
 * The icons a teacher resource can carry: the closed list payload offers the
 * Training Admin as a select (decisions/0036). Not under `$lib/server/`: the
 * `/teach` panel maps each name to a static `~icons/mdi/*` import, which is
 * why the list is closed — an icon named at runtime cannot be drawn.
 *
 * Adding one is a change here, in the panel's map, and in payload's options.
 */
export const TEACHER_RESOURCE_ICONS = [
	'link-variant',
	'file-document',
	'book-open-variant',
	'google-drive',
	'table',
	'form-select',
	'video',
	'youtube',
	'calendar',
	'headset',
	'discord',
	'map',
	'radar',
	'airplane',
	'school',
	'clipboard-text',
	'web',
	'help-circle'
] as const;
export type TeacherResourceIconName = (typeof TEACHER_RESOURCE_ICONS)[number];

/** Drawn for a row with no icon, or one this app does not know. */
export const DEFAULT_TEACHER_RESOURCE_ICON: TeacherResourceIconName = 'link-variant';

export function isTeacherResourceIcon(name: unknown): name is TeacherResourceIconName {
	return (TEACHER_RESOURCE_ICONS as readonly unknown[]).includes(name);
}
