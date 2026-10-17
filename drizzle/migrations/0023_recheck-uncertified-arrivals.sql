-- Arrivals used to be refused a certification when they had not controlled in
-- six months. That rule only ever applied to endorsements, so put everyone it
-- turned away back in the arrival job's queue.
--
-- Anyone with any certification row, revoked included, is left alone: either
-- they were granted one, or staff took it away and that must stand.
UPDATE `roster_members`
SET `certifications_checked_at` = NULL
WHERE `certifications_checked_at` IS NOT NULL
	AND `cid` NOT IN (
		SELECT `cid` FROM `certifications`
		WHERE `code` IN ('S-GC', 'A-GC', 'A-LC', 'T-RC', 'E-RC')
	);
