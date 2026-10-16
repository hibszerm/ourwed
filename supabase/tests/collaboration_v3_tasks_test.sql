begin;
select no_plan();

select has_column('public','tasks','revision','canonical tasks have a monotonic revision column');
select col_not_null('public','tasks','revision','revision is required');
select is((select column_default from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='revision'),'1','new task rows start at revision one');
select has_trigger('public','tasks','tasks_bump_revision_v3','all actual task updates use the revision trigger');
select has_function('public','get_my_collaborative_wedding_tasks_v3',array['uuid'],'exact-wedding shared read RPC exists');
select has_function('public','get_my_collaborative_tasks_v3',array['date'],'global authorized shared read RPC exists');
select has_function('public','get_my_collaborative_task_targets_v3',array[]::text[],'shared create-target RPC exists');
select has_function('public','mutate_my_collaborative_task_v3',array['text','uuid','text','uuid','text','text','date'],'typed shared mutation RPC exists');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.mutate_my_collaborative_task_v3(text,uuid,text,uuid,text,text,date)'::regprocedure),'mutation RPC is SECURITY DEFINER with empty search_path');
select ok(has_function_privilege('authenticated','public.get_my_collaborative_wedding_tasks_v3(uuid)','execute') and not has_function_privilege('anon','public.get_my_collaborative_wedding_tasks_v3(uuid)','execute'),'exact read is authenticated-only');
select ok(has_function_privilege('authenticated','public.get_my_collaborative_tasks_v3(date)','execute') and not has_function_privilege('anon','public.get_my_collaborative_tasks_v3(date)','execute'),'global read is authenticated-only');
select ok(has_function_privilege('authenticated','public.get_my_collaborative_task_targets_v3()','execute') and not has_function_privilege('anon','public.get_my_collaborative_task_targets_v3()','execute'),'task targets are authenticated-only');
select ok(has_function_privilege('authenticated','public.mutate_my_collaborative_task_v3(text,uuid,text,uuid,text,text,date)','execute') and not has_function_privilege('anon','public.mutate_my_collaborative_task_v3(text,uuid,text,uuid,text,text,date)','execute'),'mutation RPC is authenticated-only');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.mutate_my_collaborative_task_v3(text,uuid,text,uuid,text,text,date)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'mutation RPC is not executable by PUBLIC');
select ok(not has_function_privilege('service_role','public.mutate_my_collaborative_task_v3(text,uuid,text,uuid,text,text,date)','execute'),'service_role has no shared task mutation grant');
select ok(not has_function_privilege('authenticated','collaboration_private.require_tasks_edit_v3(uuid,text)','execute'),'internal authorization helper is not client-executable');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.tasks'::regclass),'raw task RLS remains enabled and forced');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='tasks' and coalesce(qual,'') ilike '%membership%'),'raw task RLS was not widened for membership');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','e9010000-0000-4000-8000-000000000001','authenticated','authenticated','tasks-owner@example.test','x',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','e9010000-0000-4000-8000-000000000002','authenticated','authenticated','tasks-member@example.test','x',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','e9010000-0000-4000-8000-000000000003','authenticated','authenticated','tasks-other-owner@example.test','x',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','e9010000-0000-4000-8000-000000000004','authenticated','authenticated','tasks-outsider@example.test','x',now(),'{}','{}',now(),now());
insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status) values
 ('e9020000-0000-4000-8000-000000000001','e9010000-0000-4000-8000-000000000001','Tasks','None','2027-08-01','active'),
 ('e9020000-0000-4000-8000-000000000002','e9010000-0000-4000-8000-000000000001','Tasks','View','2027-08-02','active'),
 ('e9020000-0000-4000-8000-000000000003','e9010000-0000-4000-8000-000000000001','Tasks','Edit','2027-08-03','active'),
 ('e9020000-0000-4000-8000-000000000004','e9010000-0000-4000-8000-000000000001','Tasks','Other Wedding','2027-08-04','active'),
 ('e9020000-0000-4000-8000-000000000005','e9010000-0000-4000-8000-000000000003','Other','Owner','2027-08-05','active'),
 ('e9020000-0000-4000-8000-000000000006','e9010000-0000-4000-8000-000000000001','Tasks','No Membership','2027-08-06','active'),
 ('e9020000-0000-4000-8000-000000000007','e9010000-0000-4000-8000-000000000001','Tasks','Empty Edit','2027-08-07','active');
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,participant_low_name_snapshot,participant_high_name_snapshot,status) values
 ('e9030000-0000-4000-8000-000000000001','e9010000-0000-4000-8000-000000000001','e9010000-0000-4000-8000-000000000002','Task Owner','Task Member','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','e9010000-0000-4000-8000-000000000001',true);
select public.create_wedding_collaboration_invitation_v3('e9020000-0000-4000-8000-000000000001','e9030000-0000-4000-8000-000000000001',null,'e9040000-0000-4000-8000-000000000001','system:photographer',null,'custom','{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":0}'::jsonb);
select public.create_wedding_collaboration_invitation_v3('e9020000-0000-4000-8000-000000000002','e9030000-0000-4000-8000-000000000001',null,'e9040000-0000-4000-8000-000000000002','system:photographer',null,'custom','{"logistics":0,"prewedding":0,"contacts":0,"tasks":1,"notes":0,"compensation":0}'::jsonb);
select public.create_wedding_collaboration_invitation_v3('e9020000-0000-4000-8000-000000000003','e9030000-0000-4000-8000-000000000001',null,'e9040000-0000-4000-8000-000000000003','system:photographer',null,'custom','{"logistics":0,"prewedding":0,"contacts":0,"tasks":2,"notes":0,"compensation":0}'::jsonb);
select public.create_wedding_collaboration_invitation_v3('e9020000-0000-4000-8000-000000000004','e9030000-0000-4000-8000-000000000001',null,'e9040000-0000-4000-8000-000000000004','system:photographer',null,'custom','{"logistics":0,"prewedding":0,"contacts":0,"tasks":2,"notes":0,"compensation":0}'::jsonb);
select public.create_wedding_collaboration_invitation_v3('e9020000-0000-4000-8000-000000000007','e9030000-0000-4000-8000-000000000001',null,'e9040000-0000-4000-8000-000000000005','system:photographer',null,'custom','{"logistics":0,"prewedding":0,"contacts":0,"tasks":2,"notes":0,"compensation":0}'::jsonb);
reset role;
select set_config('test.tasks_invite_0',(select id::text from public.wedding_collaboration_invitations where idempotency_key='e9040000-0000-4000-8000-000000000001'),true);
select set_config('test.tasks_invite_1',(select id::text from public.wedding_collaboration_invitations where idempotency_key='e9040000-0000-4000-8000-000000000002'),true);
select set_config('test.tasks_invite_2',(select id::text from public.wedding_collaboration_invitations where idempotency_key='e9040000-0000-4000-8000-000000000003'),true);
select set_config('test.tasks_invite_3',(select id::text from public.wedding_collaboration_invitations where idempotency_key='e9040000-0000-4000-8000-000000000004'),true);
select set_config('test.tasks_invite_4',(select id::text from public.wedding_collaboration_invitations where idempotency_key='e9040000-0000-4000-8000-000000000005'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','e9010000-0000-4000-8000-000000000002',true);
select public.accept_wedding_collaboration_invite(current_setting('test.tasks_invite_0')::uuid,'e9050000-0000-4000-8000-000000000001');
select public.accept_wedding_collaboration_invite(current_setting('test.tasks_invite_1')::uuid,'e9050000-0000-4000-8000-000000000002');
select public.accept_wedding_collaboration_invite(current_setting('test.tasks_invite_2')::uuid,'e9050000-0000-4000-8000-000000000003');
select public.accept_wedding_collaboration_invite(current_setting('test.tasks_invite_3')::uuid,'e9050000-0000-4000-8000-000000000004');
select public.accept_wedding_collaboration_invite(current_setting('test.tasks_invite_4')::uuid,'e9050000-0000-4000-8000-000000000005');
reset role;
insert into public.tasks(user_id,wedding_id,title,due_date) values
 ('e9010000-0000-4000-8000-000000000001','e9020000-0000-4000-8000-000000000001','Secret zero','2027-01-01'),
 ('e9010000-0000-4000-8000-000000000001','e9020000-0000-4000-8000-000000000002','Visible view','2027-01-02'),
 ('e9010000-0000-4000-8000-000000000001','e9020000-0000-4000-8000-000000000003','Editable task','2027-01-03'),
 ('e9010000-0000-4000-8000-000000000001','e9020000-0000-4000-8000-000000000004','Second wedding task','2027-01-04');
select set_config('test.tasks_zero_id',(select id::text from public.tasks where title='Secret zero'),true);
select set_config('test.tasks_edit_id',(select id::text from public.tasks where title='Editable task'),true);
select set_config('test.tasks_view_id',(select id::text from public.tasks where title='Visible view'),true);
select set_config('test.tasks_other_id',(select id::text from public.tasks where title='Second wedding task'),true);
insert into public.tasks(user_id,wedding_id,title) values ('e9010000-0000-4000-8000-000000000001',null,'Unlinked owner task');
select set_config('test.tasks_unlinked_id',(select id::text from public.tasks where title='Unlinked owner task'),true);

set local role authenticated;
select set_config('request.jwt.claim.sub','e9010000-0000-4000-8000-000000000002',true);
select is(public.get_my_collaborative_wedding_tasks_v3('e9020000-0000-4000-8000-000000000001')->>'kind','unavailable','Tasks 0 exact read is unavailable');
select is((select count(*)::int from public.get_my_collaborative_tasks_v3(null) x where x->>'id' in (select id::text from public.tasks where wedding_id='e9020000-0000-4000-8000-000000000001')),0,'Tasks 0 contributes no global task rows');
select throws_ok($$select public.mutate_my_collaborative_task_v3('create','e9020000-0000-4000-8000-000000000001','1',null,null,'No access',null)$$,'P0001','UNAVAILABLE','Tasks 0 create is denied');
select throws_ok($$select public.mutate_my_collaborative_task_v3('update','e9020000-0000-4000-8000-000000000001','1',current_setting('test.tasks_zero_id')::uuid,'1','No access',null)$$,'P0001','UNAVAILABLE','Tasks 0 edit is denied');
select throws_ok($$select public.mutate_my_collaborative_task_v3('complete','e9020000-0000-4000-8000-000000000001','1',current_setting('test.tasks_zero_id')::uuid,'1',null,null)$$,'P0001','UNAVAILABLE','Tasks 0 complete is denied');
select throws_ok($$select public.mutate_my_collaborative_task_v3('reopen','e9020000-0000-4000-8000-000000000001','1',current_setting('test.tasks_zero_id')::uuid,'1',null,null)$$,'P0001','UNAVAILABLE','Tasks 0 reopen is denied');
select throws_ok($$select public.mutate_my_collaborative_task_v3('delete','e9020000-0000-4000-8000-000000000001','1',current_setting('test.tasks_zero_id')::uuid,'1',null,null)$$,'P0001','UNAVAILABLE','Tasks 0 delete is denied');
select is(public.get_my_collaborative_wedding_tasks_v3('e9020000-0000-4000-8000-000000000002')->>'tasks_level','1','Tasks 1 read returns View level');
select is(jsonb_array_length(public.get_my_collaborative_wedding_tasks_v3('e9020000-0000-4000-8000-000000000002')->'tasks'),1,'Tasks 1 can read exact wedding task rows');
select throws_ok($$select public.mutate_my_collaborative_task_v3('update','e9020000-0000-4000-8000-000000000002','1',current_setting('test.tasks_view_id')::uuid,'1','Denied',null)$$,'P0001','FORBIDDEN','Tasks 1 edit is denied');
select throws_ok($$select public.mutate_my_collaborative_task_v3('create','e9020000-0000-4000-8000-000000000002','1',null,null,'Denied',null)$$,'P0001','FORBIDDEN','Tasks 1 create is denied');
select throws_ok($$select public.mutate_my_collaborative_task_v3('complete','e9020000-0000-4000-8000-000000000002','1',current_setting('test.tasks_view_id')::uuid,'1',null,null)$$,'P0001','FORBIDDEN','Tasks 1 complete is denied');
select throws_ok($$select public.mutate_my_collaborative_task_v3('reopen','e9020000-0000-4000-8000-000000000002','1',current_setting('test.tasks_view_id')::uuid,'1',null,null)$$,'P0001','FORBIDDEN','Tasks 1 reopen is denied');
select throws_ok($$select public.mutate_my_collaborative_task_v3('delete','e9020000-0000-4000-8000-000000000002','1',current_setting('test.tasks_view_id')::uuid,'1',null,null)$$,'P0001','FORBIDDEN','Tasks 1 delete is denied');
select is((select count(*)::int from public.get_my_collaborative_task_targets_v3()),3,'create targets include only Tasks 2 weddings');
select ok(exists(select 1 from public.get_my_collaborative_task_targets_v3() x where x->>'wedding_id'='e9020000-0000-4000-8000-000000000007') and not exists(select 1 from public.tasks where wedding_id='e9020000-0000-4000-8000-000000000007'),'Tasks 2 with no existing tasks remains a create target');
select ok(not exists(select 1 from public.get_my_collaborative_task_targets_v3() x where x->>'wedding_id'='e9020000-0000-4000-8000-000000000001'),'Tasks 0 is not a create target');
select is((select count(*)::int from public.get_my_collaborative_tasks_v3(null)),3,'global shared read includes only Tasks 1 and 2 rows');
select ok(not exists(select 1 from public.get_my_collaborative_tasks_v3(null) x where x->>'wedding_id'='e9020000-0000-4000-8000-000000000001'),'Tasks 0 task does not leak globally');
select is(public.get_my_collaborative_wedding_tasks_v3('e9020000-0000-4000-8000-000000000005')->>'kind','unavailable','another owner wedding is unavailable');
select is(public.get_my_collaborative_wedding_tasks_v3('e9020000-0000-4000-8000-000000000006')->>'kind','unavailable','same owner wedding without membership is unavailable');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','e9010000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.tasks where wedding_id='e9020000-0000-4000-8000-000000000003'),1,'owner continues to read linked tasks');
update public.tasks set title='Owner direct update' where id=current_setting('test.tasks_edit_id')::uuid;
select is((select revision::text from public.tasks where id=current_setting('test.tasks_edit_id')::uuid),'2','owner direct UPDATE advances revision exactly once');
with inserted as (insert into public.tasks(user_id,wedding_id,title) values(auth.uid(),'e9020000-0000-4000-8000-000000000003','Owner CRUD task') returning id)
select set_config('test.owner_task_id',(select id::text from inserted),true);
select is((select revision::text from public.tasks where id=current_setting('test.owner_task_id')::uuid),'1','owner create uses initial revision');
update public.tasks set status='done',completed_at=now() where id=current_setting('test.owner_task_id')::uuid;
select is((select revision::text from public.tasks where id=current_setting('test.owner_task_id')::uuid),'2','owner complete mutation advances once');
update public.tasks set status='todo',completed_at=null where id=current_setting('test.owner_task_id')::uuid;
select is((select revision::text from public.tasks where id=current_setting('test.owner_task_id')::uuid),'3','owner reopen mutation advances once');
delete from public.tasks where id=current_setting('test.owner_task_id')::uuid;
select is((select count(*)::int from public.tasks where id=current_setting('test.owner_task_id')::uuid),0,'owner delete succeeds');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','e9010000-0000-4000-8000-000000000002',true);
select set_config('test.tasks_projection',public.get_my_collaborative_wedding_tasks_v3('e9020000-0000-4000-8000-000000000003')::text,true);
select is(current_setting('test.tasks_projection')::jsonb->>'access_version','1','shared projection returns exact access version');
select is(current_setting('test.tasks_projection')::jsonb->>'tasks_level','2','shared projection returns Edit authority');
select is(current_setting('test.tasks_projection')::jsonb->'tasks'->0->>'revision','2','owner direct mutation is visible in task revision');
select is((select count(*)::int from jsonb_object_keys(current_setting('test.tasks_projection')::jsonb->'tasks'->0)),7,'shared task row contains only the seven allowlisted fields');
select ok(not (current_setting('test.tasks_projection')::jsonb->'tasks'->0 ?| array['user_id','description','contacts','finance','notes','prewedding','logistics']),'shared task projection minimizes fields');
reset role;

select throws_ok($$select public.mutate_my_collaborative_task_v3('update','e9020000-0000-4000-8000-000000000003','1',current_setting('test.tasks_edit_id')::uuid,'1','Stale',null)$$,'P0001','CONFLICT','stale task revision after owner update conflicts');
set local role authenticated;
select set_config('request.jwt.claim.sub','e9010000-0000-4000-8000-000000000002',true);
select is(public.mutate_my_collaborative_task_v3('update','e9020000-0000-4000-8000-000000000003','1',current_setting('test.tasks_edit_id')::uuid,'2','Edited task','2027-02-01')->>'revision','3','shared edit advances revision once');
select is(public.mutate_my_collaborative_task_v3('complete','e9020000-0000-4000-8000-000000000003','1',current_setting('test.tasks_edit_id')::uuid,'3',null,null)->>'revision','4','complete advances revision once');
select is(public.mutate_my_collaborative_task_v3('reopen','e9020000-0000-4000-8000-000000000003','1',current_setting('test.tasks_edit_id')::uuid,'4',null,null)->>'revision','5','reopen advances revision once');
select throws_ok($$select public.mutate_my_collaborative_task_v3('delete','e9020000-0000-4000-8000-000000000003','1',current_setting('test.tasks_edit_id')::uuid,'4',null,null)$$,'P0001','CONFLICT','stale delete conflicts');
select throws_ok($$select public.mutate_my_collaborative_task_v3('update','e9020000-0000-4000-8000-000000000003','2',current_setting('test.tasks_edit_id')::uuid,'5','Stale authority',null)$$,'P0001','CONFLICT','stale access version conflicts');
select set_config('test.tasks_created_projection',public.mutate_my_collaborative_task_v3('create','e9020000-0000-4000-8000-000000000003','1',null,null,'Created by member','2027-02-02')::text,true);
reset role;
select is(current_setting('test.tasks_created_projection')::jsonb->>'revision','1','shared create starts at initial revision');
select is((select user_id::text from public.tasks where id=(current_setting('test.tasks_created_projection')::jsonb->>'id')::uuid),'e9010000-0000-4000-8000-000000000001','shared create derives row owner from wedding owner');
select is((select wedding_id::text from public.tasks where id=(current_setting('test.tasks_created_projection')::jsonb->>'id')::uuid),'e9020000-0000-4000-8000-000000000003','shared create binds the exact authorized wedding');
select throws_ok($$select public.mutate_my_collaborative_task_v3('delete','e9020000-0000-4000-8000-000000000003','1',current_setting('test.tasks_other_id')::uuid,'1',null,null)$$,'P0001','UNAVAILABLE','foreign wedding task ID is unavailable');
select throws_ok($$select public.mutate_my_collaborative_task_v3('update','e9020000-0000-4000-8000-000000000003','1',current_setting('test.tasks_unlinked_id')::uuid,'1','Stale',null)$$,'P0001','UNAVAILABLE','unlinked owner task ID is unavailable to collaborator');
select is(public.mutate_my_collaborative_task_v3('delete','e9020000-0000-4000-8000-000000000003','1',current_setting('test.tasks_edit_id')::uuid,'5',null,null)->>'deleted','true','current revision delete removes only exact task');
reset role;

select is((select count(*)::int from public.tasks where title='Created by member' and wedding_id='e9020000-0000-4000-8000-000000000003' and user_id='e9010000-0000-4000-8000-000000000001'),1,'shared create did not reassign row or wedding');
select is((select count(*)::int from public.tasks where title='Second wedding task'),1,'cross-wedding task remains unchanged');
select is((select count(*)::int from public.weddings where id in ('e9020000-0000-4000-8000-000000000001','e9020000-0000-4000-8000-000000000002','e9020000-0000-4000-8000-000000000003')),3,'task mutations do not alter wedding rows');

-- Versioned permission loss must reject stale writes, then remove read authority.
update collaboration_private.membership_area_access a set tasks=1
where a.membership_id=(select id from public.wedding_collaboration_memberships where wedding_id='e9020000-0000-4000-8000-000000000003');
update public.wedding_collaboration_memberships set access_version=2
where wedding_id='e9020000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','e9010000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.mutate_my_collaborative_task_v3('update','e9020000-0000-4000-8000-000000000003','1',(current_setting('test.tasks_created_projection')::jsonb->>'id')::uuid,'1','Stale View grant',null)$$,'P0001','CONFLICT','Edit to View rejects stale access version');
reset role;
update collaboration_private.membership_area_access a set tasks=0
where a.membership_id=(select id from public.wedding_collaboration_memberships where wedding_id='e9020000-0000-4000-8000-000000000003');
update public.wedding_collaboration_memberships set access_version=3
where wedding_id='e9020000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','e9010000-0000-4000-8000-000000000002',true);
select is(public.get_my_collaborative_wedding_tasks_v3('e9020000-0000-4000-8000-000000000003')->>'kind','unavailable','Tasks 2 to 0 removes exact read');
select is((select count(*)::int from public.get_my_collaborative_tasks_v3(null) x where x->>'wedding_id'='e9020000-0000-4000-8000-000000000003'),0,'Tasks 2 to 0 removes global task rows');
select throws_ok($$select public.mutate_my_collaborative_task_v3('update','e9020000-0000-4000-8000-000000000003','3',(current_setting('test.tasks_created_projection')::jsonb->>'id')::uuid,'1','No access',null)$$,'P0001','UNAVAILABLE','Tasks 0 with current version cannot mutate');
select throws_ok($$select public.mutate_my_collaborative_task_v3('update','e9020000-0000-4000-8000-000000000003','2',(current_setting('test.tasks_created_projection')::jsonb->>'id')::uuid,'1','Stale Edit to None',null)$$,'P0001','CONFLICT','Edit to None rejects stale access version');
reset role;
update public.wedding_collaboration_memberships set status='revoked',access_version=4,revoked_at=now()
where wedding_id='e9020000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','e9010000-0000-4000-8000-000000000002',true);
select is(public.get_my_collaborative_wedding_tasks_v3('e9020000-0000-4000-8000-000000000003')->>'kind','unavailable','revoked membership has no exact read');
select throws_ok($$select public.mutate_my_collaborative_task_v3('delete','e9020000-0000-4000-8000-000000000003','4',(current_setting('test.tasks_created_projection')::jsonb->>'id')::uuid,'1',null,null)$$,'P0001','UNAVAILABLE','revoked membership cannot mutate');
select * from finish();
rollback;
