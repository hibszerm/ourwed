begin;
select no_plan();

select is((select max_custom_level::int from collaboration_private.capability_registry where capability_key='wedding.identity'),1,
  'identity Custom maximum is read only');
select is((select max_custom_level::int from collaboration_private.capability_registry where capability_key='places.address'),2,
  'address Custom maximum allows edit');
select is((select max_custom_level::int from collaboration_private.capability_registry where capability_key='schedule.operational_time'),2,
  'operational-time Custom maximum allows edit');
select is((select count(*)::int from collaboration_private.capability_registry where not active and max_custom_level=0),10,
  'all ten inactive capabilities remain fail-closed');
select ok(not has_table_privilege('authenticated','collaboration_private.capability_registry','select')
  and not has_table_privilege('authenticated','collaboration_private.membership_permission_grants','select')
  and not has_table_privilege('authenticated','collaboration_private.invitation_permission_grants','select'),
  'private authority tables remain inaccessible');
select ok(not has_function_privilege('authenticated','collaboration_private.validate_owner_access_configuration(text,text,text,jsonb)','execute')
  and has_function_privilege('authenticated','public.create_wedding_collaboration_invitation_configured(uuid,uuid,numeric,uuid,text,text,text,jsonb)','execute')
  and has_function_privilege('authenticated','public.get_wedding_collaboration_access_previews(uuid)','execute')
  and not has_function_privilege('anon','public.create_wedding_collaboration_invitation_configured(uuid,uuid,numeric,uuid,text,text,text,jsonb)','execute')
  and not has_function_privilege('anon','public.get_wedding_collaboration_access_previews(uuid)','execute'),
  'new helper stays private and configured create is authenticated only');
select ok(not exists(select 1 from pg_catalog.pg_policy where polrelid in
  ('public.weddings'::regclass,'public.wedding_places'::regclass,'public.wedding_operational_times'::regclass)
  and polname ilike '%collab%'),'1C-F adds no core-table collaboration policies');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,
  raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000001','authenticated','authenticated','1cf-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000002','authenticated','authenticated','1cf-member@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000003','authenticated','authenticated','1cf-outsider@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());
insert into public.weddings(id,user_id,bride_name,groom_name,status)
values ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','A','B','active'),
       ('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','C','D','active'),
       ('82000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001','E','F','active'),
       ('82000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000001','G','H','active'),
       ('82000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000001','I','J','active'),
       ('82000000-0000-4000-8000-000000000006','81000000-0000-4000-8000-000000000003','K','L','active'),
       ('82000000-0000-4000-8000-000000000007','81000000-0000-4000-8000-000000000001','M','N','active');
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status)
values ('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','Owner','Member','active');
insert into public.wedding_collaboration_invitations(id,wedding_id,wedding_id_snapshot,owner_user_id,invitee_user_id,
 source_connection_id,status,terms_version,currency_snapshot,terms_snapshot,idempotency_key,accepted_at)
values ('84000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',
 '81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000001',
 'accepted',1,'PLN','{}','85000000-0000-4000-8000-000000000001',now()),
 ('84000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000003',
 '81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000001',
 'pending',1,'PLN','{}','85000000-0000-4000-8000-000000000002',null);
insert into public.wedding_collaboration_memberships(wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,
 accepted_invitation_id,status,accepted_at)
values ('82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',
 '81000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000001','active',now());
select set_config('test.onecf_membership_id',(select id::text from public.wedding_collaboration_memberships
  where accepted_invitation_id='84000000-0000-4000-8000-000000000001'),true);

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is(public.get_wedding_collaboration_membership_access_management('82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid)->>'access_version','1',
  'owner reads active membership management DTO with decimal version text');
select ok(not (public.get_wedding_collaboration_membership_access_management('82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid) ? 'source_connection_id'),
  'owner DTO excludes private source connection ID');
select is(jsonb_array_length(public.get_wedding_collaboration_access_previews('82000000-0000-4000-8000-000000000001')->'viewer_preview'),3,
  'owner receives the three current server-computed Viewer defaults for new invites');
select is(public.get_wedding_collaboration_access_previews('82000000-0000-4000-8000-000000000001')->>'permission_group_mapping_version','1',
  'new-invitation access preview is versioned and curated');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_wedding_collaboration_membership_access_management('82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid)$$::text,
  null::character,'FORBIDDEN'::text,'active collaborator cannot read owner management DTO');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.get_wedding_collaboration_membership_access_management('82000000-0000-4000-8000-000000000002',current_setting('test.onecf_membership_id')::uuid)$$::text,
  null::character,'UNAVAILABLE'::text,'cross-wedding membership ID is unavailable');
select throws_ok($$select public.get_wedding_collaboration_invitation_access_management(
  '82000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000002')$$::text,
  null::character,'UNAVAILABLE'::text,'cross-wedding invitation ID is unavailable');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.get_wedding_collaboration_membership_access_management(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid)$$::text,
  null::character,'FORBIDDEN'::text,'unrelated user cannot read another owner management DTO');
select throws_ok($$select public.get_wedding_collaboration_membership_access_management(
  '82000000-0000-4000-8000-000000000006',current_setting('test.onecf_membership_id')::uuid)$$::text,
  null::character,'UNAVAILABLE'::text,'cross-owner wedding and membership target is unavailable');
select throws_ok($$select public.get_wedding_collaboration_invitation_access_management(
  '82000000-0000-4000-8000-000000000006','84000000-0000-4000-8000-000000000002')$$::text,
  null::character,'UNAVAILABLE'::text,'cross-owner wedding and invitation target is unavailable');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'1',
  'system:photographer',null,'viewer',null)$$::text,null::character,'FORBIDDEN'::text,
  'collaborator cannot directly change own access');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'1',
  'system:photographer',null,'custom',
  '[{"capability_key":"wedding.identity","level":1},{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":2}]'::jsonb)$$,
  'owner can change descriptive role without changing access snapshot');
select is(public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'2',
  'system:photographer',null,'custom',
  '[{"capability_key":"wedding.identity","level":1},{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":2}]'::jsonb)->>'changed','false',
  'identical membership save is a no-op');
select throws_ok($$select public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'1',
  'system:filmmaker',null,'custom','[]'::jsonb)$$::text,null::character,'CONFLICT'::text,
  'stale access version conflicts');
reset role;
select is((select access_version::text from public.wedding_collaboration_memberships
  where id=current_setting('test.onecf_membership_id')::uuid),'2',
  'stale access conflict leaves the current version unchanged');
select is((select string_agg(capability_key||':'||level::text,',' order by capability_key)
  from collaboration_private.membership_permission_grants
  where membership_id=current_setting('test.onecf_membership_id')::uuid),
  'places.address:2,schedule.operational_time:2,wedding.identity:1',
  'role-only save preserves the exact existing permission snapshot');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'2',
  'system:filmmaker',null,'custom',
  '[{"capability_key":"wedding.identity","level":2}]'::jsonb)$$::text,null::character,'VALIDATION_ERROR'::text,
  'identity edit grant is rejected');
select throws_ok($$select public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'2',
  'system:filmmaker',null,'viewer','[]'::jsonb)$$::text,null::character,'VALIDATION_ERROR'::text,
  'Viewer rejects a non-null Custom payload');
reset role;
select is((select access_version::text from public.wedding_collaboration_memberships where id=current_setting('test.onecf_membership_id')::uuid),'2',
  'role-only save increments access_version exactly once');
select is((select access_mode from public.wedding_collaboration_memberships where id=current_setting('test.onecf_membership_id')::uuid),'custom',
  'role-only save leaves access mode unchanged');
select is((select count(*)::int from public.wedding_collaboration_events where membership_id=current_setting('test.onecf_membership_id')::uuid
  and event_type='role_changed'),1,'role-only save emits one role event');
select is((select count(*)::int from public.wedding_collaboration_events where membership_id=current_setting('test.onecf_membership_id')::uuid
  and event_type in ('access_mode_changed','permissions_changed')),0,'role-only save emits no access or permission event');
select ok(exists(select 1 from public.wedding_collaboration_events e
  where e.membership_id=current_setting('test.onecf_membership_id')::uuid and e.event_type='role_changed'
    and e.metadata->>'before_version'='1' and e.metadata->>'after_version'='2'
    and e.metadata->'before'->>'access_mode'='custom'
    and e.metadata->'after'->>'access_mode'='custom'),
  'role-only event contains exact before/after and one shared version pair');

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'2',
  'system:photographer',null,'viewer',null)$$,'Custom to Viewer removes the stored sparse snapshot');
reset role;
select is((select count(*)::int from collaboration_private.membership_permission_grants where membership_id=current_setting('test.onecf_membership_id')::uuid),0,
  'leaving Custom deletes all persisted grants');
select is((select access_version::text from public.wedding_collaboration_memberships where id=current_setting('test.onecf_membership_id')::uuid),'3',
  'mode transition increments access version once');
select is((select count(*)::int from public.wedding_collaboration_events where membership_id=current_setting('test.onecf_membership_id')::uuid
  and event_type in ('access_mode_changed','permissions_changed')),2,'mode and permission snapshot changes are audited separately');
select ok(exists(select 1 from public.wedding_collaboration_events e
  where e.membership_id=current_setting('test.onecf_membership_id')::uuid and e.event_type='access_mode_changed'
    and e.metadata->>'before_version'='2' and e.metadata->>'after_version'='3'
    and e.metadata->'before'->>'access_mode'='custom'
    and e.metadata->'after'->>'access_mode'='viewer'),
  'mode event contains exact before/after and one shared version pair');
select lives_ok($$select public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'3',
  'system:photographer',null,'editor',null)$$,'Viewer to Editor changes authority source with no stored grants');
select lives_ok($$select public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'4',
  'system:photographer',null,'custom',
  '[{"capability_key":"wedding.identity","level":1},{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":2}]'::jsonb)$$,
  'Editor to Custom accepts the server Editor-default snapshot');
select lives_ok($$select public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'5',
  'system:photographer',null,'custom','[{"capability_key":"wedding.identity","level":1}]'::jsonb)$$,
  'Custom to Custom replaces the complete sparse snapshot');
select is((select string_agg(capability_key||':'||level::text,',' order by capability_key)
  from collaboration_private.membership_permission_grants
  where membership_id=current_setting('test.onecf_membership_id')::uuid),'wedding.identity:1',
  'omitted Custom keys become none after complete snapshot replacement');
select lives_ok($$select public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'6',
  'system:photographer',null,'editor',null)$$,'Custom to Editor deletes the dormant Custom snapshot');
select is((select count(*)::int from collaboration_private.membership_permission_grants
  where membership_id=current_setting('test.onecf_membership_id')::uuid),0,
  'Custom to Editor does not restore the previous sparse grants');
select lives_ok($$select public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'7',
  'system:photographer',null,'viewer',null)$$,'Editor to Viewer changes authority source without stored grants');
select lives_ok($$select public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'8',
  'system:assistant',null,'custom','[{"capability_key":"wedding.identity","level":1}]'::jsonb)$$,
  'Viewer to Custom accepts a sparse identity-only snapshot and descriptive role change');
reset role;
select is((select access_version::text from public.wedding_collaboration_memberships where id=current_setting('test.onecf_membership_id')::uuid),'9',
  'seven mode/snapshot saves each advance access_version exactly once');
select is((select string_agg(capability_key||':'||level::text,',' order by capability_key)
  from collaboration_private.membership_permission_grants where membership_id=current_setting('test.onecf_membership_id')::uuid),
  'wedding.identity:1','later Custom assignment contains only its explicitly selected grant');
select is((select count(*)::int from public.wedding_collaboration_events where membership_id=current_setting('test.onecf_membership_id')::uuid and event_type='permissions_changed'),5,
  'all complete-snapshot changes emit permissions_changed once');
select is((select count(*)::int from public.wedding_collaboration_events where membership_id=current_setting('test.onecf_membership_id')::uuid
  and event_type in ('role_changed','access_mode_changed','permissions_changed')
  and metadata->>'before_version'='8' and metadata->>'after_version'='9'),3,
  'one combined save emits role/mode/permission events with the same version pair');
select is((select count(*)::int from public.notifications where user_id in
  ('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002')),0,
  'access edits do not create notification side effects');
select is((select count(*)::int from public.wedding_collaboration_events where event_type='preset_applied'),0,
  '1C-F emits no preset lifecycle events');
update public.wedding_collaboration_memberships set access_version=9007199254740993 where id=current_setting('test.onecf_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is(public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000001',current_setting('test.onecf_membership_id')::uuid,'9007199254740993',
  'system:filmmaker',null,'editor',null)->>'access_version','9007199254740994',
  'membership bigint above JavaScript safe integer round-trips as exact decimal text');
reset role;


set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is(public.get_wedding_collaboration_invitation_access_management(
  '82000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000002')->>'access_configuration_version','0',
  'legacy pending invitation reads as compatibility version zero');
reset role;
select is((select access_configuration_version::text from public.wedding_collaboration_invitations
  where id='84000000-0000-4000-8000-000000000002'),'0','opening legacy management view does not write');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is(public.update_wedding_collaboration_invitation_access(
  '82000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000002','1',
  'unspecified',null,'custom',
  '[{"capability_key":"wedding.identity","level":1},{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":2}]'::jsonb)->>'changed','false',
  'saving the exact legacy v0 compatibility snapshot is a no-op');
reset role;
select is((select access_configuration_version::text from public.wedding_collaboration_invitations where id='84000000-0000-4000-8000-000000000002'),'0',
  'legacy v0 no-op does not upgrade or materialize the compatibility projection');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is(public.update_wedding_collaboration_invitation_access(
  '82000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000002','1',
  'system:assistant',null,'custom',
  '[{"capability_key":"wedding.identity","level":1}]'::jsonb)->>'configuration_revision','2',
  'changed save upgrades legacy invitation and advances record revision');
reset role;
select is((select access_configuration_version::text from public.wedding_collaboration_invitations
  where id='84000000-0000-4000-8000-000000000002'),'1','legacy invitation upgrades atomically to format one');
update public.wedding_collaboration_invitations set configuration_revision=9007199254740993 where id='84000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is(public.update_wedding_collaboration_invitation_access(
  '82000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000002','9007199254740993',
  'system:photographer',null,'custom','[{"capability_key":"wedding.identity","level":1}]'::jsonb)->>'configuration_revision','9007199254740994',
  'invitation revision bigint above JavaScript safe integer round-trips as exact decimal text');
reset role;

select is((select count(*)::int from collaboration_private.invitation_permission_grants
  where invitation_id='84000000-0000-4000-8000-000000000002'),1,'legacy upgrade stores the exact sparse grant set');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select set_config('test.onecf_custom_invitation_id',public.create_wedding_collaboration_invitation_configured(
  '82000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000001',null,
  '85000000-0000-4000-8000-000000000003','system:filmmaker',null,'custom',
  '[{"capability_key":"places.address","level":2}]'::jsonb)->>'invitation_id',true);
select is(public.get_wedding_collaboration_invitation_access_management(
  '82000000-0000-4000-8000-000000000002',current_setting('test.onecf_custom_invitation_id')::uuid)->>'status','pending',
  'configured create uses the single atomic RPC');
select throws_ok($$select public.get_wedding_collaboration_invitation_access_management(
  '82000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001')$$::text,
  null::character,'UNAVAILABLE'::text,'accepted invitation is not editable as pending');
reset role;
select is((select count(*)::int from public.wedding_collaboration_invitations
  where wedding_id='82000000-0000-4000-8000-000000000002' and access_configuration_version=1
    and configuration_revision=1),1,'new configured invitation is v1 at revision one from insert');
select is((select count(*)::int from collaboration_private.invitation_permission_grants g
  join public.wedding_collaboration_invitations i on i.id=g.invitation_id
  where i.wedding_id='82000000-0000-4000-8000-000000000002'),1,'configured Custom grants commit atomically with the invitation');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is(public.update_wedding_collaboration_invitation_access(
  '82000000-0000-4000-8000-000000000002',current_setting('test.onecf_custom_invitation_id')::uuid,
  '1','system:filmmaker',null,'custom','[{"capability_key":"places.address","level":2}]'::jsonb)->>'changed','false',
  'saving the exact configured v1 snapshot is a no-op');
reset role;
select is((select configuration_revision::text from public.wedding_collaboration_invitations
  where wedding_id='82000000-0000-4000-8000-000000000002'),'1',
  'configured v1 no-op keeps initial configuration revision');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is(public.update_wedding_collaboration_invitation_access(
  '82000000-0000-4000-8000-000000000002',current_setting('test.onecf_custom_invitation_id')::uuid,
  '1','system:filmmaker',null,'viewer',null)->>'configuration_revision','2',
  'owner can edit a pending v1 Custom invitation');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is(public.update_wedding_collaboration_invitation_access(
  '82000000-0000-4000-8000-000000000002',current_setting('test.onecf_custom_invitation_id')::uuid,
  '2','system:filmmaker',null,'editor',null)->>'configuration_revision','3',
  'pending v1 invitation transitions from Viewer to Editor');
reset role;
select is((select count(*)::int from collaboration_private.invitation_permission_grants g
  join public.wedding_collaboration_invitations i on i.id=g.invitation_id
  where i.wedding_id='82000000-0000-4000-8000-000000000002'),0,
  'Viewer and Editor invitations have no persisted Custom grant rows');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select set_config('test.onecf_viewer_invitation_id',
  (public.create_wedding_collaboration_invitation_configured(
    '82000000-0000-4000-8000-000000000004','83000000-0000-4000-8000-000000000001',null,
    '85000000-0000-4000-8000-000000000004','system:assistant',null,'viewer',null)->>'invitation_id'),true);
select set_config('test.onecf_editor_invitation_id',
  (public.create_wedding_collaboration_invitation_configured(
    '82000000-0000-4000-8000-000000000005','83000000-0000-4000-8000-000000000001',null,
    '85000000-0000-4000-8000-000000000005','system:second_shooter',null,'editor',null)->>'invitation_id'),true);
select set_config('test.onecf_legacy_invitation_id',
  (public.create_wedding_collaboration_invite_from_connection(
    '82000000-0000-4000-8000-000000000007','83000000-0000-4000-8000-000000000001',null,
    '85000000-0000-4000-8000-000000000007')->>'invitation_id'),true);
reset role;
select is((select count(*)::int from public.wedding_collaboration_invitations
  where id in (current_setting('test.onecf_viewer_invitation_id')::uuid,
    current_setting('test.onecf_editor_invitation_id')::uuid)
    and access_configuration_version=1 and configuration_revision=1),2,
  'configured Viewer and Editor invitations are v1 at revision one from insert');
select is((select count(*)::int from collaboration_private.invitation_permission_grants
  where invitation_id in (current_setting('test.onecf_viewer_invitation_id')::uuid,
    current_setting('test.onecf_editor_invitation_id')::uuid,
    current_setting('test.onecf_custom_invitation_id')::uuid)),0,
  'Viewer and Editor invitations have no persisted Custom grant rows');
select is((select access_configuration_version::text from public.wedding_collaboration_invitations
  where id=current_setting('test.onecf_legacy_invitation_id')::uuid),'0',
  'legacy create RPC remains unchanged and creates format zero');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is(public.update_wedding_collaboration_invitation_access(
  '82000000-0000-4000-8000-000000000002',current_setting('test.onecf_custom_invitation_id')::uuid,
  '3','system:filmmaker',null,'editor',null)->>'changed','false',
  'identical pending Editor invitation save is a no-op');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select is(public.accept_wedding_collaboration_invite(
  current_setting('test.onecf_custom_invitation_id')::uuid,
  '85000000-0000-4000-8000-000000000012')->>'status','accepted',
  'invitee accepts v1 configured Editor invitation without permission payload');
select is(public.accept_wedding_collaboration_invite(
  current_setting('test.onecf_custom_invitation_id')::uuid,
  '85000000-0000-4000-8000-000000000012')->>'duplicate','true',
  'duplicate v1 acceptance remains idempotent');
reset role;
select set_config('test.onecf_accepted_custom_membership_id',
  (select m.id::text from public.wedding_collaboration_memberships m
   where m.accepted_invitation_id=current_setting('test.onecf_custom_invitation_id')::uuid),true);
select is((select m.access_mode from public.wedding_collaboration_memberships m
  join public.wedding_collaboration_invitations i on i.id=m.accepted_invitation_id
  where i.wedding_id='82000000-0000-4000-8000-000000000002'),'editor',
  'acceptance copies the full v1 Editor access mode');
select is((select count(*)::int from collaboration_private.membership_permission_grants g
  join public.wedding_collaboration_memberships m on m.id=g.membership_id
  join public.wedding_collaboration_invitations i on i.id=m.accepted_invitation_id
  where i.wedding_id='82000000-0000-4000-8000-000000000002'),0,
  'v1 Editor acceptance creates no sparse grants');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select is(public.accept_wedding_collaboration_invite(current_setting('test.onecf_viewer_invitation_id')::uuid,
  '85000000-0000-4000-8000-000000000014')->>'status','accepted',
  'invitee accepts v1 Viewer invitation without permission payload');
reset role;
select is((select m.access_mode from public.wedding_collaboration_memberships m
  where m.accepted_invitation_id=current_setting('test.onecf_viewer_invitation_id')::uuid),'viewer',
  'acceptance copies the full v1 Viewer access mode');
select ok(not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='accept_wedding_collaboration_invite' and p.pronargs>2),
  'invitee has no acceptance RPC that accepts a permission payload');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.update_wedding_collaboration_invitation_access(
  '82000000-0000-4000-8000-000000000002',current_setting('test.onecf_custom_invitation_id')::uuid,
  '3','system:assistant',null,'viewer',null)$$::text,null::character,'UNAVAILABLE'::text,
  'accepted invitation is no longer editable');
select public.cancel_wedding_collaboration_invite(current_setting('test.onecf_legacy_invitation_id')::uuid,
  '85000000-0000-4000-8000-000000000017');
select throws_ok($$select public.update_wedding_collaboration_invitation_access(
  '82000000-0000-4000-8000-000000000007',current_setting('test.onecf_legacy_invitation_id')::uuid,
  '1','system:assistant',null,'viewer',null)$$::text,null::character,'UNAVAILABLE'::text,
  'cancelled invitation cannot be edited');
select is(public.end_collaboration('83000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000020')->>'status','ended',
  'ending the global connection completes independently of accepted wedding management');
select is(public.get_wedding_collaboration_membership_access_management(
  '82000000-0000-4000-8000-000000000002',
  current_setting('test.onecf_accepted_custom_membership_id')::uuid)->>'status','active',
  'accepted membership remains manageable after global connection end');
select is(public.update_wedding_collaboration_membership_access(
  '82000000-0000-4000-8000-000000000002',current_setting('test.onecf_accepted_custom_membership_id')::uuid,'1',
  'system:assistant',null,'viewer',null)->>'changed','true',
  'owner can still update accepted access after global connection end');
reset role;

select lives_ok($$do $roles$
declare r text;
begin
  foreach r in array array['unspecified','system:photographer','system:filmmaker','system:second_shooter',
    'system:wedding_planner','system:assistant','system:content_creator'] loop
    perform collaboration_private.validate_owner_access_configuration(r,null,'viewer',null);
  end loop;
  perform collaboration_private.validate_owner_access_configuration('custom','Local role','custom','[]'::jsonb);
end;
$roles$;$$,'all fixed 1C-F roles plus unspecified and valid Custom label pass server validation');
select throws_ok($$select collaboration_private.validate_owner_access_configuration('system:admin',null,'viewer',null)$$::text,
  null::character,'VALIDATION_ERROR'::text,'role outside the fixed 1C-F allowlist is rejected');
select throws_ok($$select collaboration_private.validate_owner_access_configuration('custom',' padded ','custom','[]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'padded Custom role label is rejected');
select throws_ok($$select collaboration_private.validate_owner_access_configuration('custom','   ','custom','[]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'whitespace-only Custom role label is rejected');
select throws_ok($$select collaboration_private.validate_owner_access_configuration('custom',repeat('x',65),'custom','[]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'Custom role label above 64 characters is rejected');
select throws_ok($$select collaboration_private.validate_owner_access_configuration('custom','bad'||chr(10)||'role','custom','[]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'Custom role label control characters are rejected');
select throws_ok($$select collaboration_private.validate_owner_access_configuration('unspecified',null,null,null)$$::text,
  null::character,'VALIDATION_ERROR'::text,'missing access mode is rejected');
select is(collaboration_private.validate_owner_access_configuration('custom','Role','custom','[]'::jsonb),'[]'::jsonb,
  'empty Custom snapshot is valid and grants nothing');
select throws_ok($$select collaboration_private.validate_owner_access_configuration('unspecified',null,'custom',
  '[{"capability_key":"wedding.identity","level":1},{"capability_key":"wedding.identity","level":1}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'duplicate capability entries are rejected');
select throws_ok($$select collaboration_private.validate_owner_access_configuration('unspecified',null,'custom',
  '[{"capability_key":"unknown.capability","level":1}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'unknown capability is rejected');
select throws_ok($$select collaboration_private.validate_owner_access_configuration('unspecified',null,'custom',
  '[{"capability_key":"places.structure","level":1}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'inactive capability is rejected');
select throws_ok($$select collaboration_private.validate_owner_access_configuration('unspecified',null,'custom',
  '[{"capability_key":"wedding.identity","level":2}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'identity edit level is rejected');
select throws_ok($$select collaboration_private.validate_owner_access_configuration('unspecified',null,'custom',
  '[{"capability_key":"places.address","level":2,"extra":true}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'unexpected Custom grant keys are rejected');
select throws_ok($$select collaboration_private.validate_owner_access_configuration('unspecified',null,'custom',
  '[{"capability_key":"places.address","level":3}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'requested level above max_custom_level is rejected');
select throws_ok($$select '[not-json'::jsonb$$::text,'22P02'::character(5),null::text,
  'malformed JSON cannot enter the Custom snapshot contract');
select is(collaboration_private.validate_owner_access_configuration('unspecified',null,'custom',
  '[{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":2}]'::jsonb),
  '[{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":2}]'::jsonb,
  'address and operational time edit levels are accepted within their maxima');
select throws_ok($$select collaboration_private.validate_owner_access_configuration('unspecified',null,'editor','[]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'Editor rejects any Custom payload');
select is((select count(*)::int from collaboration_private.capability_registry c
  where c.active and c.viewer_default<=c.max_custom_level and c.editor_default<=c.max_custom_level),3,
  'all active registry defaults fit their Custom maxima');
select is((select count(*)::int from collaboration_private.capability_registry where not active and max_custom_level<>0),0,
  'inactive registry maximums remain zero with no activation');

select finish();
rollback;
