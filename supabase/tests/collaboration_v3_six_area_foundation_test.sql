begin;
select no_plan();

select is(collaboration_private.normalize_area_access('viewer',null),
  '{"logistics":1,"prewedding":1,"contacts":1,"tasks":1,"notes":1,"compensation":0}'::jsonb,
  'Viewer has the exact six-area snapshot');
select is(collaboration_private.normalize_area_access('editor',null),
  '{"logistics":2,"prewedding":2,"contacts":2,"tasks":2,"notes":2,"compensation":0}'::jsonb,
  'Editor has the exact six-area snapshot');
select throws_ok($$select collaboration_private.normalize_area_access('custom','{"logistics":1}'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'incomplete Custom is rejected');
select throws_ok($$select collaboration_private.normalize_area_access('custom','{"logistics":0,"prewedding":1,"contacts":2,"tasks":0,"notes":1,"compensation":2,"identity":1}'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'unknown seventh area is rejected');
select throws_ok($$select collaboration_private.normalize_area_access('custom','{"logistics":3,"prewedding":1,"contacts":2,"tasks":0,"notes":1,"compensation":2}'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'levels outside 0/1/2 are rejected');
select throws_ok($$select collaboration_private.normalize_area_access(null,'{}'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'null access mode is rejected');
select is(collaboration_private.normalize_area_access('custom',
  '{"logistics":0,"prewedding":1,"contacts":2,"tasks":0,"notes":1,"compensation":2}'::jsonb),
  '{"logistics":0,"prewedding":1,"contacts":2,"tasks":0,"notes":1,"compensation":2}'::jsonb,
  'all six explicit Custom values are retained');
select ok((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
  where table_schema='collaboration_private' and table_name='membership_area_access'
    and column_name in ('logistics','prewedding','contacts','tasks','notes','compensation')) =
  array['logistics','prewedding','contacts','tasks','notes','compensation'],
  'membership storage exposes exactly the six fixed area columns');
select ok(not exists(select 1 from information_schema.columns
  where table_schema='collaboration_private' and table_name='membership_area_access'
    and column_name not in ('membership_id','logistics','prewedding','contacts','tasks','notes','compensation','created_at','updated_at')),
  'membership storage has no arbitrary capability column');

select is((select public.get_collaboration_permission_preset_v3(id)->'areas'
  from collaboration_private.permission_presets where system_key='collaboration_viewer_v3'),
  '{"logistics":1,"prewedding":1,"contacts":1,"tasks":1,"notes":1,"compensation":0}'::jsonb,
  'system Viewer preset is exact');
select is((select public.get_collaboration_permission_preset_v3(id)->'areas'
  from collaboration_private.permission_presets where system_key='collaboration_editor_v3'),
  '{"logistics":2,"prewedding":2,"contacts":2,"tasks":2,"notes":2,"compensation":0}'::jsonb,
  'system Editor preset is exact');
select is((select permission_group_mapping_version from collaboration_private.permission_presets
  where system_key='collaboration_viewer_v3'),'3','system preset mapping is v3');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','b8100000-0000-4000-8000-000000000001','authenticated','authenticated','v3-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','b8100000-0000-4000-8000-000000000002','authenticated','authenticated','v3-member@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','b8100000-0000-4000-8000-000000000003','authenticated','authenticated','v3-outsider@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());
insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status) values
 ('b8200000-0000-4000-8000-000000000001','b8100000-0000-4000-8000-000000000001','V3','Viewer','2027-08-01','active'),
 ('b8200000-0000-4000-8000-000000000002','b8100000-0000-4000-8000-000000000001','V3','Editor','2027-08-02','active'),
 ('b8200000-0000-4000-8000-000000000003','b8100000-0000-4000-8000-000000000001','V3','Custom','2027-08-03','active'),
 ('b8200000-0000-4000-8000-000000000004','b8100000-0000-4000-8000-000000000001','V3','Inactive','2027-08-04','archived');
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status) values
 ('b8300000-0000-4000-8000-000000000001','b8100000-0000-4000-8000-000000000001','b8100000-0000-4000-8000-000000000002','V3 Owner','V3 Member','active'),
 ('b8300000-0000-4000-8000-000000000002','b8100000-0000-4000-8000-000000000001','b8100000-0000-4000-8000-000000000003','V3 Owner','V3 Outsider','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','b8100000-0000-4000-8000-000000000001',true);
select is(public.create_wedding_collaboration_invitation_v3(
  'b8200000-0000-4000-8000-000000000001','b8300000-0000-4000-8000-000000000001',null,'b8500000-0000-4000-8000-000000000001',
  'system:photographer',null,'viewer',null)->>'mapping_version','3','Viewer invite is created as mapping v3');
select is(public.create_wedding_collaboration_invitation_v3(
  'b8200000-0000-4000-8000-000000000002','b8300000-0000-4000-8000-000000000001',null,'b8500000-0000-4000-8000-000000000002',
  'system:filmmaker',null,'editor',null)->'configured_areas',
  '{"logistics":2,"prewedding":2,"contacts":2,"tasks":2,"notes":2,"compensation":0}'::jsonb,
  'Editor invite stores exact six-area snapshot');
select is(public.create_wedding_collaboration_invitation_v3(
  'b8200000-0000-4000-8000-000000000003','b8300000-0000-4000-8000-000000000001',null,'b8500000-0000-4000-8000-000000000003',
  'custom','Specialist','custom','{"logistics":0,"prewedding":1,"contacts":2,"tasks":0,"notes":1,"compensation":2}'::jsonb)->'configured_areas',
  '{"logistics":0,"prewedding":1,"contacts":2,"tasks":0,"notes":1,"compensation":2}'::jsonb,
  'Custom invitation stores exact six-area snapshot independent of role');
select is(public.create_wedding_collaboration_invitation_v3(
  'b8200000-0000-4000-8000-000000000001','b8300000-0000-4000-8000-000000000001',null,'b8500000-0000-4000-8000-000000000001',
  'system:photographer',null,'viewer',null)->>'duplicate','true','identical V3 invite retry replays idempotently');
select throws_ok($$select public.create_wedding_collaboration_invitation_v3(
  'b8200000-0000-4000-8000-000000000001','b8300000-0000-4000-8000-000000000001',null,'b8500000-0000-4000-8000-000000000001',
  'system:photographer',null,'custom','{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":0}'::jsonb)$$::text,
  null::character,'CONFLICT'::text,'V3 idempotency key cannot be reused with a different six-area request');
reset role;

select ok(not exists(select 1 from collaboration_private.invitation_permission_grants g
  join public.wedding_collaboration_invitations i on i.id=g.invitation_id
  where i.idempotency_key in ('b8500000-0000-4000-8000-000000000001','b8500000-0000-4000-8000-000000000002','b8500000-0000-4000-8000-000000000003')),
  'v3 invitations store no legacy or identity capability grants');
select is((select count(*)::int from collaboration_private.invitation_v3_idempotency
  where idempotency_key in ('b8500000-0000-4000-8000-000000000001','b8500000-0000-4000-8000-000000000002','b8500000-0000-4000-8000-000000000003')),3,
  'exact V3 invitation requests live in private idempotency storage');
select ok(not exists(select 1 from public.wedding_collaboration_events
  where idempotency_key in ('b8500000-0000-4000-8000-000000000001','b8500000-0000-4000-8000-000000000002','b8500000-0000-4000-8000-000000000003')
    and metadata ? 'request_v3'), 'append-only lifecycle events remain unmodified');
select is((select count(*)::int from collaboration_private.invitation_area_access a
  join public.wedding_collaboration_invitations i on i.id=a.invitation_id
  where i.idempotency_key in ('b8500000-0000-4000-8000-000000000001','b8500000-0000-4000-8000-000000000002','b8500000-0000-4000-8000-000000000003')),3,
  'all invitation snapshots have a dedicated v3 area row');
select is((select collaboration_private.area_access_json(logistics,prewedding,contacts,tasks,notes,compensation)
  from collaboration_private.invitation_area_access where invitation_id=(select id from public.wedding_collaboration_invitations
    where idempotency_key='b8500000-0000-4000-8000-000000000001')),
  '{"logistics":1,"prewedding":1,"contacts":1,"tasks":1,"notes":1,"compensation":0}'::jsonb,
  'Viewer invitation snapshot is exact');
select is((select collaboration_private.area_access_json(logistics,prewedding,contacts,tasks,notes,compensation)
  from collaboration_private.invitation_area_access where invitation_id=(select id from public.wedding_collaboration_invitations
    where idempotency_key='b8500000-0000-4000-8000-000000000002')),
  '{"logistics":2,"prewedding":2,"contacts":2,"tasks":2,"notes":2,"compensation":0}'::jsonb,
  'Editor invitation snapshot is exact');
select ok(not has_table_privilege('authenticated','collaboration_private.membership_area_access','select')
  and not has_table_privilege('authenticated','collaboration_private.invitation_area_access','select')
  and not has_table_privilege('authenticated','collaboration_private.preset_area_access','select'),
  'authenticated clients have no raw v3 snapshot table access');
select ok(not exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  where p.oid='collaboration_private.resolve_wedding_area_level(uuid,text)'::regprocedure
    and a.grantee=0 and a.privilege_type='EXECUTE')
  and not has_function_privilege('anon','collaboration_private.resolve_wedding_area_level(uuid,text)','execute')
  and not has_function_privilege('authenticated','collaboration_private.resolve_wedding_area_level(uuid,text)','execute'),
  'internal resolver is not executable by PUBLIC, anon, or authenticated');
select ok(has_function_privilege('authenticated','public.resolve_my_wedding_detail_authority_v3(uuid)','execute')
  and not exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(
    coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where p.oid='public.resolve_my_wedding_detail_authority_v3(uuid)'::regprocedure
      and a.grantee=0 and a.privilege_type='EXECUTE')
  and not has_function_privilege('anon','public.resolve_my_wedding_detail_authority_v3(uuid)','execute'),
  'public authority RPC is authenticated-only');
select ok(not has_table_privilege('authenticated','public.wedding_collaboration_memberships','select')
  and not exists(select 1 from pg_catalog.pg_policy where polrelid in ('public.weddings'::regclass,
    'public.wedding_places'::regclass,'public.wedding_operational_times'::regclass) and polname ilike '%collab%'),
  'V3 adds no direct membership access or core wedding/child RLS policy');

select set_config('request.jwt.claim.sub','b8100000-0000-4000-8000-000000000002',true);
select is(public.accept_wedding_collaboration_invite(
  (select id from public.wedding_collaboration_invitations where idempotency_key='b8500000-0000-4000-8000-000000000001'),
  'b8600000-0000-4000-8000-000000000001')->>'status','accepted','member accepts Viewer invitation through normal lifecycle RPC');
reset role;
select set_config('test.v3_membership_id',(select id::text from public.wedding_collaboration_memberships
  where accepted_invitation_id=(select id from public.wedding_collaboration_invitations
    where idempotency_key='b8500000-0000-4000-8000-000000000001')),true);
select is((select permission_group_mapping_version from public.wedding_collaboration_memberships
  where id=current_setting('test.v3_membership_id')::uuid),'3','acceptance copies mapping version 3');
select is((select logistics::int from collaboration_private.membership_area_access where membership_id=current_setting('test.v3_membership_id')::uuid),1,
  'acceptance copies Viewer logistics level');
select is((select prewedding::int from collaboration_private.membership_area_access where membership_id=current_setting('test.v3_membership_id')::uuid),1,
  'acceptance copies Viewer prewedding level');
select is((select contacts::int from collaboration_private.membership_area_access where membership_id=current_setting('test.v3_membership_id')::uuid),1,
  'acceptance copies Viewer contacts level');
select is((select tasks::int from collaboration_private.membership_area_access where membership_id=current_setting('test.v3_membership_id')::uuid),1,
  'acceptance copies Viewer tasks level');
select is((select notes::int from collaboration_private.membership_area_access where membership_id=current_setting('test.v3_membership_id')::uuid),1,
  'acceptance copies Viewer notes level');
select is((select compensation::int from collaboration_private.membership_area_access where membership_id=current_setting('test.v3_membership_id')::uuid),0,
  'acceptance copies compensation as none');
select is((select count(*)::int from collaboration_private.membership_permission_grants
  where membership_id=current_setting('test.v3_membership_id')::uuid),0,
  'V3 acceptance stores no identity or granular permission row');
select is(collaboration_private.effective_wedding_capability_level('b8200000-0000-4000-8000-000000000001','wedding.identity')::int,1,
  'frozen H3 identity remains invariant without a stored permission row');
select is(collaboration_private.resolve_wedding_area_level('b8200000-0000-4000-8000-000000000001','logistics')::int,1,
  'server resolver returns level 1 for view');
select is(collaboration_private.resolve_wedding_area_level('b8200000-0000-4000-8000-000000000001','compensation')::int,0,
  'server resolver returns level 0 for none');
select throws_ok($$select collaboration_private.resolve_wedding_area_level('b8200000-0000-4000-8000-000000000001','identity')$$::text,
  null::character,'VALIDATION_ERROR'::text,'unknown area key is rejected by resolver');
select is(public.resolve_my_wedding_detail_authority_v3('b8200000-0000-4000-8000-000000000001')->>'kind','shared',
  'V3 authority DTO recognizes accepted active member');
select is(public.resolve_my_wedding_detail_authority_v3('b8200000-0000-4000-8000-000000000001')->>'mapping_version','3',
  'V3 authority DTO mapping version is string 3');
select is(public.resolve_my_wedding_detail_authority_v3('b8200000-0000-4000-8000-000000000001')->>'access_version','1',
  'access version is a decimal string');
select ok(public.resolve_my_wedding_detail_authority_v3('b8200000-0000-4000-8000-000000000001')->'configured_areas' ?&
  array['logistics','prewedding','contacts','tasks','notes','compensation'],
  'authority DTO returns all six configured levels');
select is(public.resolve_my_wedding_detail_authority_v3('b8200000-0000-4000-8000-000000000001')->'effective_areas'->>'compensation','0',
  'authority DTO returns effective compensation none');
select is(public.resolve_my_wedding_detail_authority_v3('b8200000-0000-4000-8000-000000000004')->>'kind','unavailable',
  'inactive wedding authority is unavailable');

set local role authenticated;
select set_config('request.jwt.claim.sub','b8100000-0000-4000-8000-000000000001',true);
select is(public.get_wedding_collaboration_membership_access_management_v3(
  'b8200000-0000-4000-8000-000000000001',current_setting('test.v3_membership_id')::uuid)->>'access_version','1',
  'owner management reads v3 access version');
select is(public.get_wedding_collaboration_membership_access_management_v3(
  'b8200000-0000-4000-8000-000000000001',current_setting('test.v3_membership_id')::uuid)->'configured_areas'->>'logistics','1',
  'owner management returns exact configured area snapshot');
select is(public.update_wedding_collaboration_membership_access_v3(
  'b8200000-0000-4000-8000-000000000001',current_setting('test.v3_membership_id')::uuid,'1',
  'system:assistant',null,'viewer',null)->>'access_version','2','role-only update increments version once');
reset role;
select is((select count(*)::int from collaboration_private.membership_area_access
  where membership_id=current_setting('test.v3_membership_id')::uuid and logistics=1 and compensation=0),1,
  'role-only update preserves the exact Viewer area snapshot');
set local role authenticated;
select set_config('request.jwt.claim.sub','b8100000-0000-4000-8000-000000000001',true);
select is(public.update_wedding_collaboration_membership_access_v3(
  'b8200000-0000-4000-8000-000000000001',current_setting('test.v3_membership_id')::uuid,'2',
  'system:assistant',null,'editor',null)->>'access_version','3','mode Editor save increments version once');
select is(public.get_wedding_collaboration_membership_access_management_v3(
  'b8200000-0000-4000-8000-000000000001',current_setting('test.v3_membership_id')::uuid)->'configured_areas'->>'logistics','2',
  'Editor materializes logistics level 2');
select is(public.get_wedding_collaboration_membership_access_management_v3(
  'b8200000-0000-4000-8000-000000000001',current_setting('test.v3_membership_id')::uuid)->'configured_areas'->>'compensation','0',
  'Editor materializes compensation none');
select is(public.update_wedding_collaboration_membership_access_v3(
  'b8200000-0000-4000-8000-000000000001',current_setting('test.v3_membership_id')::uuid,'3',
  'system:assistant',null,'custom','{"logistics":0,"prewedding":1,"contacts":2,"tasks":0,"notes":1,"compensation":2}'::jsonb)->'configuration'->'configured_areas'->>'compensation','2',
  'Custom save retains exact explicit levels');
select set_config('request.jwt.claim.sub','b8100000-0000-4000-8000-000000000002',true);
reset role;
select is(collaboration_private.resolve_wedding_area_level('b8200000-0000-4000-8000-000000000001','logistics')::int,0,
  'member resolver maps none to 0');
select is(collaboration_private.resolve_wedding_area_level('b8200000-0000-4000-8000-000000000001','prewedding')::int,1,
  'member resolver maps view to 1');
select is(collaboration_private.resolve_wedding_area_level('b8200000-0000-4000-8000-000000000001','contacts')::int,2,
  'member resolver maps edit to 2');
set local role authenticated;
select set_config('request.jwt.claim.sub','b8100000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.update_wedding_collaboration_membership_access_v3(
  'b8200000-0000-4000-8000-000000000001',current_setting('test.v3_membership_id')::uuid,'3',
  'system:assistant',null,'custom','{"logistics":0,"prewedding":1,"contacts":2,"tasks":0,"notes":1}'::jsonb)$$::text,
  null::character,'CONFLICT'::text,'stale membership version returns CONFLICT');
select throws_ok($$select public.update_wedding_collaboration_membership_access_v3(
  'b8200000-0000-4000-8000-000000000001',current_setting('test.v3_membership_id')::uuid,'4',
  'system:assistant',null,'custom','{"logistics":0,"prewedding":1,"contacts":2,"tasks":0,"notes":1}'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'incomplete Custom management save is rejected');
reset role;
select is((select access_version::text from public.wedding_collaboration_memberships
  where id=current_setting('test.v3_membership_id')::uuid),'4','failed stale/malformed writes do not advance version');
set local role authenticated;
select set_config('request.jwt.claim.sub','b8100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_wedding_collaboration_membership_access_management_v3(
  'b8200000-0000-4000-8000-000000000001',current_setting('test.v3_membership_id')::uuid)$$::text,
  null::character,'FORBIDDEN'::text,'non-owner cannot read management DTO');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','b8100000-0000-4000-8000-000000000003',true);
select is(public.resolve_my_wedding_detail_authority_v3('b8200000-0000-4000-8000-000000000001')->>'kind','unavailable',
  'unrelated actor receives unavailable authority');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','b8100000-0000-4000-8000-000000000001',true);
select set_config('test.v3_preset_id',(public.create_collaboration_permission_preset_v3('QA Custom',null,
  '{"logistics":0,"prewedding":1,"contacts":2,"tasks":0,"notes":1,"compensation":2}'::jsonb)->>'preset_id'),true);
select is(public.get_collaboration_permission_preset_v3(current_setting('test.v3_preset_id')::uuid)->>'mapping_version','3',
  'user preset stores mapping version 3');
select is(public.get_collaboration_permission_preset_v3(current_setting('test.v3_preset_id')::uuid)->'areas'->>'contacts','2',
  'user preset retains exact six-area snapshot');
select is(public.duplicate_collaboration_permission_preset_v3(current_setting('test.v3_preset_id')::uuid,'QA Custom Copy','QA description')->'areas'->>'compensation','2',
  'duplicate copies the exact six-area snapshot');
select is(public.archive_collaboration_permission_preset_v3(current_setting('test.v3_preset_id')::uuid,'1')->>'archived','true',
  'user preset archive preserves existing behavior');
select throws_ok($$select public.update_collaboration_permission_preset_v3(
  ((select value->>'preset_id' from jsonb_array_elements(public.list_collaboration_permission_presets_v3())
     where value->>'name'='Podgląd')::uuid),'1','Changed',null,
  '{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":0}'::jsonb)$$::text,
  null::character,'FORBIDDEN'::text,'system preset mutation is denied');
select set_config('request.jwt.claim.sub','b8100000-0000-4000-8000-000000000003',true);
select set_config('test.v3_outsider_preset_id',(public.create_collaboration_permission_preset_v3('Outsider Custom',null,
  '{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":0}'::jsonb)->>'preset_id'),true);
select set_config('request.jwt.claim.sub','b8100000-0000-4000-8000-000000000001',true);
select throws_ok(format('select public.get_collaboration_permission_preset_v3(%L::uuid)',
  current_setting('test.v3_outsider_preset_id')),
  null::character,'UNAVAILABLE'::text,'other user preset is unavailable');
reset role;

select ok(not exists(select 1 from public.wedding_collaboration_memberships m
  join collaboration_private.membership_area_access a on a.membership_id=m.id
  where m.id=current_setting('test.v3_membership_id')::uuid
    and (a.logistics<>0 or a.prewedding<>1 or a.contacts<>2 or a.tasks<>0 or a.notes<>1 or a.compensation<>2)),
  'preset create/duplicate/archive does not mutate membership authority');
select is((select count(*)::int from collaboration_private.preset_area_access a
  join collaboration_private.permission_presets p on p.id=a.preset_id
  where p.scope='user' and p.owner_user_id in ('b8100000-0000-4000-8000-000000000001','b8100000-0000-4000-8000-000000000003')
    and p.name in ('QA Custom','QA Custom Copy','Outsider Custom')),3,
  'archiving a preset retains its historical area snapshot');
select ok(not exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  where p.oid='public.update_wedding_collaboration_membership_access_v3(uuid,uuid,text,text,text,text,jsonb)'::regprocedure
    and a.grantee=0 and a.privilege_type='EXECUTE')
  and not has_function_privilege('anon','public.update_wedding_collaboration_membership_access_v3(uuid,uuid,text,text,text,text,jsonb)','execute')
  and has_function_privilege('authenticated','public.update_wedding_collaboration_membership_access_v3(uuid,uuid,text,text,text,text,jsonb)','execute'),
  'membership update RPC has authenticated-only execute ACL');
select ok(not exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  where p.oid='public.create_collaboration_permission_preset_v3(text,text,jsonb)'::regprocedure and a.grantee=0
    and a.privilege_type='EXECUTE'), 'preset create RPC has no PUBLIC execute ACL');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc
  where oid='public.resolve_my_wedding_detail_authority_v3(uuid)'::regprocedure),
  'authority RPC is SECURITY DEFINER with pinned empty search_path');
select is((select count(*)::int from public.wedding_collaboration_events
  where membership_id=current_setting('test.v3_membership_id')::uuid
    and event_type in ('role_changed','access_mode_changed','permissions_changed')),3,
  'membership role, mode and area updates are audited');
update public.wedding_collaboration_memberships set status='revoked',revoked_at=now()
  where id=current_setting('test.v3_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','b8100000-0000-4000-8000-000000000002',true);
select is(public.resolve_my_wedding_detail_authority_v3('b8200000-0000-4000-8000-000000000001')->>'kind','unavailable',
  'revoked membership is unavailable to the member');
reset role;
select is(collaboration_private.resolve_wedding_area_level('b8200000-0000-4000-8000-000000000001','contacts'),null::smallint,
  'revoked membership has no server area authority');

select * from finish();
rollback;
