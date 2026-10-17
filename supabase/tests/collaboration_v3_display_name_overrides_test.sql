begin;
select no_plan();

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','a7100000-0000-4000-8000-000000000001','authenticated','authenticated','display-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','a7100000-0000-4000-8000-000000000002','authenticated','authenticated','display-member-a@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','a7100000-0000-4000-8000-000000000003','authenticated','authenticated','display-member-b@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','a7100000-0000-4000-8000-000000000004','authenticated','authenticated','display-outsider@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());

insert into public.weddings(id,user_id,bride_name,groom_name,display_name,wedding_date,status) values
 ('a7200000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000001','Old Bride','Old Groom','Canonical One','2027-09-01','active'),
 ('a7200000-0000-4000-8000-000000000002','a7100000-0000-4000-8000-000000000001','Only Bride','brak',null,'2027-09-02','active');

insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status) values
 ('a7300000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000002','Owner','Member A','active'),
 ('a7300000-0000-4000-8000-000000000002','a7100000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000003','Owner','Member B','active');

insert into public.wedding_collaboration_invitations(id,wedding_id,wedding_id_snapshot,owner_user_id,invitee_user_id,
  source_connection_id,status,terms_version,couple_first_name_snapshot,couple_second_name_snapshot,wedding_date_snapshot,
  package_label_snapshot,contract_value_snapshot,currency_snapshot,proposed_share_amount,terms_snapshot,idempotency_key,
  accepted_at,access_configuration_version,role_key,custom_role_label,access_mode,permission_group_mapping_version)
values
 ('a7400000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000002','a7300000-0000-4000-8000-000000000001','accepted',1,'Historical A','Historical B','2027-09-01',null,null,'PLN',null,'{}','a7500000-0000-4000-8000-000000000001',now(),1,'unspecified',null,'custom','1'),
 ('a7400000-0000-4000-8000-000000000002','a7200000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000003','a7300000-0000-4000-8000-000000000002','accepted',1,'Snapshot A','Snapshot B','2027-09-01',null,null,'PLN',null,'{}','a7500000-0000-4000-8000-000000000002',now(),1,'unspecified',null,'custom','1');

insert into public.wedding_collaboration_memberships(id,wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,
  accepted_invitation_id,status,accepted_at)
values
 ('a7600000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000002','a7400000-0000-4000-8000-000000000001','active',now()),
 ('a7600000-0000-4000-8000-000000000002','a7200000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000003','a7400000-0000-4000-8000-000000000002','active',now());

insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
values ('a7600000-0000-4000-8000-000000000001','wedding.identity',1),
       ('a7600000-0000-4000-8000-000000000002','wedding.identity',1);
select is((select count(*)::int from collaboration_private.membership_permission_grants
  where membership_id='a7600000-0000-4000-8000-000000000001'
    and capability_key <> 'wedding.identity'),0,
  'fixture grants only safe identity access and no six-area capability');

select is((select effective_display_name from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000002'::uuid]) limit 1),null,
  'anonymous actor receives no display-name rows');

set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000002',true);
select is((select effective_display_name from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid]) limit 1),'Canonical One',
  'shared actor follows the live owner display_name, not old couple names or invitation snapshots');
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000002'::uuid])),1,
  'null owner display_name uses the owner UI fallback');
select is((select effective_display_name from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000002'::uuid]) limit 1),'Only Bride',
  'fallback omits a recognized absent-partner placeholder');
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000002',true);
select is((select has_personal_override from public.set_my_wedding_display_name_override(
  'a7200000-0000-4000-8000-000000000001','Canonical One'))::boolean,true,
  'explicitly saving a value equal to owner title still creates an override');
reset role;

update public.weddings set display_name='Canonical Two' where id='a7200000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000002',true);
select is((select effective_display_name from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid]) limit 1),'Canonical One',
  'a personal override survives owner canonical rename');
select is((select owner_canonical_display_name from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid]) limit 1),'Canonical Two',
  'resolver separately reports the current owner title to its authorized actor');
select is((select effective_display_name from public.clear_my_wedding_display_name_override(
  'a7200000-0000-4000-8000-000000000001')),'Canonical Two',
  'reset immediately restores the latest owner title');
select is((select effective_display_name from public.clear_my_wedding_display_name_override(
  'a7200000-0000-4000-8000-000000000001')),'Canonical Two',
  'repeating restore is idempotent and continues to resolve the current owner title');
reset role;

update public.weddings set display_name='Canonical Three' where id='a7200000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000002',true);
select is((select effective_display_name from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid]) limit 1),'Canonical Three',
  'after reset the collaborator resumes live owner-name synchronization');
select is((select effective_display_name from public.set_my_wedding_display_name_override(
  'a7200000-0000-4000-8000-000000000001',null)),'Old Bride i Old Groom',
  'empty collaborator input follows the same derived owner-title fallback');
select is((select has_personal_override from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid]) limit 1),true,
  'explicitly saving the derived fallback still creates a personal title');
select is((select effective_display_name from public.clear_my_wedding_display_name_override(
  'a7200000-0000-4000-8000-000000000001')),'Canonical Three',
  'clearing a fallback-valued preference returns to the live canonical owner title');
select is((select effective_display_name from public.set_my_wedding_display_name_override(
  'a7200000-0000-4000-8000-000000000001','Member A Private')),'Member A Private',
  'first collaborator can set only their own private title');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000003',true);
select is((select effective_display_name from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid]) limit 1),'Canonical Three',
  'second collaborator follows owner and cannot see first collaborator preference');
reset role;
delete from collaboration_private.membership_permission_grants
where membership_id='a7600000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000003',true);
select is((select count(*)::int from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid])),0,
  'active relationship without identity view cannot resolve the title');
select throws_ok($$select * from public.set_my_wedding_display_name_override(
  'a7200000-0000-4000-8000-000000000001','No Identity')$$,
  'P0001','FORBIDDEN','active relationship without identity view cannot save a title');
reset role;
insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
values ('a7600000-0000-4000-8000-000000000002','wedding.identity',1);
set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000003',true);
select is((select effective_display_name from public.set_my_wedding_display_name_override(
  'a7200000-0000-4000-8000-000000000001','Member B Private')),'Member B Private',
  'second collaborator can create an independent private title');
reset role;

update public.weddings set display_name='Canonical Four' where id='a7200000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000002',true);
select is((select effective_display_name from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid]) limit 1),'Member A Private',
  'owner rename and collaborator B preference do not overwrite collaborator A preference');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000003',true);
select is((select effective_display_name from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid]) limit 1),'Member B Private',
  'owner rename does not overwrite collaborator B preference');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000001',true);
select is((select effective_display_name from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid]) limit 1),'Canonical Four',
  'owner resolver remains canonical and does not expose any collaborator preference');
select is((select has_personal_override from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid]) limit 1),false,
  'owner cannot discover collaborator override existence');
select throws_ok($$select * from public.set_my_wedding_display_name_override(
  'a7200000-0000-4000-8000-000000000001','Owner Must Not Use Collaborator Setter')$$,
  'P0001','UNAVAILABLE','owner cannot use collaborator preference command');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000004',true);
select is((select count(*)::int from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid])),0,
  'unrelated actor cannot resolve an inaccessible wedding');
select throws_ok($$select * from public.set_my_wedding_display_name_override(
  'a7200000-0000-4000-8000-000000000001','Unauthorized')$$,
  'P0001','UNAVAILABLE','unrelated actor cannot create a preference');
reset role;

update public.wedding_collaboration_memberships set status='revoked',revoked_at=now()
where id='a7600000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000003',true);
select is((select count(*)::int from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid])),0,
  'revoked actor cannot use a stored preference to recover wedding visibility');
select throws_ok($$select * from public.set_my_wedding_display_name_override(
  'a7200000-0000-4000-8000-000000000001','After Revocation')$$,
  'P0001','UNAVAILABLE','revoked actor cannot mutate a preference');
select throws_ok($$select * from public.clear_my_wedding_display_name_override(
  'a7200000-0000-4000-8000-000000000001')$$,
  'P0001','UNAVAILABLE','revoked actor cannot clear a preference');
reset role;
select is((select count(*)::int from collaboration_private.wedding_display_name_overrides
  where actor_user_id='a7100000-0000-4000-8000-000000000003'),1,
  'revocation leaves the private preference stored without granting access');
update public.wedding_collaboration_memberships set status='active',revoked_at=null
where id='a7600000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000003',true);
select is((select effective_display_name from public.get_my_workspace_wedding_display_names(
  array['a7200000-0000-4000-8000-000000000001'::uuid]) limit 1),'Member B Private',
  'legitimate re-access makes the retained actor-specific preference effective again');
reset role;

select ok(not has_table_privilege('authenticated','collaboration_private.wedding_display_name_overrides','select')
  and not has_table_privilege('authenticated','collaboration_private.wedding_display_name_overrides','insert')
  and not has_table_privilege('authenticated','collaboration_private.wedding_display_name_overrides','update')
  and not has_table_privilege('authenticated','collaboration_private.wedding_display_name_overrides','delete'),
  'client roles have no direct access to private preference rows');
select ok(has_function_privilege('authenticated','public.get_my_workspace_wedding_display_names(uuid[])','execute')
  and has_function_privilege('authenticated','public.set_my_wedding_display_name_override(uuid,text)','execute')
  and has_function_privilege('authenticated','public.clear_my_wedding_display_name_override(uuid)','execute')
  and not has_function_privilege('anon','public.set_my_wedding_display_name_override(uuid,text)','execute')
  and not has_function_privilege('service_role','public.set_my_wedding_display_name_override(uuid,text)','execute'),
  'only authenticated clients receive the intended public RPC execution grants');
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
  from pg_catalog.pg_proc p where p.oid in (
    'public.get_my_workspace_wedding_display_names(uuid[])'::regprocedure,
    'public.set_my_wedding_display_name_override(uuid,text)'::regprocedure,
    'public.clear_my_wedding_display_name_override(uuid)'::regprocedure))
  and (select bool_and(not p.prosecdef and p.proconfig @> array['search_path=""'])
    from pg_catalog.pg_proc p where p.oid in (
      'collaboration_private.owner_wedding_display_name(text,text,text)'::regprocedure,
      'collaboration_private.owner_wedding_fallback_display_name(text,text)'::regprocedure))
  and not has_function_privilege('authenticated','collaboration_private.owner_wedding_display_name(text,text,text)','execute')
  and not has_function_privilege('authenticated','collaboration_private.owner_wedding_fallback_display_name(text,text)','execute'),
  'public RPCs are SECURITY DEFINER; pure private helpers are invoker-only and all use an empty search_path');
select is((select p.proargnames::text from pg_catalog.pg_proc p
  where p.oid='public.set_my_wedding_display_name_override(uuid,text)'::regprocedure),
  '{p_wedding_id,p_display_name,wedding_id,owner_canonical_display_name,effective_display_name,has_personal_override}',
  'setter has no caller-supplied actor identifier');
select is((select p.proargnames::text from pg_catalog.pg_proc p
  where p.oid='public.get_my_workspace_wedding_display_names(uuid[])'::regprocedure),
  '{p_wedding_ids,wedding_id,owner_canonical_display_name,effective_display_name,has_personal_override}',
  'batch resolver has no caller-supplied actor identifier');
select is((select p.proargnames::text from pg_catalog.pg_proc p
  where p.oid='public.clear_my_wedding_display_name_override(uuid)'::regprocedure),
  '{p_wedding_id,wedding_id,owner_canonical_display_name,effective_display_name,has_personal_override}',
  'clear command has no caller-supplied actor identifier');
select is((select display_name from public.weddings where id='a7200000-0000-4000-8000-000000000001'),
  'Canonical Four','collaborator preference writes never mutate canonical owner wedding data');
select is((select count(*)::int from public.wedding_collaboration_invitations
  where id in ('a7400000-0000-4000-8000-000000000001','a7400000-0000-4000-8000-000000000002')
    and couple_first_name_snapshot='Historical A'),1,
  'invitation snapshots remain historical and are not rewritten by title resolution');

select * from finish();
rollback;
