/**
 * Lists every CID whose credentials differ between community-website's
 * database (`website-db`) and this app's (`training-db`), so edits made on the
 * site since the September import can be signed off before the site stops
 * keeping its own copy (DEV-116).
 *
 *     npx wrangler login              # once, as someone who can read both databases
 *     node scripts/compare-credentials.ts > comparison.txt
 *
 * Needs Node 22.18 or later (it runs the TypeScript directly) and a Cloudflare
 * login on account `afd63515948c9b2188ce14ef1504b2c1` with read access to D1:
 * `wrangler login`, or `CLOUDFLARE_API_TOKEN` set to a token with D1 read.
 *
 * **Read-only.** It runs four SELECTs through `wrangler d1 execute --remote
 * --command` and refuses any other statement. It reads site user ids and CIDs,
 * never names or emails, and prints only CIDs, site user ids and codes.
 *
 * The site's rows are mapped as data migration 0003 did; see
 * `src/lib/credential-comparison.ts`. The training app's side is what is held
 * now (`revoked_at IS NULL`).
 *
 * `--local --config <wrangler config>` reads local D1 state instead, for trying
 * it out: the config must bind both `website-db` and `training-db`.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREDENTIALS } from '../src/lib/certifications.ts';
import {
	compareCredentials,
	formatComparison,
	type SiteCredentialRow,
	type SiteUser,
	type TrainingCredentialRow
} from '../src/lib/credential-comparison.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const local = args.includes('--local');
const configIndex = args.indexOf('--config');
const config = configIndex >= 0 ? args[configIndex + 1] : join(root, 'wrangler.jsonc');
if (local && configIndex < 0) {
	throw new Error('--local needs --config <wrangler config binding website-db and training-db>');
}

function select<Row>(database: string, sql: string): Row[] {
	if (!/^\s*SELECT\b/i.test(sql) || sql.includes(';')) {
		throw new Error(`Refusing to run anything but a single SELECT: ${sql}`);
	}
	const output = execFileSync(
		join(root, 'node_modules', '.bin', 'wrangler'),
		[
			'd1',
			'execute',
			database,
			local ? '--local' : '--remote',
			'--json',
			'--config',
			config,
			'--command',
			sql
		],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 }
	);
	const [result] = JSON.parse(output) as { results: Row[]; success: boolean }[];
	if (!result?.success) throw new Error(`Query on ${database} did not succeed: ${sql}`);
	return result.results;
}

// Only the users who hold something, and only their id and CID.
const users: SiteUser[] = select<SiteUser>(
	'website-db',
	`SELECT id, cid FROM users
	 WHERE id IN (SELECT user_id FROM user_certifications UNION SELECT user_id FROM user_endorsements)`
).map((user) => ({ id: String(user.id), cid: user.cid == null ? null : String(user.cid) }));
const site: SiteCredentialRow[] = [
	...select<{ userId: string; code: string }>(
		'website-db',
		'SELECT user_id AS userId, certification AS code FROM user_certifications'
	).map((row) => ({ ...row, table: 'user_certifications' as const })),
	...select<{ userId: string; code: string }>(
		'website-db',
		'SELECT user_id AS userId, endorsement AS code FROM user_endorsements'
	).map((row) => ({ ...row, table: 'user_endorsements' as const }))
];
const training = select<TrainingCredentialRow>(
	'training-db',
	'SELECT cid, code, kind FROM certifications WHERE revoked_at IS NULL'
);

process.stdout.write(
	formatComparison(compareCredentials({ users, site, training, catalogue: CREDENTIALS }))
);
