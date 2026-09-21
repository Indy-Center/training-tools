import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { CREDENTIAL_CODES, CREDENTIAL_KINDS } from '$lib/certifications';

export type Certification = InferSelectModel<typeof certificationsTable>;
export type InsertCertification = InferInsertModel<typeof certificationsTable>;

/**
 * How a credential came to be held. This is the "on what basis" half of the
 * audit trail DEV-115 asks for.
 */
export const GRANT_BASES = [
	'auto-arrival', // the roster sync worked it out from rating and activity
	'imported', // carried over from community-website, which owned certs before
	'manual' // a staff member set it on the edit view
] as const;
export type GrantBasis = (typeof GRANT_BASES)[number];

/**
 * Certifications and endorsements held by a controller.
 *
 * **Both kinds live here**, separated by `kind`, because nearly everything that
 * reads them wants "what does this controller hold" rather than one kind alone.
 *
 * Like `enrollments`, this keys on `cid` and takes **no foreign key onto
 * `roster_members`** — a VATUSA roster removal must never cascade away someone's
 * certification history, which is precisely the record we exist to keep. See
 * .ai/decisions/0006-training-tools-owns-the-roster.md
 *
 * **Rows are never deleted, and there is no expiry column.** A credential is
 * held while `revokedAt` is null and is history once it is set, so "what did
 * they hold, when, and on whose say-so" is answerable without a separate audit
 * table. community-website models this as a 6-month `expiresAt` bumped by its
 * roster sync; we do not, because losing currency here *revokes* a certification
 * and it must be re-earned. The currency job that writes those revocations is
 * later work — this table is what it will write to.
 *
 * See .ai/decisions/0010-certifications-model.md
 */
export const certificationsTable = sqliteTable(
	'certifications',
	{
		id: text('id').primaryKey(),

		/** VATSIM CID. Not a foreign key — see the note above. */
		cid: text('cid').notNull(),

		code: text('code', { enum: CREDENTIAL_CODES }).notNull(),
		kind: text('kind', { enum: CREDENTIAL_KINDS }).notNull(),

		grantedAt: integer('granted_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		/** CID of the staff member who granted it; null when automatic. */
		grantedBy: text('granted_by'),
		grantBasis: text('grant_basis', { enum: GRANT_BASES }).notNull(),
		/**
		 * Why, in words a training administrator can check — e.g.
		 * "S2 on arrival; last ATC session 2026-08-14". The rating table alone
		 * does not say what the decision was made from.
		 */
		grantNote: text('grant_note'),

		/** Null while held. Set by a staff revocation or the later currency job. */
		revokedAt: integer('revoked_at', { mode: 'timestamp' }),
		revokedBy: text('revoked_by'),
		revokedReason: text('revoked_reason'),

		/**
		 * DEV-115's "flag for TA": set when the grant was inferred rather than
		 * read off the rating table, so a human confirms it.
		 */
		needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),

		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(table) => [
		index('certifications_cid_idx').on(table.cid),
		index('certifications_code_idx').on(table.code),
		/**
		 * At most one live row per controller per credential — revoked rows are
		 * excluded, so the history can hold as many as it likes.
		 *
		 * This is what makes DEV-115's "handle a member who left and came back
		 * without duplicating" true in the database rather than only in whichever
		 * code path happens to run. The arrival job is idempotent by design; this
		 * is the backstop for when it isn't.
		 */
		uniqueIndex('certifications_held_idx')
			.on(table.cid, table.code)
			.where(sql`${table.revokedAt} is null`)
	]
);
