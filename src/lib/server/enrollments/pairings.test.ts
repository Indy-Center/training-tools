import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { GroupPost, GroupPostResult } from '@indy-center/indy-larry-worker';
import { enrollmentsTable } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { teachersTable } from '$lib/db/schema/teachers';
import { FACILITY_ID } from '$lib/config';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { announcePairings } from './pairings';

// Made-up people; nothing here is a real controller.
const TEACHER = '1000100';
const STUDENT = '1000201';
const AFTERNOON = new Date('2026-10-07T18:00:00Z');

const person = (cid: string, first: string, last: string) => ({
	cid,
	firstName: first,
	lastName: last,
	rating: 4,
	ratingShort: 'S3',
	membership: 'home' as const,
	facility: FACILITY_ID,
	discordId: '123456789012345678',
	data: { flag_nameprivacy: false, roles: [] } as never
});

/** A stand-in for larry that answers each post with the next of `answers`. */
function fakeLarry(...answers: GroupPostResult[]) {
	const posts: GroupPost[] = [];
	const env = {
		LARRY: {
			postToGroup: async (post: GroupPost) => {
				posts.push(post);
				return answers.shift() ?? 'posted';
			},
			syncMembers: async () => []
		}
	} as unknown as Partial<Env>;
	return { env, posts };
}

async function announced(db: Database) {
	const row = await db.query.enrollmentsTable.findFirst({
		where: eq(enrollmentsTable.cid, STUDENT)
	});
	return row?.announcedTeacher ?? null;
}

describe('announcePairings', () => {
	let db: Database;

	beforeEach(async () => {
		db = testDb();
		// Migration 0010 seeds the real teacher roster; start from ours instead.
		await db.delete(teachersTable);
		await db
			.insert(rosterMembersTable)
			.values([person(TEACHER, 'Joanna', 'Rivera'), person(STUDENT, 'Ann', 'Lee')]);
		await db
			.insert(teachersTable)
			.values({ cid: TEACHER, roles: ['MTR'], initials: 'JR', studentMessage: 'Book with me' });
		await db.insert(enrollmentsTable).values({
			id: 'e1',
			cid: STUDENT,
			course: 'S-GC',
			status: 'in-training',
			submittedName: 'Ann Lee',
			teacher: 'JR',
			availability: '<@999999999999999999> **weekends**'
		});
	});

	it("posts in the teacher's group, mentioning both, with no Discord markup", async () => {
		const larry = fakeLarry('posted');

		const result = await announcePairings(db, larry.env, AFTERNOON);

		expect(result).toEqual({ pending: 1, announced: 1 });
		expect(larry.posts).toHaveLength(1);
		const [post] = larry.posts;
		expect(post.source).toBe('training');
		expect(post.key).toBe(`teacher:${TEACHER}`);
		expect(post.mention).toEqual([TEACHER, STUDENT]);
		expect(post.notice.title).toBe('Good afternoon Ann Lee and Joanna Rivera');
		expect(post.notice.fields).toContainEqual({
			name: 'Course',
			value: 'Simple Ground Control (S-GC)'
		});
		expect(post.notice.fields).toContainEqual({
			name: 'From Joanna Rivera',
			value: 'Book with me'
		});
		// What the student typed is passed on as they typed it: larry escapes it.
		expect(post.notice.fields).toContainEqual({
			name: 'Student Availability',
			value: '<@999999999999999999> **weekends**'
		});
		const written = [post.notice.title, post.notice.body].join('\n');
		expect(written).not.toMatch(/<@|\*\*|\]\(</);
		expect(await announced(db)).toBe('JR');
	});

	it.each(['no-room', 'not-live'] as const)(
		'leaves it unannounced on %s, and a later pass posts it',
		async (answer) => {
			const larry = fakeLarry(answer, 'posted');

			expect(await announcePairings(db, larry.env, AFTERNOON)).toEqual({
				pending: 1,
				announced: 0
			});
			expect(await announced(db)).toBeNull();

			expect(await announcePairings(db, larry.env, AFTERNOON)).toEqual({
				pending: 1,
				announced: 1
			});
			expect(larry.posts).toHaveLength(2);
			expect(await announced(db)).toBe('JR');
		}
	);

	it('leaves it unannounced when larry cannot be reached', async () => {
		const env = {
			LARRY: {
				postToGroup: async () => {
					throw new Error('unreachable');
				}
			}
		} as unknown as Partial<Env>;

		expect(await announcePairings(db, env, AFTERNOON)).toEqual({ pending: 1, announced: 0 });
		expect(await announced(db)).toBeNull();
	});

	it('posts nothing for a teacher who is not on the teacher roster', async () => {
		await db.update(teachersTable).set({ removedAt: new Date('2026-10-01T00:00:00Z') });
		const larry = fakeLarry();

		expect(await announcePairings(db, larry.env, AFTERNOON)).toEqual({ pending: 1, announced: 0 });
		expect(larry.posts).toHaveLength(0);
	});
});
