begin;
select no_plan();

select is((select count(*)::int from collaboration_private.permission_presets
  where scope='system' and archived_at is null),2,'exactly two active system presets are seeded');
select is((select count(*)::int from collaboration_private.permission_preset_grants g
  join collaboration_private.permission_presets p on p.id=g.preset_id where p.scope='system'),6,
  'system presets contain exactly six normalized grants');
select is((select string_agg(system_key||':'||name||':'||version::text,',' order by system_key)
  from collaboration_private.permission_presets where scope='system'),
  'operational_full:Pełny dostęp operacyjny:1,read_only:Podgląd podstawowy:1','system key, Polish name and version are exact');
select is((select string_agg(p.system_key||':'||g.capability_key||'='||g.level,',' order by p.system_key,g.capability_key)
  from collaboration_private.permission_preset_grants g join collaboration_private.permission_presets p on p.id=g.preset_id
  where p.scope='system'),
  'operational_full:places.address=2,operational_full:schedule.operational_time=2,operational_full:wedding.identity=1,read_only:places.address=1,read_only:schedule.operational_time=1,read_only:wedding.identity=1',
  'system grant snapshots are exact');
select ok(not exists(select 1 from collaboration_private.permission_preset_grants g
  join collaboration_private.permission_presets p on p.id=g.preset_id
  join collaboration_private.capability_registry c using(capability_key)
  where p.scope='system' and (not c.active or not c.grantable or c.owner_only or g.level>c.max_custom_level)),
  'system seeds contain only currently grantable levels');

select ok((select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class where oid='collaboration_private.permission_presets'::regclass)
  and (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class where oid='collaboration_private.permission_preset_grants'::regclass),
  'both preset tables have enabled and forced RLS');
select ok(not exists(
  select 1 from (values ('anon'),('authenticated'),('service_role')) roles(role_name)
  cross join (values ('collaboration_private.permission_presets'),
                     ('collaboration_private.permission_preset_grants')) tables(table_name)
  cross join (values ('select'),('insert'),('update'),('delete')) privileges(privilege_name)
  where has_table_privilege(roles.role_name,tables.table_name,privileges.privilege_name)),
  'direct preset table CRUD remains denied to clients and service_role');
select ok(has_function_privilege('authenticated','public.list_collaboration_permission_presets()','execute')
  and has_function_privilege('authenticated','public.get_collaboration_permission_preset(uuid)','execute')
  and has_function_privilege('authenticated','public.create_collaboration_permission_preset(text,text,jsonb)','execute')
  and has_function_privilege('authenticated','public.update_collaboration_permission_preset(uuid,text,text,text,jsonb)','execute')
  and has_function_privilege('authenticated','public.archive_collaboration_permission_preset(uuid,text)','execute')
  and has_function_privilege('authenticated','public.duplicate_collaboration_permission_preset(uuid,text,text)','execute')
  and not exists(select 1 from (values
    ('public.list_collaboration_permission_presets()'),
    ('public.get_collaboration_permission_preset(uuid)'),
    ('public.create_collaboration_permission_preset(text,text,jsonb)'),
    ('public.update_collaboration_permission_preset(uuid,text,text,text,jsonb)'),
    ('public.archive_collaboration_permission_preset(uuid,text)'),
    ('public.duplicate_collaboration_permission_preset(uuid,text,text)')
  ) rpc(signature) where has_function_privilege('anon',rpc.signature,'execute')
      or has_function_privilege('service_role',rpc.signature,'execute'))
  and not exists(select 1 from pg_catalog.pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where p.oid in (
      'public.list_collaboration_permission_presets()'::regprocedure,
      'public.get_collaboration_permission_preset(uuid)'::regprocedure,
      'public.create_collaboration_permission_preset(text,text,jsonb)'::regprocedure,
      'public.update_collaboration_permission_preset(uuid,text,text,text,jsonb)'::regprocedure,
      'public.archive_collaboration_permission_preset(uuid,text)'::regprocedure,
      'public.duplicate_collaboration_permission_preset(uuid,text,text)'::regprocedure)
      and acl.grantee=0 and acl.privilege_type='EXECUTE')
  and not has_function_privilege('authenticated','collaboration_private.permission_preset_detail(uuid)','execute')
  and not has_function_privilege('authenticated','collaboration_private.validate_owner_access_configuration(text,text,text,jsonb)','execute'),
  'only curated RPCs are authenticated-executable, with PUBLIC/anon/service_role revoked');
select ok(not exists(select 1 from pg_catalog.pg_policy where polrelid in
  ('public.weddings'::regclass,'public.wedding_places'::regclass,'public.wedding_operational_times'::regclass)
  and polname ilike '%collab%'),'1C-G does not widen core wedding or child-resource policies');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,
  raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000001','authenticated','authenticated','1cg-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000002','91000000-0000-4000-8000-000000000002','authenticated','authenticated','1cg-outsider@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());
select set_config('test.onecg_system_id',(select id::text from collaboration_private.permission_presets where system_key='read_only'),true);

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select ok(public.list_collaboration_permission_presets() @> jsonb_build_array(jsonb_build_object('scope','system','name','Podgląd podstawowy')),
  'authenticated user lists system presets');
select set_config('test.onecg_mixed_id',(public.create_collaboration_permission_preset('  Mój zestaw  ','  Opis  ',
  '[{"capability_key":"wedding.identity","level":1},{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":1}]'::jsonb)->>'preset_id'),true);
reset role;
select is((select owner_user_id::text from collaboration_private.permission_presets where id=current_setting('test.onecg_mixed_id')::uuid),
  '91000000-0000-4000-8000-000000000001','owner identity is derived from auth.uid');
set local role authenticated;
select is((public.get_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid)->>'version'),'1',
  'created user preset starts at version one as decimal text');
select is((public.get_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid)->>'name'),'Mój zestaw',
  'name is stored as canonical trimmed text');
select is((public.get_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid)->>'description'),'Opis',
  'description is stored trimmed');
select ok((public.get_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid)->>'created_at')::timestamptz<=now()
  and (public.get_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid)->>'updated_at')::timestamptz<=now(),
  'timestamps are assigned by the database');
select is((public.get_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid)->'grants'),
  '[{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":1},{"capability_key":"wedding.identity","level":1}]'::jsonb,
  'mixed exact snapshot is stored without normalization');

select is((public.update_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid,'1','Mój zestaw v2','Opis',
  '[{"capability_key":"wedding.identity","level":1},{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":1}]'::jsonb)->>'version'),'2',
  'metadata update increments version once');
select is((public.get_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid)->'grants'),
  '[{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":1},{"capability_key":"wedding.identity","level":1}]'::jsonb,
  'rename-only update preserves mixed grant rows');
select is((public.update_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid,'2','Mój zestaw v2','Opis dwa',
  '[{"capability_key":"wedding.identity","level":1},{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":1}]'::jsonb)->>'version'),'3',
  'description update increments version once');
select is((public.get_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid)->'grants'),
  '[{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":1},{"capability_key":"wedding.identity","level":1}]'::jsonb,
  'description-only update preserves mixed grant rows');
select set_config('test.onecg_updated_after_real_change',
  (public.get_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid)->>'updated_at'),true);
select is((public.update_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid,'3','Mój zestaw v2','Opis dwa',
  '[{"capability_key":"wedding.identity","level":1},{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":1}]'::jsonb)->>'version'),'3',
  'no-op update leaves version unchanged');
select is((public.get_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid)->>'updated_at'),
  current_setting('test.onecg_updated_after_real_change'),'no-op update leaves updated_at unchanged');
select throws_ok($$select public.update_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid,'2','Stale','', '[]'::jsonb)$$::text,
  null::character,'CONFLICT'::text,'stale version returns CONFLICT without write');
select is((public.update_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid,'3','Mój zestaw v2','Opis dwa','[]'::jsonb)->>'version'),'4',
  'grant update increments version exactly once');
select is(jsonb_array_length(public.get_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid)->'grants'),0,
  'exact replacement removes omitted grant rows');

select set_config('test.onecg_empty_id',(public.create_collaboration_permission_preset('Empty',null,'[]'::jsonb)->>'preset_id'),true);
select is((public.get_collaboration_permission_preset(current_setting('test.onecg_empty_id')::uuid)->'grants'),'[]'::jsonb,
  'empty snapshot is valid and remains empty');
select ok((public.create_collaboration_permission_preset('Spaced', '   ',
  '[{"capability_key":"wedding.identity","level":1}]'::jsonb)->'description')='null'::jsonb,
  'blank description canonicalizes to null');
select throws_ok($$select public.create_collaboration_permission_preset('  ','', '[]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'blank name is rejected');
select throws_ok($$select public.create_collaboration_permission_preset(repeat('x',81),null,'[]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'name over 80 characters is rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Control'||chr(1),null,'[]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'control characters in name are rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Too long',repeat('x',241),'[]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'description over 240 characters is rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Description control',chr(1),'[]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'control characters in description are rejected');
select throws_ok($$select public.create_collaboration_permission_preset('MÓJ ZESTAW V2',null,'[]'::jsonb)$$::text,
  null::character,'CONFLICT'::text,'active names are case-insensitively unique per owner');

select set_config('test.onecg_system_copy',(public.duplicate_collaboration_permission_preset(
  current_setting('test.onecg_system_id')::uuid,'Podgląd mojego','Kopia')->>'preset_id'),true);
select is((public.get_collaboration_permission_preset(current_setting('test.onecg_system_copy')::uuid)->>'scope'),
  'user','duplicated system preset becomes user-owned');
select is((public.get_collaboration_permission_preset(current_setting('test.onecg_system_copy')::uuid)->'grants'),
  '[{"capability_key":"places.address","level":1},{"capability_key":"schedule.operational_time","level":1},{"capability_key":"wedding.identity","level":1}]'::jsonb,
  'system duplicate copies exact grants');
select throws_ok($$select public.update_collaboration_permission_preset(current_setting('test.onecg_system_id')::uuid,'1','Change','', '[]'::jsonb)$$::text,
  null::character,'FORBIDDEN'::text,'system update is forbidden');
select throws_ok($$select public.archive_collaboration_permission_preset(current_setting('test.onecg_system_id')::uuid,'1')$$::text,
  null::character,'FORBIDDEN'::text,'system archive is forbidden');

select set_config('test.onecg_copy_source',(public.create_collaboration_permission_preset('Duplicate source',null,
  '[{"capability_key":"wedding.identity","level":1},{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":1}]'::jsonb)->>'preset_id'),true);
select set_config('test.onecg_dup_user',(public.duplicate_collaboration_permission_preset(
  current_setting('test.onecg_copy_source')::uuid,'Mój zestaw kopia',null)->>'preset_id'),true);
select is((public.get_collaboration_permission_preset(current_setting('test.onecg_dup_user')::uuid)->'grants'),
  '[{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":1},{"capability_key":"wedding.identity","level":1}]'::jsonb,
  'user duplicate copies one exact coherent snapshot');

select throws_ok($$select public.create_collaboration_permission_preset('Malformed',null,'{}'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'object instead of array is rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Extra',null,'[{"capability_key":"wedding.identity","level":1,"extra":1}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'extra grant fields are rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Duplicate key',null,'[{"capability_key":"wedding.identity","level":1},{"capability_key":"wedding.identity","level":1}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'duplicate capabilities are rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Unknown',null,'[{"capability_key":"bogus","level":1}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'unknown capability is rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Inactive',null,'[{"capability_key":"tasks","level":1}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'inactive capability is rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Scalar',null,'1'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'scalar grants are rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Missing key',null,'[{"level":1}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'grant without capability key is rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Missing level',null,'[{"capability_key":"wedding.identity"}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'grant without level is rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Zero level',null,'[{"capability_key":"wedding.identity","level":0}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'zero level is rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Negative level',null,'[{"capability_key":"wedding.identity","level":-1}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'negative level is rejected');
select throws_ok($$select public.create_collaboration_permission_preset('High level',null,'[{"capability_key":"places.address","level":3}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'level above two is rejected');
select ok((public.create_collaboration_permission_preset('Podgląd podstawowy',null,'[]'::jsonb)->>'scope')='user',
  'user preset name may equal system display name');
select is((public.create_collaboration_permission_preset(U&'\2003Unicode name\2003',U&'\2003Opis\2003','[]'::jsonb)->>'name'),
  'Unicode name','Unicode whitespace is trimmed from the stored name');
select is((public.get_collaboration_permission_preset((select (preset->>'preset_id')::uuid
  from pg_catalog.jsonb_array_elements(public.list_collaboration_permission_presets()) preset
  where preset->>'name'='Unicode name'))->>'description'),
  'Opis','Unicode whitespace is trimmed from the stored description');
select is(pg_catalog.char_length((public.create_collaboration_permission_preset(repeat('😀',80),null,'[]'::jsonb)->>'name')),80,
  '80 non-BMP Unicode characters are accepted');
select throws_ok($$select public.create_collaboration_permission_preset(repeat('😀',81),null,'[]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'81 non-BMP Unicode characters are rejected');
reset role;
insert into collaboration_private.capability_registry(capability_key,active,grantable,owner_only,
  viewer_default,editor_default,introduced_version,max_custom_level)
values ('test.nongrantable',true,false,false,0,0,1,0),('test.owner_only',true,false,true,0,0,1,0);
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.create_collaboration_permission_preset('Nongrantable explicit',null,'[{"capability_key":"test.nongrantable","level":1}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'nongrantable registry entry is rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Owner only explicit',null,'[{"capability_key":"test.owner_only","level":1}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'owner-only registry entry is rejected');
reset role;
delete from collaboration_private.capability_registry where capability_key in ('test.nongrantable','test.owner_only');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.create_collaboration_permission_preset('Nongrantable',null,'[{"capability_key":"travel.commercial","level":1}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'nongrantable capability is rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Owner only',null,'[{"capability_key":"wedding.identity","level":2}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'over-maximum identity level is rejected');
select throws_ok($$select public.create_collaboration_permission_preset('Fractional',null,'[{"capability_key":"places.address","level":1.5}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'fractional level is rejected');
select throws_ok($$select public.create_collaboration_permission_preset('String level',null,'[{"capability_key":"places.address","level":"1"}]'::jsonb)$$::text,
  null::character,'VALIDATION_ERROR'::text,'string level is rejected');

-- Exercise text version round-tripping above JavaScript's exact integer range.
reset role;
update collaboration_private.permission_presets set version=9007199254740993
  where id=current_setting('test.onecg_empty_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select is((public.update_collaboration_permission_preset(current_setting('test.onecg_empty_id')::uuid,
  '9007199254740993','Empty',null,'[]'::jsonb)->>'version'),'9007199254740993',
  'large bigint version remains exact decimal text');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select ok(not (public.list_collaboration_permission_presets() @> jsonb_build_array(jsonb_build_object('preset_id',current_setting('test.onecg_mixed_id')))),
  'another user list does not reveal a private preset');
select throws_ok($$select public.get_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid)$$::text,
  null::character,'UNAVAILABLE'::text,'cross-user detail returns UNAVAILABLE');
select throws_ok($$select public.update_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid,'3','X',null,'[]'::jsonb)$$::text,
  null::character,'UNAVAILABLE'::text,'cross-user update returns UNAVAILABLE');
select throws_ok($$select public.archive_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid,'3')$$::text,
  null::character,'UNAVAILABLE'::text,'cross-user archive returns UNAVAILABLE');
select throws_ok($$select public.duplicate_collaboration_permission_preset(current_setting('test.onecg_mixed_id')::uuid,'X',null)$$::text,
  null::character,'UNAVAILABLE'::text,'cross-user duplicate returns UNAVAILABLE');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select is((public.archive_collaboration_permission_preset(current_setting('test.onecg_dup_user')::uuid,'1')->>'version'),'2',
  'archive increments version exactly once');
select throws_ok($$select public.get_collaboration_permission_preset(current_setting('test.onecg_dup_user')::uuid)$$::text,
  null::character,'UNAVAILABLE'::text,'archived detail is unavailable');
select throws_ok($$select public.update_collaboration_permission_preset(current_setting('test.onecg_dup_user')::uuid,'2','X',null,'[]'::jsonb)$$::text,
  null::character,'UNAVAILABLE'::text,'archived update is unavailable');
select throws_ok($$select public.duplicate_collaboration_permission_preset(current_setting('test.onecg_dup_user')::uuid,'X',null)$$::text,
  null::character,'UNAVAILABLE'::text,'archived duplicate source is unavailable');
select set_config('test.onecg_reused_name',(public.create_collaboration_permission_preset('Mój zestaw kopia',null,'[]'::jsonb)->>'preset_id'),true);
select ok(current_setting('test.onecg_reused_name') is not null,'archived name may be reused');

reset role;
select ok(not has_function_privilege('anon','public.create_collaboration_permission_preset(text,text,jsonb)','execute')
  and not has_function_privilege('service_role','public.create_collaboration_permission_preset(text,text,jsonb)','execute'),
  'creation RPC is not executable by anon or service_role');

select * from finish();
rollback;
