-- Disposable pre-migration fixtures for the V3 Contacts backfill acceptance.
-- Run only after the six frozen suites and before the Contacts migration.
begin;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','e8810000-0000-4000-8000-000000000001','authenticated','authenticated',
  'v3-contacts-backfill-owner@example.test','x',now(),'{}',
  '{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());

insert into public.forms(id,name,slug,category,schema,version,is_active,is_system_template)
values ('e8840000-0000-4000-8000-000000000001','Contacts backfill fixture','contacts-backfill-fixture','contract','{"questions":[]}',1,true,true);

create table public.contacts_backfill_expected (
  wedding_id uuid primary key,
  instance_id uuid not null unique,
  answer_json jsonb not null,
  initial_address text,
  initial_postal text,
  initial_city text,
  effective_owner_address text not null
);

insert into public.contacts_backfill_expected values
 ('e8820000-0000-4000-8000-000000000001','e8830000-0000-4000-8000-000000000001',
  '{"values":{"q-p1-address":"ul. Testowa 1","q-p1-postal":"00-123","q-p1-city":"Warszawa"}}',null,null,null,'ul. Testowa 1, 00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000002','e8830000-0000-4000-8000-000000000002',
  '{"answers":[{"questionId":"q-p1-address","value":"ul. Testowa 1"},{"questionId":"q-p1-postal","value":"00-123"},{"questionId":"q-p1-city","value":"Warszawa"}]}',null,null,null,'ul. Testowa 1, 00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000003','e8830000-0000-4000-8000-000000000003',
  '{"values":{"q-p1-address":"ul. Testowa 1","q-p1-postal-code":"00-123","q-p1-city":"Warszawa"}}',null,null,null,'ul. Testowa 1, 00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000004','e8830000-0000-4000-8000-000000000004',
  '{"answers":[{"questionId":"q-p1-address","value":"ul. Testowa 1"},{"questionId":"q-p1-postal-code","value":"00-123"},{"questionId":"q-p1-city","value":"Warszawa"}]}',null,null,null,'ul. Testowa 1, 00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000005','e8830000-0000-4000-8000-000000000005',
  '{"fields":{"partner1.address":"ul. Testowa 1","partner1.postalCode":"00-123","partner1.city":"Warszawa"}}',null,null,null,'ul. Testowa 1, 00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000006','e8830000-0000-4000-8000-000000000006',
  '{"values":{"q-p1-address":"ul. Testowa 1","q-p1-postal":"","q-p1-city":"Warszawa"}}','ul. Wierszowa 2','11-111','Łódź','ul. Testowa 1, 11-111 Warszawa'),
 ('e8820000-0000-4000-8000-000000000007','e8830000-0000-4000-8000-000000000007',
  '{"values":{"q-p1-address":"ul. Testowa 1","q-p1-postal":"00-123","q-p1-city":""}}',null,null,null,'ul. Testowa 1, 00-123'),
 ('e8820000-0000-4000-8000-000000000008','e8830000-0000-4000-8000-000000000008',
  '{"values":{"q-p1-address":"ul. Testowa 1","q-p1-city":"Warszawa"}}',null,null,null,'ul. Testowa 1, Warszawa'),
 ('e8820000-0000-4000-8000-000000000009','e8830000-0000-4000-8000-000000000009',
  '{"values":{"q-p1-postal":"00-123","q-p1-city":"Warszawa"}}','ul. Wierszowa 3',null,null,'ul. Wierszowa 3, 00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000010','e8830000-0000-4000-8000-000000000010',
  '{"values":{}}','ul. Wierszowa 4','22-222','Gdańsk','ul. Wierszowa 4, 22-222 Gdańsk'),
 ('e8820000-0000-4000-8000-000000000011','e8830000-0000-4000-8000-000000000011',
  '{"fields":{"partner1.address":{"street":"ul. Testowa","buildingNumber":"5","postalCode":"33-333","city":"Poznań"}}}',null,null,null,'ul. Testowa, 5, 33-333, Poznań'),
 ('e8820000-0000-4000-8000-000000000012','e8830000-0000-4000-8000-000000000012',
  '{"values":{"q-p1-address":"","q-p1-postal":null,"q-p1-city":null}}',null,null,null,''),
 ('e8820000-0000-4000-8000-000000000014','e8830000-0000-4000-8000-000000000014',
  '{"values":{"q-p1-address":"ul. Testowa 1, 00-123","q-p1-postal":"00-123","q-p1-city":"Warszawa"}}',null,null,null,'ul. Testowa 1, 00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000015','e8830000-0000-4000-8000-000000000015',
  '{"values":{"q-p1-address":"ul. Testowa 1, Warszawa","q-p1-postal":"00-123","q-p1-city":"Warszawa"}}',null,null,null,'ul. Testowa 1, 00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000016','e8830000-0000-4000-8000-000000000016',
  '{"values":{"q-p1-address":"Warszawa","q-p1-city":"Warszawa"}}',null,null,null,'Warszawa'),
 ('e8820000-0000-4000-8000-000000000017','e8830000-0000-4000-8000-000000000017',
  '{"values":{"q-p1-address":"","q-p1-postal":"00-123","q-p1-city":"Warszawa"}}',null,null,null,'00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000018','e8830000-0000-4000-8000-000000000018',
  '{"values":{"q-p1-address":"","q-p1-city":"Warszawa"}}',null,null,null,'Warszawa'),
 ('e8820000-0000-4000-8000-000000000019','e8830000-0000-4000-8000-000000000019',
  '{"values":{"q-p1-address":"","q-p1-postal":"00-123"}}',null,null,null,'00-123'),
 ('e8820000-0000-4000-8000-000000000020','e8830000-0000-4000-8000-000000000020',
  '{"values":{"q-p1-address":"ul. Testowa 1, 00-123 Warszawa","q-p1-postal":"00-123","q-p1-city":"Warszawa"}}',null,null,null,'ul. Testowa 1, 00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000021','e8830000-0000-4000-8000-000000000021',
  '{"values":{"q-p1-address":"00-123","q-p1-postal":"00-123","q-p1-city":"Warszawa"}}',null,null,null,'00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000022','e8830000-0000-4000-8000-000000000022',
  '{"values":{"q-p1-address":"ul. Testowa 1","q-p1-postal":"00-123","q-p1-city":"Warszawa"}}',null,null,null,'ul. Testowa 1, 00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000023','e8830000-0000-4000-8000-000000000023',
  '{"values":{"q-p1-address":"Warszawa","q-p1-postal":"00-123","q-p1-city":"Warszawa"}}',null,null,null,'00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000024','e8830000-0000-4000-8000-000000000024',
  '{"values":{"q-p1-address":"ul. Testowa 1, Warszawa","q-p1-city":"Warszawa"}}',null,null,null,'ul. Testowa 1, Warszawa'),
 ('e8820000-0000-4000-8000-000000000025','e8830000-0000-4000-8000-000000000025',
  '{"values":{"q-p1-address":"ul. Testowa 1, 00-123","q-p1-postal":"00-123"}}',null,null,null,'ul. Testowa 1, 00-123'),
 ('e8820000-0000-4000-8000-000000000026','e8830000-0000-4000-8000-000000000026',
  '{"values":{"q-p1-address":"ul. Testowa 1, 100-1234","q-p1-postal":"00-123","q-p1-city":"Warszawa"}}',null,null,null,'ul. Testowa 1, 100-1234, 00-123 Warszawa'),
 ('e8820000-0000-4000-8000-000000000027','e8830000-0000-4000-8000-000000000027',
  '{"values":{"q-p1-address":"ul. Testowa 1, 11-111","q-p1-postal":"00-123","q-p1-city":"Warszawa"}}',null,null,null,'ul. Testowa 1, 11-111, 00-123 Warszawa');

insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status,contract_address,contract_postal_code,contract_city)
select e.wedding_id,'e8810000-0000-4000-8000-000000000001','Anna Nowak','Jan Kowalski','2027-09-01','active',
  e.initial_address,e.initial_postal,e.initial_city
from public.contacts_backfill_expected e;

insert into public.form_instances(id,form_id,wedding_id,user_id,token,status,submitted_at)
select e.instance_id,'e8840000-0000-4000-8000-000000000001',e.wedding_id,
  'e8810000-0000-4000-8000-000000000001','contacts-backfill-'||right(e.wedding_id::text,4),'submitted',
  '2026-10-15 12:00:00+00'
from public.contacts_backfill_expected e;

insert into public.form_answers(instance_id,answer_json)
select e.instance_id,e.answer_json from public.contacts_backfill_expected e;

-- Separate intentionally malformed answer used only to prove migration rollback.
insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status)
values ('e8820000-0000-4000-8000-000000000013','e8810000-0000-4000-8000-000000000001','Bad','Fixture','2027-09-01','active');
insert into public.form_instances(id,form_id,wedding_id,user_id,token,status,submitted_at)
values ('e8830000-0000-4000-8000-000000000013','e8840000-0000-4000-8000-000000000001','e8820000-0000-4000-8000-000000000013',
  'e8810000-0000-4000-8000-000000000001','contacts-backfill-invalid','submitted','2026-10-15 12:00:00+00');
insert into public.form_answers(instance_id,answer_json)
values ('e8830000-0000-4000-8000-000000000013','{"answers":{"not":"an array"}}');

commit;
