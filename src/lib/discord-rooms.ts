/**
 * A teacher's place in Discord: a role named for their initials, held by them
 * and their current students, and a channel named for them that only the role
 * and the training admins see.
 *
 * Pure: takes who teaches whom and gives back what Discord should look like.
 * Larry does the Discord work, as two separate things — roles, then channels —
 * and `$lib/server/discord/rooms.ts` is the code that asks it to.
 *
 * See decisions/0025-teacher-rooms-in-discord.md
 */

/** A student currently assigned to a teacher. */
export type RoomStudent = { cid: string; discordId: string | null };

export type RoomTeacher = {
	cid: string;
	/** Null until a training admin has entered them. */
	initials: string | null;
	/** When they stopped holding INS or MTR here. Null while they are on the teacher roster. */
	leftAt: Date | null;
	/** What Larry found or made last time, if anything. */
	roleId: string | null;
	channelId: string | null;
	/** From identity, for teachers who have signed in and set one. */
	preferredName: string | null;
	/** From the VATUSA roster mirror. Null only for a CID the mirror has never held. */
	rosterName: { first: string; last: string } | null;
	discordId: string | null;
	/** Their students at In Training, Rating Exam or Needs CATP — never their own request. */
	students: RoomStudent[];
};

export type TeacherRoom = {
	cid: string;
	/** Exactly their initials. */
	roleName: string;
	/** As a person would write it; Larry lowercases and hyphenates it. */
	channelName: string;
	roleId: string | null;
	channelId: string | null;
	/** Discord user IDs who should hold the role: the teacher, then their students. */
	members: string[];
	/** CIDs of people who belong in the room but have no Discord ID on the roster. */
	noDiscord: string[];
};

export type RoomSkip = { cid: string; reason: 'no-initials' | 'no-name' };

/** A role and channel to delete: their teacher left longer ago than the grace period. */
export type RoomRemoval = { cid: string; roleId: string | null; channelId: string | null };

export type TeacherRoomPlan = { rooms: TeacherRoom[]; skipped: RoomSkip[]; remove: RoomRemoval[] };

/** A channel name as Discord stores it, to tell when two teachers would collide. */
export function channelSlug(name: string): string {
	return name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Their preferred name when they have set one, otherwise the roster's. */
function displayName(teacher: RoomTeacher): string | null {
	const preferred = teacher.preferredName?.trim();
	if (preferred) return preferred;
	if (!teacher.rosterName) return null;
	return `${teacher.rosterName.first} ${teacher.rosterName.last}`.trim() || null;
}

/**
 * The room each teacher should have.
 *
 * - **No initials, no room.** The role is named for them, so there is nothing
 *   to make until a training admin has entered some.
 * - **A teacher on LOA keeps their room.** LOA is not leaving.
 * - **A teacher who has left loses theirs after `graceHours`.** Until then it is
 *   kept exactly as it was, so one who comes back — a role removed on VATUSA by
 *   mistake — loses nothing. After that the role and the channel are deleted,
 *   and anyone still assigned to them loses access with it. One who left before
 *   any room existed has nothing to delete and is not given one.
 * - **Two teachers who would get the same channel** are both named by first
 *   name and CID instead, so neither depends on who was there first.
 */
export function planTeacherRooms(
	teachers: readonly RoomTeacher[],
	now: Date,
	graceHours: number
): TeacherRoomPlan {
	const rooms: TeacherRoom[] = [];
	const skipped: RoomSkip[] = [];
	const remove: RoomRemoval[] = [];
	const named: { teacher: RoomTeacher; name: string }[] = [];

	for (const teacher of teachers) {
		const hadRoom = teacher.roleId !== null || teacher.channelId !== null;

		if (teacher.leftAt) {
			if (!hadRoom) continue;
			const graceEnds = teacher.leftAt.getTime() + graceHours * 60 * 60 * 1000;
			if (now.getTime() >= graceEnds) {
				remove.push({ cid: teacher.cid, roleId: teacher.roleId, channelId: teacher.channelId });
				continue;
			}
			// Still inside the grace period: carried on exactly as before.
		}

		if (!teacher.initials) {
			skipped.push({ cid: teacher.cid, reason: 'no-initials' });
			continue;
		}

		const name = displayName(teacher);
		if (!name) {
			skipped.push({ cid: teacher.cid, reason: 'no-name' });
			continue;
		}

		named.push({ teacher, name });
	}

	const uses = new Map<string, number>();
	for (const { name } of named) {
		const slug = channelSlug(name);
		uses.set(slug, (uses.get(slug) ?? 0) + 1);
	}

	for (const { teacher, name } of named) {
		const clash = (uses.get(channelSlug(name)) ?? 0) > 1;
		const first = name.split(/\s+/)[0] ?? name;

		const people = [{ cid: teacher.cid, discordId: teacher.discordId }, ...teacher.students];

		rooms.push({
			cid: teacher.cid,
			roleName: teacher.initials!,
			channelName: clash ? `${first} ${teacher.cid}` : name,
			roleId: teacher.roleId,
			channelId: teacher.channelId,
			members: [
				...new Set(people.flatMap((person) => (person.discordId ? [person.discordId] : [])))
			],
			noDiscord: people.filter((person) => !person.discordId).map((person) => person.cid)
		});
	}

	return { rooms, skipped, remove };
}

/** How the sync is switched: nothing, report only, or for real. */
export type DiscordSyncMode = 'off' | 'dry-run' | 'live';

/** Anything not spelled exactly is off: a typo must never turn it on. */
export function discordSyncMode(value: string | null | undefined): DiscordSyncMode {
	return value === 'live' || value === 'dry-run' ? value : 'off';
}

/** One teacher's room as the last sync left it, or would. Stored, and shown on `/admin`. */
export type RoomReport = {
	cid: string;
	roleName: string;
	role: 'found' | 'created' | 'would-create' | 'failed';
	/** The role's name in Discord before it was renamed to match. */
	roleRenamedFrom?: string;
	channelName: string;
	/** `waiting` in a dry run when the role does not exist yet, so the channel cannot be previewed. */
	channel: 'found' | 'created' | 'would-create' | 'waiting' | 'failed';
	channelRenamedFrom?: string;
	/** CIDs given the role, or who would be. */
	added: string[];
	/** Discord user IDs the role was taken from, or would be. Not CIDs: they may be nobody we know. */
	removed: string[];
	/** CIDs with a Discord ID who are not in the server. */
	notInServer: string[];
	/** CIDs with no Discord ID on the roster. */
	noDiscord: string[];
	errors: string[];
};

/** A departed teacher's role and channel, as the last sync deleted them, or would. */
export type RemovalReport = {
	cid: string;
	/** `none` when there was nothing of that kind to delete. */
	role: 'deleted' | 'would-delete' | 'gone' | 'failed' | 'none';
	channel: 'deleted' | 'would-delete' | 'gone' | 'failed' | 'none';
	errors: string[];
};

export type RoomsReport = {
	mode: DiscordSyncMode;
	at: number;
	/** False when Larry cannot list members, so nobody is being removed. */
	canSeeMembers: boolean;
	rooms: RoomReport[];
	skipped: RoomSkip[];
	removed: RemovalReport[];
};

/**
 * The report as `/admin` draws it: CIDs and Discord IDs already turned into
 * names. Here rather than under `$lib/server/` because a component uses it.
 */
export type RoomsPanel = {
	mode: DiscordSyncMode;
	at: Date;
	canSeeMembers: boolean;
	skipped: { name: string; reason: RoomSkip['reason'] }[];
	/** Teachers who left: their role and channel deleted, or about to be. */
	deleted: {
		cid: string;
		teacher: string;
		role: RemovalReport['role'];
		channel: RemovalReport['channel'];
		errors: string[];
	}[];
	rooms: {
		cid: string;
		teacher: string;
		roleName: string;
		role: RoomReport['role'];
		roleRenamedFrom: string | null;
		channelName: string;
		channel: RoomReport['channel'];
		channelRenamedFrom: string | null;
		added: string[];
		removed: string[];
		notInServer: string[];
		noDiscord: string[];
		errors: string[];
	}[];
};
