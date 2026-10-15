begin;
select no_plan();

select is((select count(*)::int from collaboration_private.capability_registry),15,
  'H1 adds only place-name and inactive Plan Day capabilities');
select is((select level::int from collaboration_private.permission_mapping_defaults
  where mapping_version='1' and access_mode='editor' and capability_key='places.name'),0,
  'v1 editor mapping has no place-name authority');
select is((select level::int from collaboration_private.permission_mapping_defaults
  where mapping_version='2' and access_mode='editor' and capability_key='places.name'),2,
  'v2 editor mapping separates place-name edit');
select is((select count(*)::int from collaboration_private.capability_dependencies),2,
  'only the frozen Plan Day and identity parent dependencies exist');
select throws_ok($$insert into collaboration_private.capability_dependencies
  (child_capability_key,parent_capability_key,required_parent_level,minimum_mapping_version)
  values('wedding.identity','places.name',1,'2')$$,
  '23514','capability_dependency_cycle','capability dependency cycles are rejected');
select ok(not (select active from collaboration_private.capability_registry where capability_key='prewedding.plan_day'),
  'Plan Day remains inactive; H1 does not activate questionnaire access');
select ok(not has_table_privilege('authenticated','collaboration_private.permission_mapping_defaults','select')
  and not has_table_privilege('authenticated','collaboration_private.capability_dependencies','select')
  and not has_table_privilege('authenticated','collaboration_private.capability_dependencies','insert'),
  'mapping and dependency metadata are private');
select is((select count(*)::int from collaboration_private.permission_presets where scope='system'),2,
  'both historical system presets remain intact');
select is((select count(*)::int from collaboration_private.permission_preset_grants g
  join collaboration_private.permission_presets p on p.id=g.preset_id where p.scope='system'),6,
  'historical system preset grant snapshots are unchanged');
select ok((select bool_and(permission_group_mapping_version='1') from collaboration_private.permission_presets
  where scope='system'),'historical preset mapping versions remain v1');
select ok(has_function_privilege('authenticated','public.list_my_workspace_weddings(date,uuid,integer,text)','execute')
  and not has_function_privilege('anon','public.list_my_workspace_weddings(date,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.get_wedding_collaboration_invitation_decision(uuid)','execute')
  and not has_function_privilege('anon','public.get_wedding_collaboration_invitation_decision(uuid)','execute')
  and has_function_privilege('authenticated','public.update_collaborative_wedding_place_name(uuid,text,text,text)','execute')
  and not has_function_privilege('anon','public.update_collaborative_wedding_place_name(uuid,text,text,text)','execute'),
  'new read and write RPCs are authenticated-only');
select ok(not has_function_privilege('authenticated','public.create_collaboration_permission_preset_v2(text,text,jsonb)','execute')
  and not has_function_privilege('anon','public.create_collaboration_permission_preset_v2(text,text,jsonb)','execute')
  and not has_function_privilege('service_role','public.create_collaboration_permission_preset_v2(text,text,jsonb)','execute')
  and not exists(select 1 from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where p.oid='public.create_collaboration_permission_preset_v2(text,text,jsonb)'::regprocedure
      and a.grantee=0 and a.privilege_type='EXECUTE')
  and has_function_privilege('authenticated','public.create_collaboration_permission_preset(text,text,jsonb)','execute'),
  'authenticated preset creation remains v1-only until the full 1C-G contract is version-aware');
select ok(not has_function_privilege('anon','public.migrate_wedding_collaboration_membership_to_v2(uuid,uuid,text)','execute')
  and not has_function_privilege('authenticated','public.migrate_wedding_collaboration_membership_to_v2(uuid,uuid,text)','execute')
  and not has_function_privilege('service_role','public.migrate_wedding_collaboration_membership_to_v2(uuid,uuid,text)','execute')
  and not exists(select 1 from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where p.oid='public.migrate_wedding_collaboration_membership_to_v2(uuid,uuid,text)'::regprocedure
      and a.grantee=0 and a.privilege_type='EXECUTE'),
  'v1-to-v2 migration is not executable by PUBLIC, anon, authenticated, or service_role');
select ok(not has_table_privilege('authenticated','public.wedding_collaboration_memberships','UPDATE')
  and not has_table_privilege('authenticated','public.wedding_collaboration_invitations','UPDATE')
  and not exists(select 1 from pg_catalog.pg_proc p
    where p.pronamespace='public'::regnamespace
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
      and p.oid<>'public.migrate_wedding_collaboration_membership_to_v2(uuid,uuid,text)'::regprocedure
      and p.prosrc ilike '%migrate_wedding_collaboration_membership_to_v2%'),
  'no direct authenticated table update or callable wrapper exposes v2 migration');
select ok(not exists(select 1 from pg_catalog.pg_policy where polrelid in
  ('public.weddings'::regclass,'public.wedding_places'::regclass,'public.wedding_operational_times'::regclass)
  and polname ilike '%collab%'),'H1 does not widen core wedding or child RLS');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,
  raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000001','authenticated','authenticated','1ch1-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000002','authenticated','authenticated','1ch1-member@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000003','authenticated','authenticated','1ch1-outsider@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());

insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status)
values ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Owner','Wedding','2027-08-01','active'),
 ('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','Shared','Wedding','2027-08-02','active'),
 ('a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','Pending','Wedding','2027-08-03','active'),
 ('a2000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000003','Other','Tenant','2027-08-04','active');
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status)
values ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002','Owner','Member','active');
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status)
values ('a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000003','Owner','Outsider','active');
insert into public.wedding_collaboration_invitations(id,wedding_id,wedding_id_snapshot,owner_user_id,invitee_user_id,
  source_connection_id,status,terms_version,couple_first_name_snapshot,couple_second_name_snapshot,wedding_date_snapshot,
  package_label_snapshot,contract_value_snapshot,currency_snapshot,proposed_share_amount,terms_snapshot,idempotency_key,accepted_at)
values ('a4000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000001',
  'accepted',1,'Shared','Wedding','2027-08-02','PRIVATE PACKAGE',50000,'PLN',500,'{}','a5000000-0000-4000-8000-000000000001',now()),
 ('a4000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000001',
  'pending',1,'Pending','Wedding','2027-08-03','PRIVATE PACKAGE',70000,'PLN',0,'{}','a5000000-0000-4000-8000-000000000002',null),
 ('a4000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000001',
  'accepted',1,'Pending','Wedding','2027-08-03','PRIVATE PACKAGE',70000,'PLN',0,'{}','a5000000-0000-4000-8000-000000000003',now());
insert into public.wedding_collaboration_memberships(wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,
  accepted_invitation_id,status,accepted_at)
values ('a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',
  'a4000000-0000-4000-8000-000000000001','active',now());
insert into public.wedding_collaboration_memberships(wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,
  accepted_invitation_id,status,accepted_at,revoked_at)
values ('a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',
  'a4000000-0000-4000-8000-000000000003','revoked',now(),now());
update public.weddings set ceremony_time='15:30' where id='a2000000-0000-4000-8000-000000000002';
insert into public.wedding_places(id,wedding_id,role,label,place_id,formatted_address,latitude,longitude,sort_order)
values ('a6000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','ceremony','Initial venue','place-1','Private address',52.1,21.0,20);
insert into public.wedding_operational_times(wedding_id,stop_key,operational_time)
values ('a2000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000001','09:05');
select set_config('test.h1_membership_id',(select id::text from public.wedding_collaboration_memberships
  where accepted_invitation_id='a4000000-0000-4000-8000-000000000001'),true);
insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
values (current_setting('test.h1_membership_id')::uuid,'wedding.identity',1),
  (current_setting('test.h1_membership_id')::uuid,'places.address',2),
  (current_setting('test.h1_membership_id')::uuid,'schedule.operational_time',2)
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.list_my_workspace_weddings(null,null,50,'owned')),3,
  'owner projection includes only the owner’s active weddings');
select is((select ownership_kind from public.list_my_workspace_weddings(null,null,50,'all')
  where wedding_id='a2000000-0000-4000-8000-000000000001'),'owned','owner rows are attributed as owned');
select is((select wedding_id::text from public.list_my_workspace_weddings(null,null,1,'owned')),
  'a2000000-0000-4000-8000-000000000001','workspace order is date/UUID deterministic and page size is honored');
select is((select count(*)::int from public.list_my_workspace_weddings('2027-08-01','a2000000-0000-4000-8000-000000000001',1,'owned')),1,
  'date/id keyset cursor advances to the next owner wedding');
select is((select count(*)::int from public.list_my_workspace_weddings(null,null,50,'shared')),0,
  'owner does not see another tenant wedding as a shared row');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select ok(public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->>'relationship'='collaborator',
  'accepted member resolves actor access context');
select is((select count(*)::int from public.list_my_workspace_weddings(null,null,50,'shared')),1,
  'active accepted identity-view membership is workspace eligible');
select ok((public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities')
    @> '[{"key":"schedule.operational_time","level":"edit"}]'::jsonb,
  'v1 Custom operational-time edit remains effective with inactive Plan Day');
select is((public.get_collaborative_wedding_detail('a2000000-0000-4000-8000-000000000002')->'places'->0->>'operational_time'),
  '09:05','released v1 curated detail retains authorized operational time');
select is((public.get_collaborative_wedding_operational_edit_state('a2000000-0000-4000-8000-000000000002')->'places'->2->>'effective_operational_time'),
  '09:05','released v1 edit-state retains authorized operational time');
select is(public.update_collaborative_operational_time('a2000000-0000-4000-8000-000000000002','ceremony','09:15','1')->>'time_version',
  '2','released v1 operational-time write succeeds without Plan Day activation');
select is((public.get_collaborative_wedding_operational_edit_state('a2000000-0000-4000-8000-000000000002')->'places'->2->>'effective_operational_time'),
  '09:15','released v1 edit-state reflects the successful time write');
select is((select count(*)::int from public.list_my_workspace_weddings(null,null,50,'shared')
  where wedding_id='a2000000-0000-4000-8000-000000000003'),0,
  'revoked membership is not workspace eligible');
select ok((select owner_display_name is not null from public.list_my_workspace_weddings(null,null,50,'shared')
  where wedding_id='a2000000-0000-4000-8000-000000000002'),
  'shared projection contains owner attribution');
select is((select permission_group_mapping_version from public.list_my_workspace_weddings(null,null,50,'shared')
  where wedding_id='a2000000-0000-4000-8000-000000000002'),'1','accepted v1 mapping is exposed as text');
select ok(not ((select to_jsonb(w) from public.list_my_workspace_weddings(null,null,50,'shared') w) ?| array[
  'phone','email','contract_value','package_label','payments','tasks','notes','questionnaire','travel_coordinates']),
  'shared workspace JSON has no owner-private fields');
select is((select array_agg(key order by key)::text[] from jsonb_object_keys(
  (select to_jsonb(w) from public.list_my_workspace_weddings(null,null,50,'shared') w limit 1)) as keys(key)),
  array['access_version','couple_first_name','couple_second_name','effective_capabilities','membership_id',
    'owner_display_name','ownership_kind','permission_group_mapping_version','wedding_date','wedding_id']::text[],
  'shared workspace DTO has exactly its documented allowlist');
select is((select array_agg(key order by key)::text[] from jsonb_object_keys(
  public.get_wedding_collaboration_invitation_decision('a4000000-0000-4000-8000-000000000001')) as keys(key)),
  array['accepted_at','cancelled_at','couple_first_name','couple_second_name','created_at','currency','declined_at',
    'expired_at','expires_at','invitation_id','inviter_display_name','membership_status',
    'permission_group_mapping_version','proposed_share_amount','reason','status','superseded_at','wedding_date']::text[],
  'recipient decision DTO has exactly its documented minimal allowlist');
select is((public.get_wedding_collaboration_invitation_decision('a4000000-0000-4000-8000-000000000001')->>'contract_value'),null,
  'recipient decision projection omits contract value');
select is((public.get_wedding_collaboration_invitation_decision('a4000000-0000-4000-8000-000000000001')->>'package_label'),null,
  'recipient decision projection omits package');
select ok(not (public.get_wedding_collaboration_invitation_decision('a4000000-0000-4000-8000-000000000001') ?| array[
  'wedding_price','payments','deposit','extras','contract_value_snapshot','package_label_snapshot']),
  'recipient decision projection excludes owner price, payment, deposit, extras and stored commercial snapshots');
select is((public.get_wedding_collaboration_invitation_decision('a4000000-0000-4000-8000-000000000001')->>'proposed_share_amount'),'500.00',
  'recipient decision projection retains only recipient proposal amount');
select is((select count(*)::int from public.list_my_workspace_weddings(null,null,50,'all')
  where wedding_id='a2000000-0000-4000-8000-000000000003'),0,'pending invitation is not workspace eligible');
reset role;

update public.collaboration_connections set status='ended',ended_at=now() where id='a3000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.list_my_workspace_weddings(null,null,50,'shared')),1,
  'ending the global connection does not remove an accepted active membership');
reset role;

-- Legacy Viewer/Editor mappings keep their released operational-time defaults;
-- the v1 mapping never gains H1's place-name capability implicitly.
update public.wedding_collaboration_memberships set access_mode='viewer',role_key='system:photographer'
  where id=current_setting('test.h1_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select ok((public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities')
    @> '[{"key":"schedule.operational_time","level":"view"}]'::jsonb
  and not ((public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities')::text like '%places.name%'),
  'legacy v1 Viewer retains operational-time view with no automatic place-name privilege');
reset role;
update public.wedding_collaboration_memberships set access_mode='editor',role_key='system:photographer'
  where id=current_setting('test.h1_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select ok((public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities')
    @> '[{"key":"schedule.operational_time","level":"edit"}]'::jsonb
  and not ((public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities')::text like '%places.name%'),
  'legacy v1 Editor retains operational-time edit with no automatic place-name privilege');
reset role;

-- Role-only updates retain v1 and the exact Custom snapshot. The internal
-- migration implementation is tested as the database owner, not as an app role.
update public.wedding_collaboration_memberships set access_mode='custom',role_key='unspecified'
  where id=current_setting('test.h1_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select is((public.update_wedding_collaboration_membership_access('a2000000-0000-4000-8000-000000000002',
  current_setting('test.h1_membership_id')::uuid,'1','system:photographer',null,'custom',
  '[{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":2},{"capability_key":"wedding.identity","level":1}]'::jsonb)->'configuration'->>'permission_group_mapping_version'),'1',
  'role-only access edit preserves v1 mapping');
reset role;
select is((select jsonb_agg(jsonb_build_object('capability_key',capability_key,'level',level) order by capability_key)
  from collaboration_private.membership_permission_grants where membership_id=current_setting('test.h1_membership_id')::uuid),
  '[{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":2},{"capability_key":"wedding.identity","level":1}]'::jsonb,
  'role-only access edit preserves the exact v1 grant snapshot');
set local role authenticated;
select is((public.get_collaborative_wedding_detail('a2000000-0000-4000-8000-000000000002')->'places'->0->>'name'),null,
  'a missing places.name grant in a v1 snapshot stays none');
select throws_ok($$select public.migrate_wedding_collaboration_membership_to_v2('a2000000-0000-4000-8000-000000000002',
  current_setting('test.h1_membership_id')::uuid,'2')$$::text,
  '42501'::character(5),null::text,'authenticated owner cannot invoke the v1-to-v2 migration');
reset role;
-- Internal owner execution keeps the future migration implementation testable
-- without granting the current application role access to it.
select is((public.migrate_wedding_collaboration_membership_to_v2('a2000000-0000-4000-8000-000000000002',
  current_setting('test.h1_membership_id')::uuid,'2')->>'permission_group_mapping_version'),'2',
  'internal owner execution upgrades the mapping version for foundation tests');
select is((public.migrate_wedding_collaboration_membership_to_v2('a2000000-0000-4000-8000-000000000002',
  current_setting('test.h1_membership_id')::uuid,'3')->>'changed'),'false',
  'repeat internal migration is a no-op at the current version');
select ok((select access_version=3 and role_key='system:photographer'
  and permission_group_mapping_version='2' from public.wedding_collaboration_memberships
  where id=current_setting('test.h1_membership_id')::uuid),
  'explicit mapping migration increments access_version once and preserves role');
update public.wedding_collaboration_memberships set access_mode='viewer'
  where id=current_setting('test.h1_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select is((public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities'),
  '[{"key":"places.address","level":"view"},{"key":"places.name","level":"view"},{"key":"wedding.identity","level":"view"}]'::jsonb,
  'explicitly migrated Viewer gets deterministic v2 place-name view, with operational time gated off');
reset role;
update public.wedding_collaboration_memberships set access_mode='editor'
  where id=current_setting('test.h1_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select is((public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities'),
  '[{"key":"places.address","level":"edit"},{"key":"places.name","level":"edit"},{"key":"wedding.identity","level":"view"}]'::jsonb,
  'explicitly migrated Editor gets deterministic v2 place-name edit, with operational time gated off');
reset role;
update public.wedding_collaboration_memberships set access_mode='custom'
  where id=current_setting('test.h1_membership_id')::uuid;

insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
values (current_setting('test.h1_membership_id')::uuid,'places.name',2);
delete from collaboration_private.membership_permission_grants
  where membership_id=current_setting('test.h1_membership_id')::uuid and capability_key='wedding.identity';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select is((public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities'),
  '[{"key":"places.address","level":"edit"}]'::jsonb,
  'v2 place-name grant stays unreachable without its identity parent grant');
reset role;
insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
values (current_setting('test.h1_membership_id')::uuid,'wedding.identity',1);
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select is((public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities'),
  '[{"key":"places.address","level":"edit"},{"key":"places.name","level":"edit"},{"key":"wedding.identity","level":"view"}]'::jsonb,
  'place-name edit is reachable when its own grant and identity parent are present');
select ok(not (public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities'
  @> '[{"key":"schedule.operational_time","level":"edit"}]'::jsonb),
  'v2 operational-time edit is capped to none while Plan Day is inactive');
select is((public.get_collaborative_wedding_detail('a2000000-0000-4000-8000-000000000002')->'places'->0->>'operational_time'),null,
  'v2 curated detail hides operational time while Plan Day is inactive');
select is((public.get_collaborative_wedding_operational_edit_state('a2000000-0000-4000-8000-000000000002')->'places'->2->>'effective_operational_time'),null,
  'v2 edit-state hides operational time while Plan Day is inactive');
select throws_ok($$select public.update_collaborative_operational_time('a2000000-0000-4000-8000-000000000002','ceremony','09:20','2')$$::text,
  null::character,'FORBIDDEN'::text,'v2 time write is denied while Plan Day is inactive');
reset role;
-- This synthetic v2-only section proves dependency closure without enabling
-- Plan Day for any preceding legacy v1 assertions.
update collaboration_private.capability_registry set active=true,grantable=true,max_custom_level=2
  where capability_key='prewedding.plan_day';
insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
values (current_setting('test.h1_membership_id')::uuid,'prewedding.plan_day',1)
on conflict (membership_id,capability_key) do update set level=excluded.level;
delete from collaboration_private.membership_permission_grants
  where membership_id=current_setting('test.h1_membership_id')::uuid and capability_key='schedule.operational_time';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select ok(not ((public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities')::text
  like '%schedule.operational_time%'),'v2 parent view alone does not imply child access');
reset role;
insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
values (current_setting('test.h1_membership_id')::uuid,'schedule.operational_time',1)
on conflict (membership_id,capability_key) do update set level=excluded.level;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select ok((public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities')
  @> '[{"key":"schedule.operational_time","level":"view"}]'::jsonb,
  'v2 parent view plus an independent child view grant exposes only child view');
select throws_ok($$select public.update_collaborative_operational_time('a2000000-0000-4000-8000-000000000002','ceremony','09:25','2')$$::text,
  null::character,'FORBIDDEN'::text,'v2 parent view and child view do not authorize a time edit');
reset role;
update collaboration_private.membership_permission_grants set level=2
where membership_id=current_setting('test.h1_membership_id')::uuid and capability_key='schedule.operational_time';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select ok((public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities')
  @> '[{"key":"schedule.operational_time","level":"edit"}]'::jsonb,
  'v2 parent view plus child edit grant resolves child edit');
select is(public.update_collaborative_operational_time('a2000000-0000-4000-8000-000000000002','ceremony','09:25','2')->>'time_version',
  '3','v2 operational-time write succeeds after parent and child edit are both present');
reset role;
update collaboration_private.capability_registry set active=false,grantable=false,max_custom_level=0
  where capability_key='prewedding.plan_day';
delete from collaboration_private.membership_permission_grants
  where membership_id=current_setting('test.h1_membership_id')::uuid and capability_key='prewedding.plan_day';
update collaboration_private.membership_permission_grants set level=1
where membership_id=current_setting('test.h1_membership_id')::uuid and capability_key='places.name';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select ok((public.get_my_wedding_access_context('a2000000-0000-4000-8000-000000000002')->'capabilities'
  @> '[{"key":"places.name","level":"view"}]'::jsonb),'place-name view is distinct from edit');
select is((public.get_collaborative_wedding_detail('a2000000-0000-4000-8000-000000000002')->'places'->0->>'name'),'Initial venue',
  'place name view returns only the existing name');
select throws_ok($$select public.update_collaborative_wedding_place_name('a2000000-0000-4000-8000-000000000002','ceremony','View cannot rename','1')$$::text,
  null::character,'FORBIDDEN'::text,'place-name view cannot rename a place');
reset role;
update collaboration_private.membership_permission_grants set level=2
where membership_id=current_setting('test.h1_membership_id')::uuid and capability_key='places.name';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select is((public.get_collaborative_wedding_detail('a2000000-0000-4000-8000-000000000002')->'places'->0->>'name'),'Initial venue',
  'place name edit continues to read the existing name');
select is((public.get_collaborative_wedding_detail('a2000000-0000-4000-8000-000000000002')->'places'->0->>'formatted_address'),
  'Private address','the existing independent address grant remains visible');
select is((public.get_collaborative_wedding_detail('a2000000-0000-4000-8000-000000000002')->'places'->0->>'operational_time'),null,
  'operational time is absent while canonical parent is unavailable');
select is(public.update_collaborative_wedding_place_name('a2000000-0000-4000-8000-000000000002','ceremony','Renamed venue','1')->>'name',
  'Renamed venue','name RPC updates an existing place row under places.name edit');
select ok(not has_table_privilege('authenticated','public.wedding_places','update'),
  'direct collaborator place table mutation remains denied by table ACL');
reset role;
select is((select formatted_address from public.wedding_places where wedding_id='a2000000-0000-4000-8000-000000000002' and role='ceremony'),
  'Private address','name RPC preserves address');
select ok((select row(place_id,latitude,longitude,sort_order)=
  row('place-1'::text,52.1::double precision,21.0::double precision,20) from public.wedding_places
  where wedding_id='a2000000-0000-4000-8000-000000000002' and role='ceremony'),
  'name RPC preserves place id, coordinates and ordering');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.update_collaborative_wedding_place_name('a2000000-0000-4000-8000-000000000002','ceremony','Stale','1')$$::text,
  null::character,'CONFLICT'::text,'stale place-name version is rejected');
reset role;
select is((select version::text from collaboration_private.wedding_operational_versions
  where wedding_id='a2000000-0000-4000-8000-000000000002' and resource_type='place_name' and role='ceremony'),'2',
  'place-name version remains a decimal string and increments once');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.list_my_workspace_weddings(null,null,50,'shared')),1,
  'shared workspace remains available after name mutation');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
select is((select count(*)::int from public.list_my_workspace_weddings(null,null,50,'shared')),0,
  'globally connected user without an accepted wedding membership sees no shared rows');
select throws_ok($$select public.update_collaborative_wedding_place_name('a2000000-0000-4000-8000-000000000002','ceremony','IDOR','2')$$::text,
  null::character,'UNAVAILABLE'::text,'place-name RPC denies an unrelated connected tenant');
select is(public.get_wedding_collaboration_invitation_decision('a4000000-0000-4000-8000-000000000001'),null::jsonb,
  'invitation decision projection is invitee-bound');
reset role;

select ok(not has_table_privilege('authenticated','public.wedding_places','update')
  or not exists(select 1 from pg_catalog.pg_policy where polrelid='public.wedding_places'::regclass
    and polname ilike '%collab%'),'H1 adds no direct collaborator table path');
select ok(not has_function_privilege('anon','migrate_wedding_collaboration_membership_to_v2(uuid,uuid,text)','execute')
  and not has_function_privilege('authenticated','migrate_wedding_collaboration_membership_to_v2(uuid,uuid,text)','execute')
  and not has_function_privilege('service_role','migrate_wedding_collaboration_membership_to_v2(uuid,uuid,text)','execute')
  and not exists(select 1 from pg_catalog.pg_proc p cross join lateral
    pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where p.oid='public.migrate_wedding_collaboration_membership_to_v2(uuid,uuid,text)'::regprocedure
      and a.grantee=0 and a.privilege_type='EXECUTE')
  and not has_function_privilege('authenticated','collaboration_private.raw_wedding_capability_level(uuid,text)','execute')
  and not has_function_privilege('authenticated','collaboration_private.owner_access_preview_for_mapping(text,text,jsonb)','execute'),
  'private helpers and application-facing migration are not client executable');
select * from finish();
rollback;
