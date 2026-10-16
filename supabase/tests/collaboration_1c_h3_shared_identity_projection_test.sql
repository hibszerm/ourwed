begin;
select plan(18);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','a9100000-0000-4000-8000-000000000001','authenticated','authenticated','h3-identity-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','a9100000-0000-4000-8000-000000000002','authenticated','authenticated','h3-identity-member@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','a9100000-0000-4000-8000-000000000003','authenticated','authenticated','h3-identity-outsider@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());

insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status) values
 ('a9200000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001','Identity First','Identity Second','2027-09-01','active'),
 ('a9200000-0000-4000-8000-000000000002','a9100000-0000-4000-8000-000000000001','Pending First','Pending Second','2027-09-02','active'),
 ('a9200000-0000-4000-8000-000000000003','a9100000-0000-4000-8000-000000000001','Revoked First','Revoked Second','2027-09-03','active'),
 ('a9200000-0000-4000-8000-000000000004','a9100000-0000-4000-8000-000000000001','No Grant First','No Grant Second','2027-09-04','active'),
 ('a9200000-0000-4000-8000-000000000005','a9100000-0000-4000-8000-000000000001','Inactive First','Inactive Second','2027-09-05','archived');

insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status) values
 ('a9300000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000002','Owner','Member','active'),
 ('a9300000-0000-4000-8000-000000000002','a9100000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000003','Owner','Outsider','active');

insert into public.wedding_collaboration_invitations(id,wedding_id,wedding_id_snapshot,owner_user_id,invitee_user_id,
  source_connection_id,status,terms_version,couple_first_name_snapshot,couple_second_name_snapshot,wedding_date_snapshot,
  package_label_snapshot,contract_value_snapshot,currency_snapshot,proposed_share_amount,terms_snapshot,idempotency_key,
  accepted_at,access_configuration_version,role_key,custom_role_label,access_mode,permission_group_mapping_version)
values
 ('a9400000-0000-4000-8000-000000000001','a9200000-0000-4000-8000-000000000001','a9200000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000002','a9300000-0000-4000-8000-000000000001','accepted',1,'Identity First','Identity Second','2027-09-01',null,null,'PLN',null,'{}','a9500000-0000-4000-8000-000000000001',now(),1,'unspecified',null,'custom','1'),
 ('a9400000-0000-4000-8000-000000000002','a9200000-0000-4000-8000-000000000002','a9200000-0000-4000-8000-000000000002','a9100000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000002','a9300000-0000-4000-8000-000000000001','pending',1,'Pending First','Pending Second','2027-09-02',null,null,'PLN',null,'{}','a9500000-0000-4000-8000-000000000002',null,1,'unspecified',null,'custom','1'),
 ('a9400000-0000-4000-8000-000000000003','a9200000-0000-4000-8000-000000000003','a9200000-0000-4000-8000-000000000003','a9100000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000002','a9300000-0000-4000-8000-000000000001','accepted',1,'Revoked First','Revoked Second','2027-09-03',null,null,'PLN',null,'{}','a9500000-0000-4000-8000-000000000003',now(),1,'unspecified',null,'custom','1'),
 ('a9400000-0000-4000-8000-000000000004','a9200000-0000-4000-8000-000000000004','a9200000-0000-4000-8000-000000000004','a9100000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000002','a9300000-0000-4000-8000-000000000001','accepted',1,'No Grant First','No Grant Second','2027-09-04',null,null,'PLN',null,'{}','a9500000-0000-4000-8000-000000000004',now(),1,'unspecified',null,'custom','1');

insert into collaboration_private.invitation_permission_grants(invitation_id,capability_key,level)
values ('a9400000-0000-4000-8000-000000000001','wedding.identity',1);

insert into public.wedding_collaboration_memberships(id,wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,
  accepted_invitation_id,status,accepted_at,revoked_at)
values
 ('a9600000-0000-4000-8000-000000000001','a9200000-0000-4000-8000-000000000001','a9200000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000002','a9400000-0000-4000-8000-000000000001','active',now(),null),
 ('a9600000-0000-4000-8000-000000000002','a9200000-0000-4000-8000-000000000003','a9200000-0000-4000-8000-000000000003','a9100000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000002','a9400000-0000-4000-8000-000000000003','revoked',now(),now()),
 ('a9600000-0000-4000-8000-000000000003','a9200000-0000-4000-8000-000000000004','a9200000-0000-4000-8000-000000000004','a9100000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000002','a9400000-0000-4000-8000-000000000004','active',now(),null);

insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
values ('a9600000-0000-4000-8000-000000000001','wedding.identity',1);

set local role authenticated;
select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.get_my_collaborative_wedding_identity('a9200000-0000-4000-8000-000000000001')),
  1,'accepted active collaborator with identity view receives one projection');
select is((select wedding_id::text from public.get_my_collaborative_wedding_identity('a9200000-0000-4000-8000-000000000001')),
  'a9200000-0000-4000-8000-000000000001','projection contains the requested wedding id');
select is((select couple_first_name from public.get_my_collaborative_wedding_identity('a9200000-0000-4000-8000-000000000001')),
  'Identity First','projection contains the couple first name');
select is((select couple_second_name from public.get_my_collaborative_wedding_identity('a9200000-0000-4000-8000-000000000001')),
  'Identity Second','projection contains the couple second name');
select is((select wedding_date::text from public.get_my_collaborative_wedding_identity('a9200000-0000-4000-8000-000000000001')),
  '2027-09-01','projection contains the wedding date');
select is((select pg_catalog.array_agg(key order by key)::text
  from public.get_my_collaborative_wedding_identity('a9200000-0000-4000-8000-000000000001') projection
  cross join lateral pg_catalog.jsonb_object_keys(pg_catalog.to_jsonb(projection)) as keys(key)),
  '{couple_first_name,couple_second_name,wedding_date,wedding_id}',
  'projection key set is exactly the Phase-1 identity/date contract and excludes deferred domains');
select is((select count(*)::int from public.get_my_collaborative_wedding_identity('a9200000-0000-4000-8000-000000000002')),
  0,'pending invitation cannot read the projection');
select is((select count(*)::int from public.get_my_collaborative_wedding_identity('a9200000-0000-4000-8000-000000000003')),
  0,'revoked membership cannot read the projection');
select is((select count(*)::int from public.get_my_collaborative_wedding_identity('a9200000-0000-4000-8000-000000000004')),
  0,'identity-none membership cannot read the projection');
select is((select count(*)::int from public.get_my_collaborative_wedding_identity('a9200000-0000-4000-8000-000000000005')),
  0,'inactive wedding is unavailable');
select is((select count(*)::int from public.get_my_collaborative_wedding_identity('a9200000-0000-4000-8000-000000000099')),
  0,'missing wedding is unavailable');

select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000003',true);
select is(
  (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(result)), '[]'::jsonb)
    from public.get_my_collaborative_wedding_identity('a9200000-0000-4000-8000-000000000001') result),
  (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(result)), '[]'::jsonb)
    from public.get_my_collaborative_wedding_identity('a9200000-0000-4000-8000-000000000099') result),
  'unrelated actor cannot distinguish an existing wedding from a missing wedding');
select ok(has_function_privilege('authenticated','public.get_my_collaborative_wedding_identity(uuid)','execute'),
  'authenticated has intended RPC execution');
select ok(not has_function_privilege('anon','public.get_my_collaborative_wedding_identity(uuid)','execute'),
  'anon RPC execution is revoked');
select ok(not has_function_privilege('service_role','public.get_my_collaborative_wedding_identity(uuid)','execute'),
  'service_role RPC execution is explicitly revoked');
select ok(not exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  where p.oid='public.get_my_collaborative_wedding_identity(uuid)'::regprocedure
    and a.grantee=0 and a.privilege_type='EXECUTE'),
  'PUBLIC RPC execution is revoked');
select is((select p.proargnames::text from pg_catalog.pg_proc p
  where p.oid='public.get_my_collaborative_wedding_identity(uuid)'::regprocedure),
  '{p_wedding_id,wedding_id,couple_first_name,couple_second_name,wedding_date}',
  'RPC signature has no client-supplied actor identifier');
select ok(not has_table_privilege('authenticated','public.wedding_collaboration_memberships','SELECT')
  and not exists(select 1 from pg_catalog.pg_policy where polrelid='public.weddings'::regclass
    and polname ilike '%collab%'),
  'raw membership access and membership-based wedding policies remain absent');
reset role;

select * from finish();
rollback;
