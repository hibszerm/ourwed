begin;
select no_plan();

select has_column('public','notes','revision','canonical notes have a revision column');
select col_not_null('public','notes','revision','note revision is required');
select is((select column_default from information_schema.columns where table_schema='public' and table_name='notes' and column_name='revision'),'1','new note rows begin at revision one');
select has_trigger('public','notes','notes_bump_revision_v3','every note update uses the revision trigger');
select has_function('public','get_my_collaborative_wedding_notes_v3',array['uuid'],'exact wedding shared Notes read exists');
select has_function('public','create_my_collaborative_wedding_note_v3',array['uuid','text','text','boolean'],'shared Notes create exists');
select has_function('public','mutate_my_collaborative_wedding_note_v3',array['text','uuid','text','uuid','text','text','boolean'],'shared Notes update and delete exist');
select has_function('public','create_my_owned_wedding_note_v3',array['uuid','text','text','boolean'],'narrow owner Notes create exists');
select has_function('public','mutate_my_owned_wedding_note_v3',array['text','uuid','uuid','text','text','boolean'],'narrow owner Notes update and delete exist');
select has_function('public','get_my_owned_wedding_notes_v3',array['uuid'],'narrow owner Notes read exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.notes'::regclass),'raw notes RLS remains enabled and forced');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='notes' and coalesce(qual,'') ilike '%membership%'),'raw Notes RLS was not widened for collaborators');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.get_my_collaborative_wedding_notes_v3(uuid)'::regprocedure),'shared read is SECURITY DEFINER with empty search_path');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.mutate_my_collaborative_wedding_note_v3(text,uuid,text,uuid,text,text,boolean)'::regprocedure),'shared mutation is SECURITY DEFINER with empty search_path');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.mutate_my_owned_wedding_note_v3(text,uuid,uuid,text,text,boolean)'::regprocedure),'owner mutation is SECURITY DEFINER with empty search_path');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.get_my_owned_wedding_notes_v3(uuid)'::regprocedure),'owner read is SECURITY DEFINER with empty search_path');
select ok(has_function_privilege('authenticated','public.get_my_owned_wedding_notes_v3(uuid)','execute') and not has_function_privilege('anon','public.get_my_owned_wedding_notes_v3(uuid)','execute') and not has_function_privilege('service_role','public.get_my_owned_wedding_notes_v3(uuid)','execute'),'owner read is authenticated-only');
select ok(has_function_privilege('authenticated','public.get_my_collaborative_wedding_notes_v3(uuid)','execute') and not has_function_privilege('anon','public.get_my_collaborative_wedding_notes_v3(uuid)','execute'),'shared read is authenticated-only');
select ok(has_function_privilege('authenticated','public.create_my_collaborative_wedding_note_v3(uuid,text,text,boolean)','execute') and not has_function_privilege('anon','public.create_my_collaborative_wedding_note_v3(uuid,text,text,boolean)','execute'),'shared create is authenticated-only');
select ok(has_function_privilege('authenticated','public.mutate_my_collaborative_wedding_note_v3(text,uuid,text,uuid,text,text,boolean)','execute') and not has_function_privilege('anon','public.mutate_my_collaborative_wedding_note_v3(text,uuid,text,uuid,text,text,boolean)','execute'),'shared mutation is authenticated-only');
select ok(not has_function_privilege('service_role','public.mutate_my_collaborative_wedding_note_v3(text,uuid,text,uuid,text,text,boolean)','execute'),'service_role has no shared mutation grant');
select ok(not has_function_privilege('authenticated','collaboration_private.require_shared_notes_edit_v3(uuid,text)','execute'),'internal Notes helper is not client-executable');
select ok(not has_function_privilege('authenticated','collaboration_private.require_owner_notes_edit_v3(uuid)','execute'),'owner Pro helper is not client-executable');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in ('public.get_my_collaborative_wedding_notes_v3(uuid)'::regprocedure,'public.create_my_collaborative_wedding_note_v3(uuid,text,text,boolean)'::regprocedure,'public.mutate_my_collaborative_wedding_note_v3(text,uuid,text,uuid,text,text,boolean)'::regprocedure,'public.create_my_owned_wedding_note_v3(uuid,text,text,boolean)'::regprocedure,'public.mutate_my_owned_wedding_note_v3(text,uuid,uuid,text,text,boolean)'::regprocedure,'public.get_my_owned_wedding_notes_v3(uuid)'::regprocedure) and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC cannot execute Notes RPCs');
select ok(not exists(select 1 from pg_indexes where schemaname='public' and tablename='notes' and indexname like '%v3%'),'Notes migration adds no speculative index');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','ea010000-0000-4000-8000-000000000001','authenticated','authenticated','notes-owner@example.test','x',now(),'{}','{"legal_registration_accepted":true,"terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','ea010000-0000-4000-8000-000000000002','authenticated','authenticated','notes-member@example.test','x',now(),'{}','{"legal_registration_accepted":true,"terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','ea010000-0000-4000-8000-000000000003','authenticated','authenticated','notes-outsider@example.test','x',now(),'{}','{"legal_registration_accepted":true,"terms_version":"1.1","privacy_version":"1.1"}',now(),now());
insert into public.internal_qa_accounts(user_id,provisioned_by,purpose) values
 ('ea010000-0000-4000-8000-000000000001','V3 Notes test fixture','owner Pro semantics')
 on conflict(user_id) do nothing;
update public.account_subscriptions s set status='expired',trial_ends_at=pg_catalog.now()-interval '1 day',
  current_period_ends_at=null,manual_access_until=null,manual_access_indefinite=false
from public.billing_accounts b where b.id=s.billing_account_id and b.owner_user_id='ea010000-0000-4000-8000-000000000003';
insert into public.profiles(id,first_name,last_name,profession) values
 ('ea010000-0000-4000-8000-000000000002','Marta','Notes','photographer')
 on conflict(id) do update set first_name=excluded.first_name,last_name=excluded.last_name;
insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status,price) values
 ('ea020000-0000-4000-8000-000000000001','ea010000-0000-4000-8000-000000000001','Notes','Zero','2027-08-01','active',1234),
 ('ea020000-0000-4000-8000-000000000002','ea010000-0000-4000-8000-000000000001','Notes','View','2027-08-02','active',1234),
 ('ea020000-0000-4000-8000-000000000003','ea010000-0000-4000-8000-000000000001','Notes','Edit','2027-08-03','active',1234),
 ('ea020000-0000-4000-8000-000000000004','ea010000-0000-4000-8000-000000000001','Notes','Other','2027-08-04','active',1234),
 ('ea020000-0000-4000-8000-000000000005','ea010000-0000-4000-8000-000000000003','Foreign','Owner','2027-08-05','active',4321),
 ('ea020000-0000-4000-8000-000000000006','ea010000-0000-4000-8000-000000000001','Notes','No member','2027-08-06','active',1234);
insert into public.forms(id,name,slug,category,schema,version,is_active,is_system_template)
values ('ea070000-0000-4000-8000-000000000001','Notes contract source','notes-contract-source','contract','{"questions":[]}',1,true,true);
insert into public.form_instances(id,form_id,wedding_id,user_id,token,status,submitted_at) values
 ('ea071000-0000-4000-8000-000000000002','ea070000-0000-4000-8000-000000000001','ea020000-0000-4000-8000-000000000002','ea010000-0000-4000-8000-000000000001','notes-contract-view','submitted',now()),
 ('ea071000-0000-4000-8000-000000000003','ea070000-0000-4000-8000-000000000001','ea020000-0000-4000-8000-000000000003','ea010000-0000-4000-8000-000000000001','notes-contract-edit','submitted',now());
insert into public.form_answers(instance_id,answer_json) values
 ('ea071000-0000-4000-8000-000000000002','{"values":{"contract_value":1000,"terms":"source-view"}}'),
 ('ea071000-0000-4000-8000-000000000003','{"values":{"contract_value":1234,"terms":"source-edit"}}');
insert into public.wedding_questionnaires(id,wedding_id,owner_id,title,introduction,schema_snapshot_json,prefill_json,status)
values ('ea090000-0000-4000-8000-000000000001','ea020000-0000-4000-8000-000000000003','ea010000-0000-4000-8000-000000000001',
  'Notes questionnaire source','','{"sections":[]}'::jsonb,'{}'::jsonb,'submitted');
insert into public.wedding_questionnaire_responses(id,questionnaire_id,answers_json,answered_required,total_required,submitted_at)
values ('ea091000-0000-4000-8000-000000000001','ea090000-0000-4000-8000-000000000001',
  '{"additionalNotes":"questionnaire source remains unchanged"}'::jsonb,1,1,now());
insert into public.tasks(id,user_id,wedding_id,title,due_date)
values ('ea092000-0000-4000-8000-000000000001','ea010000-0000-4000-8000-000000000001','ea020000-0000-4000-8000-000000000003','Notes regression task','2027-01-03');
insert into public.payments(id,wedding_id,type,amount)
values ('ea093000-0000-4000-8000-000000000001','ea020000-0000-4000-8000-000000000003','deposit',321);
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,participant_low_name_snapshot,participant_high_name_snapshot,status) values
 ('ea030000-0000-4000-8000-000000000001','ea010000-0000-4000-8000-000000000001','ea010000-0000-4000-8000-000000000002','Notes Owner','Notes Member','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','ea010000-0000-4000-8000-000000000001',true);
select public.create_wedding_collaboration_invitation_v3('ea020000-0000-4000-8000-000000000001','ea030000-0000-4000-8000-000000000001',null,'ea040000-0000-4000-8000-000000000001','system:photographer',null,'custom','{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":0}'::jsonb);
select public.create_wedding_collaboration_invitation_v3('ea020000-0000-4000-8000-000000000002','ea030000-0000-4000-8000-000000000001',null,'ea040000-0000-4000-8000-000000000002','system:photographer',null,'custom','{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":1,"compensation":0}'::jsonb);
select public.create_wedding_collaboration_invitation_v3('ea020000-0000-4000-8000-000000000003','ea030000-0000-4000-8000-000000000001',null,'ea040000-0000-4000-8000-000000000003','system:photographer',null,'custom','{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":2,"compensation":0}'::jsonb);
select public.create_wedding_collaboration_invitation_v3('ea020000-0000-4000-8000-000000000004','ea030000-0000-4000-8000-000000000001',null,'ea040000-0000-4000-8000-000000000004','system:photographer',null,'custom','{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":2,"compensation":0}'::jsonb);
reset role;
select set_config('test.notes_i0',(select id::text from public.wedding_collaboration_invitations where idempotency_key='ea040000-0000-4000-8000-000000000001'),true);
select set_config('test.notes_i1',(select id::text from public.wedding_collaboration_invitations where idempotency_key='ea040000-0000-4000-8000-000000000002'),true);
select set_config('test.notes_i2',(select id::text from public.wedding_collaboration_invitations where idempotency_key='ea040000-0000-4000-8000-000000000003'),true);
select set_config('test.notes_i3',(select id::text from public.wedding_collaboration_invitations where idempotency_key='ea040000-0000-4000-8000-000000000004'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','ea010000-0000-4000-8000-000000000002',true);
select public.accept_wedding_collaboration_invite(current_setting('test.notes_i0')::uuid,'ea050000-0000-4000-8000-000000000001');
select public.accept_wedding_collaboration_invite(current_setting('test.notes_i1')::uuid,'ea050000-0000-4000-8000-000000000002');
select public.accept_wedding_collaboration_invite(current_setting('test.notes_i2')::uuid,'ea050000-0000-4000-8000-000000000003');
select public.accept_wedding_collaboration_invite(current_setting('test.notes_i3')::uuid,'ea050000-0000-4000-8000-000000000004');
reset role;

insert into public.notes(id,wedding_id,author,content,pinned) values
 ('ea060000-0000-4000-8000-000000000001','ea020000-0000-4000-8000-000000000001','Owner','Secret zero',false),
 ('ea060000-0000-4000-8000-000000000002','ea020000-0000-4000-8000-000000000002','Owner','Visible view A',false),
 ('ea060000-0000-4000-8000-000000000003','ea020000-0000-4000-8000-000000000002','Owner','Visible view B',true),
 ('ea060000-0000-4000-8000-000000000004','ea020000-0000-4000-8000-000000000003','Owner','Editable shared',false),
 ('ea060000-0000-4000-8000-000000000005','ea020000-0000-4000-8000-000000000004','Owner','Other wedding',false),
 ('ea060000-0000-4000-8000-000000000006','ea020000-0000-4000-8000-000000000005','Other owner','Foreign',false),
 ('ea060000-0000-4000-8000-000000000008','ea020000-0000-4000-8000-000000000002','Firma','Contract recovery snapshot',false),
 ('ea060000-0000-4000-8000-000000000009','ea020000-0000-4000-8000-000000000003','Firma','Questionnaire additionalNotes snapshot',false),
 ('ea060000-0000-4000-8000-000000000010','ea020000-0000-4000-8000-000000000003','Firma','Contract recovery editable snapshot',false),
 ('ea060000-0000-4000-8000-000000000011','ea020000-0000-4000-8000-000000000003','Owner','Large revision cross-actor note',false);
insert into public.notes(id,wedding_id,author,content,pinned,revision) values
 ('ea060000-0000-4000-8000-000000000007','ea020000-0000-4000-8000-000000000003','Owner','Client cannot choose revision',false,900);
select set_config('test.notes_row',(select id::text from public.notes where content='Editable shared'),true);
select is((select revision::text from public.notes where id=current_setting('test.notes_row')::uuid),'1','fixture note starts at revision one');
select is((select revision::text from public.notes where id='ea060000-0000-4000-8000-000000000007'),'1','client-selected initial revision is overwritten by the database trigger');
alter table public.notes disable trigger notes_bump_revision_v3;
update public.notes set revision=9007199254740993 where id='ea060000-0000-4000-8000-000000000011';
alter table public.notes enable trigger notes_bump_revision_v3;

set local role authenticated;
select set_config('request.jwt.claim.sub','ea010000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_my_owned_wedding_notes_v3('ea020000-0000-4000-8000-000000000003')$$,'P0001','UNAVAILABLE','collaborator cannot call the owner Notes read projection');
select set_config('test.notes_cross_actor_revision',(
  select n->>'revision' from jsonb_array_elements(public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000003')->'notes') n
  where n->>'id'='ea060000-0000-4000-8000-000000000011'),true);
select is(current_setting('test.notes_cross_actor_revision'),'9007199254740993','collaborator captures exact large bigint revision R from shared read');
select is(public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000003')->>'access_version','1','cross-actor CAS starts with current access_version');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ea010000-0000-4000-8000-000000000001',true);
select is((select n->>'revision' from jsonb_array_elements(public.get_my_owned_wedding_notes_v3('ea020000-0000-4000-8000-000000000003')) n where n->>'id'='ea060000-0000-4000-8000-000000000011'),'9007199254740993','owner read preserves bigint revision as exact decimal text');
select is(jsonb_array_length(public.get_my_owned_wedding_notes_v3('ea020000-0000-4000-8000-000000000006')),0,'owner read hydrates a wedding with zero Notes');
select is(public.mutate_my_owned_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','ea060000-0000-4000-8000-000000000011',current_setting('test.notes_cross_actor_revision'),'Cross actor owner winner',false)->>'revision','9007199254740994','canonical owner update advances R to R+1');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ea010000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000011',current_setting('test.notes_cross_actor_revision'),'Stale collaborator loser',false)$$,'P0001','CONFLICT','collaborator stale R write conflicts while access_version remains current');
reset role;
select is((select content from public.notes where id='ea060000-0000-4000-8000-000000000011'),'Cross actor owner winner','stale collaborator cannot overwrite owner winner content');
select is((select revision::text from public.notes where id='ea060000-0000-4000-8000-000000000011'),'9007199254740994','stale collaborator leaves owner R+1 revision intact');

set local role authenticated;
select set_config('request.jwt.claim.sub','ea010000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.notes where wedding_id='ea020000-0000-4000-8000-000000000003'),5,'owner continues to read canonical Notes directly');
update public.notes set content='Owner raw update' where id=current_setting('test.notes_row')::uuid;
select is((select revision::text from public.notes where id=current_setting('test.notes_row')::uuid),'2','owner direct update advances revision exactly once');
select is(public.mutate_my_owned_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003',current_setting('test.notes_row')::uuid,'2','Owner narrow update',false)->>'revision','3','owner narrow update uses revision CAS and returns next revision');
select throws_ok($$select public.mutate_my_owned_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003',current_setting('test.notes_row')::uuid,'2','Stale owner update',true)$$,'P0001','CONFLICT','owner stale revision is rejected');
select is(public.mutate_my_owned_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003',current_setting('test.notes_row')::uuid,'3','Owner pinned',true)->>'revision','4','owner pin advances once');
select is(public.mutate_my_owned_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003',current_setting('test.notes_row')::uuid,'4','Owner unpinned',false)->>'revision','5','owner unpin advances once');
select set_config('test.notes_owner_created_id',public.create_my_owned_wedding_note_v3('ea020000-0000-4000-8000-000000000003','New owner note','Studio',false)->>'id',true);
select is((select revision::text from public.notes where id=current_setting('test.notes_owner_created_id')::uuid),'1','owner create starts at revision one');
select is(public.mutate_my_owned_wedding_note_v3('delete','ea020000-0000-4000-8000-000000000003',current_setting('test.notes_owner_created_id')::uuid,'1',null,null)->>'deleted','true','owner delete follows revision CAS and succeeds');
select is((select price::text from public.weddings where id='ea020000-0000-4000-8000-000000000003'),'1234','owner Notes RPC does not change wedding price');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ea010000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.create_my_owned_wedding_note_v3('ea020000-0000-4000-8000-000000000005','No Pro note','Studio',false)$$,
  '42501','pro_required','owner Notes writes preserve the existing owner Pro gate');
reset role;
select set_config('test.notes_wedding_before',(select to_jsonb(w)::text from public.weddings w where w.id='ea020000-0000-4000-8000-000000000003'),true);
select set_config('test.notes_contract_before',(select fa.answer_json::text from public.form_answers fa where fa.instance_id='ea071000-0000-4000-8000-000000000003'),true);
select set_config('test.notes_questionnaire_before',(select qr.answers_json::text from public.wedding_questionnaire_responses qr where qr.id='ea091000-0000-4000-8000-000000000001'),true);
select set_config('test.notes_task_before',(select to_jsonb(t)::text from public.tasks t where t.id='ea092000-0000-4000-8000-000000000001'),true);
select set_config('test.notes_payment_before',(select to_jsonb(p)::text from public.payments p where p.id='ea093000-0000-4000-8000-000000000001'),true);

set local role authenticated;
select set_config('request.jwt.claim.sub','ea010000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000001')$$,'P0001','FORBIDDEN','Notes 0 read is forbidden for active relationship');
select throws_ok($$select public.create_my_collaborative_wedding_note_v3('ea020000-0000-4000-8000-000000000001','1','Denied',false)$$,'P0001','FORBIDDEN','Notes 0 create is denied');
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000001','1','ea060000-0000-4000-8000-000000000001','1','Denied',false)$$,'P0001','FORBIDDEN','Notes 0 update is denied');
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('delete','ea020000-0000-4000-8000-000000000001','1','ea060000-0000-4000-8000-000000000001','1',null,null)$$,'P0001','FORBIDDEN','Notes 0 delete is denied');
select is(public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000002')->>'notes_level','1','Notes 1 read reports View level');
select is(jsonb_array_length(public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000002')->'notes'),3,'Notes 1 reads all notes for the exact wedding');
select is((select n->>'content' from jsonb_array_elements(public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000002')->'notes') n where n->>'id'='ea060000-0000-4000-8000-000000000008'),
  'Contract recovery snapshot','a Contract-recovery copy is a normal Notes row visible at Notes 1');
select is((public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000002')->'notes'->0->>'pinned'),'true','Notes 1 projection preserves pinned display state');
select is(public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000002')->>'access_version','1','shared read returns access_version as text');
select is((select count(*)::int from public.notes where wedding_id='ea020000-0000-4000-8000-000000000002'),0,'raw Notes RLS still hides collaborator rows');
select throws_ok($$select public.create_my_collaborative_wedding_note_v3('ea020000-0000-4000-8000-000000000002','1','Denied',false)$$,'P0001','FORBIDDEN','Notes 1 create is denied');
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000002','1','ea060000-0000-4000-8000-000000000002','1','Denied',false)$$,'P0001','FORBIDDEN','Notes 1 update is denied');
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('delete','ea020000-0000-4000-8000-000000000002','1','ea060000-0000-4000-8000-000000000002','1',null,null)$$,'P0001','FORBIDDEN','Notes 1 delete is denied');
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','99','ea060000-0000-4000-8000-000000000004','1','Stale access',false)$$,'P0001','CONFLICT','stale access_version conflicts before a shared write');
select is(public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000003')->>'notes_level','2','Notes 2 read reports Edit level');
select is((select n->>'revision' from jsonb_array_elements(public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000003')->'notes') n where n->>'id'=current_setting('test.notes_row')),'5','shared read returns latest owner revision as text');
select is((select n->>'content' from jsonb_array_elements(public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000003')->'notes') n where n->>'id'='ea060000-0000-4000-8000-000000000009'),'Questionnaire additionalNotes snapshot',
  'questionnaire additionalNotes copy is read as an ordinary canonical Note');
select is(public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000010','1','Edited Contract recovery copy',true)->>'revision','2',
  'Notes 2 can edit a Contract-derived copy exactly like a normal Note');
select is(public.mutate_my_collaborative_wedding_note_v3('delete','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000010','2',null,null)->>'deleted','true',
  'Notes 2 can delete a Contract-derived copy exactly like a normal Note');
select is(public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000009','1','Edited questionnaire copy',false)->>'revision','2',
  'Notes 2 can edit a questionnaire-derived copy exactly like a normal Note');
select is(public.mutate_my_collaborative_wedding_note_v3('delete','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000009','2',null,null)->>'deleted','true',
  'Notes 2 can delete a questionnaire-derived copy exactly like a normal Note');
select is(public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000004','5','Member edit',false)->>'revision','6','Notes 2 edits exact wedding note');
select is(public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000004','6','Member pin',true)->>'revision','7','shared pin increments exactly once');
select is(public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000004','7','Member unpin',false)->>'revision','8','shared unpin increments exactly once');
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000004','7','Stale note',true)$$,'P0001','CONFLICT','stale note revision conflicts');
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('delete','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000005','1',null,null)$$,'P0001','UNAVAILABLE','another wedding note ID is unavailable');
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('delete','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000006','1',null,null)$$,'P0001','UNAVAILABLE','another owner note ID is unavailable');
select throws_ok($$select public.create_my_collaborative_wedding_note_v3('ea020000-0000-4000-8000-000000000003','1','   ',false)$$,'P0001','VALIDATION_ERROR','blank shared note is rejected without revision change');
select is((select n->>'revision' from jsonb_array_elements(public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000003')->'notes') n where n->>'id'=current_setting('test.notes_row')),'8','failed mutation leaves revision unchanged');
select set_config('test.notes_created',public.create_my_collaborative_wedding_note_v3('ea020000-0000-4000-8000-000000000003','1','Member created',true)::text,true);
select is(current_setting('test.notes_created')::jsonb->>'revision','1','shared created note starts at revision one');
select is(current_setting('test.notes_created')::jsonb->>'author','Marta Notes','shared author is derived from authenticated profile');
reset role;
select is((select count(*)::int from public.timeline_events where wedding_id='ea020000-0000-4000-8000-000000000003'),0,'shared Notes mutation creates no general timeline event');
select is((select price::text from public.weddings where id='ea020000-0000-4000-8000-000000000003'),'1234','shared Notes writes leave wedding core unchanged');
select is((select to_jsonb(w)::text from public.weddings w where w.id='ea020000-0000-4000-8000-000000000003'),current_setting('test.notes_wedding_before'),
  'representative shared Notes writes leave the complete wedding and Contacts row unchanged');
select is((select fa.answer_json::text from public.form_answers fa where fa.instance_id='ea071000-0000-4000-8000-000000000003'),current_setting('test.notes_contract_before'),
  'Contract source answers remain unchanged after editing/deleting its copied Note');
select is((select qr.answers_json::text from public.wedding_questionnaire_responses qr where qr.id='ea091000-0000-4000-8000-000000000001'),current_setting('test.notes_questionnaire_before'),
  'live questionnaire answers remain unchanged after editing/deleting the copied Note');
select is((select to_jsonb(t)::text from public.tasks t where t.id='ea092000-0000-4000-8000-000000000001'),current_setting('test.notes_task_before'),
  'Tasks row remains unchanged by Notes mutations');
select is((select to_jsonb(p)::text from public.payments p where p.id='ea093000-0000-4000-8000-000000000001'),current_setting('test.notes_payment_before'),
  'Finance/payment row remains unchanged by Notes mutations');
set local role authenticated;
select set_config('request.jwt.claim.sub','ea010000-0000-4000-8000-000000000002',true);
select ok(not (public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000003')->'notes'->0 ?| array['wedding_id','user_id','timeline','tasks','contacts','finance']),'shared note projection contains no cross-domain fields');
select is(public.mutate_my_collaborative_wedding_note_v3('delete','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000004','8',null,null)->>'deleted','true','shared exact note delete succeeds after revision validation');
reset role;

update collaboration_private.membership_area_access a set notes=1
  where a.membership_id=(select m.id from public.wedding_collaboration_memberships m where m.wedding_id='ea020000-0000-4000-8000-000000000003' and m.member_user_id='ea010000-0000-4000-8000-000000000002');
update public.wedding_collaboration_memberships m set access_version=2
  where m.wedding_id='ea020000-0000-4000-8000-000000000003' and m.member_user_id='ea010000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','ea010000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000004','8','Stale Notes2 authority',false)$$,'P0001','CONFLICT','Notes 2 to Notes 1 rejects the stale access_version');
select is(public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000003')->>'notes_level','1','Notes 2 to Notes 1 keeps the read projection');
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','2','ea060000-0000-4000-8000-000000000004','8','View cannot edit',false)$$,'P0001','FORBIDDEN','current Notes 1 authority remains read-only');
reset role;
update collaboration_private.membership_area_access a set notes=0
  where a.membership_id=(select m.id from public.wedding_collaboration_memberships m where m.wedding_id='ea020000-0000-4000-8000-000000000003' and m.member_user_id='ea010000-0000-4000-8000-000000000002');
update public.wedding_collaboration_memberships m set access_version=3
  where m.wedding_id='ea020000-0000-4000-8000-000000000003' and m.member_user_id='ea010000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','ea010000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000003')$$,'P0001','FORBIDDEN','Notes 2 to Notes 0 removes the read projection');
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','2','ea060000-0000-4000-8000-000000000004','8','Stale Notes1 authority',false)$$,'P0001','CONFLICT','Notes 1 to Notes 0 rejects stale access_version');
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','3','ea060000-0000-4000-8000-000000000004','8','No Notes access',false)$$,'P0001','FORBIDDEN','current Notes 0 authority denies writes');
reset role;
update public.wedding_collaboration_memberships m set status='revoked',revoked_at=pg_catalog.now()
  where m.wedding_id='ea020000-0000-4000-8000-000000000003' and m.member_user_id='ea010000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','ea010000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000003')$$,'P0001','UNAVAILABLE','revoked membership cannot read Notes');
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','3','ea060000-0000-4000-8000-000000000004','8','Revoked access',false)$$,'P0001','UNAVAILABLE','revoked membership cannot write Notes');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','ea010000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.get_my_collaborative_wedding_notes_v3('ea020000-0000-4000-8000-000000000003')$$,'P0001','UNAVAILABLE','no membership cannot read shared Notes');
select throws_ok($$select public.mutate_my_collaborative_wedding_note_v3('update','ea020000-0000-4000-8000-000000000003','1','ea060000-0000-4000-8000-000000000004','8','Spoof',false)$$,'P0001','UNAVAILABLE','caller cannot spoof actor identity');
reset role;

select * from finish();
rollback;
