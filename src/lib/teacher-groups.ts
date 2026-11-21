/**
 * A teacher's group: the teacher and their current students, sharing a room
 * named for the teacher. Served by `TrainingRpc.getGroups()` (see
 * `$lib/groups.ts`); larry decides what that becomes in each chat system.
 *
 * The naming rules live here, not with whatever draws the room: they are the
 * training app's choice of how a teacher is shown. Comparing two rooms' names
 * for a clash is not: what collides depends on the chat system.
 *
 * See decisions/0025-teacher-rooms-in-discord.md and decision 0045 in the
 * role-sync notes.
 */

import type { Group } from '$rpc';

/** What a teacher's room is named from. */
export type NamedTeacher = {
	cid: string;
	/** From identity, for teachers who have signed in and set one. */
	preferredName: string | null;
	/** From the VATUSA roster mirror. Null only for a CID the mirror has never held. */
	rosterName: { first: string; last: string } | null;
	/** VATUSA's `flag_nameprivacy`: no last name in the room. False when the mirror lacks them. */
	namePrivacy: boolean;
};

/** Someone on the teacher roster, or who was. */
export type GroupTeacher = NamedTeacher & {
	/** Null until a training admin has entered them. Unique across teachers. */
	initials: string | null;
	/** When they stopped holding INS or MTR here. Null while on the teacher roster, LOA included. */
	leftAt: Date | null;
	/** CIDs of their students at In Training, Rating Exam or Needs CATP: never their own request. */
	students: readonly string[];
};

/**
 * One group per teacher on the roster: the teacher, then their students, in a
 * room named for the teacher. A teacher who has left isn't served.
 *
 * With no initials or no usable name the group is served on `hold`, so a room
 * they already have is kept exactly as it is and none is made: clearing
 * someone's initials doesn't delete their room. Its other fields are what is
 * known, for reading only.
 */
export function teacherGroups(teachers: readonly GroupTeacher[]): Group[] {
	return teachers
		.filter((teacher) => teacher.leftAt === null)
		.map((teacher) => {
			const room = teacherRoomName(teacher);
			const initials = teacher.initials?.trim();
			return {
				key: `teacher:${teacher.cid}`,
				name: initials || teacher.cid,
				members: [teacher.cid, ...teacher.students],
				...(room ? { room } : {}),
				...(initials && room ? {} : { hold: true as const })
			};
		});
}

export type RoomName = {
	name: string;
	/** Used instead when two rooms' names collide: the first word of `name` and the CID. */
	fallbackName: string;
};

/**
 * The room's name: their preferred name, else the roster's first and last
 * name. With VATUSA name privacy set it is their first name and CID instead,
 * and a preferred name counts only if it is not just their full name. Null
 * when there is no usable name.
 *
 * A name that already holds the CID can't clash, so it is its own fallback.
 */
export function teacherRoomName(teacher: NamedTeacher): RoomName | null {
	const roster = teacher.rosterName;
	const full = roster ? `${roster.first.trim()} ${roster.last.trim()}`.trim() : '';
	const preferred = teacher.preferredName?.trim();

	if (preferred && !(teacher.namePrivacy && isJustFullName(preferred, full))) {
		return withFallback(preferred, teacher.cid);
	}
	if (teacher.namePrivacy) {
		const first = roster?.first.trim();
		if (!first) return null;
		const name = `${first} ${teacher.cid}`;
		return { name, fallbackName: name };
	}
	return full ? withFallback(full, teacher.cid) : null;
}

function withFallback(name: string, cid: string): RoomName {
	const first = name.split(/\s+/)[0] ?? name;
	return { name, fallbackName: `${first} ${cid}` };
}

/** Other apps pre-fill a preferred name with the full name: that is not a choice to show it. */
function isJustFullName(preferred: string, full: string): boolean {
	const key = comparable(preferred);
	return key !== '' && key === comparable(full);
}

/** A name with case, accents and punctuation set aside, to tell two spellings of one apart. */
function comparable(name: string): string {
	return name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
