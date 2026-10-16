begin;
select plan(19);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','a8100000-0000-4000-8000-000000000001','authenticated','authenticated','h3-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','a8100000-0000-4000-8000-000000000002','authenticated','authenticated','h3-member@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','a8100000-0000-4000-8000-000000000003','authenticated','authenticated','h3-outsider@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());

insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status) values
 ('a8200000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000001','Owner','Wedding','2027-08-01','active'),
 ('a8200000-0000-4000-8000-000000000002','a8100000-0000-4000-8000-000000000001','Shared','Wedding','2027-08-02','active'),
 ('a8200000-0000-4000-8000-000000000003','a8100000-0000-4000-8000-000000000001','Pending','Wedding','2027-08-03','active'),
 ('a8200000-0000-4000-8000-000000000004','a8100000-0000-4000-8000-000000000001','Revoked','Wedding','2027-08-04','active'),
 ('a8200000-0000-4000-8000-000000000005','a8100000-0000-4000-8000-000000000001','No identity','Wedding','2027-08-05','active'),
 ('a8200000-0000-4000-8000-000000000006','a8100000-0000-4000-8000-000000000001','Inactive','Wedding','2027-08-06','archived');

insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status) values
 ('a8300000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000002','Owner','Member','active'),
 ('a8300000-0000-4000-8000-000000000002','a8100000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000003','Owner','Outsider','active');

insert into public.wedding_collaboration_invitations(id,wedding_id,wedding_id_snapshot,owner_user_id,invitee_user_id,
  source_connection_id,status,terms_version,couple_first_name_snapshot,couple_second_name_snapshot,wedding_date_snapshot,
  package_label_snapshot,contract_value_snapshot,currency_snapshot,proposed_share_amount,terms_snapshot,idempotency_key,
  accepted_at,access_configuration_version,role_key,custom_role_label,access_mode,permission_group_mapping_version)
values
 ('a8400000-0000-4000-8000-000000000001','a8200000-0000-4000-8000-000000000002','a8200000-0000-4000-8000-000000000002','a8100000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000002','a8300000-0000-4000-8000-000000000001','accepted',1,'Shared','Wedding','2027-08-02',null,null,'PLN',null,'{}','a8500000-0000-4000-8000-000000000001',now(),1,'unspecified',null,'custom','1'),
 ('a8400000-0000-4000-8000-000000000002','a8200000-0000-4000-8000-000000000003','a8200000-0000-4000-8000-000000000003','a8100000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000002','a8300000-0000-4000-8000-000000000001','pending',1,'Pending','Wedding','2027-08-03',null,null,'PLN',null,'{}','a8500000-0000-4000-8000-000000000002',null,1,'unspecified',null,'custom','1'),
 ('a8400000-0000-4000-8000-000000000003','a8200000-0000-4000-8000-000000000004','a8200000-0000-4000-8000-000000000004','a8100000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000002','a8300000-0000-4000-8000-000000000001','accepted',1,'Revoked','Wedding','2027-08-04',null,null,'PLN',null,'{}','a8500000-0000-4000-8000-000000000003',now(),1,'unspecified',null,'custom','1'),
 ('a8400000-0000-4000-8000-000000000004','a8200000-0000-4000-8000-000000000005','a8200000-0000-4000-8000-000000000005','a8100000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000002','a8300000-0000-4000-8000-000000000001','accepted',1,'No identity','Wedding','2027-08-05',null,null,'PLN',null,'{}','a8500000-0000-4000-8000-000000000004',now(),1,'unspecified',null,'custom','1');

insert into collaboration_private.invitation_permission_grants(invitation_id,capability_key,level)
values ('a8400000-0000-4000-8000-000000000001','wedding.identity',1);

insert into public.wedding_collaboration_memberships(id,wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,
  accepted_invitation_id,status,accepted_at,revoked_at)
values
 ('a8600000-0000-4000-8000-000000000001','a8200000-0000-4000-8000-000000000002','a8200000-0000-4000-8000-000000000002','a8100000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000002','a8400000-0000-4000-8000-000000000001','active',now(),null),
 ('a8600000-0000-4000-8000-000000000002','a8200000-0000-4000-8000-000000000004','a8200000-0000-4000-8000-000000000004','a8100000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000002','a8400000-0000-4000-8000-000000000003','revoked',now(),now()),
 ('a8600000-0000-4000-8000-000000000003','a8200000-0000-4000-8000-000000000005','a8200000-0000-4000-8000-000000000005','a8100000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000002','a8400000-0000-4000-8000-000000000004','active',now(),null);

insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
values ('a8600000-0000-4000-8000-000000000001','wedding.identity',1);

delete from collaboration_private.membership_permission_grants
where membership_id in (select id from public.wedding_collaboration_memberships
  where wedding_id='a8200000-0000-4000-8000-000000000005');

set local role authenticated;
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000001',true);
select is((select kind from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000001')),
  'owned','active owner resolves as owned');
select is((select wedding_id::text from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000001')),
  'a8200000-0000-4000-8000-000000000001','owner projection includes only the requested owned wedding id');

select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000002',true);
select is((select kind from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000002')),
  'shared','active accepted member with identity view resolves shared');
select is((select membership_id::text from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000002')),
  'a8600000-0000-4000-8000-000000000001',
  'shared projection returns the actor membership id');
select is((select access_version from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000002')),
  '1','access version is returned as decimal-safe text');
select is((select mapping_version from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000002')),
  '1','mapping version is returned');
select is((select effective_capabilities->>'wedding.identity' from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000002')),
  '1','shared projection returns backend-computed effective identity view');
select is((select kind from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000003')),
  'unavailable','pending invitation is not detail authority');
select is((select kind from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000004')),
  'unavailable','revoked membership is unavailable');
select is((select kind from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000005')),
  'unavailable','active membership without identity view is unavailable');
select is((select wedding_id::text from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000005')),
  null,'identity-none result does not disclose the wedding id');
select is((select kind from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000006')),
  'unavailable','inactive wedding is unavailable');
select is((select kind from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000099')),
  'unavailable','missing and unrelated wedding ids share unavailable semantics');

select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000003',true);
select is((select kind from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000002')),
  'unavailable','unrelated tenant receives the same unavailable result');
select is(
  (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(result)), '[]'::jsonb)
    from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000002') result),
  (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(result)), '[]'::jsonb)
    from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000099') result),
  'unrelated and missing weddings return identical complete authority rows');
select ok(has_function_privilege('authenticated','public.resolve_my_wedding_detail_authority(uuid)','execute')
  and not has_function_privilege('anon','public.resolve_my_wedding_detail_authority(uuid)','execute')
  and not has_function_privilege('service_role','public.resolve_my_wedding_detail_authority(uuid)','execute')
  and not exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(
    coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where p.oid='public.resolve_my_wedding_detail_authority(uuid)'::regprocedure
      and a.grantee=0 and a.privilege_type='EXECUTE'),
  'resolver execution is authenticated-only with PUBLIC, anon and service_role revoked');
select ok(not has_table_privilege('authenticated','public.wedding_collaboration_memberships','SELECT')
  and not exists(select 1 from pg_catalog.pg_policy where polrelid='public.weddings'::regclass
    and polname ilike '%collab%'),
  'raw membership remains inaccessible and no core wedding collaboration policy is added');
select is((select p.proargnames[1] from pg_catalog.pg_proc p
  where p.oid='public.resolve_my_wedding_detail_authority(uuid)'::regprocedure),
  'p_wedding_id','resolver accepts no client actor identifier');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select is((select kind from public.resolve_my_wedding_detail_authority('a8200000-0000-4000-8000-000000000001')),
  'unavailable','missing authenticated actor resolves unavailable');
reset role;

select * from finish();
rollback;
