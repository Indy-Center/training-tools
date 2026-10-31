import { and, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { enrollmentsTable } from '$lib/db/schema/enrollments';

/**
 * In its restore window, as a query condition: removed by the app and not yet
 * closed. The same rule as `isInRestoreWindow()` in `$lib/roster-removal.ts`,
 * for the database. See decisions/0037-roster-removal-and-restore.md
 */
export function inRestoreWindow(): SQL {
	return and(
		isNotNull(enrollmentsTable.rosterRemovedAt),
		isNull(enrollmentsTable.restoreClosedAt)
	)!;
}
