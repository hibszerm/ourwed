begin;
select no_plan();

select has_table('collaboration_private','compensation_relationships','stable compensation relationships are installed');
select has_table('collaboration_private','compensation_terms','current official terms are separate from membership');
select has_table('collaboration_private','compensation_terms_history','official term history is durable');
select has_table('collaboration_private','compensation_recipient_terms_history','only previously visible official snapshots have a dedicated archive');
select has_table('collaboration_private','compensation_private_settings','recipient fallback settings are isolated');
select has_table('collaboration_private','compensation_private_settings_history','recipient fallback changes retain history');
select has_table('collaboration_private','compensation_private_receipts','manual receipts are separate from client payments');
select has_table('collaboration_private','compensation_private_state','recipient-private writes use a revision row');
select has_table('collaboration_private','compensation_client_receipt_archive','client receipts survive wedding deletion as financial snapshots');

select ok(not exists(select 1 from (values
  ('collaboration_private.compensation_relationships'),('collaboration_private.compensation_terms'),
  ('collaboration_private.compensation_terms_history'),('collaboration_private.compensation_recipient_terms_history'),
  ('collaboration_private.compensation_private_settings'),('collaboration_private.compensation_private_settings_history'),
  ('collaboration_private.compensation_private_receipts'),('collaboration_private.compensation_private_state'),
  ('collaboration_private.compensation_client_receipt_archive')) t(name)
  where not (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class where oid=t.name::regclass)),
  'all compensation-private tables enable and force RLS');
select ok(not exists(select 1 from (values
  ('collaboration_private.compensation_relationships'),('collaboration_private.compensation_terms'),
  ('collaboration_private.compensation_terms_history'),('collaboration_private.compensation_recipient_terms_history'),
  ('collaboration_private.compensation_private_settings'),('collaboration_private.compensation_private_settings_history'),
  ('collaboration_private.compensation_private_receipts'),('collaboration_private.compensation_private_state'),
  ('collaboration_private.compensation_client_receipt_archive')) t(name)
  cross join (values ('anon'),('authenticated'),('service_role')) roles(role_name)
  cross join (values ('select'),('insert'),('update'),('delete')) privs(privilege_name)
  where has_table_privilege(roles.role_name,t.name,privs.privilege_name)),
  'raw compensation table CRUD is denied to anon, authenticated and service_role');

select has_function('public','get_my_personal_compensation_values_v3',array['uuid[]'],'canonical actor-specific Finance projection exists');
select has_function('public','get_owner_compensation_relationships_v3',array['uuid'],'owner allocation read exists independently of Compensation visibility');
select has_function('public','mutate_owner_compensation_terms_v3',array['uuid','text','numeric','date','boolean'],'owner allocation mutation exists');
select has_function('public','get_my_collaborative_compensation_v3',array['uuid'],'shared terms projection exists');
select has_function('public','get_my_private_compensation_v3',array['uuid'],'private settlement projection exists');
select has_function('public','mutate_my_private_compensation_settings_v3',array['uuid','text','numeric','date'],'private fallback CAS exists');
select has_function('public','create_my_private_compensation_receipt_v3',array['uuid','numeric','date','text','text'],'private manual receipt create exists');
select has_function('public','delete_my_private_compensation_receipt_v3',array['uuid','text','text'],'private manual receipt delete CAS exists');
select has_function('public','mutate_my_shared_compensation_terms_v3',array['uuid','text','text','numeric','date','boolean'],'Comp2 official terms CAS exists');
select ok(not exists(select 1 from pg_catalog.pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.oid in ('public.get_my_personal_compensation_values_v3(uuid[])'::regprocedure,
    'public.get_owner_compensation_relationships_v3(uuid)'::regprocedure,
    'public.mutate_owner_compensation_terms_v3(uuid,text,numeric,date,boolean)'::regprocedure,
    'public.get_my_collaborative_compensation_v3(uuid)'::regprocedure,
    'public.get_my_private_compensation_v3(uuid)'::regprocedure,
    'public.mutate_my_private_compensation_settings_v3(uuid,text,numeric,date)'::regprocedure,
    'public.create_my_private_compensation_receipt_v3(uuid,numeric,date,text,text)'::regprocedure,
    'public.delete_my_private_compensation_receipt_v3(uuid,text,text)'::regprocedure,
    'public.mutate_my_shared_compensation_terms_v3(uuid,text,text,numeric,date,boolean)'::regprocedure)
    and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC cannot execute compensation RPCs');
select ok(has_function_privilege('authenticated','public.get_my_personal_compensation_values_v3(uuid[])','execute')
  and has_function_privilege('authenticated','public.get_owner_compensation_relationships_v3(uuid)','execute')
  and has_function_privilege('authenticated','public.mutate_owner_compensation_terms_v3(uuid,text,numeric,date,boolean)','execute')
  and has_function_privilege('authenticated','public.get_my_private_compensation_v3(uuid)','execute')
  and not has_function_privilege('anon','public.get_my_private_compensation_v3(uuid)','execute')
  and not has_function_privilege('service_role','public.get_my_private_compensation_v3(uuid)','execute'),
  'public read/write RPCs are authenticated-only and private helpers have no client grants');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc
  where oid='public.get_my_personal_compensation_values_v3(uuid[])'::regprocedure)
  and (select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc
  where oid='public.get_my_private_compensation_v3(uuid)'::regprocedure)
  and (select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc
  where oid='public.mutate_my_shared_compensation_terms_v3(uuid,text,text,numeric,date,boolean)'::regprocedure),
  'critical compensation RPCs are SECURITY DEFINER with empty search_path');

select has_column('public','payments','received_by_user_id','client payment receiver is a durable actor reference');
select has_column('public','payments','receiver_relationship_id','collaborator receiver uses stable relationship identity');
select has_column('public','payments','receiver_label_snapshot','historical receiver label is retained');
select has_column('public','payments','compensation_revision','payment receiver/settlement CAS revision exists');
select has_trigger('public','payments','payments_validate_compensation_receiver_v3','paid receiver assignment is server-validated');
select has_trigger('public','weddings','weddings_archive_compensation_receipts_v3','wedding deletion preserves collaborator client-receipt history');
select has_trigger('public','wedding_collaboration_memberships','wedding_collaboration_seed_compensation_v3','accepted collaboration creates a stable financial relationship');
select is((select receiver_kind from public.payments where id='ef0a0000-0000-4000-8000-000000000001'),'owner',
  'historical paid payment is deterministically attributed to wedding owner');
select is((select received_by_user_id::text from public.payments where id='ef0a0000-0000-4000-8000-000000000001'),
  'ef080000-0000-4000-8000-000000000001','historical paid receiver uses owner identity');
select is((select receiver_relationship_id from public.payments where id='ef0a0000-0000-4000-8000-000000000001'),null::uuid,
  'historical paid payment does not guess a collaborator relationship');
select is((select receiver_kind from public.payments where id='ef0a0000-0000-4000-8000-000000000002'),null::text,
  'unpaid scheduled payment retains null receiver');
select ok(not exists(select 1 from pg_catalog.pg_policy where polrelid in
  ('public.weddings'::regclass,'public.payments'::regclass,'public.wedding_places'::regclass,'public.wedding_operational_times'::regclass)
  and (coalesce(pg_catalog.pg_get_expr(polqual,polrelid),'') ilike '%membership%'
    or coalesce(pg_catalog.pg_get_expr(polwithcheck,polrelid),'') ilike '%membership%')),
  'compensation does not widen wedding or child-resource RLS');
select ok((select pg_get_functiondef('public.get_wedding_collaboration_invitation_preview(uuid)'::regprocedure) ilike '%contract_value%'
    and pg_get_functiondef('public.get_wedding_collaboration_invitation_preview(uuid)'::regprocedure) ilike '%proposed_share_amount%')
  and (select pg_get_functiondef('public.list_my_wedding_collaboration_invitations()'::regprocedure) ilike '%contract_value%'
    and pg_get_functiondef('public.list_my_wedding_collaboration_invitations()'::regprocedure) ilike '%proposed_share_amount%'),
  'legacy invite projections are wrapped to remove contract snapshots and redact Comp0 proposals');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','ef010000-0000-4000-8000-000000000001','authenticated','authenticated','comp-owner@example.test','x',now(),'{}','{"legal_registration_accepted":true,"terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','ef010000-0000-4000-8000-000000000002','authenticated','authenticated','comp-a@example.test','x',now(),'{}','{"legal_registration_accepted":true,"terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','ef010000-0000-4000-8000-000000000003','authenticated','authenticated','comp-b@example.test','x',now(),'{}','{"legal_registration_accepted":true,"terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000004','ef010000-0000-4000-8000-000000000004','authenticated','authenticated','comp-c@example.test','x',now(),'{}','{"legal_registration_accepted":true,"terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000005','ef010000-0000-4000-8000-000000000005','authenticated','authenticated','comp-pending@example.test','x',now(),'{}','{"legal_registration_accepted":true,"terms_version":"1.1","privacy_version":"1.1"}',now(),now());
insert into public.internal_qa_accounts(user_id,provisioned_by,purpose) values
 ('ef010000-0000-4000-8000-000000000001','V3 Compensation pgTAP fixture','local synthetic owner Pro semantics')
 on conflict(user_id) do nothing;
insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status,contract_value)
values ('ef020000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000001','Finance','Owner','2027-06-01','active',10000),
       ('ef020000-0000-4000-8000-000000000002','ef010000-0000-4000-8000-000000000001','Finance Example','Owner','2027-06-02','active',10000);
insert into collaboration_private.compensation_relationships(id,wedding_id,wedding_id_snapshot,owner_user_id,recipient_user_id,
  recipient_label_snapshot,wedding_label_snapshot,wedding_date_snapshot,currency) values
 ('ef030000-0000-4000-8000-000000000001','ef020000-0000-4000-8000-000000000001','ef020000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000002','Comp A','Finance Owner','2027-06-01','PLN'),
 ('ef030000-0000-4000-8000-000000000002','ef020000-0000-4000-8000-000000000001','ef020000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000003','Comp B','Finance Owner','2027-06-01','PLN'),
 ('ef030000-0000-4000-8000-000000000003','ef020000-0000-4000-8000-000000000002','ef020000-0000-4000-8000-000000000002','ef010000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000002','Comp A','Finance Example','2027-06-02','PLN'),
 ('ef030000-0000-4000-8000-000000000004','ef020000-0000-4000-8000-000000000002','ef020000-0000-4000-8000-000000000002','ef010000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000003','Comp B','Finance Example','2027-06-02','PLN'),
 ('ef030000-0000-4000-8000-000000000005','ef020000-0000-4000-8000-000000000001','ef020000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000004','ef010000-0000-4000-8000-000000000003','Foreign Owner Comp B','Foreign owner','2027-06-01','PLN');
insert into collaboration_private.compensation_terms(relationship_id,amount,currency,terms_revision,amount_revision,active)
values ('ef030000-0000-4000-8000-000000000001',5000,'PLN',1,1,true),
       ('ef030000-0000-4000-8000-000000000002',1500,'PLN',1,1,true),
       ('ef030000-0000-4000-8000-000000000003',2000,'PLN',1,1,true),
       ('ef030000-0000-4000-8000-000000000004',1500,'PLN',1,1,true);
insert into collaboration_private.compensation_terms_history(relationship_id,terms_revision,amount,currency,amount_revision,active,actor_user_id)
select relationship_id,terms_revision,amount,currency,amount_revision,active,'ef010000-0000-4000-8000-000000000001'
from collaboration_private.compensation_terms
where relationship_id in (
  'ef030000-0000-4000-8000-000000000001',
  'ef030000-0000-4000-8000-000000000002',
  'ef030000-0000-4000-8000-000000000003',
  'ef030000-0000-4000-8000-000000000004'
);
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status) values
 ('ef040000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000002','Comp Owner','Comp A','active'),
 ('ef040000-0000-4000-8000-000000000002','ef010000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000003','Comp Owner','Comp B','active'),
 ('ef040000-0000-4000-8000-000000000003','ef010000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000004','Comp Owner','Comp C','active'),
 ('ef040000-0000-4000-8000-000000000004','ef010000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000005','Comp Owner','Pending D','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select set_config('test.comp_invite_a',public.create_wedding_collaboration_invitation_v3(
  'ef020000-0000-4000-8000-000000000001','ef040000-0000-4000-8000-000000000001',5000,
  'ef050000-0000-4000-8000-000000000001','system:photographer',null,'custom',
  '{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":0}'::jsonb)->>'invitation_id',true);
select set_config('test.comp_invite_b',public.create_wedding_collaboration_invitation_v3(
  'ef020000-0000-4000-8000-000000000001','ef040000-0000-4000-8000-000000000002',null,
  'ef050000-0000-4000-8000-000000000002','system:photographer',null,'custom',
  '{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":0}'::jsonb)->>'invitation_id',true);
select set_config('test.comp_invite_c',public.create_wedding_collaboration_invitation_v3(
  'ef020000-0000-4000-8000-000000000001','ef040000-0000-4000-8000-000000000003',null,
  'ef050000-0000-4000-8000-000000000003','system:photographer',null,'custom',
  '{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":0}'::jsonb)->>'invitation_id',true);
select set_config('test.comp_invite_d',public.create_wedding_collaboration_invitation_v3(
  'ef020000-0000-4000-8000-000000000001','ef040000-0000-4000-8000-000000000004',null,
  'ef050000-0000-4000-8000-000000000004','system:photographer',null,'custom',
  '{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":0}'::jsonb)->>'invitation_id',true);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select ok((public.get_wedding_collaboration_invitation_preview(current_setting('test.comp_invite_a')::uuid)->>'proposed_share_amount') is null
  and not (public.get_wedding_collaboration_invitation_preview(current_setting('test.comp_invite_a')::uuid) ? 'contract_value')
  and not (public.get_wedding_collaboration_invitation_preview(current_setting('test.comp_invite_a')::uuid) ? 'has_proposed_share_amount')
  and not (public.get_wedding_collaboration_invitation_preview(current_setting('test.comp_invite_a')::uuid)::text ilike '%5000%'),
  'Comp0 invitation preview reveals no legacy proposal amount, existence flag or amount-derived metadata');
select set_config('test.membership_a',public.accept_wedding_collaboration_invite(current_setting('test.comp_invite_a')::uuid,'ef060000-0000-4000-8000-000000000001')->>'membership_id',true);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000003',true);
select set_config('test.membership_b',public.accept_wedding_collaboration_invite(current_setting('test.comp_invite_b')::uuid,'ef060000-0000-4000-8000-000000000002')->>'membership_id',true);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000004',true);
select set_config('test.membership_c',public.accept_wedding_collaboration_invite(current_setting('test.comp_invite_c')::uuid,'ef060000-0000-4000-8000-000000000003')->>'membership_id',true);
select set_config('test.comp_rel_c',public.get_my_collaborative_compensation_v3('ef020000-0000-4000-8000-000000000001')->>'relationship_id',true);
reset role;
insert into collaboration_private.compensation_private_settings(relationship_id,recipient_user_id,fallback_amount)
values ('ef030000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000002',2000),
       ('ef030000-0000-4000-8000-000000000002','ef010000-0000-4000-8000-000000000003',null)
on conflict(relationship_id) do update set fallback_amount=excluded.fallback_amount;
insert into collaboration_private.compensation_private_state(relationship_id) values
 ('ef030000-0000-4000-8000-000000000001'),('ef030000-0000-4000-8000-000000000002')
on conflict(relationship_id) do nothing;

-- The owner projection is byte-for-byte stable as recipient-private state is
-- absent, present, explicitly zero, populated with receipts, or over-received.
delete from collaboration_private.compensation_private_receipts where relationship_id='ef030000-0000-4000-8000-000000000001';
delete from collaboration_private.compensation_private_settings where relationship_id='ef030000-0000-4000-8000-000000000001';
delete from collaboration_private.compensation_private_state where relationship_id='ef030000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select set_config('test.owner_terms_shape',public.get_owner_compensation_relationships_v3('ef020000-0000-4000-8000-000000000001')::text,true);
select set_config('test.owner_finance_shape',public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])::text,true);
reset role;
insert into collaboration_private.compensation_private_state(relationship_id) values ('ef030000-0000-4000-8000-000000000001');
insert into collaboration_private.compensation_private_settings(relationship_id,recipient_user_id,fallback_amount,fallback_due_date)
values ('ef030000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000002',2000,'2027-08-01');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select ok(public.get_owner_compensation_relationships_v3('ef020000-0000-4000-8000-000000000001')::text=current_setting('test.owner_terms_shape')
  and public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])::text=current_setting('test.owner_finance_shape'),
  'owner response shape is unchanged when recipient fallback and private due date exist');
reset role;
update collaboration_private.compensation_private_settings set fallback_amount=0 where relationship_id='ef030000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select ok(public.get_owner_compensation_relationships_v3('ef020000-0000-4000-8000-000000000001')::text=current_setting('test.owner_terms_shape')
  and public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])::text=current_setting('test.owner_finance_shape'),
  'owner response shape does not reveal an explicit-zero fallback');
reset role;
update collaboration_private.compensation_private_settings set fallback_amount=2000 where relationship_id='ef030000-0000-4000-8000-000000000001';
insert into collaboration_private.compensation_private_receipts(relationship_id,recipient_user_id,amount,received_on,description)
values ('ef030000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000002',1000,'2027-07-01','private one');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select ok(public.get_owner_compensation_relationships_v3('ef020000-0000-4000-8000-000000000001')::text=current_setting('test.owner_terms_shape')
  and public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])::text=current_setting('test.owner_finance_shape'),
  'owner response shape does not reveal one private receipt or its amount, ID, or timestamp');
reset role;
insert into collaboration_private.compensation_private_receipts(relationship_id,recipient_user_id,amount,received_on,description)
values ('ef030000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000002',3000,'2027-07-02','private two');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select ok(public.get_owner_compensation_relationships_v3('ef020000-0000-4000-8000-000000000001')::text=current_setting('test.owner_terms_shape')
  and public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])::text=current_setting('test.owner_finance_shape'),
  'owner response shape does not reveal multiple private receipts or private receipt count');
reset role;
insert into collaboration_private.compensation_private_receipts(relationship_id,recipient_user_id,amount,received_on,description)
values ('ef030000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000002',4000,'2027-07-03','private over-receipt');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select ok(public.get_owner_compensation_relationships_v3('ef020000-0000-4000-8000-000000000001')::text=current_setting('test.owner_terms_shape')
  and public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])::text=current_setting('test.owner_finance_shape'),
  'owner response shape and personal value remain unchanged when private receipts exceed fallback');
reset role;
delete from collaboration_private.compensation_private_receipts where relationship_id='ef030000-0000-4000-8000-000000000001';
update collaboration_private.compensation_private_settings set fallback_amount=2000,fallback_due_date='2027-08-01'
where relationship_id='ef030000-0000-4000-8000-000000000001';
update collaboration_private.compensation_private_state set revision=1 where relationship_id='ef030000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select ok((select (item->>'personal_value')::numeric=3500::numeric from jsonb_array_elements(public.get_my_personal_compensation_values_v3(null)) item
  where item->>'wedding_id'='ef020000-0000-4000-8000-000000000001'),
  '10000 contract less 5000 and 1500 official allocations yields owner personal value 3500');
select ok((select (item->>'personal_value')::numeric=6500::numeric from jsonb_array_elements(public.get_my_personal_compensation_values_v3(null)) item
  where item->>'wedding_id'='ef020000-0000-4000-8000-000000000002'),
  '10000 contract less 2000 and 1500 official allocations yields owner personal value 6500');
select ok(not (public.get_my_personal_compensation_values_v3(null)::text ilike '%private only%')
  and not (public.get_my_personal_compensation_values_v3(null)::text ilike '%fallback_amount%')
  and not (public.get_my_personal_compensation_values_v3(null)::text ilike '%private_received_total%'),
  'owner Finance projection contains no recipient-private receipt, fallback or side-channel fields');
select throws_ok($$select public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')$$,
  'P0001','UNAVAILABLE','owner cannot read a recipient private relationship as its recipient');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select is((public.get_my_personal_compensation_values_v3(null)->0->>'personal_value')::numeric,2000::numeric,
  'Comp0 recipient Finance uses only the private fallback when no official terms are visible');
select is(public.get_my_personal_compensation_values_v3(null)->0->>'source','private_fallback',
  'private fallback source is actor-scoped');
select ok(not (public.get_my_personal_compensation_values_v3(null)::text ilike '%10000%')
  and not (public.get_my_personal_compensation_values_v3(null)::text ilike '%5000%'),
  'Comp0 recipient projection does not expose the client contract or hidden official allocation');
select ok(public.get_my_collaborative_compensation_v3('ef020000-0000-4000-8000-000000000001')->>'compensation_level'='0'
  and public.get_my_collaborative_compensation_v3('ef020000-0000-4000-8000-000000000001')->'official_terms'='null'::jsonb
  and not (public.get_my_collaborative_compensation_v3('ef020000-0000-4000-8000-000000000001') ? 'has_terms')
  and not (public.get_my_collaborative_compensation_v3('ef020000-0000-4000-8000-000000000001') ? 'terms_revision')
  and not (public.get_my_collaborative_compensation_v3('ef020000-0000-4000-8000-000000000001') ? 'amount_revision'),
  'Comp0 shared DTO omits official amount and all hidden-term presence or revision metadata');
select is((public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'received_total')::numeric,0::numeric,
  'Comp0 private settlement starts with no private receipt');
select is((public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'balance')::numeric,2000::numeric,
  'Comp0 fallback amount 2000 with no receipts yields balance 2000');
select throws_ok($$select public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000002')$$,
  'P0001','UNAVAILABLE','recipient cannot read another collaborator relationship');
reset role;

update collaboration_private.membership_area_access set compensation=1
where membership_id=(select id from public.wedding_collaboration_memberships
  where wedding_id_snapshot='ef020000-0000-4000-8000-000000000001' and member_user_id='ef010000-0000-4000-8000-000000000002' and status='active');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select is(public.get_my_collaborative_compensation_v3('ef020000-0000-4000-8000-000000000001')->'official_terms'->>'amount','5000.00',
  'Comp1 collaborator can read the official allocation');
select throws_ok($$select public.mutate_my_shared_compensation_terms_v3('ef020000-0000-4000-8000-000000000001','1','1',5100,'2027-07-01',true)$$,
  'P0001','FORBIDDEN','Comp1 collaborator cannot mutate official terms');
reset role;

update collaboration_private.membership_area_access set compensation=2
where membership_id=(select id from public.wedding_collaboration_memberships
  where wedding_id_snapshot='ef020000-0000-4000-8000-000000000001' and member_user_id='ef010000-0000-4000-8000-000000000002' and status='active');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select is(public.get_my_collaborative_compensation_v3('ef020000-0000-4000-8000-000000000001')->'official_terms'->>'amount','5000.00',
  'Comp2 collaborator reads the exact official amount');
select is(public.mutate_my_shared_compensation_terms_v3('ef020000-0000-4000-8000-000000000001','1','1',5000,'2027-07-01',true)->>'terms_revision','2',
  'Comp2 collaborator updates official terms with current access and terms versions without own Pro');
select is(public.mutate_my_shared_compensation_terms_v3('ef020000-0000-4000-8000-000000000001','1','2',5000,'2027-07-02',true)->>'amount_revision','1',
  'due-date-only official change preserves amount_revision');
select throws_ok($$select public.mutate_my_shared_compensation_terms_v3('ef020000-0000-4000-8000-000000000001','1','2',5200,'2027-07-03',true)$$,
  'P0001','CONFLICT','stale official terms revision conflicts');
select is(public.get_my_collaborative_compensation_v3('ef020000-0000-4000-8000-000000000001')->>'access_version','1',
  'Comp2 terms writes do not change membership access_version');
reset role;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select ok((select (item->>'personal_value')::numeric=3500::numeric from jsonb_array_elements(public.get_my_personal_compensation_values_v3(null)) item
  where item->>'wedding_id'='ef020000-0000-4000-8000-000000000001'),
  'owner personal value remains 3500 after unchanged Comp2 terms writes');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000004',true);
select is(public.mutate_my_private_compensation_settings_v3(current_setting('test.comp_rel_c')::uuid,'1',900,'2027-09-01')->>'revision','2',
  'third collaborator sets a private fallback through the revisioned RPC');
select is((public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'personal_value')::numeric,900::numeric,
  'third collaborator personal value is their private fallback 900');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select is((select (item->>'personal_value')::numeric from jsonb_array_elements(public.get_my_personal_compensation_values_v3(null)) item
  where item->>'wedding_id'='ef020000-0000-4000-8000-000000000001'),3500::numeric,
  'owner remains 3500 after C private fallback 900; 10000 - 5000 - 1500 = 3500');
select ok(public.get_owner_compensation_relationships_v3('ef020000-0000-4000-8000-000000000001')::text not ilike '%900%'
  and public.get_my_personal_compensation_values_v3(null)::text not ilike '%900%',
  'owner cannot infer C private fallback through owner or Finance projections');
reset role;
select set_config('test.owner_terms_before_receipt',public.get_owner_compensation_relationships_v3('ef020000-0000-4000-8000-000000000001')::text,true);
select set_config('test.owner_finance_before_receipt',public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])::text,true);

set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
insert into public.payments(id,wedding_id,type,amount,payment_date,received_by_user_id,receiver_relationship_id)
values ('ef070000-0000-4000-8000-000000000001','ef020000-0000-4000-8000-000000000001','installment',3000,'2027-07-01',
  'ef010000-0000-4000-8000-000000000002','ef030000-0000-4000-8000-000000000001');
reset role;
select is((select sum(amount)::numeric from public.payments where wedding_id='ef020000-0000-4000-8000-000000000001' and payment_date is not null),3000::numeric,
  'collaborator receiver attribution preserves the client paid total of 3000');
select is((select w.contract_value-sum(p.amount) from public.weddings w join public.payments p on p.wedding_id=w.id and p.payment_date is not null
  where w.id='ef020000-0000-4000-8000-000000000001' group by w.contract_value),7000::numeric,
  'collaborator receiver attribution preserves client remaining of 7000');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select is(public.mutate_owner_compensation_terms_v3('ef030000-0000-4000-8000-000000000002','1',1500,null,false)->>'terms_revision','2',
  'owner withdraws second allocation to isolate the mixed-receiver owner personal value');
reset role;
update collaboration_private.membership_area_access set compensation=1
where membership_id=(select id from public.wedding_collaboration_memberships where wedding_id_snapshot='ef020000-0000-4000-8000-000000000001'
  and member_user_id='ef010000-0000-4000-8000-000000000002' and status='active');
insert into public.payments(id,wedding_id,type,amount,payment_date,received_by_user_id,receiver_relationship_id)
values ('ef070000-0000-4000-8000-000000000002','ef020000-0000-4000-8000-000000000001','installment',2000,'2027-07-02',
  'ef010000-0000-4000-8000-000000000001',null);
select is((select sum(amount)::numeric from public.payments where wedding_id='ef020000-0000-4000-8000-000000000001' and payment_date is not null),5000::numeric,
  'mixed receivers preserve total client payments of 5000');
select is((select w.contract_value-sum(p.amount) from public.weddings w join public.payments p on p.wedding_id=w.id and p.payment_date is not null
  where w.id='ef020000-0000-4000-8000-000000000001' group by w.contract_value),5000::numeric,
  'mixed receivers preserve client contract remaining of 5000');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select is((public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'personal_value')::numeric,5000::numeric,
  'owner personal value is contract 10000 less only active collaborator allocation 5000');
select set_config('test.owner_terms_before_receipt',public.get_owner_compensation_relationships_v3('ef020000-0000-4000-8000-000000000001')::text,true);
select set_config('test.owner_finance_before_receipt',public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])::text,true);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select ok((public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'client_received_total')::numeric=3000
  and (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'received_total')::numeric=3000
  and (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'personal_value')::numeric=5000
  and (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'balance')::numeric=2000,
  'mixed receivers: collaborator gets only their 3000, personal value 5000, and balance 2000');
reset role;
select throws_ok($$update public.payments set receiver_relationship_id='ef030000-0000-4000-8000-000000000003' where id='ef070000-0000-4000-8000-000000000001'$$,
  'P0001','VALIDATION_ERROR','receiver relationship from another wedding is rejected');
select throws_ok($$update public.payments set receiver_relationship_id='ef030000-0000-4000-8000-000000000005',received_by_user_id='ef010000-0000-4000-8000-000000000003' where id='ef070000-0000-4000-8000-000000000001'$$,
  'P0001','VALIDATION_ERROR','foreign-owner collaborator relationship is rejected');
select throws_ok($$update public.payments set receiver_relationship_id=null,received_by_user_id='ef010000-0000-4000-8000-000000000005' where id='ef070000-0000-4000-8000-000000000001'$$,
  'P0001','VALIDATION_ERROR','pending invitation recipient without accepted membership is rejected as receiver');
select throws_ok($$update public.payments set receiver_relationship_id=null,received_by_user_id='ef010000-0000-4000-8000-ffffffffffff' where id='ef070000-0000-4000-8000-000000000001'$$,
  'P0001','VALIDATION_ERROR','arbitrary user UUID cannot be assigned as a paid receiver');
select throws_ok($$update public.payments set receiver_relationship_id='not-a-uuid' where id='ef070000-0000-4000-8000-000000000001'$$,
  '22P02','invalid input syntax for type uuid: "not-a-uuid"','malformed relationship ID is rejected by UUID parsing');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select ok(not (public.list_wedding_payment_receivers_v3('ef020000-0000-4000-8000-000000000001')::text ilike '%ef010000-0000-4000-8000-000000000005%')
  and not (public.list_wedding_payment_receivers_v3('ef020000-0000-4000-8000-000000000001')::text ilike '%ef030000-0000-4000-8000-000000000005%'),
  'receiver options contain only active accepted collaborators, excluding pending and foreign-owner identities');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select is((public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'client_received_total')::numeric,3000::numeric,
  'recipient client-attributed received total is 3000');
select is((public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'balance')::numeric,2000::numeric,
  '5000 official value less 3000 attributed receipt yields balance 2000');
reset role;
insert into collaboration_private.compensation_private_receipts(relationship_id,recipient_user_id,amount,received_on,description)
values ('ef030000-0000-4000-8000-000000000001','ef010000-0000-4000-8000-000000000002',1000,'2027-07-01','private only');
update collaboration_private.compensation_private_state set revision=revision+1
where relationship_id='ef030000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select is((public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'received_total')::numeric,4000::numeric,
  'recipient total includes 3000 attributed client and 1000 private manual receipts');
select is((public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'balance')::numeric,1000::numeric,
  'private manual receipt updates only recipient settlement balance');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select ok(public.get_owner_compensation_relationships_v3('ef020000-0000-4000-8000-000000000001')::text=current_setting('test.owner_terms_before_receipt')
  and public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])::text=current_setting('test.owner_finance_before_receipt'),
  'owner projection and personal value remain byte-identical after recipient creates a private manual receipt');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select is(public.delete_my_private_compensation_receipt_v3(
  (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->'private_receipts'->0->>'id')::uuid,'1','2')->>'private_revision','3',
  'recipient removes the private receipt through the receipt and private-state CAS');
reset role;
insert into public.payments(id,wedding_id,type,amount,payment_date,received_by_user_id,receiver_relationship_id)
values ('ef070000-0000-4000-8000-000000000003','ef020000-0000-4000-8000-000000000001','installment',4000,'2027-07-03',
  'ef010000-0000-4000-8000-000000000002','ef030000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select ok((public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'personal_value')::numeric=5000
  and (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'client_received_total')::numeric=7000
  and (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'received_total')::numeric=7000
  and (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'balance')::numeric=-2000,
  'over-receipt preserves value 5000, received 7000, and negative balance -2000');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000003',true);
select ok(not (public.get_my_personal_compensation_values_v3(null)::text ilike '%personal_value": 0%')
  and public.get_my_personal_compensation_values_v3(null)->0->>'source'='unknown',
  'missing official visibility and fallback is unknown rather than zero');
reset role;

-- Third collaborator has no official allocation. Their private fallback is
-- actor-scoped and never reduces the owner's 3,500 personal contract value.
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000004',true);
select is(public.get_my_collaborative_compensation_v3('ef020000-0000-4000-8000-000000000001')->'official_terms','null'::jsonb,
  'Comp0 third collaborator receives no official terms when no allocation exists');
select is((public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'personal_value')::numeric,900::numeric,
  'third collaborator personal value is their private fallback 900');
select is((public.get_my_private_compensation_v3(current_setting('test.comp_rel_c')::uuid)->>'personal_value')::numeric,900::numeric,
  'third collaborator can read their own private archive');
select throws_ok($$select public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')$$,
  'P0001','UNAVAILABLE','third collaborator private archive is unavailable to its peers');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select is((select (item->>'personal_value')::numeric from jsonb_array_elements(public.get_my_personal_compensation_values_v3(null)) item
  where item->>'wedding_id'='ef020000-0000-4000-8000-000000000001'),5000::numeric,
  'owner value subtracts only A official 5000; C private fallback 900 is excluded');
select ok(public.get_owner_compensation_relationships_v3('ef020000-0000-4000-8000-000000000001')::text not ilike '%900%'
  and public.get_my_personal_compensation_values_v3(null)::text not ilike '%900%',
  'owner cannot infer third collaborator fallback through owner or Finance projections');
select throws_ok($$select public.get_my_private_compensation_v3(current_setting('test.comp_rel_c')::uuid)$$,
  'P0001','UNAVAILABLE','first collaborator cannot read third collaborator private fallback');
reset role;

-- Bidirectional privacy for two collaborators with distinct private facts.
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000003',true);
select is(public.mutate_my_private_compensation_settings_v3('ef030000-0000-4000-8000-000000000002','1',1200,'2027-10-02')->>'revision','2',
  'second collaborator creates a distinct private fallback and due date');
select is(public.create_my_private_compensation_receipt_v3('ef030000-0000-4000-8000-000000000002',400,'2027-07-04','B private receipt','2')->>'revision','3',
  'second collaborator creates a private receipt under their own revision');
select ok(public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000002')::text ilike '%1200%'
  and public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000002')::text ilike '%B private receipt%'
  and public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000002')::text not ilike '%private one%',
  'second collaborator sees only their own distinct private due date, fallback, and receipt');
select throws_ok($$select public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')$$,
  'P0001','UNAVAILABLE','second collaborator cannot read first collaborator private history');
select throws_ok($$select public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000003')$$,
  'P0001','UNAVAILABLE','collaborator cannot read another wedding relationship');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select ok(public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')::text ilike '%2000%'
  and public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')::text not ilike '%B private receipt%'
  and public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')::text not ilike '%1200%',
  'first collaborator sees only own private receipts and fallback');
select throws_ok($$select public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000002')$$,
  'P0001','UNAVAILABLE','first collaborator cannot read second collaborator private history');
select throws_ok($$select public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000004')$$,
  'P0001','UNAVAILABLE','first collaborator cannot read a relationship from another wedding');
reset role;

-- Unknown, explicit zero, and visible official zero remain distinct DTO states.
update collaboration_private.membership_area_access set compensation=0
where membership_id=(select id from public.wedding_collaboration_memberships where wedding_id_snapshot='ef020000-0000-4000-8000-000000000001'
  and member_user_id='ef010000-0000-4000-8000-000000000002' and status='active');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select is(public.mutate_my_private_compensation_settings_v3('ef030000-0000-4000-8000-000000000001','3',null,null)->>'revision','4',
  'removing an existing fallback produces an unknown state for Comp0');
select is(public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'source','unknown',
  'Comp0 with no fallback is unknown despite existing hidden official terms');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select is(public.mutate_my_private_compensation_settings_v3('ef030000-0000-4000-8000-000000000001','4',0,null)->>'revision','5',
  'explicit-zero fallback is stored as a known revisioned value');
select ok((public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'value_known')::boolean
  and (public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'personal_value')::numeric=0
  and public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'source'='private_fallback',
  'Comp0 explicit fallback zero is known zero, not unknown');
select is(public.mutate_my_private_compensation_settings_v3('ef030000-0000-4000-8000-000000000001','5',null,null)->>'revision','6',
  'removing fallback returns the private source to unknown');
select ok(not (public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'value_known')::boolean
  and public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'personal_value' is null
  and public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'source'='unknown',
  'no visible official allocation and no fallback remains null unknown');
reset role;
update collaboration_private.membership_area_access set compensation=1
where membership_id=(select id from public.wedding_collaboration_memberships where wedding_id_snapshot='ef020000-0000-4000-8000-000000000001'
  and member_user_id='ef010000-0000-4000-8000-000000000002' and status='active');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select is(public.mutate_owner_compensation_terms_v3('ef030000-0000-4000-8000-000000000001','3',0,'2027-07-03',true)->>'terms_revision','4',
  'owner records an explicit active official zero');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select ok(public.get_my_collaborative_compensation_v3('ef020000-0000-4000-8000-000000000001')->'official_terms'->>'amount'='0.00'
  and (public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'value_known')::boolean
  and (public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'personal_value')::numeric=0
  and public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'source'='official_compensation',
  'Comp1 visible active official zero is known zero, distinct from no allocation');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select is(public.mutate_owner_compensation_terms_v3('ef030000-0000-4000-8000-000000000001','4',0,'2027-07-03',false)->>'terms_revision','5',
  'owner withdraws active official allocation with a new durable terms revision');
reset role;
select ok((select count(*)>=5 from collaboration_private.compensation_terms_history where relationship_id='ef030000-0000-4000-8000-000000000001')
  and not (select active from collaboration_private.compensation_terms where relationship_id='ef030000-0000-4000-8000-000000000001'),
  'withdrawal keeps immutable official terms history and marks current allocation inactive');
select is((select (item->>'personal_value')::numeric from jsonb_array_elements(public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])) item
  where item->>'wedding_id'='ef020000-0000-4000-8000-000000000001'),10000::numeric,
  'owner net stops subtracting all withdrawn official allocations');
reset role;
select ok((select count(*)>=4 from collaboration_private.compensation_recipient_terms_history
  where relationship_id='ef030000-0000-4000-8000-000000000001' and recipient_user_id='ef010000-0000-4000-8000-000000000002'
    and terms_revision::text in ('1','2','3','4')),
  'recipient-visible official term history retains each previously visible revision through withdrawal');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select is(public.get_my_collaborative_compensation_v3('ef020000-0000-4000-8000-000000000001')->'official_terms','null'::jsonb,
  'recipient projection stops treating withdrawn terms as active official allocation');
select ok(public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'terms_revision' is null,
  'active recipient private projection does not misrepresent withdrawn terms as current official value');
reset role;

-- Canonical owner revoke preserves recipient compensation history but removes
-- membership authority; only a later accepted invitation restores access.
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select is(public.revoke_wedding_collaboration_membership(current_setting('test.membership_a')::uuid,'ef060000-0000-4000-8000-000000000011')->>'status','revoked',
  'owner revokes only the first temporary synthetic membership through the canonical lifecycle RPC');
reset role;
select is((select status from public.wedding_collaboration_memberships where id=current_setting('test.membership_a')::uuid),'revoked',
  'owner revoke removes operational membership authority');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select ok((public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'active_membership')::boolean=false
  and (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'client_received_total')::numeric=7000
  and (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->'client_receipts')::text ilike '%3000%'
  and (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->'client_receipts')::text ilike '%4000%',
  'revoked recipient retains readable historical client receipt attribution while operational membership is inactive');
reset role;
select ok((select count(*)>0 from collaboration_private.compensation_private_settings_history
  where relationship_id='ef030000-0000-4000-8000-000000000001' and recipient_user_id='ef010000-0000-4000-8000-000000000002'),
  'revocation preserves recipient fallback history');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select throws_ok($$update public.payments set receiver_relationship_id='ef030000-0000-4000-8000-000000000001',received_by_user_id='ef010000-0000-4000-8000-000000000002' where id='ef070000-0000-4000-8000-000000000002'$$,
  'P0001','VALIDATION_ERROR','revoked relationship cannot be selected as a new paid receiver');
select set_config('test.invite_rejoin',public.create_wedding_collaboration_invitation_v3(
  'ef020000-0000-4000-8000-000000000001','ef040000-0000-4000-8000-000000000001',null,
  'ef050000-0000-4000-8000-000000000011','system:photographer',null,'custom',
  '{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":1}'::jsonb)->>'invitation_id',true);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select set_config('test.membership_a',public.accept_wedding_collaboration_invite(current_setting('test.invite_rejoin')::uuid,'ef060000-0000-4000-8000-000000000012')->>'membership_id',true);
select is(public.get_my_collaborative_compensation_v3('ef020000-0000-4000-8000-000000000001')->>'relationship_id','ef030000-0000-4000-8000-000000000001',
  'rejoin reuses the stable recipient/wedding compensation relationship identity');
reset role;
select ok((select count(*)=1 from collaboration_private.compensation_relationships
  where wedding_id_snapshot='ef020000-0000-4000-8000-000000000001' and owner_user_id='ef010000-0000-4000-8000-000000000001'
    and recipient_user_id='ef010000-0000-4000-8000-000000000002')
  and (select count(*)=1 from public.wedding_collaboration_memberships where wedding_id_snapshot='ef020000-0000-4000-8000-000000000001'
    and member_user_id='ef010000-0000-4000-8000-000000000002' and status='active')
  and (select a.compensation=1 from collaboration_private.membership_area_access a where a.membership_id=current_setting('test.membership_a')::uuid),
  'rejoin reuses one stable compensation relationship and the new membership controls Comp1 access');

-- Collaborator leave is a separate lifecycle path and also preserves private
-- fallback/receipt archive without exposing it to owner or peers.
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000003',true);
select is(public.leave_wedding_collaboration(current_setting('test.membership_b')::uuid,'ef060000-0000-4000-8000-000000000013')->>'status','left',
  'collaborator leaves the synthetic wedding through the canonical lifecycle RPC');
select ok((public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000002')->>'active_membership')::boolean=false
  and (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000002')->>'fallback_amount')::numeric=1200
  and (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000002')->'private_receipts')::text ilike '%400%',
  'left collaborator retains their own fallback and receipt history archive');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000002')$$,
  'P0001','UNAVAILABLE','owner cannot read private archive after collaborator leaves');
reset role;

-- Hard-delete one synthetic wedding after a paid receipt and private history
-- exist; financial snapshots survive without restoring wedding access.
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select set_config('test.invite_archive',public.create_wedding_collaboration_invitation_v3(
  'ef020000-0000-4000-8000-000000000002','ef040000-0000-4000-8000-000000000001',null,
  'ef050000-0000-4000-8000-000000000021','system:photographer',null,'custom',
  '{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":1}'::jsonb)->>'invitation_id',true);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select public.accept_wedding_collaboration_invite(current_setting('test.invite_archive')::uuid,'ef060000-0000-4000-8000-000000000022');
select is(public.mutate_my_private_compensation_settings_v3('ef030000-0000-4000-8000-000000000003','1',900,'2027-11-01')->>'revision','2',
  'archive recipient has private fallback before wedding deletion');
select is(public.create_my_private_compensation_receipt_v3('ef030000-0000-4000-8000-000000000003',150,'2027-07-05','archive private receipt','2')->>'revision','3',
  'archive recipient has a private manual receipt before wedding deletion');
reset role;
insert into public.payments(id,wedding_id,type,amount,payment_date,received_by_user_id,receiver_relationship_id)
values ('ef070000-0000-4000-8000-000000000004','ef020000-0000-4000-8000-000000000002','installment',600,'2027-07-06',
  'ef010000-0000-4000-8000-000000000002','ef030000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
delete from public.weddings where id='ef020000-0000-4000-8000-000000000002';
reset role;
select ok(not exists(select 1 from public.weddings where id='ef020000-0000-4000-8000-000000000002')
  and exists(select 1 from collaboration_private.compensation_relationships where id='ef030000-0000-4000-8000-000000000003'
    and wedding_id is null and wedding_id_snapshot='ef020000-0000-4000-8000-000000000002')
  and exists(select 1 from collaboration_private.compensation_client_receipt_archive where relationship_id='ef030000-0000-4000-8000-000000000003'
    and amount=600 and source_payment_id='ef070000-0000-4000-8000-000000000004'),
  'wedding hard-delete removes operational wedding and archives collaborator client receipt by snapshot identity');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select ok((public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000003')->>'client_received_total')::numeric=600
  and (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000003')->>'private_received_total')::numeric=150
  and (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000003')->'client_receipts')::text ilike '%600%'
  and not (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000003') ? 'contract_value')
  and not (public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000003')::text ilike '%10000%'),
  'post-delete recipient archive retains only attributed payment and private history, not client contract value');
select ok(not exists(select 1 from public.weddings where id='ef020000-0000-4000-8000-000000000002'),
  'archived recipient finance does not restore operational wedding access');
reset role;

-- Account erasure follows current FK/trigger anonymization: private identity
-- rows are erased, labels redacted, and stale IDs cannot read archived data.
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000004',true);
select is(public.create_my_private_compensation_receipt_v3(current_setting('test.comp_rel_c')::uuid,100,'2027-07-07','erase-me','2')->>'revision','3',
  'third collaborator has private receipt immediately before account erasure');
reset role;
delete from auth.users where id='ef010000-0000-4000-8000-000000000004';
select ok(not exists(select 1 from public.users where id='ef010000-0000-4000-8000-000000000004')
  and not exists(select 1 from collaboration_private.compensation_private_receipts where recipient_user_id='ef010000-0000-4000-8000-000000000004')
  and not exists(select 1 from collaboration_private.compensation_private_settings_history where recipient_user_id='ef010000-0000-4000-8000-000000000004')
  and exists(select 1 from collaboration_private.compensation_relationships where id=current_setting('test.comp_rel_c')::uuid
    and recipient_user_id is null and recipient_label_snapshot='Współpracownik'),
  'account erasure clears recipient-private data and redacts stable relationship identity');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000004',true);
select throws_ok(format('select public.get_my_private_compensation_v3(%L)',current_setting('test.comp_rel_c')),
  'P0001','UNAVAILABLE','erased recipient UUID cannot reopen private compensation archive');
reset role;

-- Unpaid rows remain under the same payment CAS contract. The original paid
-- collaborator receipt is removed from current settlement when marked unpaid;
-- stale revisions cannot restore or overwrite it.
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
select set_config('test.owner_personal_value_before_payment_cas',
  (public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'personal_value'),true);
with changed as (
  update public.payments set payment_date=null
  where id='ef070000-0000-4000-8000-000000000001' and compensation_revision=1 returning id
) select is((select count(*) from changed),1::bigint,
  'paid-to-unpaid update succeeds with the current payment revision');
select is((select compensation_revision from public.payments where id='ef070000-0000-4000-8000-000000000001'),2::bigint,
  'paid-to-unpaid increments payment revision exactly once');
select ok((select payment_date is null and received_by_user_id is null and receiver_kind is null
  and receiver_relationship_id is null and receiver_label_snapshot is null
  from public.payments where id='ef070000-0000-4000-8000-000000000001'),
  'paid-to-unpaid clears all physical receiver attribution');
select is((select sum(amount)::numeric from public.payments
  where wedding_id='ef020000-0000-4000-8000-000000000001' and payment_date is not null),6000::numeric,
  'paid-to-unpaid reduces the client paid ledger by 3000');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000002',true);
select is((public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'client_received_total')::numeric,4000::numeric,
  'paid-to-unpaid removes the payment from collaborator A current receipts');
select is((public.get_my_private_compensation_v3('ef030000-0000-4000-8000-000000000001')->>'private_received_total')::numeric,0::numeric,
  'paid-to-unpaid does not fabricate a recipient-private receipt');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef010000-0000-4000-8000-000000000001',true);
with changed as (
  update public.payments set amount=3500
  where id='ef070000-0000-4000-8000-000000000001' and compensation_revision=1 returning id
) select is((select count(*) from changed),0::bigint,
  'stale revision from before paid-to-unpaid conflicts and cannot overwrite payment state');
with changed as (
  update public.payments set amount=4000
  where id='ef070000-0000-4000-8000-000000000001' and compensation_revision=2 returning id
) select is((select count(*) from changed),1::bigint,
  'unpaid amount edit succeeds with the current revision');
select is((select compensation_revision from public.payments where id='ef070000-0000-4000-8000-000000000001'),3::bigint,
  'unpaid amount edit increments payment revision exactly once');
select ok((select amount=4000 and payment_date is null and received_by_user_id is null
  and receiver_kind is null and receiver_relationship_id is null
  from public.payments where id='ef070000-0000-4000-8000-000000000001'),
  'unpaid amount edit retains unpaid state and null receiver');
with changed as (
  update public.payments set note='stale unpaid note'
  where id='ef070000-0000-4000-8000-000000000001' and compensation_revision=2 returning id
) select is((select count(*) from changed),0::bigint,
  'stale revision after an unpaid amount edit conflicts');
select is((select sum(amount)::numeric from public.payments
  where wedding_id='ef020000-0000-4000-8000-000000000001' and payment_date is not null),6000::numeric,
  'unpaid amount edit leaves the client paid ledger unchanged');
select is((public.get_my_personal_compensation_values_v3(array['ef020000-0000-4000-8000-000000000001']::uuid[])->0->>'personal_value'),
  current_setting('test.owner_personal_value_before_payment_cas'),
  'payment state and amount edits do not change owner personal value');
with changed as (
  update public.payments set payment_date='2027-07-08',received_by_user_id='ef010000-0000-4000-8000-000000000001',receiver_relationship_id=null
  where id='ef070000-0000-4000-8000-000000000001' and compensation_revision=3 returning id
) select is((select count(*) from changed),1::bigint,
  'unpaid-to-paid mutation accepts a valid owner receiver');
select is((select compensation_revision from public.payments where id='ef070000-0000-4000-8000-000000000001'),4::bigint,
  'unpaid-to-paid increments payment revision exactly once');
select is((select sum(amount)::numeric from public.payments
  where wedding_id='ef020000-0000-4000-8000-000000000001' and payment_date is not null),10000::numeric,
  'unpaid-to-paid restores the payment amount to the client paid ledger');
select is((select contract_value from public.weddings where id='ef020000-0000-4000-8000-000000000001'),10000::numeric,
  'payment CAS transitions do not mutate the client contract value');
with changed as (
  update public.payments set amount=amount,note=note
  where id='ef070000-0000-4000-8000-000000000001' and compensation_revision=4 returning id
) select is((select count(*) from changed),1::bigint,
  'no-op protected update retains ordinary update semantics');
select is((select compensation_revision from public.payments where id='ef070000-0000-4000-8000-000000000001'),4::bigint,
  'no-op protected update does not churn payment revision');
reset role;

select * from finish();
rollback;
