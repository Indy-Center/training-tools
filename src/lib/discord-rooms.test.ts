import { describe, expect, it } from 'vitest';
import { channelSlug, discordSyncMode, planTeacherRooms, type RoomTeacher } from './discord-rooms';

const teacher = (overrides: Partial<RoomTeacher> = {}): RoomTeacher => ({
	cid: '100',
	initials: 'JR',
	leftAt: null,
	roleId: null,
	channelId: null,
	preferredName: null,
	rosterName: { first: 'Joanna', last: 'Rivera' },
	discordId: '500000000000000001',
	students: [],
	...overrides
});

const NOW = new Date('2026-10-06T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);
/** One hour of grace, as configured. */
const plan = (teachers: RoomTeacher[]) => planTeacherRooms(teachers, NOW, 1);

describe('channelSlug', () => {
	it('writes a name the way Discord stores a channel', () => {
		expect(channelSlug('Jo Rivera')).toBe('jo-rivera');
		expect(channelSlug("Seán O'Brien")).toBe('sean-o-brien');
	});
});

describe('discordSyncMode', () => {
	// A typo in a setting must never switch on something that removes roles.
	it('is off unless spelled exactly', () => {
		expect(discordSyncMode('live')).toBe('live');
		expect(discordSyncMode('dry-run')).toBe('dry-run');
		for (const value of ['', 'Live', 'on', 'true', 'dryrun', undefined, null]) {
			expect(discordSyncMode(value)).toBe('off');
		}
	});
});

describe('planTeacherRooms', () => {
	it('gives a teacher a role named for their initials and a channel named for them', () => {
		const { rooms, skipped } = plan([teacher()]);
		expect(skipped).toEqual([]);
		expect(rooms).toEqual([
			{
				cid: '100',
				roleName: 'JR',
				channelName: 'Joanna Rivera',
				roleId: null,
				channelId: null,
				members: ['500000000000000001'],
				noDiscord: []
			}
		]);
	});

	it('uses a preferred name over the roster name', () => {
		const [room] = plan([teacher({ preferredName: ' Jo Rivera ' })]).rooms;
		expect(room.channelName).toBe('Jo Rivera');
	});

	it('puts the teacher and their students in the role, the teacher first', () => {
		const [room] = plan([
			teacher({
				students: [
					{ cid: '200', discordId: '500000000000000002' },
					{ cid: '201', discordId: '500000000000000003' }
				]
			})
		]).rooms;
		expect(room.members).toEqual([
			'500000000000000001',
			'500000000000000002',
			'500000000000000003'
		]);
	});

	// They still belong in the room; they get the role once a Discord ID turns up.
	it('lists people with no Discord ID apart, and still makes the room', () => {
		const [room] = plan([
			teacher({ discordId: null, students: [{ cid: '200', discordId: null }] })
		]).rooms;
		expect(room.members).toEqual([]);
		expect(room.noDiscord).toEqual(['100', '200']);
	});

	it('makes nothing for a teacher with no initials yet', () => {
		const result = plan([teacher({ initials: null })]);
		expect(result.rooms).toEqual([]);
		expect(result.skipped).toEqual([{ cid: '100', reason: 'no-initials' }]);
	});

	it('names two teachers who would collide by first name and CID', () => {
		const { rooms } = plan([
			teacher(),
			teacher({ cid: '101', initials: 'JX', rosterName: { first: 'joanna', last: 'RIVERA' } }),
			teacher({ cid: '102', initials: 'SW', rosterName: { first: 'Sam', last: 'Wu' } })
		]);
		expect(rooms.map((room) => room.channelName)).toEqual(['Joanna 100', 'joanna 101', 'Sam Wu']);
	});

	it('passes on the IDs Larry gave last time, so a rename in Discord is followed', () => {
		const [room] = plan([teacher({ roleId: '600', channelId: '700' })]).rooms;
		expect(room).toMatchObject({ roleId: '600', channelId: '700' });
	});

	// A role taken off on VATUSA by mistake and put back must cost nothing.
	it('keeps the room of a teacher who left less than the grace period ago, unchanged', () => {
		const left = teacher({
			leftAt: hoursAgo(0.5),
			roleId: '600',
			channelId: '700',
			students: [{ cid: '200', discordId: '500000000000000002' }]
		});
		const result = plan([left]);
		expect(result.remove).toEqual([]);
		expect(result.rooms[0].members).toEqual(['500000000000000001', '500000000000000002']);
	});

	it('deletes the role and channel of a teacher who left longer ago than that', () => {
		const left = teacher({
			leftAt: hoursAgo(1),
			roleId: '600',
			channelId: '700',
			students: [{ cid: '200', discordId: '500000000000000002' }]
		});
		expect(plan([left])).toEqual({
			rooms: [],
			skipped: [],
			remove: [{ cid: '100', roleId: '600', channelId: '700' }]
		});
	});

	it('deletes whichever of the two exists', () => {
		const left = teacher({ leftAt: hoursAgo(48), roleId: '600', channelId: null });
		expect(plan([left]).remove).toEqual([{ cid: '100', roleId: '600', channelId: null }]);
	});

	it('does nothing for someone who left before they ever had a room', () => {
		expect(plan([teacher({ leftAt: hoursAgo(48) })])).toEqual({
			rooms: [],
			skipped: [],
			remove: []
		});
	});

	// Deleted, then back on the roster: they start again like any new teacher.
	it('gives a returning teacher a room again', () => {
		const back = teacher({ leftAt: null, roleId: null, channelId: null });
		expect(plan([back]).rooms).toHaveLength(1);
	});

	it('keeps a teacher on LOA exactly as they were', () => {
		// LOA is not passed in at all: it is not leaving, and changes nothing.
		const result = plan([teacher({ roleId: '600', channelId: '700' })]);
		expect(result.rooms).toHaveLength(1);
		expect(result.remove).toEqual([]);
	});
});
