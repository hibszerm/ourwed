begin;
select no_plan();

select has_function('public','list_my_collaborative_weddings',array['date','uuid','integer'],
  'bounded collaboration list RPC exists');
select has_function('public','get_collaborative_wedding_detail',array['uuid'],
  'curated collaboration detail RPC exists');
select ok((select prosecdef from pg_catalog.pg_proc where oid='public.list_my_collaborative_weddings(date,uuid,integer)'::regprocedure),
  'list RPC is SECURITY DEFINER');
select ok((select prosecdef from pg_catalog.pg_proc where oid='public.get_collaborative_wedding_detail(uuid)'::regprocedure),
  'detail RPC is SECURITY DEFINER');
select ok((select proconfig @> array['search_path=""'] from pg_catalog.pg_proc
  where oid='public.list_my_collaborative_weddings(date,uuid,integer)'::regprocedure),
  'list RPC pins empty search_path');
select ok((select proconfig @> array['search_path=""'] from pg_catalog.pg_proc
  where oid='public.get_collaborative_wedding_detail(uuid)'::regprocedure),
  'detail RPC pins empty search_path');
select ok(has_function_privilege('authenticated','public.list_my_collaborative_weddings(date,uuid,integer)','EXECUTE'),
  'authenticated can execute list RPC');
select ok(not has_function_privilege('anon','public.list_my_collaborative_weddings(date,uuid,integer)','EXECUTE'),
  'anon cannot execute list RPC');
select ok(has_function_privilege('authenticated','public.get_collaborative_wedding_detail(uuid)','EXECUTE'),
  'authenticated can execute detail RPC');
select ok(not has_function_privilege('anon','public.get_collaborative_wedding_detail(uuid)','EXECUTE'),
  'anon cannot execute detail RPC');
select ok(not exists(select 1 from pg_catalog.pg_proc p cross join lateral
  pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  where p.oid in ('public.list_my_collaborative_weddings(date,uuid,integer)'::regprocedure,
    'public.get_collaborative_wedding_detail(uuid)'::regprocedure)
    and a.grantee=0 and a.privilege_type='EXECUTE'), 'PUBLIC cannot execute either RPC');
select ok(not exists(select 1 from pg_catalog.pg_policy where polrelid='public.weddings'::regclass
  and polname ilike '%collab%'), 'no membership-based wedding RLS policy was added');
select ok(not exists(select 1 from pg_catalog.pg_policy where polrelid in
  ('public.wedding_places'::regclass,'public.wedding_operational_times'::regclass)
  and polname ilike '%collab%'), 'no membership-based child-table RLS policy was added');
select ok(exists(select 1 from pg_catalog.pg_indexes where schemaname='public'
  and tablename='wedding_collaboration_memberships'
  and indexname='wedding_collaboration_memberships_member_active_idx'
  and indexdef ilike '%(member_user_id, wedding_id)%'
  and indexdef ilike '%WHERE ((status = ''active''::text) AND (wedding_id IS NOT NULL))%'),
  'member-leading partial index supports active collaborative-list enumeration');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000001','authenticated','authenticated','c1c-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000002','authenticated','authenticated','c1c-member@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000003','11000000-0000-4000-8000-000000000003','authenticated','authenticated','c1c-member-two@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000004','authenticated','authenticated','c1c-outsider@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000005','authenticated','authenticated','c1c-unconfirmed@example.test','x',null,'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000006','authenticated','authenticated','c1c-pending-only@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());

insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,ceremony_time,status,venue,contract_value)
values
 ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Anna','Marek','2027-06-01','15:30','active','PRIVATE_VENUE_SENTINEL',99999),
 ('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','Iga','Jan','2027-06-02','10:30','active','PRIVATE_VENUE_SENTINEL',88888),
 ('21000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001','Ola','Piotr',null,null,'active','PRIVATE_VENUE_SENTINEL',77777),
 ('21000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000001','Ewa','Tomek',null,null,'active','PRIVATE_VENUE_SENTINEL',66666),
 ('21000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000001','Lena','Adam','2027-06-03',null,'archived','PRIVATE_VENUE_SENTINEL',55555),
 ('21000000-0000-4000-8000-000000000006','11000000-0000-4000-8000-000000000004','Cross','Owner','2027-06-04',null,'active','PRIVATE_VENUE_SENTINEL',44444);

insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status)
values ('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004','Owner','Outsider','active'),
 ('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002','Owner','Member','active'),
 ('31000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000006','Owner','Pending only','active');

insert into public.wedding_collaboration_invitations(id,wedding_id,wedding_id_snapshot,owner_user_id,invitee_user_id,
  status,terms_version,couple_first_name_snapshot,couple_second_name_snapshot,wedding_date_snapshot,
  currency_snapshot,terms_snapshot,idempotency_key,accepted_at)
values
 ('41000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','accepted',1,'Anna','Marek','2027-06-01','PLN','{}','51000000-0000-4000-8000-000000000001',now()),
 ('41000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','accepted',1,'Iga','Jan','2027-06-02','PLN','{}','51000000-0000-4000-8000-000000000002',now()),
 ('41000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','accepted',1,'Ola','Piotr',null,'PLN','{}','51000000-0000-4000-8000-000000000003',now()),
 ('41000000-0000-4000-8000-000000000004','21000000-0000-4000-8000-000000000004','21000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','accepted',1,'Ewa','Tomek',null,'PLN','{}','51000000-0000-4000-8000-000000000004',now()),
 ('41000000-0000-4000-8000-000000000005','21000000-0000-4000-8000-000000000005','21000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','accepted',1,'Lena','Adam','2027-06-03','PLN','{}','51000000-0000-4000-8000-000000000005',now()),
 ('41000000-0000-4000-8000-000000000006','21000000-0000-4000-8000-000000000006','21000000-0000-4000-8000-000000000006','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','accepted',1,'Cross','Owner','2027-06-04','PLN','{}','51000000-0000-4000-8000-000000000006',now()),
 ('41000000-0000-4000-8000-000000000007','21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000003','accepted',1,'Anna','Marek','2027-06-01','PLN','{}','51000000-0000-4000-8000-000000000007',now());
insert into public.wedding_collaboration_invitations(id,wedding_id,wedding_id_snapshot,owner_user_id,invitee_user_id,
  source_connection_id,status,terms_version,couple_first_name_snapshot,couple_second_name_snapshot,wedding_date_snapshot,
  currency_snapshot,terms_snapshot,idempotency_key)
values ('41000000-0000-4000-8000-000000000008','21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000006',
  '31000000-0000-4000-8000-000000000003','pending',1,'Anna','Marek','2027-06-01','PLN','{}',
  '51000000-0000-4000-8000-000000000008');

insert into public.wedding_collaboration_memberships(wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,
  accepted_invitation_id,status,accepted_at)
values
 ('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000001','active',now()),
 ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','active',now()),
 ('21000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000003','active',now()),
 ('21000000-0000-4000-8000-000000000004','21000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000004','active',now()),
 ('21000000-0000-4000-8000-000000000006','21000000-0000-4000-8000-000000000006','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000006','active',now()),
 ('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000007','active',now());
select set_config('test.member_membership_id', (select id::text from public.wedding_collaboration_memberships
  where wedding_id='21000000-0000-4000-8000-000000000001'
    and member_user_id='11000000-0000-4000-8000-000000000002'), true);

insert into public.wedding_places(id,wedding_id,role,label,place_id,formatted_address,latitude,longitude,sort_order)
values
 ('61000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','bride_preparation','PRIVATE_LABEL_SENTINEL','PRIVATE_PLACE_SENTINEL','Bride address',1.25,2.5,10),
 ('61000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000001','groom_preparation','PRIVATE_LABEL_SENTINEL','PRIVATE_PLACE_SENTINEL','Groom address',1.25,2.5,20),
 ('61000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000001','ceremony','PRIVATE_LABEL_SENTINEL','PRIVATE_PLACE_SENTINEL','Ceremony address',1.25,2.5,30),
 ('61000000-0000-4000-8000-000000000004','21000000-0000-4000-8000-000000000001','reception','PRIVATE_LABEL_SENTINEL','PRIVATE_PLACE_SENTINEL','Reception address',1.25,2.5,40),
 ('61000000-0000-4000-8000-000000000005','21000000-0000-4000-8000-000000000001','hotel','PRIVATE_LABEL_SENTINEL','PRIVATE_PLACE_SENTINEL','Forbidden hotel address',1.25,2.5,50),
 ('61000000-0000-4000-8000-000000000006','21000000-0000-4000-8000-000000000001','other','PRIVATE_LABEL_SENTINEL','PRIVATE_PLACE_SENTINEL','Forbidden other address',1.25,2.5,60),
 ('61000000-0000-4000-8000-000000000007','21000000-0000-4000-8000-000000000002','ceremony','PRIVATE_LABEL_SENTINEL','PRIVATE_PLACE_SENTINEL','Second ceremony address',1.25,2.5,30),
 ('61000000-0000-4000-8000-000000000008','21000000-0000-4000-8000-000000000003','ceremony','PRIVATE_LABEL_SENTINEL','PRIVATE_PLACE_SENTINEL','Third ceremony address',1.25,2.5,30),
 ('61000000-0000-4000-8000-000000000009','21000000-0000-4000-8000-000000000004','ceremony','PRIVATE_LABEL_SENTINEL','PRIVATE_PLACE_SENTINEL','Fourth ceremony address',1.25,2.5,30),
 ('61000000-0000-4000-8000-000000000010','21000000-0000-4000-8000-000000000004','reception','PRIVATE_LABEL_SENTINEL','PRIVATE_PLACE_SENTINEL','Fourth reception address',1.25,2.5,40),
 ('61000000-0000-4000-8000-000000000011','21000000-0000-4000-8000-000000000004','bride_preparation','PRIVATE_LABEL_SENTINEL','PRIVATE_PLACE_SENTINEL','Fourth preparation address',1.25,2.5,10);
insert into public.wedding_operational_times(wedding_id,stop_key,operational_time) values
 ('21000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','00:00'),
 ('21000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','24:00'),
 ('21000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','23:59'),
 ('21000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000007','25:30'),
 ('21000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000008','29:59'),
 ('21000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000009','malformed'),
 ('21000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000010',''),
 ('21000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000011','');

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.list_my_collaborative_weddings(null,null,50)),4,
  'member receives only four linked active weddings, excluding archived and owner-mismatched rows');
select is((select wedding_id from public.list_my_collaborative_weddings(null,null,50) limit 1),
  '21000000-0000-4000-8000-000000000001'::uuid,'dated weddings sort before undated weddings');
select is((select couple_first_name from public.list_my_collaborative_weddings(null,null,50) limit 1),'Anna',
  'list exposes the curated first couple name');
select is((select count(*)::int from public.list_my_collaborative_weddings('2027-06-01','21000000-0000-4000-8000-000000000001',50)),3,
  'date/id cursor continues through later dated and undated weddings');
select is((select wedding_id from public.list_my_collaborative_weddings('2027-06-01','21000000-0000-4000-8000-000000000001',1) limit 1),
  '21000000-0000-4000-8000-000000000002'::uuid,'limit one returns the next stable key');
select is((select count(*)::int from public.list_my_collaborative_weddings(null,'21000000-0000-4000-8000-000000000003',50)),1,
  'null-date cursor continues by wedding UUID');
select throws_ok($$select * from public.list_my_collaborative_weddings('2027-06-01',null,50)$$,
  '22023','invalid_cursor','date cursor without wedding UUID is rejected');
select ok(public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid) is not null,
  'active member reads a detail projection');
select is((select count(*)::int from jsonb_object_keys(public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid))),5,
  'detail object contains exactly the five documented top-level fields');
select is(jsonb_array_length(public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid)->'places'),4,
  'detail includes only four core place roles');
select ok(position('Forbidden hotel address' in public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid)::text)=0
  and position('PRIVATE_LABEL_SENTINEL' in public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid)::text)=0
  and position('PRIVATE_PLACE_SENTINEL' in public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid)::text)=0
  and position('PRIVATE_VENUE_SENTINEL' in public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid)::text)=0,
  'projection excludes hotel, label, place ID, venue, and commercial sentinel data');
select is((public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid)->'places'->0)->>'operational_time','00:00',
  '00:00 is a valid saved operational time');
select is((public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid)->'places'->1)->>'operational_time',null,
  '24:00 is an invalid saved operational time and becomes null');
select is((public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid)->'places'->2)->>'operational_time','15:30',
  'NULL saved ceremony time falls back to wedding ceremony_time');
select is((public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid)->'places'->3)->>'operational_time','23:59',
  '23:59 is a valid saved operational time');
select is((public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000002'::uuid)->'places'->0)->>'operational_time','10:30',
  'invalid saved ceremony value 25:30 falls back to the valid wedding ceremony time');
select is((public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000003'::uuid)->'places'->0)->>'operational_time',null,
  'invalid saved ceremony value 29:59 with NULL fallback is unavailable');
select is((public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000004'::uuid)->'places'->0)->>'operational_time',null,
  'malformed saved ceremony value with no fallback is unavailable');
select is((public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000004'::uuid)->'places'->1)->>'operational_time',null,
  'empty saved operational time is unavailable');
select is((public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000004'::uuid)->'places'->2)->>'operational_time',null,
  'NULL non-ceremony saved time stays unavailable');
reset role;
insert into public.wedding_operational_times(wedding_id,stop_key,operational_time)
values ('21000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003','09:05');
set local role authenticated;
select is((public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid)->'places'->2)->>'operational_time','09:05',
  'valid saved ceremony time wins over valid wedding ceremony fallback');
select is((select count(*)::int from public.weddings where id='21000000-0000-4000-8000-000000000001'),0,
  'active membership does not grant direct wedding SELECT');
select is((select count(*)::int from public.wedding_places where wedding_id='21000000-0000-4000-8000-000000000001'),0,
  'active membership does not grant direct place-table SELECT');
select is((select count(*)::int from public.wedding_operational_times where wedding_id='21000000-0000-4000-8000-000000000001'),0,
  'active membership does not grant direct operational-time SELECT');
select throws_ok($$insert into public.wedding_places(wedding_id,role,formatted_address)
  values ('21000000-0000-4000-8000-000000000001','ceremony','forbidden')$$,
  '42501',null,'active member cannot directly INSERT a child place');

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000006',true);
select is((select count(*)::int from public.list_my_collaborative_weddings(null,null,50)),0,
  'pending-only invitee has no collaborative list row');
select is(public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid),null::jsonb,
  'pending-only invitee cannot read collaborative detail');
select is((select count(*)::int from public.weddings where id='21000000-0000-4000-8000-000000000001'),0,
  'pending-only invitee has no direct wedding SELECT');
select is((select count(*)::int from public.wedding_places where wedding_id='21000000-0000-4000-8000-000000000001'),0,
  'pending-only invitee has no direct child SELECT');

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select is(public.end_collaboration('31000000-0000-4000-8000-000000000002'::uuid,
  '51000000-0000-4000-8000-000000000101'::uuid)->>'status','ended',
  'owner ends the global connection through the lifecycle RPC');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.list_my_collaborative_weddings(null,null,50)),4,
  'active wedding membership remains visible after global connection ends');
select ok(public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid) is not null,
  'active wedding membership remains readable after global connection ends');
select is((select count(*)::int from public.weddings where id='21000000-0000-4000-8000-000000000001'),0,
  'ended global connection does not expand direct wedding SELECT');

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select is(public.revoke_wedding_collaboration_membership(
  current_setting('test.member_membership_id')::uuid,
  '51000000-0000-4000-8000-000000000102'::uuid)->>'status','revoked',
  'owner revokes membership through the lifecycle RPC');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.list_my_collaborative_weddings(null,null,50)),3,
  'revoked membership removes that wedding from the collaborator list');
select is(public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid),null::jsonb,
  'revoked membership cannot read collaborative detail');
select is((select count(*)::int from public.weddings where id='21000000-0000-4000-8000-000000000001'),0,
  'revoked member still has no direct wedding SELECT');
select is((select count(*)::int from public.wedding_places where wedding_id='21000000-0000-4000-8000-000000000001'),0,
  'revoked member still has no direct child SELECT');

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select is((select count(*)::int from public.list_my_collaborative_weddings(null,null,50)),1,
  'a second active member retains independent access after first member revocation');
select is(public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid)->>'couple_first_name','Anna',
  'second member receives the same curated wedding name');

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.list_my_collaborative_weddings(null,null,50)),0,
  'owner is not implicitly treated as their own collaborator');
select is(public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid),null::jsonb,
  'owner cannot use the collaborator detail RPC');

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000004',true);
select is((select count(*)::int from public.list_my_collaborative_weddings(null,null,50)),0,
  'global connection or no membership yields no collaborative weddings');
select is(public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid),null::jsonb,
  'third party receives null for another member wedding');
select is(public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000005'::uuid),null::jsonb,
  'archived wedding is not readable');
select is(public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000006'::uuid),null::jsonb,
  'mismatched live owner linkage is not readable');
select is(public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000099'::uuid),null::jsonb,
  'unknown wedding is indistinguishable from inaccessible wedding');

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000005',true);
select is((select count(*)::int from public.list_my_collaborative_weddings(null,null,50)),0,
  'unconfirmed Auth identity receives no collaborative wedding rows');
select is(public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid),null::jsonb,
  'unconfirmed Auth identity receives no detail projection');

reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select throws_ok($$select * from public.list_my_collaborative_weddings(null,null,50)$$,
  '42501',null,'anon cannot call the list RPC');
select throws_ok($$select public.get_collaborative_wedding_detail('21000000-0000-4000-8000-000000000001'::uuid)$$,
  '42501',null,'anon cannot call the detail RPC');
reset role;

select * from finish();
rollback;
