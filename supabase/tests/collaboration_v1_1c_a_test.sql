begin;
select plan(146 + 28 + 20);

select has_table('public','wedding_collaboration_invitations','wedding invitations exist');
select has_table('public','wedding_collaboration_memberships','membership periods exist');
select has_table('public','wedding_collaboration_events','wedding-level audit exists');
select has_column('public','weddings','collaboration_terms_version','weddings has monotonic terms version');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.wedding_collaboration_invitations'::regclass),'invites force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.wedding_collaboration_memberships'::regclass),'memberships force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.wedding_collaboration_events'::regclass),'events force RLS');
select ok(not has_table_privilege('authenticated','public.wedding_collaboration_invitations','SELECT'),'clients cannot directly read invite snapshots');
select ok(not has_table_privilege('authenticated','public.wedding_collaboration_invitations','INSERT'),'clients cannot directly insert invites');
select ok(not has_table_privilege('authenticated','public.wedding_collaboration_memberships','UPDATE'),'clients cannot mutate memberships');
select ok(not has_table_privilege('authenticated','public.wedding_collaboration_events','INSERT'),'clients cannot forge audit events');
select ok(not has_function_privilege('anon','public.create_wedding_collaboration_invite(uuid,uuid,numeric,uuid)','EXECUTE'),'anon cannot create wedding invitations');
select ok(has_function_privilege('authenticated','public.create_wedding_collaboration_invite_from_connection(uuid,uuid,numeric,uuid)','EXECUTE'),
  'authenticated can create an invitation from a selected connection');
select ok(not exists(select 1 from pg_catalog.pg_proc p
  cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  where p.oid='public.create_wedding_collaboration_invite_from_connection(uuid,uuid,numeric,uuid)'::regprocedure
    and a.grantee=0 and a.privilege_type='EXECUTE'),
  'PUBLIC cannot execute the connection-based invitation RPC');
select ok(not has_function_privilege('anon','public.create_wedding_collaboration_invite_from_connection(uuid,uuid,numeric,uuid)','EXECUTE'),
  'anon cannot execute the connection-based invitation RPC');
select ok((select prosecdef from pg_catalog.pg_proc where oid='public.create_wedding_collaboration_invite_from_connection(uuid,uuid,numeric,uuid)'::regprocedure),
  'connection-based invitation RPC is SECURITY DEFINER');
select ok((select coalesce(proconfig @> array['search_path=""'],false) from pg_catalog.pg_proc
  where oid='public.create_wedding_collaboration_invite_from_connection(uuid,uuid,numeric,uuid)'::regprocedure),
  'connection-based invitation RPC pins an empty search_path');
select ok(has_function_privilege('authenticated','public.accept_wedding_collaboration_invite(uuid,uuid)','EXECUTE'),'authenticated can accept through RPC');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('create_wedding_collaboration_invite','accept_wedding_collaboration_invite',
  'decline_wedding_collaboration_invite','cancel_wedding_collaboration_invite','revoke_wedding_collaboration_membership',
  'leave_wedding_collaboration','end_collaboration','decline_collaboration_invite','cancel_collaboration_invite',
  'create_wedding_collaboration_invite_from_connection')
  and not coalesce(p.proconfig @> array['search_path=""'],false)),
  'all lifecycle RPCs use an empty search_path');
select ok((select pg_catalog.pg_get_functiondef(p.oid) ilike '%wedding_collaboration_lock_users(array[v_actor])%'
  from pg_catalog.pg_proc p where p.oid='public.decline_collaboration_invite(uuid,uuid)'::regprocedure),
  'global 1B decline locks its actor before the invitation');
select ok((select pg_catalog.pg_get_functiondef(p.oid) ilike '%wedding_collaboration_lock_users(array[v_actor])%'
  from pg_catalog.pg_proc p where p.oid='public.cancel_collaboration_invite(uuid,uuid)'::regprocedure),
  'global 1B cancel locks its actor before the invitation');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000001','authenticated','authenticated','one@example.test','x',now(),'{"provider":"email","providers":["email"]}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000002','authenticated','authenticated','two@example.test','x',now(),'{"provider":"email","providers":["email"]}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000003','authenticated','authenticated','three@example.test','x',now(),'{"provider":"email","providers":["email"]}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000004','authenticated','authenticated','four@example.test','x',now(),'{"provider":"email","providers":["email"]}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000005','authenticated','authenticated','five@example.test','x',now(),'{"provider":"email","providers":["email"]}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000006','authenticated','authenticated','six@example.test','x',now(),'{"provider":"email","providers":["email"]}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000007','authenticated','authenticated','seven@example.test','x',now(),'{"provider":"email","providers":["email"]}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000008','authenticated','authenticated','eight@example.test','x',now(),'{"provider":"email","providers":["email"]}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000009','authenticated','authenticated','nine@example.test','x',now(),'{"provider":"email","providers":["email"]}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());
insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,package_name,contract_value,currency)
 values('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Ala','Olek','2027-06-01','Classic',1000,'PLN'),
 ('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','Iga','Jan','2027-06-02','Plus',900,'EUR'),
 ('21000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000005','Maja','Tomek','2027-06-03','Classic',800,'PLN'),
 ('21000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000009','Ewa','Marek','2027-06-04','Plus',700,'EUR');
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status)
 values('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','One','Two','active'),
 ('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000003','One','Three','active'),
 ('31000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000004','One','Four','active'),
 ('31000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000005','Four','Five','active'),
 ('31000000-0000-4000-8000-000000000006','11000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000006','Five','Six','active'),
 ('31000000-0000-4000-8000-000000000007','11000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000007','Five','Seven','active'),
 ('31000000-0000-4000-8000-000000000008','11000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000008','Five','Eight','active'),
 ('31000000-0000-4000-8000-000000000009','11000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000009','Five','Nine','active');
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status,ended_at)
 values('31000000-0000-4000-8000-000000000010','11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002','One','Two','ended',now());
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status)
 values('31000000-0000-4000-8000-000000000011','11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000005','One','Five','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.weddings where id='21000000-0000-4000-8000-000000000001'),0,
  'active global connection alone grants zero wedding access');
reset role;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
create temporary table test_connection_invite_result(response jsonb) on commit drop;
insert into test_connection_invite_result
select public.create_wedding_collaboration_invite_from_connection('21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',1500,'41000000-0000-4000-8000-000000000001');
select is((select response->>'status' from test_connection_invite_result),'created',
  'owner creates invite from a selected connection and over-CV proposal is allowed');
select is((select invitee_user_id from public.wedding_collaboration_invitations where id=(select (response->>'invitation_id')::uuid from test_connection_invite_result)),
  '11000000-0000-4000-8000-000000000002'::uuid,'server resolves the connection peer as invitee');
select is((select source_connection_id from public.wedding_collaboration_invitations where id=(select (response->>'invitation_id')::uuid from test_connection_invite_result)),
  '31000000-0000-4000-8000-000000000001'::uuid,'invitation records the exact selected source connection');
select ok(position('11000000-0000-4000-8000-000000000002' in (select response::text from test_connection_invite_result))=0,
  'connection RPC response never exposes the peer Auth UUID');
select is(public.create_wedding_collaboration_invite_from_connection('21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',1500,'41000000-0000-4000-8000-000000000001')->>'duplicate','true',
  'same connection request and idempotency key replays successfully');
select throws_ok($$select public.create_wedding_collaboration_invite_from_connection('21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000002',1500,'41000000-0000-4000-8000-000000000001')$$,
  'P0001','idempotency_conflict','same idempotency key with another connection peer conflicts');
select throws_ok($$select public.create_wedding_collaboration_invite_from_connection('21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',1501,'41000000-0000-4000-8000-000000000001')$$,
  'P0001','idempotency_conflict','same connection key with a different amount conflicts');
select throws_ok($$select public.create_wedding_collaboration_invite_from_connection('21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000005',1500,'41000000-0000-4000-8000-000000000031')$$,
  'P0001','active_connection_required','actor cannot invite through another pair connection');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.create_wedding_collaboration_invite_from_connection('21000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000099',1500,'41000000-0000-4000-8000-000000000032')$$,
  'P0001','active_connection_required','random connection UUID receives the uniform safe rejection');
select throws_ok($$select public.create_wedding_collaboration_invite_from_connection('21000000-0000-4000-8000-000000000001',
  null,1500,'41000000-0000-4000-8000-000000000036')$$,
  'P0001','active_connection_required','missing connection UUID receives the uniform safe rejection');
select throws_ok($$select public.create_wedding_collaboration_invite_from_connection('21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000010',1500,'41000000-0000-4000-8000-000000000033')$$,
  'P0001','active_connection_required','inactive connection receives the uniform safe rejection');
select is((select count(*)::int from public.wedding_collaboration_invitations where idempotency_key in (
  '41000000-0000-4000-8000-000000000031','41000000-0000-4000-8000-000000000032',
  '41000000-0000-4000-8000-000000000033','41000000-0000-4000-8000-000000000036')),0,
  'invalid connection requests create no invitation');
select ok(exists(select 1 from pg_catalog.pg_constraint
    where conrelid='public.collaboration_connections'::regclass
      and conname='collaboration_connections_canonical_pair'
      and pg_catalog.pg_get_constraintdef(oid) like '%participant_low_id < participant_high_id%')
  and pg_catalog.pg_get_functiondef('public.create_wedding_collaboration_invite_from_connection(uuid,uuid,numeric,uuid)'::regprocedure)
    like '%v_peer = v_actor%',
  'schema and resolver both reject malformed self relationships');
select is(public.create_wedding_collaboration_invite_from_connection('21000000-0000-4000-8000-000000000002',
  '31000000-0000-4000-8000-000000000011',1,'41000000-0000-4000-8000-000000000034')->>'status','created',
  'second connection fixture creates an invitation for replay-after-end coverage');
select is(public.end_collaboration('31000000-0000-4000-8000-000000000011',
  '41000000-0000-4000-8000-000000000035')->>'status','ended',
  'ending the source connection preserves normal 1B lifecycle behavior');
select is(public.create_wedding_collaboration_invite_from_connection('21000000-0000-4000-8000-000000000002',
  '31000000-0000-4000-8000-000000000011',1,'41000000-0000-4000-8000-000000000034')->>'duplicate','true',
  'same successful request replays after its source connection ends');
select set_config('test.first_invite_id',(select id::text from public.wedding_collaboration_invitations
  where idempotency_key='41000000-0000-4000-8000-000000000001'),true);
select ok(has_function_privilege('authenticated','public.get_wedding_collaboration_invitation_preview(uuid)','EXECUTE'),
  'authenticated can call the invitee preview RPC');
select ok(not has_function_privilege('anon','public.get_wedding_collaboration_invitation_preview(uuid)','EXECUTE'),
  'anon cannot call the invitee preview RPC');
select ok(has_function_privilege('authenticated','public.get_wedding_collaboration_state(uuid)','EXECUTE'),
  'authenticated can call the owner state RPC');
select ok(has_function_privilege('authenticated','public.list_my_wedding_collaboration_invitations()','EXECUTE'),
  'authenticated can call the incoming invitation RPC');
select ok(not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('get_wedding_collaboration_invitation_preview',
    'get_wedding_collaboration_state','list_my_wedding_collaboration_invitations')
    and not coalesce(p.proconfig @> array['search_path=""'],false)),
  'all new SECURITY DEFINER read RPCs use an empty search_path');
select ok(not has_table_privilege('authenticated','public.wedding_collaboration_invitations','SELECT'),
  'new read RPCs do not grant direct invitation-table SELECT');
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select is(public.get_wedding_collaboration_invitation_preview(current_setting('test.first_invite_id')::uuid)->>'status','pending',
  'invitee can preview their own pending invitation');
select is((select array_agg(k order by k)::text from pg_catalog.jsonb_object_keys(
  public.get_wedding_collaboration_invitation_preview(current_setting('test.first_invite_id')::uuid)) as keys(k)),
  '{accepted_at,cancelled_at,contract_value,couple_first_name,couple_second_name,created_at,currency,declined_at,expired_at,expires_at,invitation_id,inviter_display_name,membership_status,package_label,proposed_share_amount,reason,status,superseded_at,wedding_date}',
  'preview returns exactly the allow-listed snapshot and lifecycle fields');
select is(public.get_wedding_collaboration_invitation_preview(current_setting('test.first_invite_id')::uuid)->>'inviter_display_name','one',
  'preview identifies the inviter without exposing account email');
reset role;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select is(public.get_wedding_collaboration_invitation_preview(current_setting('test.first_invite_id')::uuid),null,
  'owner cannot use invitee preview to read the invitation');
select is(jsonb_array_length(public.get_wedding_collaboration_state('21000000-0000-4000-8000-000000000001')->'invitations'),1,
  'owner state returns only invitations for the owned wedding');
select is(public.get_wedding_collaboration_state('21000000-0000-4000-8000-000000000003'),null,
  'owner state does not enumerate another owner wedding');
select ok(not exists(select 1 from pg_catalog.pg_proc p where p.oid='public.get_wedding_collaboration_invitation_preview(uuid)'::regprocedure
  and p.pronargs<>1),'preview accepts only an invitation ID and no caller-supplied wedding ID');
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select is(public.get_wedding_collaboration_invitation_preview(current_setting('test.first_invite_id')::uuid),null,
  'third authenticated user cannot preview another users invitation');
select is(public.get_wedding_collaboration_invitation_preview('51000000-0000-4000-8000-000000000099'),null,
  'random invitation ID returns no private data');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select is(jsonb_array_length(public.list_my_wedding_collaboration_invitations()),1,
  'incoming RPC returns only the authenticated invitees invitation');
select ok(not exists(select 1 from jsonb_array_elements(public.list_my_wedding_collaboration_invitations()) as rows(item)
  where item ? 'wedding_id' or item ? 'terms_snapshot' or item ? 'extras_snapshot'),
  'incoming list does not expose wedding IDs or unrestricted commercial snapshots');
reset role;
select is((select count(*)::int from public.notifications where user_id='11000000-0000-4000-8000-000000000002'
  and entity_type='wedding_collaboration' and entity_id=(select id from public.wedding_collaboration_invitations
    where idempotency_key='41000000-0000-4000-8000-000000000001')),
  1,'invitation creation produces one in-app notification for the invitee');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.weddings where id='21000000-0000-4000-8000-000000000001'),0,
  'pending invitation grants zero wedding access');
select is((select count(*)::int from public.payments where wedding_id='21000000-0000-4000-8000-000000000001'),0,
  'pending invitation grants zero child-data access');
reset role;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select is((select proposed_share_amount from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000002'),1500::numeric,'proposal snapshot is exact');
select is((select currency_snapshot from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000002'),'PLN','proposal snapshots wedding currency');
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000003',null,'41000000-0000-4000-8000-000000000002')->>'status','created','null share is allowed');
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000004',0,'41000000-0000-4000-8000-000000000003')->>'status','created','zero share is allowed');
select throws_ok($$select public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000003',-1,'41000000-0000-4000-8000-000000000004')$$,
  '22003','invalid_share_amount','negative proposal is rejected');
select throws_ok($$select public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000004',1,'41000000-0000-4000-8000-000000000005')$$,
  'P0001','pending_invitation_exists','only one pending invite per wedding and invitee');
select throws_ok($$select public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002',1,'41000000-0000-4000-8000-000000000006')$$,
  'P0001','pending_invitation_exists','duplicate pending invite is rejected');
select throws_ok($$select public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000005',1,'41000000-0000-4000-8000-000000000007')$$,
  'P0001','active_connection_required','unconnected account cannot receive invite');
select throws_ok($$select public.accept_wedding_collaboration_invite(
  (select id from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000002'),
  '41000000-0000-4000-8000-000000000008')$$,
  'P0001','invitation_unavailable','owner cannot accept on behalf of invitee');
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000003',null,'41000000-0000-4000-8000-000000000009')->>'status','created',
  'owner may create a separate invitation for another connected account');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.accept_wedding_collaboration_invite(
  (select id from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000002'),
  '41000000-0000-4000-8000-000000000010')$$,
  'P0001','invitation_unavailable','third party cannot accept another invitee invitation');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.decline_wedding_collaboration_invite(
  (select id from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000003' and wedding_id='21000000-0000-4000-8000-000000000001'),
  '41000000-0000-4000-8000-000000000011')$$,
  'P0001','invitation_unavailable','owner cannot decline on behalf of invitee');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select is(public.decline_wedding_collaboration_invite(
  (select id from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000003' and wedding_id='21000000-0000-4000-8000-000000000001'),
  '41000000-0000-4000-8000-000000000012')->>'status','declined','invitee may decline their own invitation');
select is(public.get_wedding_collaboration_invitation_preview((select id from public.wedding_collaboration_invitations
  where invitee_user_id='11000000-0000-4000-8000-000000000003' and wedding_id='21000000-0000-4000-8000-000000000001'))->>'status','declined',
  'declined preview remains available to its invitee without actions');
select is(public.decline_wedding_collaboration_invite(
  (select id from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000003' and wedding_id='21000000-0000-4000-8000-000000000001'),
  '41000000-0000-4000-8000-000000000012')->>'duplicate','true','decline replay is idempotent');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.cancel_wedding_collaboration_invite(
  (select id from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000004' and wedding_id='21000000-0000-4000-8000-000000000002'),
  '41000000-0000-4000-8000-000000000013')$$,
  'P0001','invitation_unavailable','third party cannot cancel as owner');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.cancel_wedding_collaboration_invite(
  (select id from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000004' and wedding_id='21000000-0000-4000-8000-000000000002'),
  '41000000-0000-4000-8000-000000000014')$$,
  'P0001','invitation_unavailable','invitee cannot cancel as owner');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select is(public.cancel_wedding_collaboration_invite(
  (select id from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000004' and wedding_id='21000000-0000-4000-8000-000000000002'),
  '41000000-0000-4000-8000-000000000015')->>'status','cancelled','current owner may cancel a pending invite');
select is(public.cancel_wedding_collaboration_invite(
  (select id from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000004' and wedding_id='21000000-0000-4000-8000-000000000002'),
  '41000000-0000-4000-8000-000000000015')->>'duplicate','true','cancel replay is idempotent');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000004',true);
select is(public.get_wedding_collaboration_invitation_preview((select id from public.wedding_collaboration_invitations
  where invitee_user_id='11000000-0000-4000-8000-000000000004' and wedding_id='21000000-0000-4000-8000-000000000002'))->>'status','cancelled',
  'cancelled preview remains available to its invitee without actions');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select is(public.accept_wedding_collaboration_invite((select id from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000002'),'42000000-0000-4000-8000-000000000001')->>'status','accepted','invitee accepts their own invite');
select is(public.get_wedding_collaboration_invitation_preview((select id from public.wedding_collaboration_invitations
  where invitee_user_id='11000000-0000-4000-8000-000000000002' and status='accepted'))->>'status','accepted',
  'accepted invitee can still read terminal invitation status');
select is(public.get_wedding_collaboration_invitation_preview((select id from public.wedding_collaboration_invitations
  where invitee_user_id='11000000-0000-4000-8000-000000000002' and status='accepted'))->>'membership_status','active',
  'accepted preview reflects the invitees active membership period');
select is((select status from public.wedding_collaboration_memberships where member_user_id='11000000-0000-4000-8000-000000000002'),'active','acceptance creates active membership');
select is((select status from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000002'),'accepted','invitation and membership lifecycle remain distinct');
select throws_ok($$update public.wedding_collaboration_invitations set accepted_at=null where id=(select accepted_invitation_id from public.wedding_collaboration_memberships where member_user_id='11000000-0000-4000-8000-000000000002')$$,
  '23514','new row for relation "wedding_collaboration_invitations" violates check constraint "wedding_collaboration_invites_terminal_timestamp"','accepted invitation cannot lose its acceptance timestamp');
select throws_ok($$insert into public.wedding_collaboration_memberships(wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,accepted_invitation_id,status,accepted_at) values('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000004',(select id from public.wedding_collaboration_invitations where idempotency_key='41000000-0000-4000-8000-000000000009'),'active',now())$$,
  '23514','membership_requires_matching_accepted_invitation','membership cannot link to a pending invitation');
select throws_ok($$select public.cancel_wedding_collaboration_invite((select id from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000002'),'42000000-0000-4000-8000-000000000002')$$,
  'P0001','invitation_unavailable','invitee cannot cancel as owner');

set local role authenticated;
select is((select count(*)::int from public.weddings where id='21000000-0000-4000-8000-000000000001'),0,'accepted membership still has zero wedding SELECT access');
select lives_ok($test$do $body$ declare v_rows integer; begin
  update public.weddings set venue='unauthorized' where id='21000000-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;
  if v_rows<>0 then raise exception 'member unexpectedly updated wedding'; end if;
end $body$;$test$,'accepted member cannot UPDATE wedding');
select lives_ok($test$do $body$ declare v_rows integer; begin
  delete from public.weddings where id='21000000-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;
  if v_rows<>0 then raise exception 'member unexpectedly deleted wedding'; end if;
end $body$;$test$,'accepted member cannot DELETE wedding');
select is((select count(*)::int from public.payments where wedding_id='21000000-0000-4000-8000-000000000001'),0,'accepted member sees zero child data');
reset role;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select is(public.end_collaboration('31000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001')->>'status','ended','existing global end RPC still ends connection');
select is((select status from public.wedding_collaboration_memberships where member_user_id='11000000-0000-4000-8000-000000000002'),'active','accepted membership survives global connection end');
select is((select status from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000002'),'accepted','accepted invitation remains immutable after global end');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.revoke_wedding_collaboration_membership(
  (select id from public.wedding_collaboration_memberships where member_user_id='11000000-0000-4000-8000-000000000002' and status='active'),
  '43000000-0000-4000-8000-000000000003')$$,
  'P0001','membership_unavailable','member cannot revoke their own membership');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.leave_wedding_collaboration(
  (select id from public.wedding_collaboration_memberships where member_user_id='11000000-0000-4000-8000-000000000002' and status='active'),
  '43000000-0000-4000-8000-000000000004')$$,
  'P0001','membership_unavailable','owner cannot leave on behalf of member');
select is(public.revoke_wedding_collaboration_membership(
  (select id from public.wedding_collaboration_memberships where member_user_id='11000000-0000-4000-8000-000000000002' and status='active'),
  '43000000-0000-4000-8000-000000000005')->>'status','revoked','owner can revoke active membership');
select is((select status from public.wedding_collaboration_memberships where member_user_id='11000000-0000-4000-8000-000000000002' and status='revoked'),'revoked','revocation preserves a historical membership period');
select set_config('test.revoked_invitation_id',(select accepted_invitation_id::text from public.wedding_collaboration_memberships
  where member_user_id='11000000-0000-4000-8000-000000000002' and status='revoked'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select is(public.get_wedding_collaboration_invitation_preview(current_setting('test.revoked_invitation_id')::uuid)->>'membership_status','revoked',
  'accepted invitation history does not imply an active membership after revocation');
reset role;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select is((select (public.accept_wedding_collaboration_invite(accepted_invitation_id,'42000000-0000-4000-8000-000000000001')->>'status')
  || ':' || (public.accept_wedding_collaboration_invite(accepted_invitation_id,'42000000-0000-4000-8000-000000000001')->>'duplicate')
  from public.wedding_collaboration_memberships where member_user_id='11000000-0000-4000-8000-000000000002' and status='revoked'),
  'accepted:true','accept replay returns its historical result after later revocation');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status)
values('31000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002','One','Two','active');
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002',100,'43000000-0000-4000-8000-000000000006')->>'status','created','owner can invite again after revocation and reconnect');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select is(public.accept_wedding_collaboration_invite((select id from public.wedding_collaboration_invitations
  where invitee_user_id='11000000-0000-4000-8000-000000000002' and status='pending'),
  '43000000-0000-4000-8000-000000000007')->>'status','accepted','re-invitation creates a new accepted period');
select is(public.leave_wedding_collaboration((select id from public.wedding_collaboration_memberships
  where member_user_id='11000000-0000-4000-8000-000000000002' and status='active'),
  '43000000-0000-4000-8000-000000000008')->>'status','left','active member may leave their own membership');
select is((select (public.accept_wedding_collaboration_invite(accepted_invitation_id,'43000000-0000-4000-8000-000000000007')->>'status')
  || ':' || (public.accept_wedding_collaboration_invite(accepted_invitation_id,'43000000-0000-4000-8000-000000000007')->>'duplicate')
  from public.wedding_collaboration_memberships where member_user_id='11000000-0000-4000-8000-000000000002' and status='left'),
  'accepted:true','accept replay returns its historical result after later leave');
select throws_ok($$update public.wedding_collaboration_memberships set revoked_at=null where member_user_id='11000000-0000-4000-8000-000000000002' and status='revoked'$$,
  '23514','new row for relation "wedding_collaboration_memberships" violates check constraint "wedding_collaboration_memberships_terminal_timestamp"','revoked membership requires its terminal timestamp');
select throws_ok($$update public.wedding_collaboration_memberships set left_at=null where member_user_id='11000000-0000-4000-8000-000000000002' and status='left'$$,
  '23514','new row for relation "wedding_collaboration_memberships" violates check constraint "wedding_collaboration_memberships_terminal_timestamp"','left membership requires its terminal timestamp');
select is((select count(*)::int from public.wedding_collaboration_memberships
  where wedding_id_snapshot='21000000-0000-4000-8000-000000000001' and member_user_id='11000000-0000-4000-8000-000000000002'),2,
  'membership period history remains distinct after leave');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
create temporary table test_connection_end_expected_invites(invitation_id uuid primary key) on commit drop;
insert into test_connection_end_expected_invites
select id from public.wedding_collaboration_invitations
where source_connection_id='31000000-0000-4000-8000-000000000002' and status='pending';
select is(public.end_collaboration('31000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000002')->>'status','ended','second global connection ends');
select is((select status from public.wedding_collaboration_invitations where id=(select invitation_id from test_connection_end_expected_invites)),'cancelled','pending invite is cancelled by exact source connection end');
select is((select reason from public.wedding_collaboration_invitations where id=(select invitation_id from test_connection_end_expected_invites)),'global_connection_ended','system invalidation has distinct audit reason');
select is((select array_agg(e.invitation_id order by e.invitation_id) from public.wedding_collaboration_events e
  where e.reason='global_connection_ended'
    and e.invitation_id in (select invitation_id from test_connection_end_expected_invites)),
  (select array_agg(invitation_id order by invitation_id) from test_connection_end_expected_invites),
  'connection end emits exactly one event for every captured pending invitation and no extras');
select throws_ok($$select public.accept_wedding_collaboration_invite((select invitation_id from test_connection_end_expected_invites),'44000000-0000-4000-8000-000000000001')$$,
  'P0001','invitation_unavailable','old invite cannot be accepted after disconnect');
select is((select count(*)::int from public.wedding_collaboration_events
  where reason='global_connection_ended'
    and invitation_id in (select invitation_id from test_connection_end_expected_invites)),
  (select count(*)::int from test_connection_end_expected_invites),'connection end audit cardinality matches exact affected invitations');

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004',null,'45000000-0000-4000-8000-000000000001')->>'status','created','fresh connection may create new invitation after prior source ended');
select is((select collaboration_terms_version from public.weddings where id='21000000-0000-4000-8000-000000000001'),1,'initial terms version is one');
update public.weddings set venue='Operational Venue' where id='21000000-0000-4000-8000-000000000001';
select is((select collaboration_terms_version from public.weddings where id='21000000-0000-4000-8000-000000000001'),1,'operational-only edit does not bump version');
insert into public.wedding_extra_services(wedding_id,extra_service_id,price_snapshot,name_snapshot,quantity)
select '21000000-0000-4000-8000-000000000001',id,25,'Additional service',2
from public.extra_services where slug='harness-service' and is_system_template is true;
select is((select collaboration_terms_version from public.weddings where id='21000000-0000-4000-8000-000000000001'),2,'extra row changes increment terms version');
select is((select status from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000004' and wedding_id='21000000-0000-4000-8000-000000000001'),'superseded','extra changes supersede pending proposal');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000004',true);
select is(public.get_wedding_collaboration_invitation_preview((select id from public.wedding_collaboration_invitations
  where invitee_user_id='11000000-0000-4000-8000-000000000004' and wedding_id='21000000-0000-4000-8000-000000000001'))->>'status','superseded',
  'superseded preview is visible but remains terminal');
select is((public.get_wedding_collaboration_invitation_preview((select id from public.wedding_collaboration_invitations
  where invitee_user_id='11000000-0000-4000-8000-000000000004' and wedding_id='21000000-0000-4000-8000-000000000001'))->>'contract_value')::numeric,
  1000::numeric,'superseded preview preserves the original frozen contract value');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004',null,'45000000-0000-4000-8000-000000000002')->>'status','created','fresh proposal captures updated extra snapshot');
select is((select jsonb_array_length(extras_snapshot) from public.wedding_collaboration_invitations
  where idempotency_key='45000000-0000-4000-8000-000000000002'),1,'extra snapshot is immutable invitation content');
update public.weddings set contract_value=1200 where id='21000000-0000-4000-8000-000000000001';
select is((select collaboration_terms_version from public.weddings where id='21000000-0000-4000-8000-000000000001'),3,'commercial edit increments terms version');
select is((select status from public.wedding_collaboration_invitations where idempotency_key='45000000-0000-4000-8000-000000000002'),'superseded','commercial edit supersedes pending proposal');
select is((select reason from public.wedding_collaboration_invitations where idempotency_key='45000000-0000-4000-8000-000000000002'),'commercial_terms_changed','stale proposal has machine-readable reason');
update public.weddings set delivery_due_date='2027-07-01',delivery_due_source='manual'
  where id='21000000-0000-4000-8000-000000000001';
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004',null,'45000000-0000-4000-8000-000000000005')->>'status','created',
  'delivery deadline regression captures a fresh proposal');
update public.weddings set delivery_due_date='2027-08-01',delivery_due_source='manual'
  where id='21000000-0000-4000-8000-000000000001';
select is((select collaboration_terms_version from public.weddings where id='21000000-0000-4000-8000-000000000001'),5,
  'manual delivery deadline change increments commercial terms version');
select is((select status from public.wedding_collaboration_invitations where idempotency_key='45000000-0000-4000-8000-000000000005'),
  'superseded','manual delivery deadline change supersedes pending proposal');
select is((select terms_snapshot->>'delivery_due_date' from public.wedding_collaboration_invitations
  where idempotency_key='45000000-0000-4000-8000-000000000005'),'2027-07-01',
  'invitation snapshot binds the concrete delivery deadline');

create temporary table test_existing_extra(id uuid primary key) on commit drop;
insert into test_existing_extra select id from public.wedding_extra_services where wedding_id='21000000-0000-4000-8000-000000000001';
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004',null,'45500000-0000-4000-8000-000000000001')->>'status',
  'created','extra update regression has a pending proposal');
update public.wedding_extra_services set price_snapshot=35,name_snapshot='Updated service',quantity=3
  where id=(select id from test_existing_extra);
select is((select collaboration_terms_version from public.weddings where id='21000000-0000-4000-8000-000000000001'),6,
  'extra price, quantity, and name update invalidates the source wedding exactly once');
select is((select status from public.wedding_collaboration_invitations where idempotency_key='45500000-0000-4000-8000-000000000001'),
  'superseded','extra row update supersedes the pending proposal');
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004',null,'45500000-0000-4000-8000-000000000002')->>'status',
  'created','extra deletion regression has a pending proposal');
delete from public.wedding_extra_services where id=(select id from test_existing_extra);
select is((select collaboration_terms_version from public.weddings where id='21000000-0000-4000-8000-000000000001'),7,
  'extra deletion invalidates its source wedding exactly once');
select is((select status from public.wedding_collaboration_invitations where idempotency_key='45500000-0000-4000-8000-000000000002'),
  'superseded','extra deletion supersedes the pending proposal');

insert into public.wedding_extra_services(wedding_id,extra_service_id,price_snapshot,name_snapshot,quantity)
select '21000000-0000-4000-8000-000000000001',id,20,'Move source',1
from public.extra_services where slug='harness-service' and is_system_template is true;
insert into public.wedding_extra_services(wedding_id,extra_service_id,price_snapshot,name_snapshot,quantity)
select '21000000-0000-4000-8000-000000000002',id,22,'Move destination',1
from public.extra_services where slug='harness-service' and is_system_template is true;
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004',null,'45500000-0000-4000-8000-000000000003')->>'status',
  'created','source wedding has a proposal before reparent');
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000004',null,'45500000-0000-4000-8000-000000000004')->>'status',
  'created','destination wedding has a proposal before reparent');
create temporary table test_reparent_versions as
select id,collaboration_terms_version from public.weddings
where id in ('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002');
update public.wedding_extra_services set wedding_id='21000000-0000-4000-8000-000000000002'
where id=(select id from public.wedding_extra_services where wedding_id='21000000-0000-4000-8000-000000000001' and name_snapshot='Move source');
select is((select w.collaboration_terms_version - v.collaboration_terms_version
  from public.weddings w join test_reparent_versions v on v.id=w.id where w.id='21000000-0000-4000-8000-000000000001'),1,
  'extra reparent increments source wedding once');
select is((select w.collaboration_terms_version - v.collaboration_terms_version
  from public.weddings w join test_reparent_versions v on v.id=w.id where w.id='21000000-0000-4000-8000-000000000002'),1,
  'extra reparent increments destination wedding once');
select is((select status from public.wedding_collaboration_invitations where idempotency_key='45500000-0000-4000-8000-000000000003'),
  'superseded','extra reparent supersedes source wedding proposal');
select is((select status from public.wedding_collaboration_invitations where idempotency_key='45500000-0000-4000-8000-000000000004'),
  'superseded','extra reparent supersedes destination wedding proposal');

-- Create-command idempotency binds all caller-controlled input while keeping
-- server-derived terms and later lifecycle state attached to the original ID.
create temporary table test_create_replay(invitation_id uuid primary key) on commit drop;
insert into test_create_replay
select (public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004',null,'46000000-0000-4000-8000-000000000001')->>'invitation_id')::uuid;
select is((public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004',null,'46000000-0000-4000-8000-000000000001')->>'duplicate'),'true',
  'same create key and exact payload replays the original result');
select is((public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004',null,'46000000-0000-4000-8000-000000000001')->>'invitation_id')::uuid,
  (select invitation_id from test_create_replay),'create replay returns the same invitation ID');
select throws_ok($$select public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004',5,'46000000-0000-4000-8000-000000000001')$$,
  'P0001','idempotency_conflict','same create key with a different amount conflicts');
select throws_ok($$select public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004',0,'46000000-0000-4000-8000-000000000001')$$,
  'P0001','idempotency_conflict','same create key distinguishes NULL from zero share');
select throws_ok($$select public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000003',null,'46000000-0000-4000-8000-000000000001')$$,
  'P0001','idempotency_conflict','same create key with a different invitee conflicts');
select throws_ok($$select public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000004',null,'46000000-0000-4000-8000-000000000001')$$,
  'P0001','idempotency_conflict','same create key with a different wedding conflicts');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004',null,'46000000-0000-4000-8000-000000000001')$$,
  'P0001','active_connection_required','another actor cannot retrieve the first actor idempotency result');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
update public.weddings set contract_value=1300 where id='21000000-0000-4000-8000-000000000001';
select is((select status from public.wedding_collaboration_invitations where id=(select invitation_id from test_create_replay)),
  'superseded','original create result remains tied to its superseded invitation');
select is((public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000004',null,'46000000-0000-4000-8000-000000000001')->>'invitation_id')::uuid,
  (select invitation_id from test_create_replay),'replay after supersession returns the original ID without a fresh invite');
select is((select count(*)::int from public.wedding_collaboration_invitations where idempotency_key='46000000-0000-4000-8000-000000000001'),
  1,'superseded create replay does not create a second invitation');

create temporary table test_accepted_create_replay(invitation_id uuid primary key) on commit drop;
insert into test_accepted_create_replay
select (public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000004',null,'46000000-0000-4000-8000-000000000002')->>'invitation_id')::uuid;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000004',true);
create temporary table test_accept_replay(membership_id uuid primary key) on commit drop;
insert into test_accept_replay
select (public.accept_wedding_collaboration_invite((select invitation_id from test_accepted_create_replay),
  '46000000-0000-4000-8000-000000000003')->>'membership_id')::uuid;
select is((select status from public.wedding_collaboration_invitations where id=(select invitation_id from test_accepted_create_replay)),
  'accepted','acceptance establishes the exact invitation status for replay');
select is(public.accept_wedding_collaboration_invite((select invitation_id from test_accepted_create_replay),
  '46000000-0000-4000-8000-000000000003')->>'duplicate','true','same accept key replays only its linked accepted membership');
delete from public.wedding_collaboration_memberships where id=(select membership_id from test_accept_replay);
select throws_ok($$select public.accept_wedding_collaboration_invite(
  (select invitation_id from test_accepted_create_replay),'46000000-0000-4000-8000-000000000003')$$,
  'P0001','invitation_unavailable','accept replay fails if its exact linked membership is missing');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select is((public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000004',null,'46000000-0000-4000-8000-000000000002')->>'invitation_id')::uuid,
  (select invitation_id from test_accepted_create_replay),'create replay after acceptance returns the original invite');
select is((select count(*)::int from public.wedding_collaboration_invitations where idempotency_key='46000000-0000-4000-8000-000000000002'),
  1,'accepted create replay does not create a second invitation');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);

select is((select contract_value_snapshot from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000002' and proposed_share_amount=1500),1000::numeric,'accepted contract snapshot remains immutable after later terms changes');
select is((select proposed_share_amount from public.wedding_collaboration_invitations where invitee_user_id='11000000-0000-4000-8000-000000000002' and proposed_share_amount=1500),1500::numeric,'accepted monetary share remains immutable after later terms changes');
select throws_ok($$update public.weddings set collaboration_terms_version=99 where id='21000000-0000-4000-8000-000000000001'$$,
  '42501','collaboration_terms_version_is_managed','clients cannot forge terms version');
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000004',null,'45000000-0000-4000-8000-000000000003')->>'status','created',
  'connected owner creates invitation for explicit expiry regression');
update public.wedding_collaboration_invitations set expires_at=timezone('utc',now())-interval '1 second'
  where owner_user_id='11000000-0000-4000-8000-000000000001'
    and idempotency_key='45000000-0000-4000-8000-000000000003';
select is((select status from public.wedding_collaboration_invitations
  where idempotency_key='45000000-0000-4000-8000-000000000003' and expires_at<=timezone('utc',now())),
  'pending','expired-time invitation is pending until lifecycle access');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000004',true);
select is(public.accept_wedding_collaboration_invite((select id from public.wedding_collaboration_invitations
  where idempotency_key='45000000-0000-4000-8000-000000000003'),
  '45000000-0000-4000-8000-000000000004')->>'status','expired',
  'expired invitation is denied and transitioned at acceptance without cron');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000004',true);
select is((select item->>'status' from jsonb_array_elements(public.list_my_wedding_collaboration_invitations()) as rows(item)
  where item->>'invitation_id'=(select id::text from public.wedding_collaboration_invitations
    where idempotency_key='45000000-0000-4000-8000-000000000003')),'expired',
  'incoming list retains the invitees expired terminal state');
select is(public.get_wedding_collaboration_invitation_preview((select id from public.wedding_collaboration_invitations
  where idempotency_key='45000000-0000-4000-8000-000000000003'))->>'status','expired',
  'expired invitation preview preserves its terminal state');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select is((select status from public.wedding_collaboration_invitations
  where idempotency_key='45000000-0000-4000-8000-000000000003'),'expired',
  'expiry transition leaves the invitation unusable');
select is((select count(*)::int from public.wedding_collaboration_memberships
  where wedding_id_snapshot='21000000-0000-4000-8000-000000000002'
    and member_user_id='11000000-0000-4000-8000-000000000004'),0,
  'expired invitation creates no membership');
select ok(exists(select 1 from public.wedding_collaboration_events
  where invitation_id=(select id from public.wedding_collaboration_invitations
    where idempotency_key='45000000-0000-4000-8000-000000000003')
    and event_type='invitation_expired' and reason='expired'),
  'expired invitation retains lifecycle audit history');

-- Owner erasure covers pending, accepted, revoked, left, and multiple-member
-- states. User 9 also owns a separate wedding that must remain untouched.
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000005',true);
insert into public.wedding_extra_services(wedding_id,extra_service_id,price_snapshot,name_snapshot,quantity)
select '21000000-0000-4000-8000-000000000003',id,15,'Owner erase extra',1
from public.extra_services where slug='harness-service' and is_system_template is true;
select ok(exists(select 1 from public.wedding_extra_services where wedding_id='21000000-0000-4000-8000-000000000003'),
  'owner erasure fixture includes a cascaded extra-service row');
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000003',
  '11000000-0000-4000-8000-000000000006',null,'51000000-0000-4000-8000-000000000001')->>'status',
  'created','owner erasure fixture has a pending invitation');
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000003',
  '11000000-0000-4000-8000-000000000007',null,'51000000-0000-4000-8000-000000000002')->>'status',
  'created','owner erasure fixture has an accepted-member invitation');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000007',true);
select is(public.accept_wedding_collaboration_invite((select id from public.wedding_collaboration_invitations
  where idempotency_key='51000000-0000-4000-8000-000000000002'),'51000000-0000-4000-8000-000000000003')->>'status',
  'accepted','owner erasure fixture accepts a member before revocation');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000005',true);
select is(public.revoke_wedding_collaboration_membership((select id from public.wedding_collaboration_memberships
  where accepted_invitation_id=(select id from public.wedding_collaboration_invitations where idempotency_key='51000000-0000-4000-8000-000000000002')),
  '51000000-0000-4000-8000-000000000004')->>'status','revoked','owner erasure fixture includes an already-revoked period');
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000003',
  '11000000-0000-4000-8000-000000000008',null,'51000000-0000-4000-8000-000000000005')->>'status',
  'created','owner erasure fixture has a member who will leave');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000008',true);
select is(public.accept_wedding_collaboration_invite((select id from public.wedding_collaboration_invitations
  where idempotency_key='51000000-0000-4000-8000-000000000005'),'51000000-0000-4000-8000-000000000006')->>'status',
  'accepted','owner erasure fixture accepts the leaving member');
select is(public.leave_wedding_collaboration((select id from public.wedding_collaboration_memberships
  where accepted_invitation_id=(select id from public.wedding_collaboration_invitations where idempotency_key='51000000-0000-4000-8000-000000000005')),
  '51000000-0000-4000-8000-000000000007')->>'status','left','owner erasure fixture includes an already-left period');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000005',true);
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000003',
  '11000000-0000-4000-8000-000000000004',null,'51000000-0000-4000-8000-000000000008')->>'status',
  'created','owner erasure fixture adds first simultaneous collaborator');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000004',true);
select is(public.accept_wedding_collaboration_invite((select id from public.wedding_collaboration_invitations
  where idempotency_key='51000000-0000-4000-8000-000000000008'),'51000000-0000-4000-8000-000000000009')->>'status',
  'accepted','owner erasure fixture activates first simultaneous collaborator');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000005',true);
select is(public.create_wedding_collaboration_invite('21000000-0000-4000-8000-000000000003',
  '11000000-0000-4000-8000-000000000009',null,'51000000-0000-4000-8000-000000000010')->>'status',
  'created','owner erasure fixture adds a second simultaneous collaborator');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000009',true);
select is(public.accept_wedding_collaboration_invite((select id from public.wedding_collaboration_invitations
  where idempotency_key='51000000-0000-4000-8000-000000000010'),'51000000-0000-4000-8000-000000000011')->>'status',
  'accepted','owner erasure fixture activates second simultaneous collaborator');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000005',true);
select lives_ok($$delete from public.users where id='11000000-0000-4000-8000-000000000005'$$,
  'owner account erasure succeeds with pending, active, revoked, left, and multiple collaborator state');
select is((select count(*)::int from public.weddings where id='21000000-0000-4000-8000-000000000003'),0,
  'owner erasure follows existing wedding deletion behavior');
select is((select count(*)::int from public.weddings where id='21000000-0000-4000-8000-000000000004'),1,
  'owner erasure leaves the collaborator own wedding intact');
select is((select count(*)::int from public.wedding_collaboration_memberships
  where wedding_id_snapshot='21000000-0000-4000-8000-000000000003' and status='active'),0,
  'owner erasure leaves no active authorization-capable membership');
select is((select count(*)::int from public.wedding_collaboration_memberships
  where wedding_id_snapshot='21000000-0000-4000-8000-000000000003' and owner_user_id is null),4,
  'owner erasure retains and redacts all four membership histories');
select is((select count(*)::int from public.wedding_collaboration_memberships
  where wedding_id_snapshot='21000000-0000-4000-8000-000000000003' and status='revoked'),3,
  'owner disappearance revokes active periods without treating them as member leaves');
select is((select status from public.wedding_collaboration_invitations where idempotency_key='51000000-0000-4000-8000-000000000001'),
  'cancelled','owner erasure closes its pending invitation');
select is((select reason from public.wedding_collaboration_invitations where idempotency_key='51000000-0000-4000-8000-000000000001'),
  'global_connection_ended','owner erasure closes pending invite through the existing connection-end lifecycle');
select ok((select owner_user_id is null and couple_first_name_snapshot is null and terms_snapshot='{}'::jsonb
  from public.wedding_collaboration_invitations where idempotency_key='51000000-0000-4000-8000-000000000008'),
  'owner erasure redacts accepted invitation references and commercial snapshot');
select set_config('test.erased_invitation_id',(select id::text from public.wedding_collaboration_invitations
  where idempotency_key='51000000-0000-4000-8000-000000000001'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000006',true);
select is(public.get_wedding_collaboration_invitation_preview(current_setting('test.erased_invitation_id')::uuid),null,
  'owner erasure removes invitee identity association so historical preview returns no private data');
reset role;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000005',true);
select is((select count(*)::int from public.wedding_collaboration_events
  where wedding_id_snapshot='21000000-0000-4000-8000-000000000003'
    and event_type='membership_revoked' and reason='account_deleted'
    and metadata->>'subject'='owner'),2,'owner erasure appends system revocation audit for both active collaborators');
select is((select count(*)::int from public.users where id in (
  '11000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000006',
  '11000000-0000-4000-8000-000000000007','11000000-0000-4000-8000-000000000008',
  '11000000-0000-4000-8000-000000000009')),5,'owner erasure does not delete any collaborator account');

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
delete from public.users where id='11000000-0000-4000-8000-000000000002';
select ok(exists(select 1 from public.weddings where id='21000000-0000-4000-8000-000000000001'),
  'deleting collaborator account leaves owner wedding intact');
select ok(exists(select 1 from public.wedding_collaboration_invitations where wedding_id_snapshot='21000000-0000-4000-8000-000000000001'
  and status='accepted' and invitee_user_id is null and couple_first_name_snapshot is null and proposed_share_amount=1500),
  'account erasure redacts identity but preserves accepted invitation and share history');
select ok(exists(select 1 from public.wedding_collaboration_memberships where wedding_id_snapshot='21000000-0000-4000-8000-000000000001'
  and status='left' and member_user_id is null),'account erasure closes the active period and retains membership history');
select ok(exists(select 1 from public.wedding_collaboration_events e join public.wedding_collaboration_invitations i on i.id=e.invitation_id
  where i.wedding_id_snapshot='21000000-0000-4000-8000-000000000001' and e.event_type='invitation_accepted' and e.actor_user_id is null),
  'account erasure nulls historical actor identity without deleting audit');

select * from finish();
rollback;
