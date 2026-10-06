import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { syncStateTable } from '$lib/db/schema/sync-state';
import { teachersTable } from '$lib/db/schema/teachers';
import { DISCORD_ROOM_GRACE_HOURS, DISCORD_TEACHER_CATEGORY } from '$lib/config';
import {
	discordSyncMode,
	planTeacherRooms,
	type DiscordSyncMode,
	type RemovalReport,
	type RoomReport,
	type RoomsReport,
	type RoomTeacher
} from '$lib/discord-rooms';
import { normalizeInitials } from '$lib/teachers';
import { assignmentsFor, getAssignedEnrollments, listTeachers } from '$lib/server/teachers';
import { lookUpTeachers, writeInitials } from './identity';
import { larryGuild } from './larry';

/**
 * Keeps each teacher's Discord role and channel in step with who they teach.
 *
 * Run by the cron, after the status sweep it reads and before the
 * announcements, so a student told about their teacher can already see the
 * channel. Reconciling the whole picture each run, rather than reacting to one
 * change at a time, is what makes reassignment, withdrawal, finishing and a
 * late arrival in the server all come out right: whoever should hold a role
 * holds it, and nobody else does.
 *
 * Larry does the Discord work, as two calls — roles, then channels, because a
 * new channel is made visible to a role that has to exist first.
 *
 * `DISCORD_SYNC` switches it: `off`, `dry-run` (ask Larry what it would do and
 * store that for `/teachers`, changing nothing), or `live`.
 *
 * See decisions/0025-teacher-rooms-in-discord.md
 */

/** `sync_state` key: the last run's report, for `/teachers`. */
const REPORT_KEY = 'discord-teacher-rooms';

const SNOWFLAKE = /^\d{17,20}$/;

export type RoomsSyncResult = {
	mode: DiscordSyncMode;
	rooms: number;
	created: number;
	added: number;
	removed: number;
	errors: number;
	/** Departed teachers whose role and channel were deleted. */
	deleted: number;
	/** Initials written to identity this run. */
	initialsWritten: number;
};

function settings(env: Partial<Env> | undefined) {
	const vars = env as
		{ DISCORD_SYNC?: string; DISCORD_TRAINING_ADMIN_ROLE_ID?: string } | undefined;
	const adminRoleId = vars?.DISCORD_TRAINING_ADMIN_ROLE_ID?.trim() ?? '';
	return {
		mode: discordSyncMode(vars?.DISCORD_SYNC),
		adminRoleId: SNOWFLAKE.test(adminRoleId) ? adminRoleId : null
	};
}

/** Null when the sync is off, or Larry is not bound. */
export async function syncTeacherRooms(
	db: Database,
	env: Partial<Env> | undefined,
	now = new Date()
): Promise<RoomsSyncResult | null> {
	const { mode, adminRoleId } = settings(env);
	if (mode === 'off') return null;

	const larry = larryGuild(env);
	if (!larry) {
		console.warn('[training-tools] discord rooms: no LARRY binding; skipped');
		return null;
	}

	const dryRun = mode === 'dry-run';

	// Whole tables, not `IN (...)` over CIDs: D1's 100-parameter limit.
	const [teachers, roster, enrollments] = await Promise.all([
		listTeachers(db),
		db
			.select({
				cid: rosterMembersTable.cid,
				firstName: rosterMembersTable.firstName,
				lastName: rosterMembersTable.lastName,
				discordId: rosterMembersTable.discordId
			})
			.from(rosterMembersTable),
		getAssignedEnrollments(db)
	]);

	const people = new Map(roster.map((row) => [row.cid, row]));
	const discordIdOf = (cid: string) => {
		const id = people.get(cid)?.discordId?.trim();
		return id && SNOWFLAKE.test(id) ? id : null;
	};

	const identity = await lookUpTeachers(
		env,
		teachers.filter((teacher) => teacher.removedAt === null).map((teacher) => teacher.cid)
	);

	const plan = planTeacherRooms(
		teachers.map((teacher): RoomTeacher => {
			const person = people.get(teacher.cid);
			return {
				cid: teacher.cid,
				initials: teacher.initials,
				leftAt: teacher.removedAt,
				roleId: teacher.discordRoleId,
				channelId: teacher.discordChannelId,
				preferredName: identity.known.get(teacher.cid)?.preferredName ?? null,
				rosterName: person ? { first: person.firstName, last: person.lastName } : null,
				discordId: discordIdOf(teacher.cid),
				students: assignmentsFor(teacher, enrollments).students.map((student) => ({
					cid: student.cid,
					discordId: discordIdOf(student.cid)
				}))
			};
		}),
		now,
		DISCORD_ROOM_GRACE_HOURS
	);

	// Discord ID back to CID, for the report. Removed people may be nobody we know.
	const cidOf = new Map(
		roster.flatMap((row) =>
			discordIdOf(row.cid) ? [[discordIdOf(row.cid)!, row.cid] as const] : []
		)
	);

	const roles = await larry.syncRoles({
		dryRun,
		roles: plan.rooms.map((room) => ({
			key: room.cid,
			id: room.roleId,
			name: room.roleName,
			rename: true,
			members: room.members,
			// Decided: anyone holding a teacher's role who is not that teacher or
			// one of their students loses it, however they got it.
			exclusive: true
		}))
	});
	const roleByCid = new Map(roles.roles.map((role) => [role.key, role]));

	// A channel is made visible to its role, so only rooms whose role exists
	// can have one. In a dry run that leaves out roles Larry would create.
	const ready = adminRoleId
		? plan.rooms.filter(
				(room) => roleByCid.get(room.cid)?.roleId && !roleByCid.get(room.cid)?.error
			)
		: [];
	const channels =
		ready.length > 0
			? await larry.syncChannels({
					dryRun,
					channels: ready.map((room) => ({
						key: room.cid,
						category: DISCORD_TEACHER_CATEGORY,
						id: room.channelId,
						name: room.channelName,
						rename: true,
						visibleTo: [roleByCid.get(room.cid)!.roleId!, adminRoleId!]
					}))
				})
			: { dryRun, channels: [] };
	const channelByCid = new Map(channels.channels.map((channel) => [channel.key, channel]));

	// Teachers gone longer than the grace period: their role and channel go.
	const removed = await removeRooms(db, larry, plan.remove, dryRun);

	const report: RoomsReport = {
		mode,
		at: now.getTime(),
		canSeeMembers: roles.canSeeMembers,
		skipped: plan.skipped,
		removed,
		rooms: plan.rooms.map((room): RoomReport => {
			const role = roleByCid.get(room.cid);
			const channel = channelByCid.get(room.cid);
			const errors = [role?.error, channel?.error].filter((error): error is string => !!error);
			if (!adminRoleId)
				errors.push('DISCORD_TRAINING_ADMIN_ROLE_ID is not set, so no channel is made');

			return {
				cid: room.cid,
				roleName: room.roleName,
				role: role?.error || !role ? 'failed' : role.role,
				roleRenamedFrom: role?.renamedFrom,
				channelName: channel?.channelName ?? room.channelName,
				channel: channel?.error
					? 'failed'
					: (channel?.channel ?? (adminRoleId ? 'waiting' : 'failed')),
				channelRenamedFrom: channel?.renamedFrom,
				added: (role?.added ?? []).map((id) => cidOf.get(id) ?? id),
				removed: role?.removed ?? [],
				notInServer: (role?.notInServer ?? []).map((id) => cidOf.get(id) ?? id),
				noDiscord: room.noDiscord,
				errors
			};
		})
	};

	// Remember what Larry found or made, so next time it is asked for by ID.
	if (!dryRun) {
		for (const room of plan.rooms) {
			const roleId = roleByCid.get(room.cid)?.roleId ?? room.roleId;
			const channelId = channelByCid.get(room.cid)?.channelId ?? room.channelId;
			if (roleId === room.roleId && channelId === room.channelId) continue;

			await db
				.update(teachersTable)
				.set({ discordRoleId: roleId, discordChannelId: channelId })
				.where(eq(teachersTable.cid, room.cid));
		}
	}

	// This app is where initials are entered, so identity is told. Only for
	// someone identity already knows, and never in a dry run.
	let initialsWritten = 0;
	if (!dryRun) {
		for (const teacher of teachers) {
			const known = identity.known.get(teacher.cid);
			const initials = normalizeInitials(teacher.initials);
			if (!known || !initials || known.initials === initials) continue;

			try {
				await writeInitials(env, known.userId, initials);
				initialsWritten += 1;
			} catch (err) {
				console.error('[training-tools] could not write initials to identity', teacher.cid, err);
			}
		}
	}

	await db
		.insert(syncStateTable)
		.values({ key: REPORT_KEY, cursorAt: now, value: JSON.stringify(report) })
		.onConflictDoUpdate({
			target: syncStateTable.key,
			set: { cursorAt: now, value: JSON.stringify(report) }
		});

	const failed = [
		...report.rooms.filter((room) => room.errors.length > 0),
		...removed
			.filter((removal) => removal.errors.length > 0)
			.map((removal) => ({ roleName: `removing ${removal.cid}`, errors: removal.errors }))
	];
	const result: RoomsSyncResult = {
		mode,
		rooms: report.rooms.length,
		created: report.rooms.filter((room) => room.role === 'created' || room.channel === 'created')
			.length,
		added: report.rooms.reduce((sum, room) => sum + room.added.length, 0),
		removed: report.rooms.reduce((sum, room) => sum + room.removed.length, 0),
		errors: failed.length,
		deleted: removed.filter(
			(removal) => removal.role === 'deleted' || removal.channel === 'deleted'
		).length,
		initialsWritten
	};

	// Live, a room that could not be synced fails the job, which is how the tech
	// team hears: the job-health alert, once, with the reasons. The report is
	// already saved, and every other room was still done.
	if (!dryRun && failed.length > 0) {
		throw new Error(
			`Discord rooms: ${failed.map((room) => `${room.roleName}: ${room.errors.join('; ')}`).join(' | ')}`
		);
	}

	return result;
}

/**
 * Delete the role and channel of each teacher who left longer ago than the
 * grace period, and forget their IDs once Discord no longer has them.
 *
 * The IDs are cleared only for what is actually deleted or already gone, so
 * one that Larry refused or could not reach is tried again next run.
 */
async function removeRooms(
	db: Database,
	larry: NonNullable<ReturnType<typeof larryGuild>>,
	remove: readonly { cid: string; roleId: string | null; channelId: string | null }[],
	dryRun: boolean
): Promise<RemovalReport[]> {
	if (remove.length === 0) return [];

	const ids = (pick: (removal: (typeof remove)[number]) => string | null) =>
		remove.flatMap((removal) => (pick(removal) ? [pick(removal)!] : []));

	// Channels first: a channel whose role has gone would be left visible only to the admins.
	const channels = await larry.deleteChannels({ ids: ids((removal) => removal.channelId), dryRun });
	const roles = await larry.deleteRoles({ ids: ids((removal) => removal.roleId), dryRun });
	const channelOutcome = new Map(channels.deleted.map((deletion) => [deletion.id, deletion]));
	const roleOutcome = new Map(roles.deleted.map((deletion) => [deletion.id, deletion]));

	const reports: RemovalReport[] = [];

	for (const removal of remove) {
		const role = removal.roleId ? roleOutcome.get(removal.roleId) : undefined;
		const channel = removal.channelId ? channelOutcome.get(removal.channelId) : undefined;
		const done = (deletion: typeof role) =>
			!!deletion &&
			!deletion.error &&
			(deletion.outcome === 'deleted' || deletion.outcome === 'gone');

		if (!dryRun) {
			const roleId = done(role) ? null : removal.roleId;
			const channelId = done(channel) ? null : removal.channelId;
			if (roleId !== removal.roleId || channelId !== removal.channelId) {
				await db
					.update(teachersTable)
					.set({ discordRoleId: roleId, discordChannelId: channelId })
					.where(eq(teachersTable.cid, removal.cid));
			}
		}

		const outcome = (id: string | null, deletion: typeof role): RemovalReport['role'] =>
			!id ? 'none' : !deletion || deletion.error ? 'failed' : deletion.outcome;

		reports.push({
			cid: removal.cid,
			role: outcome(removal.roleId, role),
			channel: outcome(removal.channelId, channel),
			errors: [role?.error, channel?.error].filter((error): error is string => !!error)
		});
	}

	return reports;
}

/**
 * Who each Discord user ID on the roster belongs to, by name. For the report:
 * Larry says who loses a role by Discord ID, since it may be nobody we know.
 */
export async function getDiscordNames(db: Database): Promise<Map<string, string>> {
	// The whole (small) table, not `IN (...)`: D1's 100-parameter limit.
	const rows = await db
		.select({
			firstName: rosterMembersTable.firstName,
			lastName: rosterMembersTable.lastName,
			discordId: rosterMembersTable.discordId
		})
		.from(rosterMembersTable);

	return new Map(
		rows.flatMap((row) =>
			row.discordId?.trim()
				? [[row.discordId.trim(), `${row.firstName} ${row.lastName}`.trim()] as const]
				: []
		)
	);
}

/** The last run's report, for `/teachers`. Null before the first run. */
export async function getRoomsReport(db: Database): Promise<RoomsReport | null> {
	const row = await db.query.syncStateTable.findFirst({
		where: eq(syncStateTable.key, REPORT_KEY)
	});
	if (!row?.value) return null;

	try {
		return JSON.parse(row.value) as RoomsReport;
	} catch {
		return null;
	}
}
