import type { Config } from 'drizzle-kit';

/**
 * `out` points straight at the directory wrangler reads as `migrations_dir`,
 * so `npm run db:generate` writes SQL that `npm run db:migrate:local` applies.
 * drizzle-kit only generates; wrangler applies. Never use drizzle-kit
 * migrate/push against D1.
 */
export default {
	schema: './src/lib/db/schema',
	out: './drizzle/migrations',
	dialect: 'sqlite',
	verbose: true,
	strict: true
} satisfies Config;
