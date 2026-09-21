/**
 * Identity stores roles as an unconstrained `text` column with no published
 * vocabulary, so this app namespaces the ones it owns. Nothing grants these
 * yet — they read false until someone writes them into identity's user_roles
 * table. See .ai/decisions/0005-namespaced-role-vocabulary.md
 */
export enum Role {
	/** Training staff: full access, implies every other training role. */
	ADMIN = 'training:admin',
	/** Mentors and instructors: run lessons, grade students. */
	INSTRUCTOR = 'training:instructor',
	/**
	 * View and edit anyone's certifications and endorsements.
	 *
	 * DEV-115 wants this held by home I1/I3s, the ATM, DATM and TA, and the ZID
	 * mentor role. **Identity owns that assignment**, not this app — we only read
	 * the string. Deliberately separate from INSTRUCTOR: running lessons and
	 * changing someone's certification are different authorities, and the ATM and
	 * DATM need the second without necessarily being instructors.
	 */
	CERTIFICATIONS = 'training:certifications:edit'
}

export function isTrainingAdmin(roles?: string[] | null): boolean {
	if (!roles) return false;
	return roles.includes(Role.ADMIN);
}

/** True when the user holds `role`, or is a training admin (admin implies all). */
export function canManage(roles: string[] | null | undefined, role: Role): boolean {
	if (!roles) return false;
	return roles.includes(role) || isTrainingAdmin(roles);
}

export function isInstructor(roles?: string[] | null): boolean {
	return canManage(roles, Role.INSTRUCTOR);
}

/** May view and edit anyone's certifications and endorsements (DEV-115). */
export function canEditCertifications(roles?: string[] | null): boolean {
	return canManage(roles, Role.CERTIFICATIONS);
}
