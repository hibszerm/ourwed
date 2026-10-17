begin;
select no_plan();

select is((select count(*)::integer from public.contacts_backfill_expected),26,
  'the migration-time Contacts backfill matrix includes twenty-six synthetic legacy rows');
select is((select count(*)::integer from public.contacts_backfill_expected e
  join public.form_answers fa on fa.instance_id=e.instance_id where fa.answer_json<>e.answer_json),0,
  'historical Contract answer fixtures remain unchanged after the migration');
select is((select collaboration_private.format_effective_contact_address_v3(w.contract_address,w.contract_postal_code,w.contract_city)
  from public.contacts_backfill_expected e join public.weddings w on w.id=e.wedding_id
  where e.wedding_id='e8820000-0000-4000-8000-000000000001'),
  (select effective_owner_address from public.contacts_backfill_expected order by wedding_id limit 1),
  'canonical q-p1-postal values fixture preserves the complete owner-visible address');
select is((select count(*)::integer from public.contacts_backfill_expected e join public.weddings w on w.id=e.wedding_id
  where collaboration_private.format_effective_contact_address_v3(w.contract_address,w.contract_postal_code,w.contract_city)
    is distinct from e.effective_owner_address),0,
  'all migration-time legacy representations preserve their effective owner-visible address');

-- The exact P2 reproduction: q-p1-postal is canonical; the former
-- q-p1-postal-code compatibility alias is covered by fixtures 3 and 4.
select is((select collaboration_private.format_effective_contact_address_v3(w.contract_address,w.contract_postal_code,w.contract_city)
  from public.weddings w where w.id='e8820000-0000-4000-8000-000000000001'),
  'ul. Testowa 1, 00-123 Warszawa','canonical values question ID retains postal code during cutover');
select is((select collaboration_private.format_effective_contact_address_v3(w.contract_address,w.contract_postal_code,w.contract_city)
  from public.weddings w where w.id='e8820000-0000-4000-8000-000000000002'),
  'ul. Testowa 1, 00-123 Warszawa','canonical answers-array question ID retains postal code during cutover');
select is((select collaboration_private.format_effective_contact_address_v3(w.contract_address,w.contract_postal_code,w.contract_city)
  from public.weddings w where w.id='e8820000-0000-4000-8000-000000000003'),
  'ul. Testowa 1, 00-123 Warszawa','legacy values postal alias remains supported');
select is((select collaboration_private.format_effective_contact_address_v3(w.contract_address,w.contract_postal_code,w.contract_city)
  from public.weddings w where w.id='e8820000-0000-4000-8000-000000000004'),
  'ul. Testowa 1, 00-123 Warszawa','legacy answers-array postal alias remains supported');
select is((select collaboration_private.format_effective_contact_address_v3(w.contract_address,w.contract_postal_code,w.contract_city)
  from public.weddings w where w.id='e8820000-0000-4000-8000-000000000008'),
  'ul. Testowa 1, Warszawa','street and city without postal code have no formatting artifacts');
select is((select collaboration_private.format_effective_contact_address_v3(w.contract_address,w.contract_postal_code,w.contract_city)
  from public.weddings w where w.id='e8820000-0000-4000-8000-000000000009'),
  'ul. Wierszowa 3, 00-123 Warszawa','postal and city use the existing row address when answer address is absent');
select is(collaboration_private.format_effective_contact_address_v3('ul. Testowa 1, 00-123','00-123','Warszawa'),
  'ul. Testowa 1, 00-123 Warszawa','existing postal code does not suppress a missing city');
select is(collaboration_private.format_effective_contact_address_v3('ul. Testowa 1, Warszawa','00-123','Warszawa'),
  'ul. Testowa 1, 00-123 Warszawa','existing city is moved after postal code without duplication');
select is(collaboration_private.format_effective_contact_address_v3('Warszawa',null,'Warszawa'),
  'Warszawa','city-only base is not duplicated');
select is(collaboration_private.format_effective_contact_address_v3(null,'00-123','Warszawa'),
  '00-123 Warszawa','empty base preserves both postal and city');
select is(collaboration_private.format_effective_contact_address_v3(null,null,'Warszawa'),
  'Warszawa','empty base preserves city only');
select is(collaboration_private.format_effective_contact_address_v3(null,'00-123',null),
  '00-123','empty base preserves postal only');
select is(collaboration_private.format_effective_contact_address_v3('ul. Testowa 1, 00-123 Warszawa','00-123','Warszawa'),
  'ul. Testowa 1, 00-123 Warszawa','complete base address remains unchanged');
select is(collaboration_private.format_effective_contact_address_v3('00-123','00-123','Warszawa'),
  '00-123 Warszawa','postal-only base receives city without duplicating postal');
select is(collaboration_private.format_effective_contact_address_v3('ul. Testowa 1','00-123','Warszawa'),
  'ul. Testowa 1, 00-123 Warszawa','street-only base receives postal and city');
select is(collaboration_private.format_effective_contact_address_v3('Warszawa','00-123','Warszawa'),
  '00-123 Warszawa','city-only base with postal is normalized to postal city');
select is(collaboration_private.format_effective_contact_address_v3('ul. Testowa 1, Warszawa',null,'Warszawa'),
  'ul. Testowa 1, Warszawa','street and city without postal remain unchanged');
select is(collaboration_private.format_effective_contact_address_v3('ul. Testowa 1, 00-123','00-123',null),
  'ul. Testowa 1, 00-123','street and postal without city remain unchanged');
select is(collaboration_private.format_effective_contact_address_v3('  ul. Testowa 1   ',' 00-123 ',' Warszawa  '),
  'ul. Testowa 1, 00-123 Warszawa','outer and repeated whitespace is normalized');
select is(collaboration_private.format_effective_contact_address_v3('ul. Testowa 1, 100-1234','00-123','Warszawa'),
  'ul. Testowa 1, 100-1234, 00-123 Warszawa','postal substring inside a longer number is not treated as a match');
select is(collaboration_private.format_effective_contact_address_v3('ul. Testowa 1, 11-111','00-123','Warszawa'),
  'ul. Testowa 1, 11-111, 00-123 Warszawa','a different valid postal token does not suppress the supplied postal');
select is(collaboration_private.format_effective_contact_address_v3('ul. Testowa 1, nr 42, 11-111','00-123','Warszawa'),
  'ul. Testowa 1, nr 42, 11-111, 00-123 Warszawa','unrelated numeric text and a different postal token do not suppress the supplied postal');

set local role authenticated;
select set_config('request.jwt.claim.sub','e8810000-0000-4000-8000-000000000001',true);
select is(public.update_my_wedding_contacts_v3('e8820000-0000-4000-8000-000000000001','1',
  jsonb_build_object('bride',jsonb_build_object('first_name','Anna','last_name','Nowak','phone',null,'email',null),
  'groom',jsonb_build_object('first_name','Jan','last_name','Kowalski','phone',null,'email',null),
  'contract_address','ul. Zapisana 9, 55-555 Kraków','correspondence','[]'::jsonb))->>'contacts_revision',
  '2','post-cutover owner Contacts edit updates only canonical operational Contacts');
reset role;
select is((select collaboration_private.format_effective_contact_address_v3(w.contract_address,w.contract_postal_code,w.contract_city)
  from public.weddings w where w.id='e8820000-0000-4000-8000-000000000001'),
  'ul. Zapisana 9, 55-555 Kraków','later Contacts edit remains the canonical owner-visible value');
select is((select fa.answer_json from public.form_answers fa where fa.instance_id='e8830000-0000-4000-8000-000000000001'),
  '{"values":{"q-p1-address":"ul. Testowa 1","q-p1-postal":"00-123","q-p1-city":"Warszawa"}}'::jsonb,
  'later Contacts edit does not mutate or restore precedence from historical Contract answers');

select has_function('public','get_my_collaborative_contacts_v3',array['uuid'],'narrow shared Contacts read RPC exists');
select has_function('public','get_my_wedding_contacts_v3',array['uuid'],'narrow owner Contacts read RPC exists');
select has_function('public','update_my_collaborative_contacts_v3',array['uuid','text','text','jsonb'],'single transactional shared Contacts write exists');
select has_function('public','update_my_wedding_contacts_v3',array['uuid','text','jsonb'],'narrow owner Contacts write exists');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid='public.get_my_collaborative_contacts_v3(uuid)'::regprocedure),'read RPC is SECURITY DEFINER with empty search_path');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid='public.update_my_collaborative_contacts_v3(uuid,text,text,jsonb)'::regprocedure),'shared write RPC is SECURITY DEFINER with empty search_path');
select ok(has_function_privilege('authenticated','public.get_my_collaborative_contacts_v3(uuid)','execute') and not has_function_privilege('anon','public.get_my_collaborative_contacts_v3(uuid)','execute'),'read RPC is authenticated-only');
select ok(has_function_privilege('authenticated','public.update_my_collaborative_contacts_v3(uuid,text,text,jsonb)','execute') and not has_function_privilege('anon','public.update_my_collaborative_contacts_v3(uuid,text,text,jsonb)','execute'),'shared write RPC is authenticated-only');
select ok(not has_function_privilege('service_role','public.get_my_collaborative_contacts_v3(uuid)','execute') and not has_function_privilege('service_role','public.update_my_collaborative_contacts_v3(uuid,text,text,jsonb)','execute'),'service_role has no Contacts RPC grant');
select ok(not exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid in ('public.get_my_collaborative_contacts_v3(uuid)'::regprocedure,'public.get_my_wedding_contacts_v3(uuid)'::regprocedure,'public.update_my_collaborative_contacts_v3(uuid,text,text,jsonb)'::regprocedure,'public.update_my_wedding_contacts_v3(uuid,text,jsonb)'::regprocedure) and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC cannot execute Contacts RPCs');
select ok(not has_function_privilege('authenticated','collaboration_private.write_wedding_contacts_v3(uuid,text,jsonb)','execute') and not has_function_privilege('anon','collaboration_private.write_wedding_contacts_v3(uuid,text,jsonb)','execute'),'internal Contacts writer is not client-executable');
select ok(not exists(select 1 from pg_catalog.pg_policy where polrelid in ('public.weddings'::regclass,'public.contacts'::regclass) and polname ilike '%collab%'),'Contacts adds no collaborator raw-table policy');
select ok(not has_table_privilege('authenticated','public.wedding_collaboration_memberships','select'),'Contacts does not grant raw membership reads');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='weddings' and column_name='contact_id'),'couple Contacts are not stored in public.contacts');
select ok(pg_catalog.pg_get_functiondef('public.get_my_collaborative_contacts_v3(uuid)'::regprocedure) not ilike '%form_answers%' and pg_catalog.pg_get_functiondef('public.get_my_collaborative_contacts_v3(uuid)'::regprocedure) not ilike '%contract_value%' and pg_catalog.pg_get_functiondef('public.get_my_collaborative_contacts_v3(uuid)'::regprocedure) not ilike '%payments%','shared read is independent of Contract, Finance and broad form answers');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','e8100000-0000-4000-8000-000000000001','authenticated','authenticated','v3-contacts-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','e8100000-0000-4000-8000-000000000002','authenticated','authenticated','v3-contacts-member@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','e8100000-0000-4000-8000-000000000003','authenticated','authenticated','v3-contacts-outsider@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','e8100000-0000-4000-8000-000000000004','authenticated','authenticated','v3-contacts-other-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());
select set_config('request.jwt.claim.sub','e8100000-0000-4000-8000-000000000001',true);
insert into public.weddings(id,user_id,bride_name,groom_name,bride_first_name,bride_last_name,groom_first_name,groom_last_name,wedding_date,status,email,phone,groom_phone,contract_address,contract_postal_code,contract_city,correspondence,contract_value)
values ('e8200000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000001','Anna Nowak','Jan Kowalski','Anna','Nowak','Jan','Kowalski','2027-09-01','active','anna@old.test','111','222','ul. Stara 1','00-001','Warszawa','[{"id":"e8600000-0000-4000-8000-000000000001","channel":"email","value":"studio@example.test"}]',1234),
       ('e8200000-0000-4000-8000-000000000002','e8100000-0000-4000-8000-000000000001','Other','Wedding','Other','Wedding','Other','Wedding','2027-09-02','active','other@example.test','333','444','Other address',null,null,'[]',999),
       ('e8200000-0000-4000-8000-000000000003','e8100000-0000-4000-8000-000000000001','Inactive','Wedding','Inactive','Wedding','Inactive','Wedding','2027-09-03','archived','inactive@example.test','555','666','Inactive address',null,null,'[]',888);
select set_config('request.jwt.claim.sub','e8100000-0000-4000-8000-000000000004',true);
insert into public.weddings(id,user_id,bride_name,groom_name,bride_first_name,bride_last_name,groom_first_name,groom_last_name,wedding_date,status,email,phone,groom_phone,contract_address,contract_postal_code,contract_city,correspondence,contract_value)
values ('e8200000-0000-4000-8000-000000000004','e8100000-0000-4000-8000-000000000004','Foreign','Owner','Foreign','Owner','Foreign','Owner','2027-09-04','active','foreign@example.test','777','888','Foreign address',null,null,'[]',777);
select set_config('request.jwt.claim.sub','e8100000-0000-4000-8000-000000000001',true);
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,participant_low_name_snapshot,participant_high_name_snapshot,status)
values ('e8300000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000002','Contacts Owner','Contacts Member','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','e8100000-0000-4000-8000-000000000001',true);
select public.create_wedding_collaboration_invitation_v3('e8200000-0000-4000-8000-000000000001','e8300000-0000-4000-8000-000000000001',null,'e8500000-0000-4000-8000-000000000001','system:photographer',null,'custom','{"logistics":0,"prewedding":0,"contacts":2,"tasks":0,"notes":0,"compensation":0}'::jsonb);
reset role;
select set_config('test.contacts_invitation_id',(select id::text from public.wedding_collaboration_invitations where idempotency_key='e8500000-0000-4000-8000-000000000001'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','e8100000-0000-4000-8000-000000000002',true);
select public.accept_wedding_collaboration_invite(current_setting('test.contacts_invitation_id')::uuid,'e8700000-0000-4000-8000-000000000001');
reset role;
select set_config('test.contacts_membership_id',(select id::text from public.wedding_collaboration_memberships where wedding_id='e8200000-0000-4000-8000-000000000001' and member_user_id='e8100000-0000-4000-8000-000000000002'),true);

set local role authenticated;
select set_config('request.jwt.claim.sub','e8100000-0000-4000-8000-000000000002',true);
select set_config('test.contacts_projection',public.get_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000001')::text,true);
reset role;
select set_config('test.contacts_row_before',(select to_jsonb(w)::text from public.weddings w where w.id='e8200000-0000-4000-8000-000000000001'),true);
select is(current_setting('test.contacts_projection')::jsonb->>'contacts_level','2','Contacts level is returned as the frozen area authority');
select is(current_setting('test.contacts_projection')::jsonb->>'access_version','1','read projection returns current access version');
select is(current_setting('test.contacts_projection')::jsonb->>'contacts_revision','1','read projection returns decimal text revision');
select is((select count(*)::int from jsonb_object_keys(current_setting('test.contacts_projection')::jsonb)),8,'read projection has exactly eight allowlisted root fields');
select is(current_setting('test.contacts_projection')::jsonb->'bride'->>'first_name','Anna','bride structured name is projected');
select is(current_setting('test.contacts_projection')::jsonb->'groom'->>'last_name','Kowalski','groom structured name is projected');
select is(current_setting('test.contacts_projection')::jsonb->'groom'->>'email',null::text,'missing groom email is explicit null');
select is(current_setting('test.contacts_projection')::jsonb->>'contract_address','ul. Stara 1, 00-001 Warszawa','contract address includes the complete effective owner address');
select is(jsonb_array_length(current_setting('test.contacts_projection')::jsonb->'correspondence'),1,'ordered correspondence JSON is included');
select ok(not (current_setting('test.contacts_projection')::jsonb ?| array['contract_value','payments','forms','finance','tasks','notes','prewedding','logistics']),'no unrelated domain keys are returned');
select is((select contract_value::numeric from public.weddings where id='e8200000-0000-4000-8000-000000000001'),1234::numeric,'read-only Contacts projection does not mutate commercial data');
select is((select to_jsonb(w)::text from public.weddings w where w.id='e8200000-0000-4000-8000-000000000001'),current_setting('test.contacts_row_before'),'read RPC is pure and does not mutate any wedding field');
set local role authenticated;
select is(public.update_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000001','1','1',
 jsonb_build_object('bride',jsonb_build_object('first_name','Alicja','last_name','Nowa','phone','999','email','ALICJA@EXAMPLE.TEST'),
 'groom',jsonb_build_object('first_name','Jan','last_name','Nowy','phone','888','email','JAN@EXAMPLE.TEST'),
 'contract_address','ul. Nowa 2','correspondence',jsonb_build_array(
  jsonb_build_object('id','e8610000-0000-4000-8000-000000000001','channel','email','value','TEAM@EXAMPLE.TEST'),
  jsonb_build_object('id','e8610000-0000-4000-8000-000000000002','channel','instagram','value','team.profile'),
  jsonb_build_object('id','e8610000-0000-4000-8000-000000000003','channel','facebook','value','OurPage'),
  jsonb_build_object('id','e8610000-0000-4000-8000-000000000004','channel','email','value','OTHER@EXAMPLE.TEST'))))->>'contacts_revision','2','level-two member saves the entire Contacts aggregate');
reset role;
select is((select bride_name from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'Alicja Nowa','save atomically updates safe combined bride identity');
select is((select groom_name from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'Jan Nowy','save atomically updates safe combined groom identity');
select is((select groom_email from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'jan@example.test','groom email is stored canonically');
select is((select email from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'alicja@example.test','bride email is normalized and stored canonically');
select is((select correspondence->0->>'value' from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'team@example.test','correspondence email normalizes case');
select is((select correspondence->1->>'value' from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'@team.profile','correspondence Instagram handle is normalized');
select is((select correspondence->2->>'value' from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'OurPage','Facebook entry remains ordered and unchanged');
select is((select correspondence->3->>'value' from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'other@example.test','distinct same-type email entries are allowed and normalized');
select is((select correspondence->0->>'id' from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'e8610000-0000-4000-8000-000000000001','correspondence IDs remain stable');
select is((select jsonb_array_length(correspondence)::int from public.weddings where id='e8200000-0000-4000-8000-000000000001'),4,'correspondence order and all entries are preserved');
select is((select contacts_revision::text from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'2','successful aggregate save advances Contacts revision once');
select is((select contract_value::numeric from public.weddings where id='e8200000-0000-4000-8000-000000000001'),1234::numeric,'Contacts save preserves commercial snapshot');

set local role authenticated;
select throws_ok($$select public.update_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000001','2','2','{}'::jsonb)$$,'P0001','CONFLICT','stale access version is rejected');
select throws_ok($$select public.update_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000001','1','1','{}'::jsonb)$$,'P0001','CONFLICT','stale Contacts revision is rejected before mutation');
select throws_ok($$select public.update_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000001','1','2',jsonb_build_object('bride',jsonb_build_object('first_name','Partial','last_name','Nowa','phone',null,'email',null),'groom',jsonb_build_object('first_name','Jan','last_name','Nowy','phone',null,'email',null),'contract_address','Partial address','correspondence',jsonb_build_array(jsonb_build_object('id','e8610000-0000-4000-8000-000000000003','channel','sms','value','bad'))))$$,'P0001','VALIDATION_ERROR','invalid correspondence rejects the complete transaction');
select throws_ok($$select public.update_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000001','1','2',jsonb_build_object('bride',jsonb_build_object('first_name','Partial','last_name','Nowa','phone',null,'email',null),'groom',jsonb_build_object('first_name','Jan','last_name','Nowy','phone',null,'email',null),'contract_address','Partial address','correspondence',jsonb_build_array(jsonb_build_object('id','e8610000-0000-4000-8000-000000000005','channel','email','value','same@example.test'),jsonb_build_object('id','e8610000-0000-4000-8000-000000000006','channel','email','value','SAME@example.test'))))$$,'P0001','VALIDATION_ERROR','normalized duplicate correspondence is rejected');
select throws_ok($$select public.update_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000001','1','2',jsonb_build_object('bride',jsonb_build_object('first_name','Partial','last_name','Nowa','phone',null,'email',null),'groom',jsonb_build_object('first_name','Jan','last_name','Nowy','phone',null,'email',null),'contract_address','Partial address','correspondence',jsonb_build_array(jsonb_build_object('id','e8610000-0000-4000-8000-000000000007','channel','email'))))$$,'P0001','VALIDATION_ERROR','partial correspondence row is rejected');
select throws_ok($$select public.update_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000001','1','2','[]'::jsonb)$$,'P0001','VALIDATION_ERROR','malformed top-level payload is rejected');
reset role;
select is((select bride_name from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'Alicja Nowa','validation failure rolls back earlier contact field edits');
select is((select groom_name from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'Jan Nowy','validation failure rolls back groom identity edits');
select is((select phone||'|'||email||'|'||groom_phone||'|'||groom_email from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'999|alicja@example.test|888|jan@example.test','validation failure rolls back all phone and email edits');
select is((select contract_address from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'ul. Nowa 2','validation failure rolls back address edits');
select is((select correspondence from public.weddings where id='e8200000-0000-4000-8000-000000000001'), '[{"id":"e8610000-0000-4000-8000-000000000001","channel":"email","value":"team@example.test"},{"id":"e8610000-0000-4000-8000-000000000002","channel":"instagram","value":"@team.profile"},{"id":"e8610000-0000-4000-8000-000000000003","channel":"facebook","value":"OurPage"},{"id":"e8610000-0000-4000-8000-000000000004","channel":"email","value":"other@example.test"}]'::jsonb,'validation failure rolls back correspondence edits');
select is((select contacts_revision::text from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'2','conflict and invalid writes do not advance revision');
set local role authenticated;
select throws_ok($$select public.update_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000002','1','2','{}'::jsonb)$$,'P0001','UNAVAILABLE','cross-wedding write target is unavailable');
select throws_ok($$select public.update_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000003','1','1','{}'::jsonb)$$,'P0001','UNAVAILABLE','inactive wedding target is unavailable');
select throws_ok($$select public.get_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000004')$$,'P0001','UNAVAILABLE','another owner wedding Contacts read is unavailable');
select throws_ok($$select public.update_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000004','1','1','{}'::jsonb)$$,'P0001','UNAVAILABLE','another owner wedding Contacts write is unavailable');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','e8100000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.get_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000001')$$,'P0001','UNAVAILABLE','unconnected cross-user cannot read Contacts');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','e8100000-0000-4000-8000-000000000001',true);
select is(public.update_my_wedding_contacts_v3('e8200000-0000-4000-8000-000000000001','2',
 jsonb_build_object('bride',jsonb_build_object('first_name','Owner','last_name','Saved','phone','777','email','owner@example.test'),
 'groom',jsonb_build_object('first_name','Owner Groom','last_name','Saved','phone',null,'email',null),
 'contract_address','Owner address','correspondence','[]'::jsonb))->>'contacts_revision','3','owner-specific Contacts adapter writes without collaborator membership');
reset role;
select is((select bride_name from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'Owner Saved','owner Contacts save preserves safe identity consistency');
select is((select contract_address from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'Owner address','owner save updates the canonical contract address');
select is((select contacts_revision::text from public.weddings where id='e8200000-0000-4000-8000-000000000001'),'3','owner save advances the same aggregate revision once');
select is((select contract_value::numeric from public.weddings where id='e8200000-0000-4000-8000-000000000001'),1234::numeric,'owner Contacts save preserves commercial snapshot');

update collaboration_private.membership_area_access set contacts=1 where membership_id=current_setting('test.contacts_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','e8100000-0000-4000-8000-000000000002',true);
select is(public.get_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000001')->>'contacts_level','1','Contacts level one read remains available');
select throws_ok($$select public.update_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000001','1','2','{}'::jsonb)$$,'P0001','FORBIDDEN','Contacts level one cannot write');
reset role;
update collaboration_private.membership_area_access set contacts=0 where membership_id=current_setting('test.contacts_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','e8100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000001')$$,'P0001','FORBIDDEN','Contacts level zero cannot read private projection');
reset role;
update public.wedding_collaboration_memberships set status='revoked',revoked_at=now() where id=current_setting('test.contacts_membership_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','e8100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_my_collaborative_contacts_v3('e8200000-0000-4000-8000-000000000001')$$,'P0001','UNAVAILABLE','revoked member cannot read Contacts');
reset role;

-- The trusted migration backfill must bypass only weddings_enforce_owner.
-- Runtime owner enforcement and the other wedding triggers remain enabled.
select is((select count(*)::int from public.contacts_backfill_expected e
  join public.weddings w on w.id=e.wedding_id where w.user_id<>'e8810000-0000-4000-8000-000000000001'),0,
  'trusted Contacts backfill leaves every fixture wedding owner unchanged');
select ok((select t.tgenabled='O' from pg_catalog.pg_trigger t
  where t.tgrelid='public.weddings'::regclass and t.tgname='weddings_enforce_owner' and not t.tgisinternal),
  'wedding owner trigger is restored and enabled after the migration');
select is((select count(*)::int from pg_catalog.pg_trigger t
  where t.tgrelid='public.weddings'::regclass
    and t.tgname in ('weddings_collaboration_terms_before','weddings_collaboration_terms_after')
    and t.tgenabled='O'),2,'collaboration terms triggers remain active after the Contacts backfill');

reset role;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$update public.weddings set phone='unauthenticated-trigger-regression'
  where id='e8820000-0000-4000-8000-000000000010'$$,
  'P0001','Authentication required to modify weddings',
  'unauthenticated direct wedding mutation remains rejected after migration');
select set_config('request.jwt.claim.sub','e8810000-0000-4000-8000-000000000002',true);
select throws_ok($$update public.weddings set phone='wrong-owner-trigger-regression'
  where id='e8820000-0000-4000-8000-000000000010'$$,
  'P0001','Cannot modify a wedding owned by another studio',
  'wrong-owner direct wedding mutation remains rejected after migration');

set local role authenticated;
select set_config('request.jwt.claim.sub','e8810000-0000-4000-8000-000000000001',true);
update public.weddings set phone='owner-trigger-regression'
where id='e8820000-0000-4000-8000-000000000010';
select is((select phone from public.weddings where id='e8820000-0000-4000-8000-000000000010'),
  'owner-trigger-regression',
  'correct-owner direct wedding mutation remains allowed after migration');
reset role;
select is((select user_id::text from public.weddings
  where id='e8820000-0000-4000-8000-000000000010'),'e8810000-0000-4000-8000-000000000001',
  'normal owner mutation cannot change wedding ownership');

select * from finish();
rollback;
