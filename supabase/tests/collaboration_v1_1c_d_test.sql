begin;
select no_plan();

select ok((select count(*)=1 from pg_catalog.pg_trigger t
  join pg_catalog.pg_proc p on p.oid=t.tgfoid
  where t.tgrelid='public.weddings'::regclass
    and t.tgname='a_wedding_1cd_operational_delete_lock'
    and (t.tgtype & 1)=0
    and pg_catalog.pg_get_functiondef(p.oid) ilike '%ourwed:wedding-extra-mutation%'
    and pg_catalog.pg_get_functiondef(p.oid) ilike '%for update%'),
  'wedding delete statement locks its actor before E and before any wedding row');

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


select has_table('collaboration_private','wedding_operational_versions','private logical version ledger exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class where oid='collaboration_private.wedding_operational_versions'::regclass),'version ledger forces RLS');
select ok(not has_schema_privilege('authenticated','collaboration_private','USAGE'),'authenticated cannot use private schema');
select has_function('public','get_collaborative_wedding_operational_edit_state',array['uuid'],'versioned edit-state RPC exists');
select has_function('public','update_collaborative_wedding_place',array['uuid','text','text','text'],'address command RPC exists');
select has_function('public','update_collaborative_operational_time',array['uuid','text','text','text'],'time command RPC exists');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_catalog.pg_proc where oid in (
 'public.get_collaborative_wedding_operational_edit_state(uuid)'::regprocedure,
 'public.update_collaborative_wedding_place(uuid,text,text,text)'::regprocedure,
 'public.update_collaborative_operational_time(uuid,text,text,text)'::regprocedure)),'all 1C-D RPCs are hardened SECURITY DEFINER with empty search_path');
select ok((select bool_and(has_function_privilege('authenticated',oid,'EXECUTE') and not has_function_privilege('anon',oid,'EXECUTE')) from pg_catalog.pg_proc where oid in (
 'public.get_collaborative_wedding_operational_edit_state(uuid)'::regprocedure,
 'public.update_collaborative_wedding_place(uuid,text,text,text)'::regprocedure,
 'public.update_collaborative_operational_time(uuid,text,text,text)'::regprocedure)),'only authenticated can execute the 1C-D RPCs');
select ok(not exists(select 1 from pg_catalog.pg_policy where polrelid in ('public.weddings'::regclass,'public.wedding_places'::regclass,'public.wedding_operational_times'::regclass) and polname ilike '%collab%'),'no membership-based direct table policies were added');

grant update on public.wedding_places to authenticated;
grant update on public.wedding_operational_times to authenticated;
grant delete on public.wedding_operational_times to authenticated;
create policy collaboration_1cd_test_owner_place_update on public.wedding_places
  for update to authenticated using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
create policy collaboration_1cd_test_owner_time_update on public.wedding_operational_times
  for update to authenticated using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select is((select array_agg(key order by key) from jsonb_object_keys(public.get_collaborative_wedding_operational_edit_state('21000000-0000-4000-8000-000000000001'::uuid)) as keys(key)),array['places','wedding_id']::text[],'edit state returns only the two root keys');
select is(jsonb_array_length(public.get_collaborative_wedding_operational_edit_state('21000000-0000-4000-8000-000000000001'::uuid)->'places'),4,'edit state returns exactly four approved operational roles');
select ok(not (public.get_collaborative_wedding_operational_edit_state('21000000-0000-4000-8000-000000000001'::uuid)::text ~ 'PRIVATE_PLACE_SENTINEL|PRIVATE_LABEL_SENTINEL|61000000-0000'),'edit state excludes map IDs and private labels');
select is(public.update_collaborative_wedding_place('21000000-0000-4000-8000-000000000001'::uuid,'bride_preparation','Baker Street','1')->>'address_version','2','address command advances generation');
select is(public.update_collaborative_wedding_place('21000000-0000-4000-8000-000000000001'::uuid,'bride_preparation','Baker Street','1')->>'changed','false','same-value retry is idempotent despite stale token');
select throws_ok($$select public.update_collaborative_wedding_place('21000000-0000-4000-8000-000000000001'::uuid,'bride_preparation','Different address','1')$$,'P0001','CONFLICT','stale address write is rejected');
select is(public.update_collaborative_wedding_place('21000000-0000-4000-8000-000000000001'::uuid,'bride_preparation','Initial address','2')->>'address_version','3','ABA restoration advances a new generation');
select throws_ok($$select public.update_collaborative_wedding_place('21000000-0000-4000-8000-000000000001'::uuid,'bride_preparation','Baker Street','1')$$,'P0001','CONFLICT','ABA replay with the original generation is rejected');
select is(public.update_collaborative_operational_time('21000000-0000-4000-8000-000000000001'::uuid,'ceremony','15:45',null)->>'time_version','1','first time override creates its initial generation');
select is(public.update_collaborative_operational_time('21000000-0000-4000-8000-000000000001'::uuid,'ceremony',null,'1')->>'time_version','2','time tombstone advances generation');
select is(public.get_collaborative_wedding_operational_edit_state('21000000-0000-4000-8000-000000000001'::uuid)->'places'->2->>'effective_operational_time','15:30','clearing ceremony override restores valid ceremony fallback');
select is(public.get_collaborative_wedding_operational_edit_state('21000000-0000-4000-8000-000000000001'::uuid)->'places'->2->>'time_source','ceremony_fallback','edit state identifies fallback source');
select throws_ok($$select public.update_collaborative_operational_time('21000000-0000-4000-8000-000000000001'::uuid,'ceremony','24:00','3')$$,'P0001','VALIDATION_ERROR','time input validation retains precedence before authority evaluation');
select throws_ok($$select public.update_collaborative_wedding_place('21000000-0000-4000-8000-000000000001'::uuid,'hotel','No','1')$$,'P0001','VALIDATION_ERROR','non-approved place role is rejected');
select throws_ok($$select public.update_collaborative_wedding_place('21000000-0000-4000-8000-000000000001'::uuid,'ceremony',repeat('x',501),'1')$$,'P0001','VALIDATION_ERROR','oversized address is rejected');
select throws_ok($$select public.update_collaborative_wedding_place('21000000-0000-4000-8000-000000000001'::uuid,'ceremony',E'bad\naddress','1')$$,'P0001','VALIDATION_ERROR','control characters in address are rejected');
select throws_ok($$select public.get_collaborative_wedding_operational_edit_state('21000000-0000-4000-8000-000000000006'::uuid)$$,'P0001','UNAVAILABLE','non-member cannot read edit state');
select lives_ok($pgtap$do $$ declare n int; begin update public.wedding_places set formatted_address='direct write' where wedding_id='21000000-0000-4000-8000-000000000001'; get diagnostics n = row_count; if n <> 0 then raise exception 'DIRECT_WRITE_ALLOWED'; end if; end $$;$pgtap$,'member direct place UPDATE affects zero rows');
select lives_ok($pgtap$do $$ declare n int; begin delete from public.wedding_operational_times where wedding_id='21000000-0000-4000-8000-000000000001'; get diagnostics n = row_count; if n <> 0 then raise exception 'DIRECT_WRITE_ALLOWED'; end if; end $$;$pgtap$,'member direct time DELETE affects zero rows');
reset role;
select ok((select place_id is null and latitude is null and longitude is null and formatted_address='Initial address'
 from public.wedding_places where wedding_id='21000000-0000-4000-8000-000000000001' and role='bride_preparation'),'address write clears map identity and coordinates');
select ok((select updated_by_user_id='11000000-0000-4000-8000-000000000002'::uuid and updated_source='collaborator'
 from public.wedding_places where wedding_id='21000000-0000-4000-8000-000000000001' and role='bride_preparation'),'collaborator provenance is preserved on the place row');
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
update public.wedding_places set label='Owner direct edit'
where wedding_id='21000000-0000-4000-8000-000000000001' and role='bride_preparation';
update public.wedding_operational_times set operational_time='08:00'
where wedding_id='21000000-0000-4000-8000-000000000001' and stop_key='61000000-0000-4000-8000-000000000001';
reset role;
select ok((select updated_by_user_id='11000000-0000-4000-8000-000000000001'::uuid and updated_source='owner'
 from public.wedding_places where wedding_id='21000000-0000-4000-8000-000000000001' and role='bride_preparation'),'existing owner place DML remains functional and records owner provenance');
select is((select version::text from collaboration_private.wedding_operational_versions
 where wedding_id='21000000-0000-4000-8000-000000000001' and resource_type='place_name' and role='bride_preparation'),'2',
 'existing owner label edit advances the separate place-name generation');
select ok((select updated_by_user_id='11000000-0000-4000-8000-000000000001'::uuid and updated_source='owner'
 from public.wedding_operational_times where wedding_id='21000000-0000-4000-8000-000000000001' and stop_key='61000000-0000-4000-8000-000000000001'),'existing owner time DML remains functional and records owner provenance');
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select throws_ok($$select public.get_collaborative_wedding_operational_edit_state('21000000-0000-4000-8000-000000000001'::uuid)$$,'42501',null,'anon cannot call edit-state RPC');
select throws_ok($$select public.update_collaborative_wedding_place('21000000-0000-4000-8000-000000000001'::uuid,'ceremony','x','1')$$,'42501',null,'anon cannot call address RPC');
reset role;
revoke update on public.wedding_places, public.wedding_operational_times from authenticated;
revoke delete on public.wedding_operational_times from authenticated;
with f as (
  select pg_get_functiondef('public.apply_wedding_contract_recovery(uuid,uuid,uuid,timestamptz,jsonb,boolean,integer[],integer[])'::regprocedure) as d
)
select ok(position('public.lock_contract_recovery_actor(v_uid)' in d)
  < position('ourwed:wedding-extra-mutation' in d)
  and position('ourwed:wedding-extra-mutation' in d) < position('from public.weddings' in d)
  and position('from public.weddings' in d) < position('pg_advisory_xact_lock(1330918916, 1)' in d)
  and position('pg_advisory_xact_lock(1330918916, 1)' in d) < position('source-contract:' in d)
  and position('from public.wedding_contract_recoveries' in substring(d from position('source-contract:' in d)))
    < position('for update' in substring(d from position('source-contract:' in d))),
  'recovery follows actor → E → wedding → O → S → recovery row') from f;
with f as (select pg_get_functiondef('public.public_submit_form_by_token(text,jsonb)'::regprocedure) as d)
select ok(position('ourwed:wedding-extra-mutation' in d) < position('from public.form_instances' in d),
  'public form submission takes E before the form row') from f;
with f as (select pg_get_functiondef('public.erase_account_data(uuid)'::regprocedure) as d)
select ok(position('select u.id into v_locked_user_id' in d) < position('ourwed:wedding-extra-mutation' in d)
  and position('ourwed:wedding-extra-mutation' in d) < position('delete from public.form_answers' in d),
  'account erasure locks user → E before child cleanup') from f;
with f as (select pg_get_functiondef('public.update_collaborative_wedding_place(uuid,text,text,text)'::regprocedure) as d)
select ok(position('pg_advisory_xact_lock(1330918916,1)' in d) < position('source-contract:' in d)
  and position('source-contract:' in d) < position('from public.wedding_collaboration_memberships' in d),
  'address RPC takes O → S before membership/resource rows') from f;
select ok(position('source-contract:' in pg_get_functiondef('public.update_collaborative_operational_time(uuid,text,text,text)'::regprocedure))=0,
  'time RPC deliberately skips S');
with f as (select pg_get_functiondef('public.revoke_wedding_collaboration_membership(uuid,uuid)'::regprocedure) as d)
select ok(position('public.wedding_collaboration_lock_users(array[v_actor,v_peek.member_user_id])' in d)
    < position('from public.weddings w where w.id=v_peek.wedding_id and w.user_id=v_actor for update' in d)
    and position('from public.wedding_collaboration_memberships m where m.id=p_membership_id for update'
      in substring(d from position('from public.weddings w where w.id=v_peek.wedding_id and w.user_id=v_actor for update' in d))) > 0,
  'membership revoke locks both participants before wedding and membership to preserve canonical user → wedding → membership order') from f;
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc
  where oid='public.lock_contract_recovery_actor(uuid)'::regprocedure)
  and has_function_privilege('authenticated','public.lock_contract_recovery_actor(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.lock_contract_recovery_actor(uuid)','EXECUTE'),
  'recovery actor lock helper is hardened and authenticated-only');
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.apply_wedding_contract_recovery('71000000-0000-4000-8000-000000000001'::uuid,'72000000-0000-4000-8000-000000000001'::uuid,'73000000-0000-4000-8000-000000000001'::uuid,null,'{}'::jsonb,false,array[]::integer[],array[]::integer[])$$,
  'P0001','CONTRACT_RECOVERY_INVALID_DECISIONS','recovery preserves input-validation error precedence');
select throws_ok($$select public.apply_wedding_contract_recovery('71000000-0000-4000-8000-000000000002'::uuid,'72000000-0000-4000-8000-000000000002'::uuid,'73000000-0000-4000-8000-000000000002'::uuid,null,'[]'::jsonb,false,array[]::integer[],array[]::integer[])$$,
  'P0001','CONTRACT_RECOVERY_NOT_FOUND','recovery preserves missing-recovery result before wedding lookup');
reset role;
select lives_ok($pgtap$do $$begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:wedding-extra-mutation',0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:wedding-extra-mutation',0));
  perform pg_catalog.pg_advisory_xact_lock(1330918916,1);
  perform pg_catalog.pg_advisory_xact_lock(1330918916,1);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('source-contract:21000000-0000-4000-8000-000000000001',0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('source-contract:21000000-0000-4000-8000-000000000001',0));
end$$;$pgtap$,'reentrant same-transaction E/O/S acquisition does not self-block');
select ok(not has_table_privilege('authenticated','public.wedding_places','UPDATE')
  and not has_table_privilege('authenticated','public.wedding_operational_times','UPDATE'),
  '1C-D does not grant direct authenticated write access to operational tables');
insert into public.form_instances(id,form_id,wedding_id,user_id,token,token_hash,status,options_snapshot)
select '71000000-0000-4000-8000-000000000001'::uuid,f.id,
  '21000000-0000-4000-8000-000000000001'::uuid,'11000000-0000-4000-8000-000000000001'::uuid,
  'local-form-lock-order-token-001',
  encode(extensions.digest(convert_to('local-form-lock-order-token-001','UTF8'),'sha256'),'hex'),
  'pending','{}'::jsonb
from public.forms f limit 1;
set local role anon;
select ok(public.public_submit_form_by_token('local-form-lock-order-token-001',
  '{"fields":{"additionalNotes":"Form lock order regression"}}'::jsonb)->'instance'->>'status'='submitted',
  'public form submission preserves successful response and status');
select throws_ok($$select public.public_submit_form_by_token('local-form-lock-order-token-001','{}'::jsonb)$$,
  'P0001','ALREADY_SUBMITTED','form submission preserves replay error');
select throws_ok($$select public.public_submit_form_by_token('bad','{}'::jsonb)$$,
  'P0001','INVALID_TOKEN','form submission preserves invalid-token error');
reset role;
select is((select count(*)::integer from public.form_answers where instance_id='71000000-0000-4000-8000-000000000001'),1,
  'valid form submission persists exactly one answer');
select ok(exists(select 1 from public.notes where wedding_id='21000000-0000-4000-8000-000000000001' and content='Form lock order regression'),
  'valid form submission preserves note projection');
select ok(exists(select 1 from public.timeline_events where wedding_id='21000000-0000-4000-8000-000000000001' and type='questionnaire_completed'),
  'valid form submission preserves timeline projection');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(public.erase_account_data('11000000-0000-4000-8000-000000000004'::uuid)->>'already_erased','false',
  'account erasure preserves first-run result');
reset role;
select ok(not exists(select 1 from public.users where id='11000000-0000-4000-8000-000000000004'::uuid),
  'account erasure removes only the target public user');
select ok(exists(select 1 from auth.users where id='11000000-0000-4000-8000-000000000004'::uuid),
  'account erasure preserves the Auth identity as before');
select ok(exists(select 1 from public.weddings where user_id='11000000-0000-4000-8000-000000000001'::uuid),
  'account erasure preserves unrelated owner weddings');
set local role service_role;
select is(public.erase_account_data('11000000-0000-4000-8000-000000000004'::uuid)->>'already_erased','true',
  'account erasure preserves idempotent already-erased result');
reset role;
select has_table('collaboration_private','wedding_route_input_versions','route-input generation ledger exists');
select has_table('collaboration_private','studio_route_input_versions','studio-origin generation ledger exists');
select ok(not has_table_privilege('authenticated','public.travel_segments','INSERT')
  and not has_table_privilege('authenticated','public.travel_segments','UPDATE')
  and not has_table_privilege('authenticated','public.travel_segments','DELETE'),
  'authenticated route cache writes are restricted to guarded RPC');
select ok(has_table_privilege('authenticated','public.travel_segments','SELECT'),
  'owner route cache SELECT remains available');
select has_function('public','get_wedding_travel_route_snapshot',array['uuid'],'owner route snapshot RPC exists');
select has_function('public','replace_wedding_travel_segments_if_current',array['uuid','integer','text','text','text','text','text','jsonb'],'guarded route persistence RPC exists');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_catalog.pg_proc where oid in (
  'public.get_wedding_travel_route_snapshot(uuid)'::regprocedure,
  'public.replace_wedding_travel_segments_if_current(uuid,integer,text,text,text,text,text,jsonb)'::regprocedure)),
  'route RPCs are SECURITY DEFINER with empty search_path');
select ok(has_function_privilege('authenticated','public.get_wedding_travel_route_snapshot(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.replace_wedding_travel_segments_if_current(uuid,integer,text,text,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.get_wedding_travel_route_snapshot(uuid)','EXECUTE'),
  'only authenticated callers can execute route RPCs');

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select lives_ok($pgtap$do $$declare r jsonb; begin
  r:=public.upsert_studio_travel_settings_guarded(
    '{"studio_name":"Route harness","street":"Route Street","building_number":"1","postal_code":"00-001","city":"Warsaw","country":"Polska","formatted_address":"Route Street 1","latitude":52.2297,"longitude":21.0122,"place_id":"studio-route-harness","free_distance_km":50}'::jsonb,false);
  perform public.mutate_owner_wedding_places('21000000-0000-4000-8000-000000000001'::uuid,'upsert',
    jsonb_build_object('role','ceremony','formatted_address','Route Venue','has_location',true,'place_id','route-venue',
      'latitude',52.2301,'longitude',21.013,'label','Venue','label_supplied',true));
  perform public.mutate_owner_wedding_places('21000000-0000-4000-8000-000000000001'::uuid,'upsert',
    '{"role":"groom_preparation","formatted_address":"Route Groom","has_location":true,"place_id":"route-groom","latitude":52.2298,"longitude":21.0124,"label":"Groom","label_supplied":true}'::jsonb);
  perform public.mutate_owner_wedding_places('21000000-0000-4000-8000-000000000001'::uuid,'upsert',
    '{"role":"bride_preparation","formatted_address":"Route Bride","has_location":true,"place_id":"route-bride","latitude":52.2299,"longitude":21.0126,"label":"Bride","label_supplied":true}'::jsonb);
  perform public.mutate_owner_wedding_places('21000000-0000-4000-8000-000000000001'::uuid,'upsert',
    '{"role":"reception","formatted_address":"Route Reception","has_location":true,"place_id":"route-reception","latitude":52.2303,"longitude":21.0133,"label":"Reception","label_supplied":true}'::jsonb);
  r:=public.get_wedding_travel_route_snapshot('21000000-0000-4000-8000-000000000001'::uuid);
  if r->>'route_contract_version'<>'1' or jsonb_typeof(r->'wedding_route_input_version')<>'string'
    or jsonb_typeof(r->'studio_origin_version')<>'string' or r->>'provider'<>'google' or r->>'travel_mode'<>'DRIVE'
    or r->>'topology_token' !~ '^[0-9a-f]{64}$' then raise exception 'SNAPSHOT_INVALID'; end if;
end$$;$pgtap$,'owner snapshot returns the server contract, decimal-string generations, and topology token');
select lives_ok($pgtap$do $$declare snap jsonb; payload jsonb; response jsonb; v_count integer; begin
  snap:=public.get_wedding_travel_route_snapshot('21000000-0000-4000-8000-000000000001'::uuid);
  select coalesce(jsonb_agg(jsonb_build_object('wedding_id','21000000-0000-4000-8000-000000000001',
    'sequence',t->'sequence','origin_kind',t->'origin_kind','origin_wedding_place_id',t->'origin_wedding_place_id',
    'destination_kind',t->'destination_kind','destination_wedding_place_id',t->'destination_wedding_place_id',
    'endpoints_hash',t->'endpoints_hash','distance_meters',1200,'distance_text','1.2 km','duration_seconds',300,
    'duration_text','5 min','travel_mode','DRIVE','provider','google','status','ok','error_message',null,
    'calculated_at',now()::text) order by (t->>'sequence')::integer),'[]'::jsonb)
    into payload from jsonb_array_elements(snap->'route_topology') t;
  if jsonb_array_length(payload)=0 then raise exception 'NO_ROUTE_FIXTURE'; end if;
  response:=public.replace_wedding_travel_segments_if_current('21000000-0000-4000-8000-000000000001'::uuid,1,
    snap->>'wedding_route_input_version',snap->>'studio_origin_version','google','DRIVE',snap->>'topology_token',payload);
  if response->>'status'<>'ok' then raise exception 'PERSIST_FAILED'; end if;
  response:=public.replace_wedding_travel_segments_if_current('21000000-0000-4000-8000-000000000001'::uuid,1,
    snap->>'wedding_route_input_version',snap->>'studio_origin_version','google','DRIVE',snap->>'topology_token',payload);
  select count(*) into v_count from public.travel_segments where wedding_id='21000000-0000-4000-8000-000000000001';
  if v_count<>jsonb_array_length(payload) then raise exception 'RETRY_NOT_IDEMPOTENT'; end if;
end$$;$pgtap$,'owner route persistence succeeds and exact payload retry creates no duplicates');
select lives_ok($pgtap$do $$declare old_snap jsonb; current_snap jsonb; payload jsonb; variant jsonb; response jsonb; bad_payloads jsonb[]; v_count integer; begin
  old_snap:=public.get_wedding_travel_route_snapshot('21000000-0000-4000-8000-000000000001'::uuid);
  select coalesce(jsonb_agg(jsonb_build_object('wedding_id','21000000-0000-4000-8000-000000000001',
    'sequence',t->'sequence','origin_kind',t->'origin_kind','origin_wedding_place_id',t->'origin_wedding_place_id',
    'destination_kind',t->'destination_kind','destination_wedding_place_id',t->'destination_wedding_place_id',
    'endpoints_hash',t->'endpoints_hash','distance_meters',1200,'distance_text','1.2 km','duration_seconds',300,
    'duration_text','5 min','travel_mode','DRIVE','provider','google','status','ok','error_message',null,
    'calculated_at',now()::text) order by (t->>'sequence')::integer),'[]'::jsonb)
    into payload from jsonb_array_elements(old_snap->'route_topology') t;
  perform public.mutate_owner_wedding_places('21000000-0000-4000-8000-000000000001'::uuid,'upsert',
    '{"role":"ceremony","formatted_address":"New route venue","has_location":true,"place_id":"route-venue-new","latitude":52.2302,"longitude":21.0131,"label":"Venue","label_supplied":true}'::jsonb);
  begin
    perform public.replace_wedding_travel_segments_if_current('21000000-0000-4000-8000-000000000001'::uuid,1,
      old_snap->>'wedding_route_input_version',old_snap->>'studio_origin_version','google','DRIVE',old_snap->>'topology_token',payload);
    raise exception 'OLD_SNAPSHOT_ACCEPTED';
  exception when raise_exception then
    if sqlerrm<>'STALE_ROUTE_INPUT' then raise; end if;
  end;
  select count(*) into v_count from public.travel_segments where wedding_id='21000000-0000-4000-8000-000000000001';
  if v_count<>0 then raise exception 'STALE_WRITE_OCCURRED'; end if;
  current_snap:=public.get_wedding_travel_route_snapshot('21000000-0000-4000-8000-000000000001'::uuid);
  select coalesce(jsonb_agg(jsonb_build_object('wedding_id','21000000-0000-4000-8000-000000000001',
    'sequence',t->'sequence','origin_kind',t->'origin_kind','origin_wedding_place_id',t->'origin_wedding_place_id',
    'destination_kind',t->'destination_kind','destination_wedding_place_id',t->'destination_wedding_place_id',
    'endpoints_hash',t->'endpoints_hash','distance_meters',1200,'distance_text','1.2 km','duration_seconds',300,
    'duration_text','5 min','travel_mode','DRIVE','provider','google','status','ok','error_message',null,
    'calculated_at',now()::text) order by (t->>'sequence')::integer),'[]'::jsonb)
    into payload from jsonb_array_elements(current_snap->'route_topology') t;
  begin
    perform public.replace_wedding_travel_segments_if_current('21000000-0000-4000-8000-000000000001'::uuid,1,
      current_snap->>'wedding_route_input_version',current_snap->>'studio_origin_version','google','DRIVE',old_snap->>'topology_token',payload);
    raise exception 'CURRENT_VECTOR_OLD_TOKEN_ACCEPTED';
  exception when raise_exception then
    if sqlerrm<>'STALE_ROUTE_INPUT' then raise; end if;
  end;
  bad_payloads:=array[
    payload-0,
    jsonb_set(payload,'{1,sequence}',payload->0->'sequence'),
    jsonb_set(payload,'{0,sequence}',to_jsonb(99)),
    jsonb_set(payload,'{0,wedding_id}',to_jsonb('21000000-0000-4000-8000-000000000006'::text)),
    jsonb_set(payload,'{0,endpoints_hash}',to_jsonb('tampered'::text)),
    jsonb_set(payload,'{0,destination_wedding_place_id}',to_jsonb('61000000-0000-4000-8000-000000000099'::text))
  ];
  foreach variant in array bad_payloads loop
    begin
      perform public.replace_wedding_travel_segments_if_current('21000000-0000-4000-8000-000000000001'::uuid,1,
        current_snap->>'wedding_route_input_version',current_snap->>'studio_origin_version','google','DRIVE',current_snap->>'topology_token',variant);
      raise exception 'TAMPERED_PAYLOAD_ACCEPTED';
    exception when raise_exception then
      if sqlerrm<>'ROUTE_SEGMENT_INVALID' then raise; end if;
    end;
    select count(*) into v_count from public.travel_segments where wedding_id='21000000-0000-4000-8000-000000000001';
    if v_count<>0 then raise exception 'INVALID_PAYLOAD_PARTIAL_WRITE'; end if;
  end loop;
end$$;$pgtap$,'place mutation rejects stale vectors and token, and topology/payload tampering writes no rows');
select throws_ok($$select public.replace_wedding_travel_segments_if_current('21000000-0000-4000-8000-000000000001'::uuid,1,'1','1','other','DRIVE',repeat('0',64),'[]'::jsonb)$$,
  'P0001','ROUTE_SEGMENT_INVALID','wrong provider is rejected');
select throws_ok($$select public.replace_wedding_travel_segments_if_current('21000000-0000-4000-8000-000000000001'::uuid,1,'1','1','google','WALK',repeat('0',64),'[]'::jsonb)$$,
  'P0001','ROUTE_SEGMENT_INVALID','wrong travel mode is rejected');
select throws_ok($$select public.replace_wedding_travel_segments_if_current('21000000-0000-4000-8000-000000000006'::uuid,1,'1','1','google','DRIVE',repeat('0',64),'[]'::jsonb)$$,
  'P0001','UNAVAILABLE', 'non-owner cannot persist route data');
select throws_ok($$select public.get_wedding_travel_route_snapshot('21000000-0000-4000-8000-000000000006'::uuid)$$,
  'P0001','UNAVAILABLE','non-owner cannot read route snapshot');
select throws_ok($$insert into public.travel_segments(wedding_id,sequence,origin_kind,origin_wedding_place_id,destination_kind,destination_wedding_place_id,endpoints_hash,travel_mode,provider,status)
  values('21000000-0000-4000-8000-000000000001'::uuid,99,'wedding_place','61000000-0000-4000-8000-000000000001'::uuid,'wedding_place','61000000-0000-4000-8000-000000000001'::uuid,'x','DRIVE','google','error')$$,
  '42501',null,'authenticated owner direct route-segment INSERT is denied');
select throws_ok($$update public.wedding_places set formatted_address='bypass' where wedding_id='21000000-0000-4000-8000-000000000001'::uuid$$,
  '42501',null,'authenticated owner direct place UPDATE is denied');
select throws_ok($$update public.studio_travel_settings set city='bypass' where user_id='11000000-0000-4000-8000-000000000001'::uuid$$,
  '42501',null,'authenticated owner direct studio UPDATE is denied');
reset role;
select * from finish();
rollback;
