-- Data migration, not schema: seeds the teacher roster (DEV-175).
--
-- The ten people holding ZID:INS or ZID:MTR on the VATUSA roster on
-- 2026-09-30, with the operating initials TRK's `Teacher` dropdown already
-- uses, as confirmed by the training staff. Steve Crow (SC) is new to the
-- dropdown and starts on LOA, at their direction.
--
-- Roles are seeded as they stood that day so the first teacher roster sync
-- finds nothing to log. If VATUSA has changed since, that sync records the
-- difference like any other. No qualifications are seeded: instructors get
-- evaluator automatically on the first sync, and everything else is set by
-- training admins.
--
-- Names are in these comments only; the tables key on CID.
--   1354450 CT Colin Talbot
--   1730044 CY Kalan Cody
--   1613736 JR Jim Reburn
--   1151389 YG Hayden Young
--   1283146 HI Krikor Hajian
--   1523136 SW Stephen Welsh
--   1148860 RS Richard Snell
--   1777974 MB Mike Bradley
--   1413693 MO Micah Messer
--   1530662 SC Steve Crow (LOA)
INSERT INTO teachers (cid,roles,status,initials,availability,student_slots,joined_at,removed_at,updated_at,updated_by) VALUES ('1354450','["MTR"]','active','CT',NULL,NULL,unixepoch(),NULL,unixepoch(),NULL);
--> statement-breakpoint
INSERT INTO activity_log (id,cid,event,detail,actor,at) VALUES ('03ab502f-e59d-4d96-8df6-47697d1539e4','1354450','teacher.joined','{"note":"On the teacher roster when it was established (DEV-175)"}',NULL,unixepoch());
--> statement-breakpoint
INSERT INTO teachers (cid,roles,status,initials,availability,student_slots,joined_at,removed_at,updated_at,updated_by) VALUES ('1730044','["MTR"]','active','CY',NULL,NULL,unixepoch(),NULL,unixepoch(),NULL);
--> statement-breakpoint
INSERT INTO activity_log (id,cid,event,detail,actor,at) VALUES ('ffc5e091-0dc2-46ef-9411-02cbdf309abb','1730044','teacher.joined','{"note":"On the teacher roster when it was established (DEV-175)"}',NULL,unixepoch());
--> statement-breakpoint
INSERT INTO teachers (cid,roles,status,initials,availability,student_slots,joined_at,removed_at,updated_at,updated_by) VALUES ('1613736','["MTR"]','active','JR',NULL,NULL,unixepoch(),NULL,unixepoch(),NULL);
--> statement-breakpoint
INSERT INTO activity_log (id,cid,event,detail,actor,at) VALUES ('439ec1d5-5db7-445f-b7eb-c66083546416','1613736','teacher.joined','{"note":"On the teacher roster when it was established (DEV-175)"}',NULL,unixepoch());
--> statement-breakpoint
INSERT INTO teachers (cid,roles,status,initials,availability,student_slots,joined_at,removed_at,updated_at,updated_by) VALUES ('1151389','["INS"]','active','YG',NULL,NULL,unixepoch(),NULL,unixepoch(),NULL);
--> statement-breakpoint
INSERT INTO activity_log (id,cid,event,detail,actor,at) VALUES ('a58d72af-d777-4f84-9a77-abcf379dbc23','1151389','teacher.joined','{"note":"On the teacher roster when it was established (DEV-175)"}',NULL,unixepoch());
--> statement-breakpoint
INSERT INTO teachers (cid,roles,status,initials,availability,student_slots,joined_at,removed_at,updated_at,updated_by) VALUES ('1283146','["INS"]','active','HI',NULL,NULL,unixepoch(),NULL,unixepoch(),NULL);
--> statement-breakpoint
INSERT INTO activity_log (id,cid,event,detail,actor,at) VALUES ('09939021-c2f9-469a-8b94-c0fbd7847356','1283146','teacher.joined','{"note":"On the teacher roster when it was established (DEV-175)"}',NULL,unixepoch());
--> statement-breakpoint
INSERT INTO teachers (cid,roles,status,initials,availability,student_slots,joined_at,removed_at,updated_at,updated_by) VALUES ('1523136','["INS"]','active','SW',NULL,NULL,unixepoch(),NULL,unixepoch(),NULL);
--> statement-breakpoint
INSERT INTO activity_log (id,cid,event,detail,actor,at) VALUES ('2a90ae35-b035-4152-8fbf-082b7b6bcbc3','1523136','teacher.joined','{"note":"On the teacher roster when it was established (DEV-175)"}',NULL,unixepoch());
--> statement-breakpoint
INSERT INTO teachers (cid,roles,status,initials,availability,student_slots,joined_at,removed_at,updated_at,updated_by) VALUES ('1148860','["MTR"]','active','RS',NULL,NULL,unixepoch(),NULL,unixepoch(),NULL);
--> statement-breakpoint
INSERT INTO activity_log (id,cid,event,detail,actor,at) VALUES ('a2fdc238-35e7-4e78-b849-0187b2c48b59','1148860','teacher.joined','{"note":"On the teacher roster when it was established (DEV-175)"}',NULL,unixepoch());
--> statement-breakpoint
INSERT INTO teachers (cid,roles,status,initials,availability,student_slots,joined_at,removed_at,updated_at,updated_by) VALUES ('1777974','["MTR"]','active','MB',NULL,NULL,unixepoch(),NULL,unixepoch(),NULL);
--> statement-breakpoint
INSERT INTO activity_log (id,cid,event,detail,actor,at) VALUES ('120cd7b1-08f3-4919-8deb-f2c802bc1ec3','1777974','teacher.joined','{"note":"On the teacher roster when it was established (DEV-175)"}',NULL,unixepoch());
--> statement-breakpoint
INSERT INTO teachers (cid,roles,status,initials,availability,student_slots,joined_at,removed_at,updated_at,updated_by) VALUES ('1413693','["MTR"]','active','MO',NULL,NULL,unixepoch(),NULL,unixepoch(),NULL);
--> statement-breakpoint
INSERT INTO activity_log (id,cid,event,detail,actor,at) VALUES ('fa19aeab-0156-4c0d-bb35-ba2ca2d3a97e','1413693','teacher.joined','{"note":"On the teacher roster when it was established (DEV-175)"}',NULL,unixepoch());
--> statement-breakpoint
INSERT INTO teachers (cid,roles,status,initials,availability,student_slots,joined_at,removed_at,updated_at,updated_by) VALUES ('1530662','["MTR"]','loa','SC',NULL,NULL,unixepoch(),NULL,unixepoch(),NULL);
--> statement-breakpoint
INSERT INTO activity_log (id,cid,event,detail,actor,at) VALUES ('e93a5d36-4579-42d2-b3f1-f386ccd59567','1530662','teacher.joined','{"note":"On the teacher roster when it was established (DEV-175)"}',NULL,unixepoch());
--> statement-breakpoint
INSERT INTO activity_log (id,cid,event,detail,actor,at) VALUES ('41fd2d2c-e5d7-413f-b744-0c700fb5d17a','1530662','teacher.status','{"from":"active","to":"loa","note":"Set when the teacher roster was established (DEV-175)"}',NULL,unixepoch());
