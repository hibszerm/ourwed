begin;
select no_plan();

select has_function('public','get_my_collaborative_prewedding_v3',array['uuid'],'narrow shared Pre-Wedding read RPC exists');
select has_function('public','update_my_collaborative_prewedding_answer_v3',array['uuid','uuid','text','jsonb','boolean','text','text'],'scoped answer patch RPC exists');
select has_function('public','update_my_collaborative_prewedding_time_v3',array['uuid','text','text','boolean','text','text'],'scoped operational-time RPC exists');
select has_function('public','public_get_prewedding_questionnaire_v2',array['text'],'revision-aware public load exists');
select has_function('public','public_autosave_prewedding_answer_v2',array['text','text','jsonb','boolean','integer','integer','text'],'revision-aware per-answer public save exists');
select has_function('public','public_submit_prewedding_questionnaire_v2',array['text','jsonb','integer','integer','text'],'revision-aware public submit exists');

select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid='public.get_my_collaborative_prewedding_v3(uuid)'::regprocedure),'read RPC is definer with empty search_path');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid='public.update_my_collaborative_prewedding_answer_v3(uuid,uuid,text,jsonb,boolean,text,text)'::regprocedure),'answer command is definer with empty search_path');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid='public.update_my_collaborative_prewedding_time_v3(uuid,text,text,boolean,text,text)'::regprocedure),'time command is definer with empty search_path');
select ok(has_function_privilege('authenticated','public.get_my_collaborative_prewedding_v3(uuid)','execute')
  and not has_function_privilege('anon','public.get_my_collaborative_prewedding_v3(uuid)','execute')
  and not has_function_privilege('service_role','public.get_my_collaborative_prewedding_v3(uuid)','execute'),'shared read is authenticated-only');
select ok(not exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  where p.oid='public.get_my_collaborative_prewedding_v3(uuid)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),
  'PUBLIC has no shared read RPC execution grant');
select ok(has_function_privilege('authenticated','public.update_my_collaborative_prewedding_answer_v3(uuid,uuid,text,jsonb,boolean,text,text)','execute')
  and not has_function_privilege('anon','public.update_my_collaborative_prewedding_answer_v3(uuid,uuid,text,jsonb,boolean,text,text)','execute')
  and not has_function_privilege('service_role','public.update_my_collaborative_prewedding_answer_v3(uuid,uuid,text,jsonb,boolean,text,text)','execute'),'answer command is authenticated-only');
select ok(has_function_privilege('authenticated','public.update_my_collaborative_prewedding_time_v3(uuid,text,text,boolean,text,text)','execute')
  and not has_function_privilege('anon','public.update_my_collaborative_prewedding_time_v3(uuid,text,text,boolean,text,text)','execute')
  and not has_function_privilege('service_role','public.update_my_collaborative_prewedding_time_v3(uuid,text,text,boolean,text,text)','execute'),'time command is authenticated-only');
select ok(has_function_privilege('anon','public.public_get_prewedding_questionnaire_v2(text)','execute')
  and has_function_privilege('anon','public.public_autosave_prewedding_answer_v2(text,text,jsonb,boolean,integer,integer,text)','execute')
  and has_function_privilege('anon','public.public_submit_prewedding_questionnaire_v2(text,jsonb,integer,integer,text)','execute'),'public token endpoints retain anon access');
select ok(not has_function_privilege('anon','public.public_autosave_prewedding_questionnaire(text,jsonb,integer,integer)','execute')
  and not has_function_privilege('authenticated','public.public_autosave_prewedding_questionnaire(text,jsonb,integer,integer)','execute')
  and not has_function_privilege('anon','public.public_submit_prewedding_questionnaire(text,jsonb,integer,integer)','execute')
  and not has_function_privilege('authenticated','public.public_submit_prewedding_questionnaire(text,jsonb,integer,integer)','execute'),'unversioned public whole-response writes are disabled');
select ok(not has_table_privilege('authenticated','public.wedding_questionnaire_responses','insert')
  and not has_table_privilege('authenticated','public.wedding_questionnaire_responses','update')
  ,'raw response inserts and updates remain denied');
select ok(not exists(select 1 from pg_catalog.pg_policy where polrelid in ('public.weddings'::regclass,
  'public.wedding_places'::regclass,'public.wedding_questionnaires'::regclass,
  'public.wedding_questionnaire_responses'::regclass,'public.wedding_operational_times'::regclass)
  and polname ilike '%collaborat%'),'no collaborator RLS policy was added');
select ok(exists(select 1 from information_schema.columns where table_schema='public'
  and table_name='wedding_questionnaire_responses' and column_name='collaboration_revision'),'response CAS revision column exists');
select ok(exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.wedding_operational_times'::regclass
  and tgname='wedding_operational_times_prewedding_revision' and not tgisinternal),'owner and shared time writes advance the same revision');

-- Runtime fixtures exercise the actual V3 authority and all three answer writers.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','d8100000-0000-4000-8000-000000000001','authenticated','authenticated','prewedding-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','d8100000-0000-4000-8000-000000000002','authenticated','authenticated','prewedding-member@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','d8100000-0000-4000-8000-000000000003','authenticated','authenticated','prewedding-outsider@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());
insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status) values
 ('d8200000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000001','Prewedding','Owner','2027-10-01','active'),
 ('d8200000-0000-4000-8000-000000000002','d8100000-0000-4000-8000-000000000003','Other','Wedding','2027-10-02','active');
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status) values
 ('d8300000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000002','Prewedding Owner','Prewedding Member','active');
insert into public.wedding_places(id,wedding_id,role,label,formatted_address,sort_order) values
 ('d8600000-0000-4000-8000-000000000001','d8200000-0000-4000-8000-000000000001','bride_preparation','Preparation','Example Street 1',10),
 ('d8600000-0000-4000-8000-000000000002','d8200000-0000-4000-8000-000000000001','ceremony','Ceremony','Example Street 2',20),
 ('d8600000-0000-4000-8000-000000000003','d8200000-0000-4000-8000-000000000002','ceremony','Other Ceremony','Other Street 3',20);
insert into public.wedding_operational_times(wedding_id,stop_key,operational_time)
values ('d8200000-0000-4000-8000-000000000001','d8600000-0000-4000-8000-000000000001','10:30');
insert into public.wedding_questionnaires(id,wedding_id,owner_id,title,introduction,schema_snapshot_json,
  prefill_json,status,public_token_hash)
values
 ('d8400000-0000-4000-8000-000000000001','d8200000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000001','Frozen questionnaire','Safe intro',
  '{"sections":[{"id":"s1","title":"Details","questions":[{"id":"ordinary","label":"Ordinary","type":"short_text","required":true},{"id":"family","label":"Family notes","type":"long_text","required":false,"weddingDayMapping":"sensitiveFamilyNotes"},{"id":"choice","label":"Choice","type":"single_choice","required":false,"options":["A","B"]},{"id":"multiple","label":"Multiple","type":"multiple_choice","required":false,"options":["A","B"]},{"id":"yesno","label":"Yes or no","type":"yes_no","required":false,"options":["Tak","Nie"]},{"id":"ack","label":"Acknowledgement","type":"acknowledgement","required":false}]}]}'::jsonb,
  '{"private_prefill":"must_not_be_returned"}'::jsonb,'sent',pg_catalog.encode(extensions.digest('prewedding-test-token-20261016','sha256'),'hex')),
 ('d8400000-0000-4000-8000-000000000002','d8200000-0000-4000-8000-000000000002','d8100000-0000-4000-8000-000000000003','Other questionnaire','Other intro',
  '{"sections":[]}'::jsonb,'{}'::jsonb,'sent',null);
insert into public.wedding_questionnaire_responses(questionnaire_id,answers_json,answered_required,total_required)
values ('d8400000-0000-4000-8000-000000000001',
  '{"ordinary":"Initial","family":"Sensitive but shared","choice":"A","multiple":["A"],"yesno":"Tak","ack":true}'::jsonb,1,1);

select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000001',true);
select public.create_wedding_collaboration_invitation_v3('d8200000-0000-4000-8000-000000000001',
  'd8300000-0000-4000-8000-000000000001',null,'d8500000-0000-4000-8000-000000000001',
  'system:photographer',null,'custom','{"logistics":0,"prewedding":1,"contacts":0,"tasks":0,"notes":0,"compensation":0}'::jsonb);
select set_config('test.prewedding_invitation_id',(select id::text from public.wedding_collaboration_invitations
  where idempotency_key='d8500000-0000-4000-8000-000000000001'),true);
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000002',true);
select is(public.accept_wedding_collaboration_invite(current_setting('test.prewedding_invitation_id')::uuid,
  'd8700000-0000-4000-8000-000000000001')->>'status','accepted','member accepts V3 invitation using normal lifecycle RPC');
select set_config('test.prewedding_membership_id',(select id::text from public.wedding_collaboration_memberships
  where accepted_invitation_id=current_setting('test.prewedding_invitation_id')::uuid),true);

update collaboration_private.membership_area_access set prewedding=0 where membership_id=current_setting('test.prewedding_membership_id')::uuid;
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_my_collaborative_prewedding_v3('d8200000-0000-4000-8000-000000000001')$$,'P0001','UNAVAILABLE','Pre-Wedding level zero denies read');
select throws_ok($$select public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','ordinary','"No"'::jsonb,false,'1','1')$$,'P0001','FORBIDDEN','level zero denies answer writes');
select throws_ok($$select public.update_my_collaborative_prewedding_time_v3('d8200000-0000-4000-8000-000000000001','d8600000-0000-4000-8000-000000000001','11:00',false,'1','0')$$,'P0001','FORBIDDEN','level zero denies time writes');
reset role;
update collaboration_private.membership_area_access set prewedding=1 where membership_id=current_setting('test.prewedding_membership_id')::uuid;
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000002',true);
select set_config('test.prewedding_level_one',public.get_my_collaborative_prewedding_v3('d8200000-0000-4000-8000-000000000001')::text,true);
select is((current_setting('test.prewedding_level_one')::jsonb->>'prewedding_level')::int,1,'level one reads the operational Pre-Wedding projection');
select is((select array_agg(key order by key) from jsonb_object_keys(current_setting('test.prewedding_level_one')::jsonb) as k(key)),
  array['access_version','plan_day','prewedding_level','questionnaire','wedding_id']::text[],'read root has the exact allowlisted shape');
select is((select array_agg(key order by key) from jsonb_object_keys(current_setting('test.prewedding_level_one')::jsonb->'questionnaire') as k(key)),
  array['answered_required','answers','id','introduction','response_id','response_revision','schema','status','submitted_at','title','total_required']::text[],'questionnaire has the exact allowlisted shape');
select ok(current_setting('test.prewedding_level_one')::jsonb->'questionnaire'->'answers'->>'family'='Sensitive but shared','ordinary and sensitiveFamilyNotes answers are both visible');
select ok(not ((current_setting('test.prewedding_level_one')::jsonb->'questionnaire') ?| array['public_token','public_token_hash','prefill','prefill_json','template','template_id','contract','finance','payments','contacts','tasks','notes','compensation']),
  'read response excludes token, prefill, administration, and unrelated domains');
select is(jsonb_array_length(current_setting('test.prewedding_level_one')::jsonb->'plan_day'->'places'),2,'Plan Day projection includes only supported wedding stops');
select is(current_setting('test.prewedding_level_one')::jsonb->'plan_day'->'times'->0->>'time','10:30','Plan Day includes the existing operational-time override');
set local role authenticated;
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.wedding_operational_times
  where wedding_id='d8200000-0000-4000-8000-000000000001'),0,
  'authenticated non-owner cannot directly read owner operational-time rows');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.wedding_operational_times
  where wedding_id='d8200000-0000-4000-8000-000000000001'),1,
  'owner can directly read the seeded operational-time row');
reset role;
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','ordinary','"No"'::jsonb,false,'1','1')$$,'P0001','FORBIDDEN','level one denies answer writes');
select throws_ok($$select public.update_my_collaborative_prewedding_time_v3('d8200000-0000-4000-8000-000000000001','d8600000-0000-4000-8000-000000000001','11:00',false,'1','1')$$,'P0001','FORBIDDEN','level one denies time writes');
select throws_ok($$select public.get_my_collaborative_prewedding_v3('d8200000-0000-4000-8000-000000000002')$$,'P0001','UNAVAILABLE','cross-wedding Pre-Wedding read is denied');
select is((select status from public.wedding_questionnaires where id='d8400000-0000-4000-8000-000000000001'),'sent','shared read is pure and does not advance public lifecycle');
select is((select answers_json->>'ordinary' from public.wedding_questionnaire_responses where questionnaire_id='d8400000-0000-4000-8000-000000000001'),'Initial','shared read is pure and does not mutate answers');

update collaboration_private.membership_area_access set prewedding=2 where membership_id=current_setting('test.prewedding_membership_id')::uuid;
update public.wedding_collaboration_memberships set role_key='system:viewer' where id=current_setting('test.prewedding_membership_id')::uuid;
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000002','ordinary','"No"'::jsonb,false,'1','1')$$,'P0001','UNAVAILABLE','foreign questionnaire ID is rejected');
select is(public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','ordinary','"Collaborator"'::jsonb,false,'1','1')->>'response_revision','2','level two writes ordinary answer and returns next shared revision');
select is((select answers_json->>'ordinary' from public.wedding_questionnaire_responses where questionnaire_id='d8400000-0000-4000-8000-000000000001'),'Collaborator','answer patch changes only its selected key');
select throws_ok($$select public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','ordinary','"Stale"'::jsonb,false,'1','1')$$,'P0001','CONFLICT','stale answer revision conflicts');
select throws_ok($$select public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','absent','"Invalid"'::jsonb,false,'1','2')$$,'P0001','VALIDATION_ERROR','question ID absent from frozen schema is rejected');
select throws_ok($$select public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','choice','"Z"'::jsonb,false,'1','2')$$,'P0001','VALIDATION_ERROR','choice outside frozen options is rejected');
select is(public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','multiple','["B"]'::jsonb,false,'1','2')->>'response_revision','3','representative multiple-choice answer is accepted');
select is(public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','family','"Updated family note"'::jsonb,false,'1','3')->>'response_revision','4','sensitiveFamilyNotes is an ordinary editable answer');
select is(public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','family',null,true,'1','4')->>'response_revision','5','answer clear removes only the selected key');
select ok(not (select answers_json ? 'family' from public.wedding_questionnaire_responses where questionnaire_id='d8400000-0000-4000-8000-000000000001'),'answer clear is persisted');
select is(public.update_my_collaborative_prewedding_time_v3('d8200000-0000-4000-8000-000000000001','d8600000-0000-4000-8000-000000000001','11:15',false,'1','1')->>'revision','2','level two sets operational time with current revision');
select throws_ok($$select public.update_my_collaborative_prewedding_time_v3('d8200000-0000-4000-8000-000000000001','d8600000-0000-4000-8000-000000000001','11:30',false,'1','1')$$,'P0001','CONFLICT','stale time set conflicts');
select is(public.update_my_collaborative_prewedding_time_v3('d8200000-0000-4000-8000-000000000001','d8600000-0000-4000-8000-000000000001',null,true,'1','2')->>'revision','3','current operational-time clear advances revision');
select throws_ok($$select public.update_my_collaborative_prewedding_time_v3('d8200000-0000-4000-8000-000000000001','d8600000-0000-4000-8000-000000000001',null,true,'1','2')$$,'P0001','CONFLICT','stale time clear conflicts');
select throws_ok($$select public.update_my_collaborative_prewedding_time_v3('d8200000-0000-4000-8000-000000000001','d8600000-0000-4000-8000-000000000003','12:00',false,'1','0')$$,'P0001','UNAVAILABLE','foreign stop is rejected');
select throws_ok($$select public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','ordinary','"Wrong version"'::jsonb,false,'999','5')$$,'P0001','CONFLICT','stale access version conflicts');

-- Public per-answer autosave, public whole-response autosave, owner edits, and submit share the CAS ledger.
select is(public.public_get_prewedding_questionnaire_v2('prewedding-test-token-20261016')->>'response_revision','5','public load exposes the shared current answer revision');
select throws_ok($$select public.public_autosave_prewedding_answer_v2('prewedding-test-token-20261016','ordinary','"Stale public"'::jsonb,false,1,1,'4')$$,'P0001','CONFLICT','stale public answer autosave conflicts after collaborator write');
select is(public.public_autosave_prewedding_answer_v2('prewedding-test-token-20261016','choice','"B"'::jsonb,false,1,1,'5')->>'response_revision','6','current public per-answer autosave succeeds');
select throws_ok($$select public.public_autosave_prewedding_questionnaire_v2('prewedding-test-token-20261016','{"ordinary":"Stale whole"}'::jsonb,1,1,'5')$$,'P0001','CONFLICT','stale public whole-response autosave conflicts');
select throws_ok($$select public.public_autosave_prewedding_questionnaire_v2('prewedding-test-token-20261016','{"unknown":"Not in frozen schema"}'::jsonb,1,1,'6')$$,'P0001','VALIDATION_ERROR','public whole-response save rejects keys absent from frozen schema');
select throws_ok($$select public.public_autosave_prewedding_answer_v2('prewedding-test-token-20261016','yesno','true'::jsonb,false,1,1,'6')$$,'P0001','VALIDATION_ERROR','public answer save validates frozen field type');
select is(public.public_autosave_prewedding_questionnaire_v2('prewedding-test-token-20261016','{"ordinary":"Public current","family":"Family","choice":"B","multiple":["A"],"yesno":"Nie","ack":true}'::jsonb,1,1,'6')->>'response_revision','7','current public whole-response autosave succeeds');
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','ordinary','"Stale collaborator"'::jsonb,false,'1','6')$$,'P0001','CONFLICT','stale collaborator write conflicts after public save');
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000001',true);
select is(public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','ordinary','"Owner current"'::jsonb,false,'owner','7')->>'response_revision','8','owner uses the same revision-aware answer command with owner authority');
select throws_ok($$select public.public_autosave_prewedding_answer_v2('prewedding-test-token-20261016','ordinary','"Stale owner"'::jsonb,false,1,1,'7')$$,'P0001','CONFLICT','stale public save conflicts after owner answer edit');
select is(public.public_autosave_prewedding_answer_v2('prewedding-test-token-20261016','ordinary','"Final answer"'::jsonb,false,1,1,'8')->>'response_revision','9','public write using current owner revision succeeds');
select throws_ok($$select public.public_submit_prewedding_questionnaire_v2('prewedding-test-token-20261016','{"ordinary":"Stale submit"}'::jsonb,1,1,'8')$$,'P0001','CONFLICT','stale public submission conflicts');
select is(public.public_submit_prewedding_questionnaire_v2('prewedding-test-token-20261016','{"ordinary":"Final answer","family":"Family","choice":"B","multiple":["A"],"yesno":"Nie","ack":true}'::jsonb,1,1,'9')->>'response_revision','10','current public final submission returns actual shared revision');
select is((select revision::text from collaboration_private.prewedding_response_revisions where questionnaire_id='d8400000-0000-4000-8000-000000000001'),'10','public, owner, and collaborator writers share a monotonic CAS ledger');
select is((select answers_json->>'ordinary' from public.wedding_questionnaire_responses where questionnaire_id='d8400000-0000-4000-8000-000000000001'),'Final answer','successful cross-writer writes preserve the last accepted value');
select is((select status from public.wedding_questionnaires where id='d8400000-0000-4000-8000-000000000001'),'submitted','public submit preserves the final questionnaire lifecycle state');
delete from public.wedding_questionnaire_responses where questionnaire_id='d8400000-0000-4000-8000-000000000001';
select is((select revision::text from collaboration_private.prewedding_response_revisions where questionnaire_id='d8400000-0000-4000-8000-000000000001'),'11','response deletion preserves the monotonic revision ledger');
select is(public.update_my_collaborative_prewedding_answer_v3('d8200000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','ordinary','"Recreated"'::jsonb,false,'owner','11')->>'response_revision','12','owner response recreation continues from the ledger revision');
select is((select collaboration_revision::text from public.wedding_questionnaire_responses where questionnaire_id='d8400000-0000-4000-8000-000000000001'),'12','delete and recreate does not reset response revision');

-- Owner-authorized write path remains valid, and membership role does not gate the six-area authority.
select is(collaboration_private.resolve_wedding_area_level('d8200000-0000-4000-8000-000000000001','prewedding')::int,2,'area level remains independent of role key');
select ok((select sort_order=10 from public.wedding_places where id='d8600000-0000-4000-8000-000000000001'),'shared Pre-Wedding never reorders Logistics place rows');
select ok(not exists(select 1 from public.travel_segments where wedding_id='d8200000-0000-4000-8000-000000000001'),'Pre-Wedding commands do not create or mutate route segments');
select ok(not has_table_privilege('authenticated','public.wedding_places','insert')
  and not has_table_privilege('authenticated','public.wedding_places','update'),
  'collaborative changes remain RPC-mediated with no raw place writes');
select ok(pg_catalog.pg_get_functiondef('public.update_my_collaborative_prewedding_time_v3(uuid,text,text,boolean,text,text)'::regprocedure)
  not ilike '%mutate_collaborative_wedding_logistics_v3%'
  and pg_catalog.pg_get_functiondef('public.update_my_collaborative_prewedding_time_v3(uuid,text,text,boolean,text,text)'::regprocedure)
    not ilike '%update public.wedding_places%'
  and pg_catalog.pg_get_functiondef('public.update_my_collaborative_prewedding_answer_v3(uuid,uuid,text,jsonb,boolean,text,text)'::regprocedure)
    not ilike '%applyWeddingDaySync%',
  'Pre-Wedding write functions do not route through Logistics or Apply');
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000001',true);
select is(public.revoke_wedding_collaboration_membership(current_setting('test.prewedding_membership_id')::uuid,
  'd8800000-0000-4000-8000-000000000001')->>'status','revoked','owner ends only the test membership through the normal authority RPC');
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_my_collaborative_prewedding_v3('d8200000-0000-4000-8000-000000000001')$$,'P0001','UNAVAILABLE','revoked membership loses Pre-Wedding read');

select * from finish();
rollback;
