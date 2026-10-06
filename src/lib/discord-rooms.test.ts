import { describe, expect, it } from 'vitest';
import { channelSlug, discordSyncMode, planTeacherRooms, type RoomTeacher } from './discord-rooms';

const teacher = (overrides: Partial<RoomTeacher> = {}): RoomTeacher => ({
	cid: '100',
	initials: 'JR',
	onRoster: true,
	roleId: null,
	channelId: null,
	preferredName: null,
	rosterName: { first: 'Joanna', last: 'Rivera' },
	discordId: '500000000000000001',
	students: [],
	...overrides
});

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
		const { rooms, skipped } = planTeacherRooms([teacher()]);
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
		const [room] = planTeacherRooms([teacher({ preferredName: ' Jo Rivera ' })]).rooms;
		expect(room.channelName).toBe('Jo Rivera');
	});

	it('puts the teacher and their students in the role, the teacher first', () => {
		const [room] = planTeacherRooms([
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
		const [room] = planTeacherRooms([
			teacher({ discordId: null, students: [{ cid: '200', discordId: null }] })
		]).rooms;
		expect(room.members).toEqual([]);
		expect(room.noDiscord).toEqual(['100', '200']);
	});

	it('makes nothing for a teacher with no initials yet', () => {
		const plan = planTeacherRooms([teacher({ initials: null })]);
		expect(plan.rooms).toEqual([]);
		expect(plan.skipped).toEqual([{ cid: '100', reason: 'no-initials' }]);
	});

	it('names two teachers who would collide by first name and CID', () => {
		const { rooms } = planTeacherRooms([
			teacher(),
			teacher({ cid: '101', initials: 'JX', rosterName: { first: 'joanna', last: 'RIVERA' } }),
			teacher({ cid: '102', initials: 'SW', rosterName: { first: 'Sam', last: 'Wu' } })
		]);
		expect(rooms.map((room) => room.channelName)).toEqual(['Joanna 100', 'joanna 101', 'Sam Wu']);
	});

	it('passes on the IDs Larry gave last time, so a rename in Discord is followed', () => {
		const [room] = planTeacherRooms([teacher({ roleId: '600', channelId: '700' })]).rooms;
		expect(room).toMatchObject({ roleId: '600', channelId: '700' });
	});

	// Kept, and kept in step: a student moved to another teacher loses the old role.
	it('keeps the room of a teacher who has left, with whoever is still assigned', () => {
		const left = teacher({
			onRoster: false,
			roleId: '600',
			channelId: '700',
			students: [{ cid: '200', discordId: '500000000000000002' }]
		});
		expect(planTeacherRooms([left]).rooms[0].members).toEqual([
			'500000000000000001',
			'500000000000000002'
		]);
	});

	it('makes no room for someone who left before they ever had one', () => {
		expect(planTeacherRooms([teacher({ onRoster: false })])).toEqual({ rooms: [], skipped: [] });
	});

	it('keeps a teacher on LOA exactly as they were', () => {
		// LOA is not passed in at all: it changes nothing about who is in the room.
		expect(planTeacherRooms([teacher()]).rooms).toHaveLength(1);
	});
});
