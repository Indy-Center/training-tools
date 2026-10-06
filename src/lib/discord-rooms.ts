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
	/** False once they no longer hold INS or MTR here. */
	onRoster: boolean;
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

export type TeacherRoomPlan = { rooms: TeacherRoom[]; skipped: RoomSkip[] };

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
 * - **A teacher who has left keeps their room** if they ever had one: it stays
 *   in step with whoever is still assigned to them, so a student moved to
 *   someone else loses the old role. One who left before any room existed is
 *   not given one.
 * - **Two teachers who would get the same channel** are both named by first
 *   name and CID instead, so neither depends on who was there first.
 */
export function planTeacherRooms(teachers: readonly RoomTeacher[]): TeacherRoomPlan {
	const rooms: TeacherRoom[] = [];
	const skipped: RoomSkip[] = [];
	const named: { teacher: RoomTeacher; name: string }[] = [];

	for (const teacher of teachers) {
		const hadRoom = teacher.roleId !== null || teacher.channelId !== null;
		if (!teacher.onRoster && !hadRoom) continue;

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

	return { rooms, skipped };
}

/** How the sync is switched: nothing, report only, or for real. */
export type DiscordSyncMode = 'off' | 'dry-run' | 'live';

/** Anything not spelled exactly is off: a typo must never turn it on. */
export function discordSyncMode(value: string | null | undefined): DiscordSyncMode {
	return value === 'live' || value === 'dry-run' ? value : 'off';
}

/** One teacher's room as the last sync left it, or would. Stored, and shown on `/teachers`. */
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

export type RoomsReport = {
	mode: DiscordSyncMode;
	at: number;
	/** False when Larry cannot list members, so nobody is being removed. */
	canSeeMembers: boolean;
	rooms: RoomReport[];
	skipped: RoomSkip[];
};
