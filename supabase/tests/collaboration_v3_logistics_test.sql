begin;
select no_plan();

select has_function('public','get_collaborative_wedding_logistics_v3',array['uuid'],'narrow Logistics projection RPC exists');
select has_function('public','mutate_collaborative_wedding_logistics_v3',array['uuid','text','text','jsonb'],'single Logistics mutation RPC exists');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid='public.get_collaborative_wedding_logistics_v3(uuid)'::regprocedure),'read RPC is SECURITY DEFINER with empty search_path');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid='public.mutate_collaborative_wedding_logistics_v3(uuid,text,text,jsonb)'::regprocedure),'write RPC is SECURITY DEFINER with empty search_path');
select ok(has_function_privilege('authenticated','public.get_collaborative_wedding_logistics_v3(uuid)','execute') and not has_function_privilege('anon','public.get_collaborative_wedding_logistics_v3(uuid)','execute'),'read RPC is authenticated-only');
select ok(has_function_privilege('authenticated','public.mutate_collaborative_wedding_logistics_v3(uuid,text,text,jsonb)','execute') and not has_function_privilege('anon','public.mutate_collaborative_wedding_logistics_v3(uuid,text,text,jsonb)','execute'),'write RPC is authenticated-only');
select ok(not exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid in ('public.get_collaborative_wedding_logistics_v3(uuid)'::regprocedure,'public.mutate_collaborative_wedding_logistics_v3(uuid,text,text,jsonb)'::regprocedure) and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC cannot execute either RPC');
select ok(not has_function_privilege('service_role','public.get_collaborative_wedding_logistics_v3(uuid)','execute') and not has_function_privilege('service_role','public.mutate_collaborative_wedding_logistics_v3(uuid,text,text,jsonb)','execute'),'service_role has no client RPC grant');
select ok(not has_function_privilege('authenticated','collaboration_private.replace_wedding_travel_segments_checked(uuid,uuid,integer,text,text,text,text,text,jsonb,text)','execute'),'internal route writer is not client executable');
select ok(not has_table_privilege('authenticated','public.wedding_places','insert')
  and not has_table_privilege('authenticated','public.wedding_places','update')
  and not has_table_privilege('authenticated','public.travel_segments','insert')
  and not has_table_privilege('authenticated','public.travel_segments','update'),
  'Logistics grants no direct place or route writes');
select ok(not exists(select 1 from pg_catalog.pg_policy where polrelid in ('public.weddings'::regclass,'public.wedding_places'::regclass,'public.wedding_operational_times'::regclass) and polname ilike '%collab%'),'Logistics adds no membership-based core table policy');
select ok(pg_catalog.pg_get_functiondef('public.get_collaborative_wedding_logistics_v3(uuid)'::regprocedure) not ilike '%contract_value%' and pg_catalog.pg_get_functiondef('public.get_collaborative_wedding_logistics_v3(uuid)'::regprocedure) not ilike '%free_distance_km%','projection source does not select commercial travel or contract values');
select ok(pg_catalog.pg_get_functiondef('public.mutate_collaborative_wedding_logistics_v3(uuid,text,text,jsonb)'::regprocedure) not ilike '%resolve_wedding_travel_fee%' and pg_catalog.pg_get_functiondef('public.mutate_collaborative_wedding_logistics_v3(uuid,text,text,jsonb)'::regprocedure) not ilike '%contract_value%','mutation has no commercial fee or contract operation');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','c8100000-0000-4000-8000-000000000001','authenticated','authenticated','v3-logistics-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','c8100000-0000-4000-8000-000000000002','authenticated','authenticated','v3-logistics-member@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','c8100000-0000-4000-8000-000000000003','authenticated','authenticated','v3-logistics-outsider@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());
insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status,contract_value,travel_fee_amount,travel_fee_status,package_items_snapshot)
values ('c8200000-0000-4000-8000-000000000001','c8100000-0000-4000-8000-000000000001','Logistics','Test','2027-09-01','active',5678,90,'charged','[{"name":"Snapshot package","price":321}]'),
 ('c8200000-0000-4000-8000-000000000002','c8100000-0000-4000-8000-000000000001','Inactive','Test','2027-09-02','archived',200,0,'not_charged','[]'),
 ('c8200000-0000-4000-8000-000000000003','c8100000-0000-4000-8000-000000000003','Other','Owner','2027-09-03','active',999,12,'charged','[]');
insert into public.wedding_places(id,wedding_id,role,label,place_id,formatted_address,latitude,longitude,sort_order) values
 ('c8600000-0000-4000-8000-000000000001','c8200000-0000-4000-8000-000000000001','ceremony','Ceremony','google-ceremony','Ceremony Street 1',52.1,21.0,20),
 ('c8600000-0000-4000-8000-000000000002','c8200000-0000-4000-8000-000000000001','reception','Reception','google-reception','Reception Street 2',52.2,21.1,30),
 ('c8600000-0000-4000-8000-000000000003','c8200000-0000-4000-8000-000000000003','ceremony','Other wedding','other-ceremony','Other Street 3',52.3,21.2,20),
 ('c8600000-0000-4000-8000-000000000004','c8200000-0000-4000-8000-000000000001','bride_preparation','Canonical bride','canonical-bride','Canonical Bride Street',52.15,21.05,15),
 ('c8600000-0000-4000-8000-000000000005','c8200000-0000-4000-8000-000000000001','bride_preparation','Duplicate bride','duplicate-bride','Duplicate Bride Street',52.16,21.06,15),
 ('c8600000-0000-4000-8000-000000000006','c8200000-0000-4000-8000-000000000001','preparation','Legacy bride','legacy-bride','Legacy Bride Street',52.14,21.04,5);
insert into public.payments(id,wedding_id,type,amount) values ('c8900000-0000-4000-8000-000000000001','c8200000-0000-4000-8000-000000000001','deposit',100);
insert into public.studio_travel_settings(user_id,studio_name,street,building_number,postal_code,city,country,formatted_address,latitude,longitude,place_id,free_distance_km)
values ('c8100000-0000-4000-8000-000000000001','Owner Studio','Owner Street','7','00-001','Warszawa','PL','Owner Studio, Owner Street 7',52.0,21.0,'owner-origin',25),
 ('c8100000-0000-4000-8000-000000000002','Member Studio','Member Street','99','00-099','Łódź','PL','Member Studio, Member Street 99',51.7,19.4,'member-origin',500);
insert into public.wedding_operational_times(wedding_id,stop_key,operational_time)
values ('c8200000-0000-4000-8000-000000000001','c8600000-0000-4000-8000-000000000001','15:30'),
 ('c8200000-0000-4000-8000-000000000001','c8600000-0000-4000-8000-000000000002','16:00'),
 ('c8200000-0000-4000-8000-000000000001','c8600000-0000-4000-8000-000000000004','13:00'),
 ('c8200000-0000-4000-8000-000000000003','c8600000-0000-4000-8000-000000000003','17:00');
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,participant_low_name_snapshot,participant_high_name_snapshot,status)
values ('c8300000-0000-4000-8000-000000000001','c8100000-0000-4000-8000-000000000001','c8100000-0000-4000-8000-000000000002','Logistics Owner','Logistics Member','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000001',true);
select public.create_wedding_collaboration_invitation_v3('c8200000-0000-4000-8000-000000000001','c8300000-0000-4000-8000-000000000001',null,'c8500000-0000-4000-8000-000000000001','system:photographer',null,'custom','{"logistics":1,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":0}'::jsonb);
reset role;
select set_config('test.logistics_invitation_id',(select id::text from public.wedding_collaboration_invitations where idempotency_key='c8500000-0000-4000-8000-000000000001'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000002',true);
select public.accept_wedding_collaboration_invite(current_setting('test.logistics_invitation_id')::uuid,'c8700000-0000-4000-8000-000000000001');
reset role;
select is(public.resolve_my_wedding_detail_authority_v3('c8200000-0000-4000-8000-000000000001')->>'kind','shared','accepted V3 member resolves shared authority');
select is(collaboration_private.resolve_wedding_area_level('c8200000-0000-4000-8000-000000000001','logistics')::int,1,'invitation snapshot grants Logistics view level one');
select set_config('test.logistics_membership_id',(select id::text from public.wedding_collaboration_memberships where wedding_id='c8200000-0000-4000-8000-000000000001' and member_user_id='c8100000-0000-4000-8000-000000000002'),true);
reset role;
select is((select p.id::text from public.wedding_places p where p.wedding_id='c8200000-0000-4000-8000-000000000001' and p.role in ('bride_preparation','preparation') order by case when p.role='bride_preparation' then 0 else 1 end,p.sort_order,p.created_at,p.id limit 1),'c8600000-0000-4000-8000-000000000004','runtime duplicate fixture deterministically prefers canonical preparation row');
select set_config('test.logistics_read_snapshot',jsonb_build_object(
 'places',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.wedding_places p where p.wedding_id='c8200000-0000-4000-8000-000000000001'),
 'segments',(select coalesce(jsonb_agg(to_jsonb(s) order by s.sequence),'[]') from public.travel_segments s where s.wedding_id='c8200000-0000-4000-8000-000000000001'),
 'operational_versions',(select coalesce(jsonb_agg(to_jsonb(v) order by v.resource_type,v.role),'[]') from collaboration_private.wedding_operational_versions v where v.wedding_id='c8200000-0000-4000-8000-000000000001'),
 'route_versions',(select coalesce(jsonb_agg(to_jsonb(v) order by v.wedding_id),'[]') from collaboration_private.wedding_route_input_versions v where v.wedding_id='c8200000-0000-4000-8000-000000000001'),
 'origin_versions',(select coalesce(jsonb_agg(to_jsonb(v) order by v.user_id),'[]') from collaboration_private.studio_route_input_versions v where v.user_id='c8100000-0000-4000-8000-000000000001'),
 'times',(select coalesce(jsonb_agg(to_jsonb(t) order by t.stop_key),'[]') from public.wedding_operational_times t where t.wedding_id='c8200000-0000-4000-8000-000000000001'),
 'commercial',(select to_jsonb(w) from public.weddings w where w.id='c8200000-0000-4000-8000-000000000001'),
 'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.payments p where p.wedding_id='c8200000-0000-4000-8000-000000000001'))::text,true);
update public.wedding_collaboration_memberships set role_key='system:viewer' where id=current_setting('test.logistics_membership_id')::uuid;
select is(collaboration_private.resolve_wedding_area_level('c8200000-0000-4000-8000-000000000001','logistics')::int,1,'Logistics authority is independent of collaborator role');
update public.wedding_collaboration_memberships set role_key='system:photographer' where id=current_setting('test.logistics_membership_id')::uuid;
update collaboration_private.membership_area_access set logistics=0 where membership_id=current_setting('test.logistics_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001')$$,'P0001','FORBIDDEN','level-zero Logistics read is denied');
reset role;
update collaboration_private.membership_area_access set logistics=1 where membership_id=current_setting('test.logistics_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000002',true);
select set_config('test.logistics_projection',public.get_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001')::text,true);
select is(jsonb_array_length(current_setting('test.logistics_projection')::jsonb->'places'),5,'read projection contains all historical rows for this wedding');
select is((select array_agg(key order by key) from jsonb_object_keys(current_setting('test.logistics_projection')::jsonb) as keys(key)),array['access_version','logistics_level','places','provider','route_contract_version','route_stale','route_stops','route_topology','segments','studio','studio_origin_version','topology_token','travel_mode','wedding_id','wedding_route_input_version']::text[],'read projection has the exact allowlisted root shape');
select is((current_setting('test.logistics_projection')::jsonb->>'logistics_level')::int,1,'read projection reports effective view level');
select ok(current_setting('test.logistics_projection')::jsonb->'places'->0 ?& array['id','role','label','place_id','formatted_address','latitude','longitude','sort_order','resolution_state','address_version','name_version','created_at','updated_at'],'place rows expose only approved Logistics fields');
select ok(position('contract_value' in current_setting('test.logistics_projection'))=0 and position('operational_time' in current_setting('test.logistics_projection'))=0 and position('free_distance_km' in current_setting('test.logistics_projection'))=0,'projection omits contract, schedule, and commercial travel fields');
select is((select array_agg(key order by key) from jsonb_object_keys(current_setting('test.logistics_projection')::jsonb->'studio') as keys(key)),array['building_number','city','country','formatted_address','latitude','longitude','place_id','postal_code','street','studio_name']::text[],'studio response is the exact sanitized location allowlist');
select is(current_setting('test.logistics_projection')::jsonb->'studio'->>'place_id','owner-origin','studio origin comes from wedding owner rather than collaborator');
select ok(not (current_setting('test.logistics_projection')::jsonb->'studio' ? 'free_distance_km'),'studio commercial travel policy is absent');
select ok(not (current_setting('test.logistics_projection')::jsonb ?| array['price','contract_value','payments','finance','package','extras','questionnaire','operational_times','contacts','tasks','notes','compensation']),'projection excludes commercial and unrelated domains');
select throws_ok($$select public.get_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000002')$$,'P0001','UNAVAILABLE','inactive wedding projection is unavailable');
select throws_ok($$select public.get_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000003')$$,'P0001','UNAVAILABLE','cross-wedding projection is unavailable');
select throws_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_projection')::jsonb->>'access_version','upsert_place',jsonb_build_object('place_row_id','c8600000-0000-4000-8000-000000000001','role','ceremony','label','New Ceremony','formatted_address','New Ceremony Street','place_id','google-new','latitude',52.1,'longitude',21.0,'expected_address_version','2','expected_name_version','2'))$$,'P0001','FORBIDDEN','level-one Logistics member cannot mutate');
reset role;
select is(jsonb_build_object(
 'places',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.wedding_places p where p.wedding_id='c8200000-0000-4000-8000-000000000001'),
 'segments',(select coalesce(jsonb_agg(to_jsonb(s) order by s.sequence),'[]') from public.travel_segments s where s.wedding_id='c8200000-0000-4000-8000-000000000001'),
 'operational_versions',(select coalesce(jsonb_agg(to_jsonb(v) order by v.resource_type,v.role),'[]') from collaboration_private.wedding_operational_versions v where v.wedding_id='c8200000-0000-4000-8000-000000000001'),
 'route_versions',(select coalesce(jsonb_agg(to_jsonb(v) order by v.wedding_id),'[]') from collaboration_private.wedding_route_input_versions v where v.wedding_id='c8200000-0000-4000-8000-000000000001'),
 'origin_versions',(select coalesce(jsonb_agg(to_jsonb(v) order by v.user_id),'[]') from collaboration_private.studio_route_input_versions v where v.user_id='c8100000-0000-4000-8000-000000000001'),
 'times',(select coalesce(jsonb_agg(to_jsonb(t) order by t.stop_key),'[]') from public.wedding_operational_times t where t.wedding_id='c8200000-0000-4000-8000-000000000001'),
 'commercial',(select to_jsonb(w) from public.weddings w where w.id='c8200000-0000-4000-8000-000000000001'),
 'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.payments p where p.wedding_id='c8200000-0000-4000-8000-000000000001')),
 current_setting('test.logistics_read_snapshot')::jsonb,'view-level Logistics reads do not mutate places, route cache, generations, sidecars or commerce');
set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.wedding_places where wedding_id='c8200000-0000-4000-8000-000000000001'),0,'raw collaborator place SELECT remains owner-only');
select is((select count(*)::int from public.travel_segments where wedding_id='c8200000-0000-4000-8000-000000000001'),0,'raw collaborator route SELECT remains owner-only');
select is((select count(*)::int from public.studio_travel_settings where user_id='c8100000-0000-4000-8000-000000000001'),0,'raw collaborator studio setting SELECT remains owner-only');
select is((select count(*)::int from public.wedding_operational_times where wedding_id='c8200000-0000-4000-8000-000000000001'),0,'raw collaborator operational-time SELECT remains owner-only');
reset role;

update collaboration_private.membership_area_access set logistics=2 where membership_id=current_setting('test.logistics_membership_id')::uuid;
reset role;
select is(collaboration_private.resolve_wedding_area_level('c8200000-0000-4000-8000-000000000001','logistics')::int,2,'level-two snapshot grants Logistics edit');
set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000002',true);
select set_config('test.logistics_projection_v2',public.get_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001')::text,true);
select throws_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_projection_v2')::jsonb->>'access_version','upsert_place',jsonb_build_object('place_row_id','c8600000-0000-4000-8000-000000000003','role','ceremony','label','IDOR','formatted_address','Other wedding','place_id',null,'latitude',null,'longitude',null,'expected_address_version','1','expected_name_version','1'))$$,'P0001','CONFLICT','wedding A collaborator cannot submit a place row from wedding B');
select throws_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000003',current_setting('test.logistics_projection_v2')::jsonb->>'access_version','upsert_place',jsonb_build_object('place_row_id','c8600000-0000-4000-8000-000000000003','role','ceremony','label','IDOR','formatted_address','Other wedding','place_id',null,'latitude',null,'longitude',null,'expected_address_version','1','expected_name_version','1'))$$,'P0001','UNAVAILABLE','wedding A collaborator cannot mutate wedding B');
select set_config('test.logistics_bride_place',(select e.value::text from jsonb_array_elements(current_setting('test.logistics_projection_v2')::jsonb->'places') e(value) where e.value->>'id'='c8600000-0000-4000-8000-000000000004'),true);
select throws_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_projection_v2')::jsonb->>'access_version','upsert_place',jsonb_build_object('place_row_id','c8600000-0000-4000-8000-000000000005','role','bride_preparation','label','Wrong sibling','formatted_address','Wrong sibling address','place_id',null,'latitude',null,'longitude',null,'expected_address_version',current_setting('test.logistics_bride_place')::jsonb->>'address_version','expected_name_version',current_setting('test.logistics_bride_place')::jsonb->>'name_version'))$$,'P0001','CONFLICT','server rejects mutation of a non-selected historical duplicate');
select lives_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_projection_v2')::jsonb->>'access_version','upsert_place',jsonb_build_object('place_row_id','c8600000-0000-4000-8000-000000000004','role','bride_preparation','label','Selected canonical edited','formatted_address','Selected canonical address','place_id','canonical-bride-edited','latitude',52.15,'longitude',21.05,'expected_address_version',current_setting('test.logistics_bride_place')::jsonb->>'address_version','expected_name_version',current_setting('test.logistics_bride_place')::jsonb->>'name_version'))$$,'duplicate-role editor mutates the selected canonical preparation row');
reset role;
select is((select label from public.wedding_places where id='c8600000-0000-4000-8000-000000000004'),'Selected canonical edited','selected duplicate row is the row changed');
select is((select label from public.wedding_places where id='c8600000-0000-4000-8000-000000000005'),'Duplicate bride','duplicate sibling remains unchanged');
select is((select role from public.wedding_places where id='c8600000-0000-4000-8000-000000000006'),'preparation','legacy preparation remains unnormalized and unchanged');
set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000002',true);
select set_config('test.logistics_ceremony_place',(select e.value::text from jsonb_array_elements(current_setting('test.logistics_projection_v2')::jsonb->'places') e(value) where e.value->>'id'='c8600000-0000-4000-8000-000000000001'),true);
select lives_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_projection_v2')::jsonb->>'access_version','upsert_place',jsonb_build_object('place_row_id','c8600000-0000-4000-8000-000000000001','role','ceremony','label','New Ceremony','formatted_address','New Ceremony Street','place_id','google-new','latitude',52.1,'longitude',21.0,'expected_address_version',current_setting('test.logistics_ceremony_place')::jsonb->>'address_version','expected_name_version',current_setting('test.logistics_ceremony_place')::jsonb->>'name_version'))$$,'level-two member edits existing canonical place');
reset role;
select is((select formatted_address from public.wedding_places where id='c8600000-0000-4000-8000-000000000001'),'New Ceremony Street','place address mutation is applied to target wedding row');
select is((select label from public.wedding_places where id='c8600000-0000-4000-8000-000000000001'),'New Ceremony','place name mutation advances the intended canonical row');
select is((select contract_value::numeric from public.weddings where id='c8200000-0000-4000-8000-000000000001'),5678::numeric,'Logistics edit preserves contract value');
select is((select travel_fee_amount::numeric from public.weddings where id='c8200000-0000-4000-8000-000000000001'),90::numeric,'Logistics edit preserves charged travel amount');
select is((select package_items_snapshot->0->>'name' from public.weddings where id='c8200000-0000-4000-8000-000000000001'),'Snapshot package','Logistics edit preserves package snapshot');
select is((select count(*)::int from public.payments where wedding_id='c8200000-0000-4000-8000-000000000001'),1,'Logistics edit preserves payment rows');
set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001','stale','upsert_place','{}'::jsonb)$$,'P0001','CONFLICT','stale access version is rejected');
select set_config('test.logistics_projection_v3',public.get_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001')::text,true);
select set_config('test.logistics_ceremony_place_v3',(select e.value::text from jsonb_array_elements(current_setting('test.logistics_projection_v3')::jsonb->'places') e(value) where e.value->>'id'='c8600000-0000-4000-8000-000000000001'),true);
select lives_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_projection_v3')::jsonb->>'access_version','upsert_place',jsonb_build_object('place_row_id','c8600000-0000-4000-8000-000000000001','role','ceremony','label','New Ceremony','formatted_address','Manual unresolved ceremony address','place_id',null,'latitude',null,'longitude',null,'expected_address_version',current_setting('test.logistics_ceremony_place_v3')::jsonb->>'address_version','expected_name_version',current_setting('test.logistics_ceremony_place_v3')::jsonb->>'name_version'))$$,'level-two member saves an unresolved manual address');
reset role;
select is((select formatted_address from public.wedding_places where id='c8600000-0000-4000-8000-000000000001'),'Manual unresolved ceremony address','manual unresolved address persisted');
select is((select place_id from public.wedding_places where id='c8600000-0000-4000-8000-000000000001'),null::text,'manual unresolved address clears provider place ID');
set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000002',true);
select set_config('test.logistics_route_projection',public.get_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001')::text,true);
select is(current_setting('test.logistics_route_projection')::jsonb->'route_topology'->0->>'origin_kind','studio','route topology starts at wedding owner studio origin');
select ok(current_setting('test.logistics_route_projection')::jsonb->'route_topology'->0->>'endpoints_hash' like 'studio:owner-origin:%','route origin hash contains owner origin, not collaborator origin');
select lives_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_route_projection')::jsonb->>'access_version','replace_route_segments',jsonb_build_object(
 'route_contract_version',1,'expected_wedding_route_input_version',current_setting('test.logistics_route_projection')::jsonb->>'wedding_route_input_version',
 'expected_studio_origin_version',current_setting('test.logistics_route_projection')::jsonb->>'studio_origin_version','provider','google','travel_mode','DRIVE',
 'topology_token',current_setting('test.logistics_route_projection')::jsonb->>'topology_token',
 'segments',(select coalesce(jsonb_agg(jsonb_build_object('wedding_id','c8200000-0000-4000-8000-000000000001','sequence',(t.value->>'sequence')::int,
 'origin_kind',t.value->>'origin_kind','origin_wedding_place_id',t.value->'origin_wedding_place_id','destination_kind',t.value->>'destination_kind',
 'destination_wedding_place_id',t.value->'destination_wedding_place_id','endpoints_hash',t.value->>'endpoints_hash','distance_meters',100,
 'distance_text','100 m','duration_seconds',60,'duration_text','1 min','travel_mode','DRIVE','provider','google','status','ok','error_message',null,'calculated_at',now()::text)
 order by (t.value->>'sequence')::int),'[]'::jsonb) from jsonb_array_elements(current_setting('test.logistics_route_projection')::jsonb->'route_topology') t(value))))$$,'valid current-generation route persistence succeeds');
reset role;
select is((select count(*)::int from public.travel_segments where wedding_id='c8200000-0000-4000-8000-000000000001'),jsonb_array_length(current_setting('test.logistics_route_projection')::jsonb->'route_topology'),'route writer persists one segment per current topology leg');
select is((select count(*)::int from public.travel_segments where wedding_id='c8200000-0000-4000-8000-000000000001' and sequence=0 and origin_kind='studio' and endpoints_hash like 'studio:owner-origin:%'),1,'persisted first route leg retains owner studio origin');
select is((select travel_fee_amount::numeric from public.weddings where id='c8200000-0000-4000-8000-000000000001'),90::numeric,'route persistence preserves charged travel');
select is((select contract_value::numeric from public.weddings where id='c8200000-0000-4000-8000-000000000001'),5678::numeric,'route persistence preserves contract value');
select is((select count(*)::int from public.payments where wedding_id='c8200000-0000-4000-8000-000000000001'),1,'route persistence preserves payments');
select set_config('test.logistics_bad_route_segments',(select jsonb_agg(jsonb_build_object('wedding_id',s.wedding_id,'sequence',s.sequence,
 'origin_kind',s.origin_kind,'origin_wedding_place_id',s.origin_wedding_place_id,'destination_kind',s.destination_kind,
 'destination_wedding_place_id',case when s.sequence=0 then 'c8600000-0000-4000-8000-000000000003'::uuid else s.destination_wedding_place_id end,
 'endpoints_hash',case when s.sequence=0 then 'wrong-endpoints-hash' else s.endpoints_hash end,'distance_meters',s.distance_meters,
 'distance_text',s.distance_text,'duration_seconds',s.duration_seconds,'duration_text',s.duration_text,'travel_mode',s.travel_mode,
 'provider',s.provider,'status',s.status,'error_message',s.error_message,'calculated_at',s.calculated_at) order by s.sequence)::text
 from public.travel_segments s where s.wedding_id='c8200000-0000-4000-8000-000000000001'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_route_projection')::jsonb->>'access_version','replace_route_segments',jsonb_build_object('route_contract_version',1,'expected_wedding_route_input_version','999','expected_studio_origin_version',current_setting('test.logistics_route_projection')::jsonb->>'studio_origin_version','provider','google','travel_mode','DRIVE','topology_token',current_setting('test.logistics_route_projection')::jsonb->>'topology_token','segments','[]'::jsonb))$$,'P0001','CONFLICT','stale wedding route-input generation conflicts');
select throws_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_route_projection')::jsonb->>'access_version','replace_route_segments',jsonb_build_object('route_contract_version',1,'expected_wedding_route_input_version',current_setting('test.logistics_route_projection')::jsonb->>'wedding_route_input_version','expected_studio_origin_version','999','provider','google','travel_mode','DRIVE','topology_token',current_setting('test.logistics_route_projection')::jsonb->>'topology_token','segments','[]'::jsonb))$$,'P0001','CONFLICT','stale owner studio-origin generation conflicts');
select throws_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_route_projection')::jsonb->>'access_version','replace_route_segments',jsonb_build_object('route_contract_version',1,'expected_wedding_route_input_version',current_setting('test.logistics_route_projection')::jsonb->>'wedding_route_input_version','expected_studio_origin_version',current_setting('test.logistics_route_projection')::jsonb->>'studio_origin_version','provider','google','travel_mode','DRIVE','topology_token',repeat('0',64),'segments','[]'::jsonb))$$,'P0001','CONFLICT','stale route topology token conflicts');
select throws_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_route_projection')::jsonb->>'access_version','replace_route_segments',jsonb_build_object('route_contract_version',1,'expected_wedding_route_input_version',current_setting('test.logistics_route_projection')::jsonb->>'wedding_route_input_version','expected_studio_origin_version',current_setting('test.logistics_route_projection')::jsonb->>'studio_origin_version','provider','google','travel_mode','DRIVE','topology_token',current_setting('test.logistics_route_projection')::jsonb->>'topology_token','segments','[]'::jsonb))$$,'P0001','ROUTE_SEGMENT_INVALID','incorrect route leg count is rejected');
select throws_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_route_projection')::jsonb->>'access_version','replace_route_segments',jsonb_build_object('route_contract_version',1,'expected_wedding_route_input_version',current_setting('test.logistics_route_projection')::jsonb->>'wedding_route_input_version','expected_studio_origin_version',current_setting('test.logistics_route_projection')::jsonb->>'studio_origin_version','provider','google','travel_mode','DRIVE','topology_token',current_setting('test.logistics_route_projection')::jsonb->>'topology_token','segments',current_setting('test.logistics_bad_route_segments')::jsonb))$$,'P0001','ROUTE_SEGMENT_INVALID','wrong route endpoints are rejected');
select throws_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_projection_v3')::jsonb->>'access_version','upsert_place',jsonb_build_object('place_row_id','c8600000-0000-4000-8000-000000000001','role','ceremony','label','stale','formatted_address','stale','place_id',null,'latitude',null,'longitude',null,'expected_address_version',current_setting('test.logistics_ceremony_place_v3')::jsonb->>'address_version','expected_name_version',current_setting('test.logistics_ceremony_place_v3')::jsonb->>'name_version'))$$,'P0001','CONFLICT','stale place-field generations conflict');
select set_config('test.logistics_projection_clear',public.get_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001')::text,true);
select set_config('test.logistics_selected_bride_place_clear',(select e.value::text from jsonb_array_elements(current_setting('test.logistics_projection_clear')::jsonb->'places') e(value) where e.value->>'id'='c8600000-0000-4000-8000-000000000004'),true);
savepoint logistics_clear_atomicity;
select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_projection_clear')::jsonb->>'access_version','upsert_place',jsonb_build_object('place_row_id','c8600000-0000-4000-8000-000000000004','role','bride_preparation','label',null,'formatted_address','','place_id',null,'latitude',null,'longitude',null,'expected_address_version',current_setting('test.logistics_selected_bride_place_clear')::jsonb->>'address_version','expected_name_version',current_setting('test.logistics_selected_bride_place_clear')::jsonb->>'name_version'));
rollback to savepoint logistics_clear_atomicity;
reset role;
select is((select count(*)::int from public.wedding_places where id='c8600000-0000-4000-8000-000000000004'),1,'failed outer transaction rolls back selected duplicate-row removal');
select is((select count(*)::int from public.wedding_operational_times where wedding_id='c8200000-0000-4000-8000-000000000001' and stop_key='c8600000-0000-4000-8000-000000000004'),1,'failed outer transaction rolls back selected place sidecar cleanup');
set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000002',true);
select set_config('test.logistics_projection_v4',public.get_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001')::text,true);
select set_config('test.logistics_selected_bride_place_v4',(select e.value::text from jsonb_array_elements(current_setting('test.logistics_projection_v4')::jsonb->'places') e(value) where e.value->>'id'='c8600000-0000-4000-8000-000000000004'),true);
select lives_ok($$select public.mutate_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001',current_setting('test.logistics_projection_v4')::jsonb->>'access_version','upsert_place',jsonb_build_object('place_row_id','c8600000-0000-4000-8000-000000000004','role','bride_preparation','label',null,'formatted_address','','place_id',null,'latitude',null,'longitude',null,'expected_address_version',current_setting('test.logistics_selected_bride_place_v4')::jsonb->>'address_version','expected_name_version',current_setting('test.logistics_selected_bride_place_v4')::jsonb->>'name_version'))$$,'level-two member can clear selected canonical duplicate row');
reset role;
select is((select count(*)::int from public.wedding_places where id='c8600000-0000-4000-8000-000000000004'),0,'clear removes the selected canonical row');
select is((select count(*)::int from public.wedding_operational_times where wedding_id='c8200000-0000-4000-8000-000000000001' and stop_key='c8600000-0000-4000-8000-000000000004'),0,'clear removes exact selected-row operational-time sidecar');
select is((select count(*)::int from public.wedding_places where id='c8600000-0000-4000-8000-000000000005'),1,'clear preserves the duplicate sibling row');
select is((select count(*)::int from public.wedding_places where id='c8600000-0000-4000-8000-000000000006'),1,'clear preserves legacy preparation row');
select is((select count(*)::int from public.wedding_operational_times where wedding_id='c8200000-0000-4000-8000-000000000001' and stop_key='c8600000-0000-4000-8000-000000000002'),1,'clear preserves another same-wedding sidecar');
select is((select count(*)::int from public.wedding_operational_times where wedding_id='c8200000-0000-4000-8000-000000000003' and stop_key='c8600000-0000-4000-8000-000000000003'),1,'clear preserves another wedding sidecar');
reset role;
update public.wedding_collaboration_memberships set status='revoked',revoked_at=now() where id=current_setting('test.logistics_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_collaborative_wedding_logistics_v3('c8200000-0000-4000-8000-000000000001')$$,'P0001','UNAVAILABLE','revoked membership projection is unavailable');
reset role;

select * from finish();
rollback;
