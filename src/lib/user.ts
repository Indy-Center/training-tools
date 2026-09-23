import type { User } from '@indy-center/identity';

/**
 * Identity's User nests the VATSIM profile and keeps almost every field
 * optional, so the fallback chain lives here rather than being repeated in
 * every component that renders a name.
 */
export function displayName(user: User): string {
	const preferred = user.attributes.preferredName?.trim();
	if (preferred) return preferred;

	const personal = user.vatsimData.personal;
	const full = personal.name_full?.trim();
	if (full) return full;

	const parts = [personal.name_first, personal.name_last].filter(Boolean).join(' ').trim();
	if (parts) return parts;

	return user.cid;
}

/** Short ATC rating (e.g. "S2"), or undefined when VATSIM didn't supply one. */
export function atcRating(user: User): string | undefined {
	return user.vatsimData.vatsim?.rating?.short ?? undefined;
}

/** The VATSIM email identity holds for them, or undefined when it is blank. */
export function email(user: User): string | undefined {
	return user.vatsimData.personal.email?.trim() || undefined;
}

/** Two-letter operating initials, once a user has been assigned some. */
export function operatingInitials(user: User): string | undefined {
	return user.attributes.operatingInitials?.trim() || undefined;
}
