import { describe, expect, it } from 'vitest';
import { CREDENTIALS } from './certifications';
import { planGroups, type GroupMember, type GroupsInput } from './groups';
import type { GroupTeacher } from './teacher-groups';

// Made-up people; nothing here is a real controller.
const member = (cid: string, certification: string | null, endorsements: string[] = []) =>
	({ cid, certification, endorsements }) satisfies GroupMember;

const plan = (input: Partial<GroupsInput>) =>
	planGroups({ catalogue: CREDENTIALS, members: [], teachers: [], ...input });

/** The credential groups a CID is in, by code. */
const credentialsOf = (cid: string, input: Partial<GroupsInput>) =>
	plan(input)
		.groups.filter((group) => group.key.startsWith('credential:') && group.members.includes(cid))
		.map((group) => group.name)
		.sort();

describe('planGroups: credential groups', () => {
	it('puts a T-RC holder in T-RC and every credential below it, not E-RC', () => {
		expect(credentialsOf('1000001', { members: [member('1000001', 'T-RC')] })).toEqual([
			'A-GC',
			'A-LC',
			'S-GC',
			'S-LC',
			'T-RC'
		]);
	});

	// S-LC needs S-GC *or* A-GC: holding it says nothing about which.
	it('puts an S-GC holder with the S-LC endorsement in S-GC and S-LC, not A-GC', () => {
		expect(credentialsOf('1000001', { members: [member('1000001', 'S-GC', ['S-LC'])] })).toEqual([
			'S-GC',
			'S-LC'
		]);
	});

	// Imported data can hold T2-CTR without E-RC; it still implies everything below.
	it('puts a T2-CTR holder in every credential group from T2-CTR down to S-GC', () => {
		expect(credentialsOf('1000001', { members: [member('1000001', null, ['T2-CTR'])] })).toEqual([
			'A-GC',
			'A-LC',
			'E-RC',
			'S-GC',
			'S-LC',
			'T-RC',
			'T2-CTR'
		]);
	});

	it('serves a group for every catalogue entry, even one nobody holds', () => {
		const { groups } = plan({
			catalogue: [...CREDENTIALS, { code: 'X-TEST', requires: ['S-GC'] }],
			members: [member('1000001', 'S-GC')]
		});
		expect(groups.map((group) => group.key)).toEqual([
			'credential:S-GC',
			'credential:A-GC',
			'credential:A-LC',
			'credential:T-RC',
			'credential:E-RC',
			'credential:S-LC',
			'credential:T2-CTR',
			'credential:X-TEST'
		]);
		expect(groups.find((group) => group.key === 'credential:X-TEST')).toEqual({
			key: 'credential:X-TEST',
			name: 'X-TEST',
			members: []
		});
	});

	it('lists each member once, as a digit string', () => {
		const { groups } = plan({
			members: [
				member('1000001', 'A-LC', ['S-LC']),
				member('1000001', 'A-GC'),
				member(' 1000002 ', 'S-GC'),
				member('not-a-cid', 'S-GC')
			]
		});
		expect(groups.find((group) => group.key === 'credential:S-GC')?.members).toEqual([
			'1000001',
			'1000002'
		]);
	});
});

describe('planGroups: teacher groups', () => {
	const teacher = (overrides: Partial<GroupTeacher> = {}): GroupTeacher => ({
		cid: '1000100',
		initials: 'JR',
		leftAt: null,
		preferredName: null,
		rosterName: { first: 'Joanna', last: 'Rivera' },
		namePrivacy: false,
		students: [],
		nameUncertain: false,
		...overrides
	});

	const teacherGroups = (teachers: GroupTeacher[]) =>
		plan({ teachers }).groups.filter((group) => group.key.startsWith('teacher:'));

	it('serves the teacher and their students, with a room named for the teacher', () => {
		expect(teacherGroups([teacher({ students: ['1000201', '1000202'] })])).toEqual([
			{
				key: 'teacher:1000100',
				name: 'JR',
				members: ['1000100', '1000201', '1000202'],
				room: { name: 'Joanna Rivera', fallbackName: 'Joanna 1000100' }
			}
		]);
	});

	it('lists the teacher first, then their students by CID', () => {
		const [group] = teacherGroups([teacher({ students: ['1000203', '1000099', '1000201'] })]);
		expect(group.members).toEqual(['1000100', '1000099', '1000201', '1000203']);
	});

	it('lists each member once, as a digit string', () => {
		const [group] = teacherGroups([
			teacher({ students: ['1000201', ' 1000201', '1000100', 'nobody'] })
		]);
		expect(group.members).toEqual(['1000100', '1000201']);
	});

	// LOA is not passed in at all: it is not leaving, and changes nothing.
	it('serves teachers on the roster, and not one who has left', () => {
		const groups = teacherGroups([
			teacher(),
			teacher({ cid: '1000101', initials: 'SW', leftAt: new Date('2026-11-01T00:00:00Z') })
		]);
		expect(groups.map((group) => group.key)).toEqual(['teacher:1000100']);
	});

	// So a room they already have is kept exactly as it is, and none is made.
	it('holds the group of a teacher with no initials', () => {
		expect(teacherGroups([teacher({ initials: null, students: ['1000201'] })])).toEqual([
			{
				key: 'teacher:1000100',
				name: '1000100',
				members: ['1000100', '1000201'],
				room: { name: 'Joanna Rivera', fallbackName: 'Joanna 1000100' },
				hold: true
			}
		]);
	});

	it('holds the group of a teacher with no usable name', () => {
		expect(teacherGroups([teacher({ rosterName: null })])).toEqual([
			{ key: 'teacher:1000100', name: 'JR', members: ['1000100'], hold: true }
		]);
	});

	// Identity was down: the room keeps its name and members rather than taking the roster name.
	it('holds the group of a teacher whose name is uncertain', () => {
		expect(teacherGroups([teacher({ nameUncertain: true, students: ['1000201'] })])).toEqual([
			{
				key: 'teacher:1000100',
				name: 'JR',
				members: ['1000100', '1000201'],
				room: { name: 'Joanna Rivera', fallbackName: 'Joanna 1000100' },
				hold: true
			}
		]);
	});

	it('comes after the credential groups', () => {
		const keys = plan({ teachers: [teacher()] }).groups.map((group) => group.key);
		expect(keys.at(-1)).toBe('teacher:1000100');
		expect(keys.slice(0, -1).every((key) => key.startsWith('credential:'))).toBe(true);
	});
});
