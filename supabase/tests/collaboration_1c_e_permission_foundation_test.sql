begin;
select no_plan();

select is((select count(*)::int from collaboration_private.capability_registry),13,
  'registry contains exactly the 13 frozen capability keys');
with expected(capability_key,active,grantable,owner_only,viewer_default,editor_default,introduced_version) as (
  values ('wedding.identity',true,true,false,1,1,1),('places.address',true,true,false,1,2,1),
    ('places.structure',false,true,false,0,0,1),('places.location_resolution',false,true,false,0,0,1),
    ('schedule.operational_time',true,true,false,1,2,1),('schedule.timeline',false,true,false,0,0,1),
    ('schedule.completion',false,true,false,0,0,1),('brief.curated',false,true,false,0,0,1),
    ('brief.artifact',false,true,false,0,0,1),('tasks',false,true,false,0,0,1),('notes',false,true,false,0,0,1),
    ('travel.route',false,true,false,0,0,1),('travel.commercial',false,true,false,0,0,1)
)
select ok(not exists(
  (select capability_key,active,grantable,owner_only,viewer_default::int,editor_default::int,introduced_version
   from collaboration_private.capability_registry except select * from expected)
  union all
  (select * from expected except
   select capability_key,active,grantable,owner_only,viewer_default::int,editor_default::int,introduced_version
   from collaboration_private.capability_registry)
),'registry rows exactly match the frozen key/flag/default contract');
select ok((select bool_and(introduced_version=1) from collaboration_private.capability_registry),
  'all initial capabilities use registry version 1');
select ok((select bool_and(viewer_default=0 and editor_default=0) from collaboration_private.capability_registry where not active),
  'inactive capabilities always have zero defaults');
select is((select viewer_default::int from collaboration_private.capability_registry where capability_key='wedding.identity'),1,
  'identity viewer default is read-only');
select is((select editor_default::int from collaboration_private.capability_registry where capability_key='wedding.identity'),1,
  'identity editor default remains read-only');
select is((select editor_default::int from collaboration_private.capability_registry where capability_key='places.address'),2,
  'editor address default is edit');
select is((select editor_default::int from collaboration_private.capability_registry where capability_key='schedule.operational_time'),2,
  'editor operational-time default is edit');
select ok(not has_table_privilege('authenticated','collaboration_private.capability_registry','select')
  and not has_table_privilege('authenticated','collaboration_private.capability_registry','update')
  and not has_table_privilege('service_role','collaboration_private.capability_registry','select'),
  'registry is not directly readable or writable by client or service roles');
select ok(not has_table_privilege('authenticated','collaboration_private.membership_permission_grants','select')
  and not has_table_privilege('authenticated','collaboration_private.membership_permission_grants','insert')
  and not has_table_privilege('authenticated','collaboration_private.invitation_permission_grants','select'),
  'grant tables are inaccessible directly');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_catalog.pg_class where oid in (
  'collaboration_private.capability_registry'::regclass,
  'collaboration_private.membership_permission_grants'::regclass,
  'collaboration_private.invitation_permission_grants'::regclass)),
  'all authority tables enforce RLS');
select ok(not has_function_privilege('authenticated','collaboration_private.resolve_wedding_actor_access(uuid)','execute')
  and not has_function_privilege('authenticated','collaboration_private.effective_wedding_capability_level(uuid,text)','execute')
  and not has_function_privilege('service_role','collaboration_private.has_wedding_capability(uuid,text,smallint)','execute'),
  'private resolver helpers are not client executable');
select ok(has_function_privilege('authenticated','public.get_my_wedding_access_context(uuid)','execute')
  and not has_function_privilege('anon','public.get_my_wedding_access_context(uuid)','execute')
  and not exists(select 1 from pg_catalog.pg_proc p cross join lateral
    pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where p.oid='public.get_my_wedding_access_context(uuid)'::regprocedure
      and a.grantee=0 and a.privilege_type='EXECUTE'),
  'access-context RPC is authenticated-only');

select ok((select count(*)=0 from pg_catalog.pg_policy where polrelid in (
  'collaboration_private.capability_registry'::regclass,
  'collaboration_private.membership_permission_grants'::regclass,
  'collaboration_private.invitation_permission_grants'::regclass)),
  'authority tables have no client policies');
select ok(not exists(select 1 from pg_catalog.pg_policy where polrelid in
  ('public.weddings'::regclass,'public.wedding_places'::regclass,'public.wedding_operational_times'::regclass)
  and polname ilike '%collab%'), '1C-E adds no membership-based core-table policy');
set local role authenticated;
select throws_ok($$select * from collaboration_private.membership_permission_grants limit 1$$,
  '42501',null,'authenticated cannot directly read private permission rows');
reset role;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','71000000-0000-4000-8000-000000000001','authenticated','authenticated','1ce-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','71000000-0000-4000-8000-000000000002','authenticated','authenticated','1ce-member@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','71000000-0000-4000-8000-000000000003','authenticated','authenticated','1ce-outsider@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());

insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,ceremony_time,status)
values ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','Klara','Michał','2027-08-01','14:30','active'),
       ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','Basia','Tomasz','2027-08-02','15:30','active');
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status)
values ('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002','Owner','Member','active');
insert into public.wedding_collaboration_invitations(id,wedding_id,wedding_id_snapshot,owner_user_id,invitee_user_id,
  source_connection_id,status,terms_version,couple_first_name_snapshot,couple_second_name_snapshot,wedding_date_snapshot,
  currency_snapshot,terms_snapshot,idempotency_key,accepted_at)
values ('74000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000001','accepted',1,'Klara','Michał','2027-08-01','PLN','{}',
  '75000000-0000-4000-8000-000000000001',now()),
 ('74000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000001','pending',1,'Basia','Tomasz','2027-08-02','PLN','{}',
  '75000000-0000-4000-8000-000000000002',null);
insert into public.wedding_collaboration_memberships(wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,
  accepted_invitation_id,status,accepted_at)
values ('72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000001','active',now());
select set_config('test.onece_membership_id', (select id::text from public.wedding_collaboration_memberships
  where accepted_invitation_id='74000000-0000-4000-8000-000000000001'),true);
insert into public.wedding_places(id,wedding_id,role,formatted_address,sort_order)
values ('76000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','ceremony','Test venue',20);
insert into public.wedding_operational_times(wedding_id,stop_key,operational_time)
values ('72000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001','14:30');
insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
values (current_setting('test.onece_membership_id')::uuid,'wedding.identity',1),
       (current_setting('test.onece_membership_id')::uuid,'places.address',2),
       (current_setting('test.onece_membership_id')::uuid,'schedule.operational_time',2);
insert into collaboration_private.capability_registry(capability_key,active,grantable,owner_only,viewer_default,editor_default,introduced_version)
values ('test.owner_only',true,false,true,0,0,1);
insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
values (current_setting('test.onece_membership_id')::uuid,'test.owner_only',2);
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select is(collaboration_private.effective_wedding_capability_level('72000000-0000-4000-8000-000000000001','unknown.capability'),0::smallint,
  'unknown capability fails closed');
select is(collaboration_private.effective_wedding_capability_level('72000000-0000-4000-8000-000000000001','test.owner_only'),0::smallint,
  'owner-only and non-grantable capability fails closed despite an explicit row');
delete from collaboration_private.membership_permission_grants
where membership_id=current_setting('test.onece_membership_id')::uuid and capability_key='test.owner_only';
delete from collaboration_private.capability_registry where capability_key='test.owner_only';

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select is(public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->>'relationship','collaborator',
  'active member access context identifies collaborator');
select is(public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->>'access_version','1',
  'access version is a decimal string');
select is((public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->'capabilities'->0->>'key'),
  'places.address','access context includes only effective active capabilities');
select ok(not (public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')::text ~
  'membership_id|invitation_id|owner_user_id|contract_value|PRIVATE'), 'access context omits internal IDs and domain data');
select is(public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->>'membership_id',null,
  'access context does not return membership ID');
select ok(public.get_collaborative_wedding_detail('72000000-0000-4000-8000-000000000001')->>'couple_first_name'='Klara'
  and public.get_collaborative_wedding_detail('72000000-0000-4000-8000-000000000001')->'places'->0->>'formatted_address'='Test venue'
  and public.get_collaborative_wedding_detail('72000000-0000-4000-8000-000000000001')->'places'->0->>'operational_time'='14:30',
  'legacy full snapshot preserves curated detail fields');
select is(public.get_collaborative_wedding_operational_edit_state('72000000-0000-4000-8000-000000000001')->'places'->2->>'formatted_address',
  'Test venue','legacy full snapshot preserves address edit state');
select is((select count(*)::int from public.list_my_collaborative_weddings()),1,
  'legacy list remains a collaboration-only list');
select is(public.get_collaborative_wedding_detail('72000000-0000-4000-8000-000000000002'),null,
  'pending invitation does not create accessible detail');
select is(public.update_collaborative_wedding_place('72000000-0000-4000-8000-000000000001','ceremony','Test venue','1')->>'changed','false',
  'address same-value retry remains idempotent');
reset role;

delete from collaboration_private.membership_permission_grants
where membership_id=current_setting('test.onece_membership_id')::uuid and capability_key='places.address';
insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
values (current_setting('test.onece_membership_id')::uuid,'places.structure',2);
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.update_collaborative_wedding_place('72000000-0000-4000-8000-000000000001','ceremony','Forbidden','1')$$,
  'P0001','FORBIDDEN','missing Custom address grant denies address mutation');
select ok(public.get_collaborative_wedding_detail('72000000-0000-4000-8000-000000000001')->'places'->0->>'formatted_address' is null,
  'missing Custom address grant hides address from curated detail');
select ok(not (public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')::text ~ 'places.structure'),
  'inactive capability cannot authorize even with a malformed grant row');
reset role;
delete from collaboration_private.membership_permission_grants
where membership_id=current_setting('test.onece_membership_id')::uuid and capability_key='schedule.operational_time';
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.update_collaborative_operational_time('72000000-0000-4000-8000-000000000001','ceremony','15:00','1')$$,
  'P0001','FORBIDDEN','missing Custom operational-time grant denies time mutation');
select ok(not ((public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->'capabilities')::text like '%schedule.operational_time%'),
  'missing Custom operational-time grant resolves to none');
select throws_ok($$select public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000002')$$,
  'P0001','UNAVAILABLE','pending invitee receives unavailable access context');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select is(public.accept_wedding_collaboration_invite('74000000-0000-4000-8000-000000000002',
  '75000000-0000-4000-8000-000000000003')->>'status','accepted',
  'legacy version-0 invitation remains acceptable');
reset role;
select ok((select m.role_key='unspecified' and m.custom_role_label is null
  and m.access_mode='custom' and m.access_version=1
  and (select count(*)=3 from collaboration_private.membership_permission_grants g where g.membership_id=m.id)
  and exists(select 1 from collaboration_private.membership_permission_grants g where g.membership_id=m.id and g.capability_key='wedding.identity' and g.level=1)
  and exists(select 1 from collaboration_private.membership_permission_grants g where g.membership_id=m.id and g.capability_key='places.address' and g.level=2)
  and exists(select 1 from collaboration_private.membership_permission_grants g where g.membership_id=m.id and g.capability_key='schedule.operational_time' and g.level=2)
  from public.wedding_collaboration_memberships m where m.accepted_invitation_id='74000000-0000-4000-8000-000000000002'),
  'legacy acceptance atomically creates the exact three-grant snapshot');
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select is(public.accept_wedding_collaboration_invite('74000000-0000-4000-8000-000000000002',
  '75000000-0000-4000-8000-000000000003')->>'duplicate','true',
  'legacy acceptance replay is idempotent');
reset role;

delete from collaboration_private.membership_permission_grants
where membership_id=(select id from public.wedding_collaboration_memberships
  where accepted_invitation_id='74000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select is(public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000002')->'capabilities','[]'::jsonb,
  'grants on another active membership cannot authorize this wedding');
select ok(public.get_collaborative_wedding_detail('72000000-0000-4000-8000-000000000002')->>'couple_first_name' is null,
  'cross-wedding membership snapshot does not leak identity');
reset role;

update public.wedding_collaboration_memberships set access_mode='viewer'
where id=current_setting('test.onece_membership_id')::uuid;
delete from collaboration_private.membership_permission_grants
where membership_id=current_setting('test.onece_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select is(public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->'capabilities',
  '[{"key":"places.address","level":"view"},{"key":"schedule.operational_time","level":"view"},{"key":"wedding.identity","level":"view"}]'::jsonb,
  'Viewer receives exactly the three frozen active view defaults');
select throws_ok($$select public.update_collaborative_wedding_place('72000000-0000-4000-8000-000000000001','ceremony','No edit','1')$$,
  'P0001','FORBIDDEN','Viewer cannot edit address');
reset role;

update public.wedding_collaboration_memberships set access_mode='editor'
where id=current_setting('test.onece_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select ok((public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->'capabilities')::text like '%places.address%'
  and (public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->'capabilities')::text like '%schedule.operational_time%'
  and not ((public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->'capabilities')::text like '%places.structure%')
  and public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->'capabilities' =
    '[{"key":"places.address","level":"edit"},{"key":"schedule.operational_time","level":"edit"},{"key":"wedding.identity","level":"view"}]'::jsonb,
  'Editor defaults activate only approved capabilities and keep future keys absent');
select ok(public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->'capabilities'
    @> '[{"key":"wedding.identity","level":"view"}]'::jsonb,
  'Editor does not upgrade read-only wedding identity');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select is(public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->>'relationship','owner',
  'owner remains a separate relationship');
select ok(public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->>'access_mode' is null,
  'owner is not represented as Editor');
reset role;

select throws_ok($$select public.get_collaborative_wedding_operational_edit_state('72000000-0000-4000-8000-000000000001')$$,
  'P0001','UNAVAILABLE','owner does not use the collaborator-only operational endpoint');

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')$$,
  'P0001','UNAVAILABLE','unrelated authenticated actor has no access context');
select is(public.get_collaborative_wedding_detail('72000000-0000-4000-8000-000000000001'),null,
  'unrelated actor receives no detail projection');
select throws_ok($$select public.get_collaborative_wedding_operational_edit_state('72000000-0000-4000-8000-000000000001')$$,
  'P0001','UNAVAILABLE','unrelated actor cannot read edit state');
select throws_ok($$select public.update_collaborative_wedding_place('72000000-0000-4000-8000-000000000001','ceremony','No access','1')$$,
  'P0001','UNAVAILABLE','unrelated actor address write is unavailable');
select throws_ok($$select public.update_collaborative_operational_time('72000000-0000-4000-8000-000000000001','ceremony','15:00','1')$$,
  'P0001','UNAVAILABLE','unrelated actor time write is unavailable');
reset role;

update public.collaboration_connections set status='ended',ended_at=pg_catalog.now()
where id='73000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select is(public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')->>'relationship','collaborator',
  'accepted membership remains authoritative after global connection ends');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select is(public.revoke_wedding_collaboration_membership(current_setting('test.onece_membership_id')::uuid,
  '75000000-0000-4000-8000-000000000004')->>'status','revoked','owner revoke lifecycle remains usable');
reset role;
select is((select access_version::text from public.wedding_collaboration_memberships
  where id=current_setting('test.onece_membership_id')::uuid),'2','revoke advances the authorization version');
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000001')$$,
  'P0001','UNAVAILABLE','revoked membership is unavailable despite retained grants');
select is(public.get_collaborative_wedding_detail('72000000-0000-4000-8000-000000000001'),null,
  'revoked membership has no detail projection');
reset role;

select set_config('test.onece_left_membership_id',(select id::text from public.wedding_collaboration_memberships
  where accepted_invitation_id='74000000-0000-4000-8000-000000000002'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select is(public.leave_wedding_collaboration(current_setting('test.onece_left_membership_id')::uuid,
  '75000000-0000-4000-8000-000000000005')->>'status','left','member leave lifecycle remains usable');
reset role;
select is((select access_version::text from public.wedding_collaboration_memberships
  where accepted_invitation_id='74000000-0000-4000-8000-000000000002'),'2','leave advances the authorization version');
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_my_wedding_access_context('72000000-0000-4000-8000-000000000002')$$,
  'P0001','UNAVAILABLE','left membership is unavailable');
reset role;

select finish();
rollback;
