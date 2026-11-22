import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * larry makes and manages every Discord role and channel from the groups this
 * app serves (decisions/0044, 0045). This app must not do any of it itself.
 */
const RETIRED = [
	'LarryGuild',
	'syncRoles',
	'syncChannels',
	'deleteRoles',
	'deleteChannels',
	'setMemberRole'
];

function sources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sources(path);
		return /\.(ts|svelte)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
	});
}

describe('Discord roles and channels', () => {
	it('are never made or changed from this app', () => {
		const found = sources(join(process.cwd(), 'src')).flatMap((path) => {
			const text = readFileSync(path, 'utf8');
			return RETIRED.filter((name) => new RegExp(`\\b${name}\\b`).test(text)).map(
				(name) => `${path}: ${name}`
			);
		});

		expect(found).toEqual([]);
	});
});
