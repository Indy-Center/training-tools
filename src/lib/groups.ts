/**
 * The training app's groups, as `TrainingRpc.getGroups()` serves them: one per
 * credential, its holders top down, and one per teacher, with their students
 * and a room. Larry turns them into chat roles and rooms without knowing why
 * they exist.
 *
 * Pure: everything it reads is passed in, the catalogue included, so a later
 * catalogue (Payload) changes only what the caller hands it.
 *
 * See decisions/0045-groups-contract.md
 */
import type { Credential } from './certifications';
import { teacherGroups, teacherHold, type GroupTeacher, type HoldReason } from './teacher-groups';
import type { Group, GroupsAnswer, RosterMember } from '$rpc';

/** A credential as the plan reads it: its code and what it needs. */
export type CatalogueEntry = Pick<Credential, 'code' | 'requires'>;

/** What `readRoster()` says a member holds. */
export type GroupMember = Pick<RosterMember, 'cid' | 'certification' | 'endorsements'>;

export type GroupsInput = {
	catalogue: readonly CatalogueEntry[];
	/** `readRoster()`'s members: active, with live credentials only. */
	members: readonly GroupMember[];
	/** Everyone on the teacher roster or who was, with their students and names. */
	teachers: readonly GroupTeacher[];
};

/** Credential groups in catalogue order, then teacher groups. */
export function planGroups(input: GroupsInput): GroupsAnswer {
	const groups = [
		...credentialGroups(input.catalogue, input.members),
		...teacherGroups(input.teachers)
	];
	return { groups: groups.map((group) => ({ ...group, members: cids(group.members) })) };
}

/**
 * The groups as `/admin` shows them: members by name, and each held group with
 * why. Here rather than under `$lib/server/` because a component uses it.
 */
export type GroupsPanel = {
	key: string;
	name: string;
	/** The room's name, for a group that has one. */
	room: string | null;
	/** By name, in the group's order. */
	members: string[];
	held: HoldReason | null;
}[];

/** `planGroups()` as `/admin` reads it, with `nameOf` turning a CID into a name. */
export function groupsPanel(input: GroupsInput, nameOf: (cid: string) => string): GroupsPanel {
	const why = new Map(
		input.teachers.map((teacher) => [`teacher:${teacher.cid}`, teacherHold(teacher)])
	);

	return planGroups(input).groups.map((group) => ({
		key: group.key,
		name: group.name,
		room: group.room?.name ?? null,
		members: group.members.map(nameOf),
		held: group.hold ? (why.get(group.key) ?? null) : null
	}));
}

/** The contract's members: digit strings, each once, in the order first seen. */
function cids(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter((cid) => /^\d+$/.test(cid)))];
}

/**
 * One group per credential in the catalogue, served even with no members.
 * Holding a credential puts someone in every credential it implies too.
 */
function credentialGroups(
	catalogue: readonly CatalogueEntry[],
	members: readonly GroupMember[]
): Group[] {
	const implied = impliedCodes(catalogue);
	const holders = new Map(catalogue.map((entry) => [entry.code, [] as string[]]));

	for (const member of members) {
		const held = [member.certification, ...member.endorsements].filter(
			(code): code is string => code !== null
		);
		for (const code of held) {
			for (const included of implied(code)) holders.get(included)?.push(member.cid);
		}
	}

	return catalogue.map((entry) => ({
		key: `credential:${entry.code}`,
		name: entry.code,
		members: holders.get(entry.code)!
	}));
}

/**
 * A credential and everything it implies, top down: each code in its
 * `requires` that is a plain string (an AND), transitively. An any-one-of
 * group implies nothing, since it does not say which one was held.
 */
function impliedCodes(catalogue: readonly CatalogueEntry[]): (code: string) => Set<string> {
	const byCode = new Map(catalogue.map((entry) => [entry.code, entry]));

	return (code) => {
		const found = new Set<string>();
		const visit = (next: string) => {
			if (found.has(next)) return;
			found.add(next);
			for (const requirement of byCode.get(next)?.requires ?? []) {
				if (typeof requirement === 'string') visit(requirement);
			}
		};
		visit(code);
		return found;
	};
}
