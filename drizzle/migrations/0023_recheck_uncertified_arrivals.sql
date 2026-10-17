-- Arrivals used to be refused a certification when they had not controlled in
-- six months. That rule only ever applied to endorsements, so put everyone it
-- turned away back in the arrival job's queue.
--
-- Anyone with a certification row, revoked included, is left alone: either
-- they were granted one, or staff took it away and that must stand. An
-- endorsement does not count, so someone holding only S-LC or T2-CTR is
-- re-checked; the old rule could have turned them away too.
--
-- Departed members are cleared as well. That is harmless: the job skips anyone
-- with `removed_at` set, and the roster sync clears the stamp on a restore.
UPDATE `roster_members`
SET `certifications_checked_at` = NULL
WHERE `certifications_checked_at` IS NOT NULL
	AND `cid` NOT IN (
		SELECT `cid` FROM `certifications` WHERE `kind` = 'certification'
	);
