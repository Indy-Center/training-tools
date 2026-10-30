/**
 * An in-memory D1 for tests, over Node's built-in SQLite, with every
 * migration applied. Test-only: nothing in the app imports it.
 *
 * It enforces D1's **100 bound parameters per query**, which is the limit that
 * otherwise only shows up when the cron runs against production.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { drizzle, type Database } from '$lib/server/db';

const MIGRATIONS = join(process.cwd(), 'drizzle', 'migrations');
const D1_MAX_PARAMS = 100;

type Result = { results: Record<string, unknown>[]; success: true; meta: object };

class Statement {
	constructor(
		private readonly sqlite: DatabaseSync,
		readonly sql: string,
		private readonly params: SQLInputValue[] = []
	) {}

	bind(...params: unknown[]): Statement {
		if (params.length > D1_MAX_PARAMS) {
			throw new Error(
				`D1 allows ${D1_MAX_PARAMS} bound parameters; this query has ${params.length}`
			);
		}
		return new Statement(this.sqlite, this.sql, params as SQLInputValue[]);
	}

	execute(): Result {
		const statement = this.sqlite.prepare(this.sql);
		const results = statement.columns().length
			? (statement.all(...this.params) as Record<string, unknown>[])
			: (statement.run(...this.params), []);
		return { results, success: true, meta: {} };
	}

	async all() {
		return this.execute();
	}

	async run() {
		return this.execute();
	}

	async first() {
		return this.execute().results[0] ?? null;
	}

	async raw() {
		return this.execute().results.map((row) => Object.values(row));
	}
}

export function testDb(): Database {
	const sqlite = new DatabaseSync(':memory:');
	for (const file of readdirSync(MIGRATIONS)
		.filter((name) => name.endsWith('.sql'))
		.sort()) {
		sqlite.exec(
			readFileSync(join(MIGRATIONS, file), 'utf8').replaceAll('--> statement-breakpoint', '')
		);
	}

	const d1 = {
		prepare: (sql: string) => new Statement(sqlite, sql),
		// D1 runs a batch as one transaction.
		batch: async (statements: Statement[]) => {
			sqlite.exec('BEGIN');
			try {
				const results = statements.map((statement) => statement.execute());
				sqlite.exec('COMMIT');
				return results;
			} catch (err) {
				sqlite.exec('ROLLBACK');
				throw err;
			}
		}
	};

	return drizzle(d1 as unknown as D1Database);
}
