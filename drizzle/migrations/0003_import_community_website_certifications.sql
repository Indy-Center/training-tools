-- Data migration, not schema: seeds `certifications` from community-website,
-- which owned certifications and endorsements before this app did (DEV-116).
--
-- Read from website-db on 2026-09-21: 179 rows across 122 CIDs.
-- 1 lower-ranked certification(s) dropped to honour the top-down model;
-- every endorsement carried across as-is. `granted_at` preserves the original
-- date, so this reads as history rather than as if everyone qualified today.
--
-- Leavers are included deliberately: certifications key on CID with no foreign
-- key onto roster_members, so someone off the roster keeps their record and a
-- returning controller is recognised instead of re-inferred.
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('09599d8c-a033-4349-8b77-b659c96469b1','810210','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('cd6fb2e2-ed9c-4ae0-a4ed-0f15c2f95cee','813323','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('30b01fae-7e60-4890-a89d-f3714c20bf5b','815898','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('4c70a8bb-a234-4255-9241-16ec6658f26e','820279','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('b74f9de0-994f-45c1-8f46-8ca163f7b3fa','955080','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('2ed20d4b-c353-4ea0-9580-71accf92041c','973741','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('13e8950c-f80c-4289-aba0-d4f76bc8d197','976130','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('4e324a05-1ac8-4c9a-911b-7652d9c40dc9','1012739','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('c7473705-c4da-40cf-8b26-ba84ce9feacd','1026637','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('c551d33c-88a1-47e3-9527-95c31e0561b4','1148860','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('447b43d1-33bc-44f9-a62b-d9a20144fbcf','1151389','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('1c57cd8b-302c-4215-91f3-a036e47ef2d8','1182002','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('5b6bf877-8ef8-4f85-b011-afd6d5001060','1222857','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('78e26b3b-81c8-4248-b324-509c0c90ec34','1243205','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('391d5ca1-9ce0-48d7-b036-9f78f146dbc6','1252585','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('3dd1bbfc-959a-48b7-a7bd-faeecb1e857e','1283146','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('6f7c4ce3-ad3b-4060-b74b-68770a65cd15','1326742','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('affd816a-8e82-47e2-b125-0e8be972425a','1338180','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('67718760-0c69-4f28-a98d-7c49bb2826be','1354977','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('bbe551d5-d437-4ebf-83f2-778a0520d0e8','1394476','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('88c12116-f5d1-40c8-9f08-e93e9eb189bd','1398242','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('dbb78f69-42ff-4fad-a233-45bc04dff9e3','1426527','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('385a0386-b25e-4569-8359-df97d73d6fa3','1432868','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('d59ead25-56fd-465a-a9ac-c74d6899aa73','1475401','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('014dd22c-bac1-4c82-b8c3-e431d717c97b','1475805','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('693c87b6-fa81-41cb-9c77-088a2c411fb5','1492532','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('2b5fafe8-2360-4961-bd96-8a68de029fce','1499593','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('3130e500-781f-46b1-a96c-2953a5cf0437','1523136','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('39441ebb-ed19-4c12-9ef7-226be168f291','1528479','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('3b7d0eab-68dd-4045-acf3-00582a3e8da8','1616023','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('2d570b78-08c0-4e4d-8ee7-cbf197d6d385','1634151','T2-CTR','endorsement',1757735666,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735666,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('1d5a1f61-1e88-46b2-a1bc-4ae7d45069ef','1616661','S-LC','endorsement',1757737898,NULL,'imported','Imported from community-website on 2026-09-21',false,1757737898,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('2e1775e6-a75c-4cc6-927d-60b4db362a36','1636436','S-LC','endorsement',1757737898,NULL,'imported','Imported from community-website on 2026-09-21',false,1757737898,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('e7e71caa-4e4a-4e96-88e1-0114b40ef87c','1831557','S-LC','endorsement',1757737898,NULL,'imported','Imported from community-website on 2026-09-21',false,1757737898,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('0f04038f-0644-420d-a98e-76e77502f3e6','1677974','T2-CTR','endorsement',1758172202,NULL,'imported','Imported from community-website on 2026-09-21',false,1758172202,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('0ed13a26-95da-40cd-915d-e59b53b3f4c6','1332592','T2-CTR','endorsement',1758280818,NULL,'imported','Imported from community-website on 2026-09-21',false,1758280818,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('a580c49f-4c49-4f3c-92ef-6a8c96eed554','1757138','S-LC','endorsement',1758409069,NULL,'imported','Imported from community-website on 2026-09-21',false,1758409069,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('6b158cf9-57ef-4b98-91e3-5f6e4147d6cf','1327540','T2-CTR','endorsement',1758580865,NULL,'imported','Imported from community-website on 2026-09-21',false,1758580865,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('2b6c3c9c-cd41-450f-8808-a926803c8a0c','1572680','T2-CTR','endorsement',1758580884,NULL,'imported','Imported from community-website on 2026-09-21',false,1758580884,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('b421a607-59a0-4f0c-98ee-67c1f56b01e4','1599405','T2-CTR','endorsement',1759764986,NULL,'imported','Imported from community-website on 2026-09-21',false,1759764986,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('c2b4b94a-71d5-47b7-85c4-69bcbe51ce4b','1690871','T2-CTR','endorsement',1764537786,NULL,'imported','Imported from community-website on 2026-09-21',false,1764537786,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('31e2227d-de8c-45d1-a199-d4069e7351b2','1648899','T2-CTR','endorsement',1764796530,NULL,'imported','Imported from community-website on 2026-09-21',false,1764796530,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('a7ee71ff-fcea-4d0f-8363-53ada04aec24','1430265','T2-CTR','endorsement',1765754873,NULL,'imported','Imported from community-website on 2026-09-21',false,1765754873,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('5be37b35-7920-4e2c-999d-cd51611765df','1401766','T2-CTR','endorsement',1767492410,NULL,'imported','Imported from community-website on 2026-09-21',false,1767492410,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('14b660e2-d9d8-4968-bf2e-b1d30ec1d36b','1827043','S-LC','endorsement',1767839820,NULL,'imported','Imported from community-website on 2026-09-21',false,1767839820,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('70e66566-3da1-4439-af3d-d8db57f9f5fd','1819738','S-LC','endorsement',1768437627,NULL,'imported','Imported from community-website on 2026-09-21',false,1768437627,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('7eb95791-7e35-43b8-aa48-6bf55ec6fa7a','1521778','S-LC','endorsement',1776539634,NULL,'imported','Imported from community-website on 2026-09-21',false,1776539634,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('999ce5a5-8364-410f-948e-6c6f10cdc24f','1179253','T2-CTR','endorsement',1777476505,NULL,'imported','Imported from community-website on 2026-09-21',false,1777476505,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('5d5fceb1-9fa1-4cd6-a419-1ef6f96be5f3','1279609','T2-CTR','endorsement',1777476528,NULL,'imported','Imported from community-website on 2026-09-21',false,1777476528,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('e58407d1-7e14-4bd6-9689-671437600bbd','1701032','S-LC','endorsement',1777958125,NULL,'imported','Imported from community-website on 2026-09-21',false,1777958125,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('027e2066-1420-47aa-8f0d-811b23729407','875722','T2-CTR','endorsement',1778171935,NULL,'imported','Imported from community-website on 2026-09-21',false,1778171935,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('cc5e27cb-aeff-4a83-badc-61185fa16a41','1884997','S-LC','endorsement',1779567029,NULL,'imported','Imported from community-website on 2026-09-21',false,1779567029,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('0a5ca39b-a4c9-4398-896c-b69ca0a5482c','1492470','S-LC','endorsement',1783117291,NULL,'imported','Imported from community-website on 2026-09-21',false,1783117291,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('072abed8-a61f-4fb5-a44e-83ca3e04a75a','1435969','T2-CTR','endorsement',1785711359,NULL,'imported','Imported from community-website on 2026-09-21',false,1785711359,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('9bbc351d-344a-4229-89af-75bfdfc4099b','1370694','T2-CTR','endorsement',1787442716,NULL,'imported','Imported from community-website on 2026-09-21',false,1787442716,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('f90e8ea8-fabe-400f-98b2-60317936dac6','1603607','S-LC','endorsement',1789603330,NULL,'imported','Imported from community-website on 2026-09-21',false,1789603330,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('1a743d97-cb4c-4d15-b35f-51416f7da5d3','810210','E-RC','certification',1757735916,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735916,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('3bfe56ad-e600-4dc8-b46e-8b9648a2ac62','813323','E-RC','certification',1757735916,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735916,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('82b4c922-c1ea-48cb-b6fe-061b42de1e70','815898','E-RC','certification',1757735916,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735916,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('94100b91-e7e0-4dbb-96a8-745fe6a9387e','820279','E-RC','certification',1757735916,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735916,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('5970b84a-d2e4-4c3e-ae0f-4114cdc123cb','835466','T-RC','certification',1784851032,NULL,'imported','Imported from community-website on 2026-09-21',false,1784851032,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('2e9b7fd3-9a15-40ff-8bf9-2848ce0c2ef2','875722','E-RC','certification',1778171934,NULL,'imported','Imported from community-website on 2026-09-21',false,1778171934,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('aef88a72-4cbf-470b-aeb0-980d3ca9cd3d','955080','E-RC','certification',1757735916,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735916,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('e9e887b8-a2b7-4616-b128-910e3df40b6d','973741','E-RC','certification',1757735916,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735916,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('6e8c56ff-af10-40e8-8715-1871789fcf5a','976130','E-RC','certification',1757735917,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735917,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('d4f2f3a1-df93-47a6-965a-404d5713fb0c','1012739','E-RC','certification',1757735917,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735917,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('0369fbdc-1079-4884-a195-3972eab1ec96','1026637','E-RC','certification',1757735917,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735917,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('10c480af-78a5-4844-8a71-e65bb748f769','1034598','T-RC','certification',1774895719,NULL,'imported','Imported from community-website on 2026-09-21',false,1774895719,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('e906a47e-887e-48c5-942e-6d6094e5c300','1049778','T-RC','certification',1757735917,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735917,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('de6c750c-628e-4b27-9e29-e3314fb247c5','1127972','A-GC','certification',1780174566,NULL,'imported','Imported from community-website on 2026-09-21',false,1780174566,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('aa8bb609-8fda-4430-b97e-adbebca5b703','1148860','E-RC','certification',1757735917,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735917,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('9d1b6ef1-aa73-4d41-ae2e-6f6bc0808f66','1151389','E-RC','certification',1757735917,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735917,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('365255fc-8f31-4fd0-bfe0-f326f273bf76','1157040','T-RC','certification',1757735917,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735917,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('501f6a50-3b88-4f8e-b6c6-355049d08c03','1160927','T-RC','certification',1757735917,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735917,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('c8927d69-ebc0-417a-8c5e-d974f9d3fdac','1170418','A-GC','certification',1757735918,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735918,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('e7eeb8fb-67e0-4691-8d1e-4f728db04b49','1179253','E-RC','certification',1777476505,NULL,'imported','Imported from community-website on 2026-09-21',false,1777476505,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('210972a9-8e2b-4c9b-8597-3bddd0c73cf0','1182002','E-RC','certification',1757735918,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735918,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('0a2ba10e-8a9b-4ac1-b687-f6197ce47923','1222857','E-RC','certification',1757735918,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735918,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('fa23a1d6-707c-47fd-b6c8-bd8564c6c30a','1228450','A-LC','certification',1779932744,NULL,'imported','Imported from community-website on 2026-09-21',false,1779932744,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('ee719b3e-bd53-458a-9663-5d43a8a8f6de','1243205','E-RC','certification',1757735918,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735918,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('6f6ffc67-0d9d-4c29-87e5-adef847ba58d','1252585','E-RC','certification',1757868378,NULL,'imported','Imported from community-website on 2026-09-21',false,1757868378,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('5f9d2e4b-258d-427e-9b0c-79569e0045b1','1263134','S-GC','certification',1767631538,NULL,'imported','Imported from community-website on 2026-09-21',false,1767631538,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('ad5b7441-b943-4d1b-9541-5feb830da8fd','1269430','T-RC','certification',1757735918,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735918,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('a3f7b33a-3481-472f-9e55-9ce582a341f5','1279609','E-RC','certification',1777476528,NULL,'imported','Imported from community-website on 2026-09-21',false,1777476528,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('41d4c5dc-5051-4b9e-b174-167aa5757220','1283146','E-RC','certification',1757735918,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735918,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('6ac1d626-36ff-4e9a-8cc0-6878e82623d0','1296617','A-GC','certification',1787093870,NULL,'imported','Imported from community-website on 2026-09-21',false,1787093870,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('eb7fa952-449e-4710-b442-35a77d7d5c44','1300964','T-RC','certification',1757735918,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735918,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('5301ec5a-4679-4527-9e5c-e754e786a0a5','1315134','T-RC','certification',1757735919,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735919,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('e74d0b02-d2c0-4bad-bec4-3758616645a5','1316014','T-RC','certification',1776433862,NULL,'imported','Imported from community-website on 2026-09-21',false,1776433862,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('c900d6c3-bb59-4774-8798-fb4b4e2a5466','1326742','E-RC','certification',1757735919,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735919,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('284912e0-1e00-4ec4-bf7e-79fd8cb6fed6','1327540','E-RC','certification',1758580866,NULL,'imported','Imported from community-website on 2026-09-21',false,1758580866,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('650df327-1afd-47b6-8703-bb79dd54c42a','1332592','E-RC','certification',1758280818,NULL,'imported','Imported from community-website on 2026-09-21',false,1758280818,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('c231d9d7-6f65-4fef-a5e8-d4d1418383c3','1338180','E-RC','certification',1757735919,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735919,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('678d9744-bf1f-444d-acd5-990bd6b58c7a','1339868','T-RC','certification',1785980320,NULL,'imported','Imported from community-website on 2026-09-21',false,1785980320,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('f5108273-b28d-4286-a289-bd33858d0fff','1354450','T-RC','certification',1757735919,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735919,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('bad7e4e0-31b2-4db5-8639-eb8463c7cd20','1354977','E-RC','certification',1757868413,NULL,'imported','Imported from community-website on 2026-09-21',false,1757868413,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('27c4f33f-bcd0-4d58-bc17-860fd6c2be37','1356984','A-GC','certification',1757735919,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735919,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('47a8719e-a381-4e71-a824-e5b3969c38b5','1370694','T-RC','certification',1787347519,NULL,'imported','Imported from community-website on 2026-09-21',false,1787347519,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('bf0d1b1f-aae2-43e7-8f8a-c5a4964b83e1','1377373','T-RC','certification',1757735920,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735920,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('9ec1f6b8-06ca-4f2a-bc5e-20678ea76d37','1387114','T-RC','certification',1786884634,NULL,'imported','Imported from community-website on 2026-09-21',false,1786884634,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('2569cd76-4ead-46c2-820b-3589f9e37b2d','1394476','E-RC','certification',1757735920,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735920,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('0eb9b27b-15b3-47ea-935e-65d8fd1e16bf','1398242','E-RC','certification',1757735920,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735920,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('12cc6148-a2e1-44ef-9245-65a92fc05a3b','1401766','T-RC','certification',1766702731,NULL,'imported','Imported from community-website on 2026-09-21',false,1766702731,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('14e9f9eb-4f63-4b96-93bf-a090074038ff','1413693','T-RC','certification',1757735920,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735920,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('acbe14f3-5606-4198-a971-5833e44ab891','1413825','T-RC','certification',1757735920,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735920,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('d42eb182-7e2f-45e1-82ee-a9eb743db079','1425707','A-GC','certification',1786928781,NULL,'imported','Imported from community-website on 2026-09-21',false,1786928781,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('efb41367-c308-42bd-89ee-d7d8630fa739','1426527','E-RC','certification',1757735920,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735920,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('0fdc1616-e888-4ccd-8b8f-aa0982d967da','1430265','E-RC','certification',1765754873,NULL,'imported','Imported from community-website on 2026-09-21',false,1765754873,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('6141f444-d0a1-478e-8e35-f0b59883ef37','1432868','E-RC','certification',1757735921,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735921,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('5288a513-2afa-4ddd-97d2-55985d4caeb6','1435969','E-RC','certification',1785711360,NULL,'imported','Imported from community-website on 2026-09-21',false,1785711360,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('4dd31c73-993c-484e-82cd-508aea8eb790','1456690','T-RC','certification',1757735921,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735921,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('c7b32ed2-c40e-4224-9f27-d581a1a517ce','1465916','A-GC','certification',1782760529,NULL,'imported','Imported from community-website on 2026-09-21',false,1782760529,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('ac25d386-b9ad-4365-854b-95ca0889c7b2','1466079','A-LC','certification',1771969618,NULL,'imported','Imported from community-website on 2026-09-21',false,1771969618,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('66a426c8-6a46-4779-bd89-d3eebdaa68fd','1467635','S-GC','certification',1773778506,NULL,'imported','Imported from community-website on 2026-09-21',false,1773778506,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('0adcf51c-db17-43cb-9105-321c36692dd2','1475401','E-RC','certification',1757735921,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735921,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('e0ffb952-9063-4d7d-bf1c-e40b80ff6537','1475805','E-RC','certification',1757735921,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735921,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('07a48d48-fbff-4289-b53c-a39696cd0c19','1476492','A-LC','certification',1775168427,NULL,'imported','Imported from community-website on 2026-09-21',false,1775168427,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('46b81cd9-1646-4c51-a96b-22ff35144990','1486516','A-LC','certification',1757735921,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735921,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('23feb081-9819-4630-9eae-ff6023de0ffa','1489354','T-RC','certification',1778383824,NULL,'imported','Imported from community-website on 2026-09-21',false,1778383824,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('e517f6d4-6253-4d93-8adb-2f95bae5de05','1492470','A-GC','certification',1777937344,NULL,'imported','Imported from community-website on 2026-09-21',false,1777937344,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('94fd446b-19b9-431d-bd6b-fefcdf56d666','1492532','E-RC','certification',1757735921,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735921,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('17c760fa-aeef-4d55-b3a6-8c70d2da6426','1494647','T-RC','certification',1781137524,NULL,'imported','Imported from community-website on 2026-09-21',false,1781137524,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('673fd0fa-f8f6-483b-9420-857965348636','1498044','T-RC','certification',1757735922,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735922,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('15f69890-8d45-4cd0-afb1-8ffba537857c','1499593','E-RC','certification',1757735922,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735922,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('3b3c1eaf-af0e-4fe3-8451-c282e3de6c37','1521778','A-GC','certification',1757735922,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735922,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('32e861cb-87c0-4eda-a99c-099b089f9a75','1523136','E-RC','certification',1757735922,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735922,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('7e18ad34-fa55-494e-bbd9-c2610843e0d8','1524518','A-LC','certification',1776539685,NULL,'imported','Imported from community-website on 2026-09-21',false,1776539685,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('fafccbfa-494d-44c2-b344-337627ee82df','1528479','E-RC','certification',1757735922,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735922,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('82409fd8-da85-490d-b314-8fcc08058317','1530662','A-LC','certification',1757968221,NULL,'imported','Imported from community-website on 2026-09-21',false,1757968221,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('0c9ee28c-2c93-4489-abb9-b64fa7eec205','1532473','T-RC','certification',1757735922,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735922,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('6195f45f-8e66-4916-939f-aed98b975f0a','1539012','S-GC','certification',1780522533,NULL,'imported','Imported from community-website on 2026-09-21',false,1780522533,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('db6b6ca3-083c-4531-a699-325ee6353dbd','1551156','A-LC','certification',1757735922,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735922,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('fe987b08-c49c-4cba-adda-9b93065329b8','1572680','E-RC','certification',1758580884,NULL,'imported','Imported from community-website on 2026-09-21',false,1758580884,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('a261d243-0dc8-404b-8255-164256fdccf2','1577588','T-RC','certification',1780545555,NULL,'imported','Imported from community-website on 2026-09-21',false,1780545555,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('b4ade95c-a12e-4371-9aed-624592000399','1588920','A-GC','certification',1757735923,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735923,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('119d1fc5-7569-4a4d-930b-f8af66c5e5f2','1599405','T-RC','certification',1759613683,NULL,'imported','Imported from community-website on 2026-09-21',false,1759613683,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('e0754300-058a-4847-99a2-f23545240aa4','1603607','A-GC','certification',1789603329,NULL,'imported','Imported from community-website on 2026-09-21',false,1789603329,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('b5f2925f-e2b1-45f5-b0dc-a141d467d2a4','1611653','A-GC','certification',1757735923,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735923,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('1035b59f-29b6-4d03-9a1a-faedac8199f8','1613736','T-RC','certification',1757735923,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735923,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('6c9c82a6-11ac-4a9c-b047-4eb4fdf4db64','1616023','E-RC','certification',1757735923,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735923,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('5d359763-53f0-4d2d-8821-5497612901d7','1616028','A-GC','certification',1757735923,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735923,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('faf28ce5-daae-4e21-9c46-e2ef37ecab0a','1616661','A-GC','certification',1757868558,NULL,'imported','Imported from community-website on 2026-09-21',false,1757868558,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('19e23318-2709-4272-8467-4fe59461e5d9','1616822','T-RC','certification',1757735923,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735923,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('e1dd8683-8ea1-481a-b16c-9764db2e0201','1617100','A-GC','certification',1787625239,NULL,'imported','Imported from community-website on 2026-09-21',false,1787625239,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('13adfe8a-e652-4d2b-aa1d-d9c987a612c5','1623682','T-RC','certification',1789784756,NULL,'imported','Imported from community-website on 2026-09-21',false,1789784756,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('97be223b-cc09-41e3-8a48-c65866e74166','1623778','T-RC','certification',1757735924,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735924,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('eb2b0c99-36d5-45d6-8105-fc8426b257c6','1629690','S-GC','certification',1757737891,NULL,'imported','Imported from community-website on 2026-09-21',false,1757737891,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('cb301073-b774-4c4f-9d22-5963e5054f94','1634151','E-RC','certification',1757735924,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735924,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('84ca640d-da91-433c-ba85-cb2afc7344cf','1636436','A-GC','certification',1757735924,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735924,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('76f78790-3cbe-46d7-bab1-a23acc961125','1638662','S-GC','certification',1757737891,NULL,'imported','Imported from community-website on 2026-09-21',false,1757737891,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('6a99386e-134d-48cc-8248-b9d560568198','1646342','T-RC','certification',1789782656,NULL,'imported','Imported from community-website on 2026-09-21',false,1789782656,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('5ba7899d-6022-4e52-ba82-ade6af92a71e','1648899','E-RC','certification',1764796530,NULL,'imported','Imported from community-website on 2026-09-21',false,1764796530,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('0c4c691a-1a17-4688-bf6d-43aa8c664567','1652285','T-RC','certification',1778360121,NULL,'imported','Imported from community-website on 2026-09-21',false,1778360121,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('160af8f7-c4a3-43bb-b083-8cb01849a99a','1653042','A-LC','certification',1757735924,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735924,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('2a7ad1b5-0bbd-4490-b668-71843e93f105','1662131','A-LC','certification',1757735924,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735924,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('1df91020-13d7-45bb-a08b-208d1d3fd43a','1677974','E-RC','certification',1758172202,NULL,'imported','Imported from community-website on 2026-09-21',false,1758172202,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('1bafbfae-6b6e-4f2b-8460-19a501024e0e','1690871','E-RC','certification',1764537786,NULL,'imported','Imported from community-website on 2026-09-21',false,1764537786,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('c81d84bc-d53c-4546-bbd5-9d7ed8a670cf','1697291','T-RC','certification',1757735924,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735924,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('a12e2bbf-8285-4d16-b131-074c1b4d09bd','1700707','T-RC','certification',1785038147,NULL,'imported','Imported from community-website on 2026-09-21',false,1785038147,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('b4e06cc6-f09d-4fef-a66c-d30fc97e5e95','1701032','A-GC','certification',1757735925,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735925,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('cd4a1c80-3757-4642-8b2c-3a0b9a13aca5','1720262','T-RC','certification',1757735925,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735925,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('5f6614ce-478f-47f4-90af-94738dd51ff8','1721443','A-GC','certification',1757735925,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735925,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('96e60604-67cc-41bb-bec5-26546aaadee0','1730044','A-LC','certification',1760574089,NULL,'imported','Imported from community-website on 2026-09-21',false,1760574089,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('5af1ba58-6395-41c5-ab7c-14687e674da8','1731057','A-GC','certification',1757735925,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735925,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('e6154964-b7b6-49ed-a70f-630ec0de64ec','1745573','A-GC','certification',1757735925,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735925,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('dd67df7a-80d6-4937-8d4a-b6849dd64f77','1757138','A-GC','certification',1757735756,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735756,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('f3675ffe-4c8e-4720-847d-6a7387e436df','1769034','T-RC','certification',1774901418,NULL,'imported','Imported from community-website on 2026-09-21',false,1774901418,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('05d377a9-4afb-44a0-9868-14c1c00f3dba','1777974','T-RC','certification',1763856032,NULL,'imported','Imported from community-website on 2026-09-21',false,1763856032,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('26d87523-b5a8-4b4a-977e-53e669549923','1785058','T-RC','certification',1785609660,NULL,'imported','Imported from community-website on 2026-09-21',false,1785609660,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('dee98905-319c-49fa-8d6e-31c779356362','1799628','S-GC','certification',1757737891,NULL,'imported','Imported from community-website on 2026-09-21',false,1757737891,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('b3b3336f-86d1-42bf-875b-c12863689d56','1814243','A-LC','certification',1787592293,NULL,'imported','Imported from community-website on 2026-09-21',false,1787592293,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('3cd62eb8-0acd-4454-962b-f3a3c6d39ec2','1819738','A-GC','certification',1757735926,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735926,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('19dbc508-b3ba-498e-9bcd-cdfde7499122','1827043','A-GC','certification',1757735926,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735926,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('dc15c2d3-9895-4de9-9a2f-5e7b47a78afd','1831557','A-GC','certification',1757735926,NULL,'imported','Imported from community-website on 2026-09-21',false,1757735926,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('a37c5d33-3a24-424a-b7e0-f27d80ccc57d','1845128','S-GC','certification',1757737891,NULL,'imported','Imported from community-website on 2026-09-21',false,1757737891,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('54e683fb-8db9-49bf-9e93-b2f12aa0fa88','1884997','A-GC','certification',1777840090,NULL,'imported','Imported from community-website on 2026-09-21',false,1777840090,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('8edd65fd-d907-4582-9e23-c797228e81c5','1948998','A-LC','certification',1787601001,NULL,'imported','Imported from community-website on 2026-09-21',false,1787601001,unixepoch());
--> statement-breakpoint
INSERT INTO certifications (id,cid,code,kind,granted_at,granted_by,grant_basis,grant_note,needs_review,created_at,updated_at) VALUES ('d2448786-f980-48c7-98bf-2c2bec191e34','2003320','A-GC','certification',1788715647,NULL,'imported','Imported from community-website on 2026-09-21',false,1788715647,unixepoch());
