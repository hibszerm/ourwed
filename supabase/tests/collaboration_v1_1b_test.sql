begin;
select plan(98);

select has_table('public', 'collaboration_invitations', 'global invitation table exists');
select has_table('public', 'collaboration_connections', 'durable connection table exists');
select has_table('public', 'collaboration_events', 'append-only event table exists');
select ok(not exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'collaboration_invitations'
    and column_name in ('token_hash', 'intended_email_normalized', 'expires_at')),
  'invitation stores user identities without token, email, or expiry');

select ok((select c.relrowsecurity and c.relforcerowsecurity
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'collaboration_invitations'), 'invitation table forces RLS');
select ok((select c.relrowsecurity and c.relforcerowsecurity
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'collaboration_connections'), 'connection table forces RLS');
select ok((select c.relrowsecurity and c.relforcerowsecurity
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'collaboration_events'), 'event table forces RLS');

select ok(not has_table_privilege('anon', 'public.collaboration_invitations', 'SELECT'), 'anon cannot read invitations');
select ok(not has_table_privilege('anon', 'public.collaboration_connections', 'SELECT'), 'anon cannot read connections');
select ok(not has_table_privilege('anon', 'public.collaboration_events', 'SELECT'), 'anon cannot read events');
select ok(not has_table_privilege('authenticated', 'public.collaboration_invitations', 'INSERT'), 'authenticated cannot insert invitations directly');
select ok(not has_table_privilege('authenticated', 'public.collaboration_invitations', 'UPDATE'), 'authenticated cannot update invitations directly');
select ok(not has_table_privilege('authenticated', 'public.collaboration_invitations', 'DELETE'), 'authenticated cannot delete invitations directly');
select ok(not has_table_privilege('authenticated', 'public.collaboration_connections', 'INSERT'), 'authenticated cannot insert connections directly');
select ok(not has_table_privilege('authenticated', 'public.collaboration_connections', 'UPDATE'), 'authenticated cannot update connections directly');
select ok(not has_table_privilege('authenticated', 'public.collaboration_connections', 'DELETE'), 'authenticated cannot delete connections directly');
select ok(not has_table_privilege('authenticated', 'public.collaboration_events', 'INSERT'), 'authenticated cannot forge audit events');
select ok(not has_table_privilege('authenticated', 'public.collaboration_events', 'UPDATE'), 'authenticated cannot update audit events directly');
select ok(not has_table_privilege('authenticated', 'public.collaboration_events', 'DELETE'), 'authenticated cannot delete audit events directly');
select ok(has_table_privilege('authenticated', 'public.collaboration_invitations', 'SELECT'), 'authenticated has participant-scoped invitation reads');

select ok(not has_function_privilege('anon', 'public.create_collaboration_invite(text,uuid)', 'EXECUTE'), 'anon cannot resolve/invite users');
select ok(has_function_privilege('authenticated', 'public.create_collaboration_invite(text,uuid)', 'EXECUTE'), 'authenticated can create invitations through RPC');
select ok(not exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
  where n.nspname = 'public' and p.proname in (
    'create_collaboration_invite', 'accept_collaboration_invite', 'decline_collaboration_invite',
    'cancel_collaboration_invite', 'end_collaboration', 'get_collaboration_state',
    'collaboration_events_allow_fk_nulling', 'collaboration_before_user_delete'
  ) and a.grantee = 0 and a.privilege_type = 'EXECUTE'
), 'no new collaboration function is executable by PUBLIC');
select ok((select p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'accept_collaboration_invite'),
  'SECURITY DEFINER command uses a fixed empty search_path');
select ok(not exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'create_collaboration_invite', 'accept_collaboration_invite', 'decline_collaboration_invite',
    'cancel_collaboration_invite', 'end_collaboration', 'get_collaboration_state'
  ) and has_function_privilege('anon', p.oid, 'EXECUTE')
), 'anon cannot execute any client Collaboration function');
select ok(not exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'create_collaboration_invite', 'accept_collaboration_invite', 'decline_collaboration_invite',
    'cancel_collaboration_invite', 'end_collaboration', 'get_collaboration_state'
  ) and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
), 'authenticated role can execute all intended commands and DTO read');
select ok(not exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'create_collaboration_invite', 'accept_collaboration_invite', 'decline_collaboration_invite',
    'cancel_collaboration_invite', 'end_collaboration', 'get_collaboration_state',
    'collaboration_events_allow_fk_nulling', 'collaboration_before_user_delete'
  ) and not coalesce(p.proconfig @> array['search_path=""'], false)
), 'all Collaboration privileged functions pin empty search_path');

set local role anon;
select throws_ok($$select public.create_collaboration_invite('someone@example.test', '90000000-0000-4000-8000-000000000001'::uuid)$$,
  '42501', null, 'unauthenticated role cannot invoke invitation command');
reset role;

-- Synthetic confirmed users are created only in this local test transaction.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'alice@example.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Alice","last_name":"Owner","legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bob@example.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Bob","last_name":"Invitee","legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'carol@example.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Carol","last_name":"Other","legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dave@example.test', 'x', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Dave","last_name":"Cancel","legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}', now(), now());

-- Two provisioned SSO identities can legally share an email in auth.users;
-- case-varied values exercise ambiguity-safe matching without storing email.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'Shared@example.test', 'x', now(), '{"provider":"sso","providers":["sso"]}', '{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}', now(), now(), true),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'shared@example.test', 'x', now(), '{"provider":"sso","providers":["sso"]}', '{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}', now(), now(), true);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
update auth.users set banned_until = now() + interval '1 hour'
where id = '10000000-0000-4000-8000-000000000004';
select is(public.create_collaboration_invite('dave@example.test', '90000000-0000-4000-8000-000000000002'::uuid)->>'status',
  'account_not_found', 'currently banned account is not eligible for invitation');
update auth.users set banned_until = null, deleted_at = now()
where id = '10000000-0000-4000-8000-000000000004';
select is(public.create_collaboration_invite('dave@example.test', '90000000-0000-4000-8000-000000000003'::uuid)->>'status',
  'account_not_found', 'soft-deleted Auth account is not eligible for invitation');
update auth.users set deleted_at = null, is_anonymous = true
where id = '10000000-0000-4000-8000-000000000004';
select is(public.create_collaboration_invite('dave@example.test', '90000000-0000-4000-8000-000000000004'::uuid)->>'status',
  'account_not_found', 'anonymous Auth account is not eligible for invitation');
update auth.users set is_anonymous = false, email_confirmed_at = null
where id = '10000000-0000-4000-8000-000000000004';
select is(public.create_collaboration_invite('dave@example.test', '90000000-0000-4000-8000-000000000005'::uuid)->>'status',
  'account_not_found', 'unconfirmed Auth account is not eligible for invitation');
update auth.users set email_confirmed_at = now()
where id = '10000000-0000-4000-8000-000000000004';
select is(public.create_collaboration_invite('SHARED@example.test', '90000000-0000-4000-8000-000000000006'::uuid)->>'status',
  'account_ambiguous', 'case-insensitive matching refuses ambiguous SSO identities');
update auth.users set banned_until = now() + interval '1 hour'
where id = '10000000-0000-4000-8000-000000000001';
select throws_ok($$select public.create_collaboration_invite('carol@example.test', '90000000-0000-4000-8000-000000000007'::uuid)$$,
  'P0001', 'verified_account_required', 'currently banned inviter cannot create an invitation');
update auth.users set banned_until = null
where id = '10000000-0000-4000-8000-000000000001';
select is(public.create_collaboration_invite(' BOB@example.test ', '20000000-0000-4000-8000-000000000001'::uuid)->>'status',
  'created', 'inviter resolves normalized email and creates invitation for existing account');
select is((select count(*)::int from public.collaboration_invitations
  where inviter_user_id = '10000000-0000-4000-8000-000000000001'
    and invitee_user_id = '10000000-0000-4000-8000-000000000002' and status = 'pending'),
  1, 'one pending invitation exists for resolved pair');
select is((select count(*)::int from public.notifications
  where user_id = '10000000-0000-4000-8000-000000000002'
    and title = 'Zaproszenie do współpracy'), 1, 'invitee receives an in-app notification');
select is(public.create_collaboration_invite('bob@example.test', '20000000-0000-4000-8000-000000000001'::uuid)->>'status',
  'created', 'replayed create request returns its original outcome');
select is(public.create_collaboration_invite('carol@example.test', '20000000-0000-4000-8000-000000000001'::uuid)->>'status',
  'created', 'same create key with altered email retains the first request outcome');
select is((select count(*)::int from public.collaboration_invitations
  where invitee_user_id='10000000-0000-4000-8000-000000000003' and status='pending'),
  0, 'altered payload replay does not create another invitation');
select is((select count(*)::int from public.notifications
  where user_id = '10000000-0000-4000-8000-000000000002'
    and title = 'Zaproszenie do współpracy'), 1, 'create replay does not duplicate in-app notification');
select is(public.create_collaboration_invite('missing@example.test', '20000000-0000-4000-8000-000000000002'::uuid)->>'status',
  'account_not_found', 'unknown email returns explicit authenticated product result');
select throws_ok($$select public.create_collaboration_invite('alice@example.test', '20000000-0000-4000-8000-000000000003'::uuid)$$,
  'P0001', 'self_invite', 'self invite is rejected');
select is(public.create_collaboration_invite('bob@example.test', '20000000-0000-4000-8000-000000000004'::uuid)->>'status',
  'pending_exists', 'reciprocal invite reuses the pending unordered pair');
select throws_ok($$select public.accept_collaboration_invite(
  (select id from public.collaboration_invitations where status='pending' limit 1),
  '30000000-0000-4000-8000-000000000009'::uuid)$$,
  'P0001', 'invitation_unavailable', 'inviter cannot accept their own outgoing invitation');
select is((select count(*)::int from public.collaboration_invitations
  where status = 'pending' and least(inviter_user_id, invitee_user_id) = least(
    '10000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000002'::uuid)
    and greatest(inviter_user_id, invitee_user_id) = greatest(
    '10000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000002'::uuid)),
  1, 'reciprocal requests cannot create duplicate pending invitations');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok($$select public.accept_collaboration_invite(
  (select id from public.collaboration_invitations where status='pending' limit 1),
  '30000000-0000-4000-8000-000000000001'::uuid)$$,
  'P0001', 'invitation_unavailable', 'unrelated authenticated user cannot accept');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is(public.accept_collaboration_invite(
  (select id from public.collaboration_invitations where status='pending' limit 1),
  '30000000-0000-4000-8000-000000000002'::uuid)->>'status', 'accepted', 'intended invitee accepts');
select is((select count(*)::int from public.collaboration_connections where status = 'active'
  and participant_low_id = '10000000-0000-4000-8000-000000000001'
  and participant_high_id = '10000000-0000-4000-8000-000000000002'), 1, 'accept creates one canonical active connection');
select is(public.create_collaboration_invite('alice@example.test', '20000000-0000-4000-8000-000000000011'::uuid)->>'status',
  'already_connected', 'active pair cannot receive a new pending invite');
select is(public.accept_collaboration_invite(
  (select id from public.collaboration_invitations where status='accepted' limit 1),
  '30000000-0000-4000-8000-000000000002'::uuid)->>'status', 'accepted', 'accept replay is idempotent');
select throws_ok($$select public.decline_collaboration_invite(
  (select id from public.collaboration_invitations where status='accepted' limit 1),
  '30000000-0000-4000-8000-000000000002'::uuid)$$,
  'P0001', 'idempotency_key_reused', 'idempotency key cannot be replayed across command types');
select throws_ok($$select public.accept_collaboration_invite(
  (select id from public.collaboration_invitations where status='accepted' limit 1),
  '30000000-0000-4000-8000-000000000003'::uuid)$$,
  'P0001', 'invitation_unavailable', 'accepted invitation cannot be accepted with a new key');
select throws_ok($$insert into public.collaboration_connections (
  participant_low_id, participant_high_id, participant_low_name_snapshot,
  participant_high_name_snapshot, status
) values (
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  'Alice Owner', 'Bob Invitee', 'active'
)$$, '23505', null, 'database unique index prevents a second active canonical connection');
select is((select count(*)::int from public.collaboration_events
  where event_type = 'collaboration_invite_accepted'), 1, 'accept replay does not duplicate audit event');
select throws_ok($$select public.decline_collaboration_invite(
  (select id from public.collaboration_invitations where status='accepted' limit 1),
  '30000000-0000-4000-8000-000000000004'::uuid)$$,
  'P0001', 'invitation_unavailable', 'accepted invitation cannot later be declined');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select is((select count(*)::int from public.collaboration_invitations
  where id = (select id from public.collaboration_invitations where status='accepted' limit 1)),
  0, 'unrelated authenticated user cannot read another invitation');
select is((select count(*)::int from public.collaboration_connections where status='active'),
  0, 'unrelated authenticated user cannot read an active connection');
select throws_ok($$insert into public.collaboration_invitations (
  inviter_user_id, inviter_name_snapshot, invitee_user_id, invitee_name_snapshot, idempotency_key
) values (
  '10000000-0000-4000-8000-000000000003', 'Carol Other',
  '10000000-0000-4000-8000-000000000001', 'Alice Owner',
  '70000000-0000-4000-8000-000000000001'
)$$, '42501', null, 'authenticated clients cannot insert invitation rows directly');
select throws_ok($$update public.collaboration_invitations set status='cancelled' where status='accepted'$$,
  '42501', null, 'authenticated clients cannot update invitation rows directly');
select throws_ok($$delete from public.collaboration_invitations where status='accepted'$$,
  '42501', null, 'authenticated clients cannot delete invitation rows directly');
select throws_ok($$update public.collaboration_connections set status='ended' where status='active'$$,
  '42501', null, 'authenticated clients cannot update connection rows directly');
select throws_ok($$delete from public.collaboration_connections where status='active'$$,
  '42501', null, 'authenticated clients cannot delete connection rows directly');
select throws_ok($$insert into public.collaboration_events (actor_name_snapshot,event_type)
  values ('Carol Other','collaboration_ended')$$, '42501', null, 'authenticated clients cannot insert audit rows directly');
select throws_ok($$update public.collaboration_events set metadata='{}'::jsonb$$,
  '42501', null, 'authenticated clients cannot update audit rows directly');
select throws_ok($$delete from public.collaboration_events$$,
  '42501', null, 'authenticated clients cannot delete audit rows directly');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is((select count(*)::int from public.collaboration_invitations
  where invitee_user_id = '10000000-0000-4000-8000-000000000002' and status='accepted'),
  1, 'invitation participant can read the invitation');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is(public.create_collaboration_invite('carol@example.test', '20000000-0000-4000-8000-000000000005'::uuid)->>'status',
  'created', 'second invite can be created for lifecycle tests');
select throws_ok($$select public.decline_collaboration_invite(
  (select id from public.collaboration_invitations where invitee_user_id='10000000-0000-4000-8000-000000000003' and status='pending'),
  '40000000-0000-4000-8000-000000000001'::uuid)$$,
  'P0001', 'invitation_unavailable', 'inviter cannot decline invitee invitation');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select is(public.decline_collaboration_invite(
  (select id from public.collaboration_invitations where invitee_user_id='10000000-0000-4000-8000-000000000003' and status='pending'),
  '40000000-0000-4000-8000-000000000002'::uuid)->>'status', 'declined', 'intended invitee declines');
select is(public.decline_collaboration_invite(
  (select id from public.collaboration_invitations where invitee_user_id='10000000-0000-4000-8000-000000000003' and status='declined'),
  '40000000-0000-4000-8000-000000000002'::uuid)->>'status', 'declined', 'decline replay is idempotent');
select is((select count(*)::int from public.collaboration_events
  where invitation_id=(select id from public.collaboration_invitations
      where invitee_user_id='10000000-0000-4000-8000-000000000003')
    and event_type = 'collaboration_invite_declined'), 1, 'decline replay does not duplicate audit event');
select is((select count(*)::int from public.collaboration_connections where participant_low_id =
  least('10000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000003'::uuid)
  and participant_high_id = greatest('10000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000003'::uuid)), 0, 'decline does not create a connection');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select throws_ok($$select public.accept_collaboration_invite(
  (select id from public.collaboration_invitations where invitee_user_id='10000000-0000-4000-8000-000000000003' and status='declined'),
  '40000000-0000-4000-8000-000000000003'::uuid)$$,
  'P0001', 'invitation_unavailable', 'declined invitation cannot later be accepted');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok($$select public.decline_collaboration_invite(
  (select id from public.collaboration_invitations where status='accepted' limit 1),
  '40000000-0000-4000-8000-000000000004'::uuid)$$,
  'P0001', 'invitation_unavailable', 'accepted invitation cannot later be declined');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is(public.create_collaboration_invite('dave@example.test', '20000000-0000-4000-8000-000000000006'::uuid)->>'status',
  'created', 'third invitation created for cancellation and deletion tests');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok($$select public.cancel_collaboration_invite(
  (select id from public.collaboration_invitations where invitee_user_id='10000000-0000-4000-8000-000000000004' and status='pending'),
  '50000000-0000-4000-8000-000000000001'::uuid)$$,
  'P0001', 'invitation_unavailable', 'non-inviter cannot cancel');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is(public.cancel_collaboration_invite(
  (select id from public.collaboration_invitations where invitee_user_id='10000000-0000-4000-8000-000000000004' and status='pending'),
  '50000000-0000-4000-8000-000000000002'::uuid)->>'status', 'cancelled', 'inviter cancels pending invite');
select is(public.cancel_collaboration_invite(
  (select id from public.collaboration_invitations where invitee_user_id='10000000-0000-4000-8000-000000000004' and status='cancelled'),
  '50000000-0000-4000-8000-000000000002'::uuid)->>'status', 'cancelled', 'cancel replay is idempotent');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select throws_ok($$select public.accept_collaboration_invite(
  (select id from public.collaboration_invitations where idempotency_key='20000000-0000-4000-8000-000000000006'::uuid),
  '50000000-0000-4000-8000-000000000003'::uuid)$$,
  'P0001', 'invitation_unavailable', 'cancelled invitation cannot later be accepted');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.collaboration_events
  where invitation_id=(select id from public.collaboration_invitations
      where invitee_user_id='10000000-0000-4000-8000-000000000004')
    and event_type = 'collaboration_invite_cancelled'), 1, 'cancel replay does not duplicate audit event');

create temporary table test_connection_to_end(id uuid primary key) on commit drop;
insert into test_connection_to_end
select id from public.collaboration_connections where status='active' order by id limit 1;
select is(public.end_collaboration(
  (select id from test_connection_to_end),
  '60000000-0000-4000-8000-000000000001'::uuid)->>'status', 'ended', 'participant ends active relationship');
select is((select status from public.collaboration_connections where id=(select id from test_connection_to_end)), 'ended', 'ended connection history remains');
select is(public.end_collaboration(
  (select id from test_connection_to_end),
  '60000000-0000-4000-8000-000000000001'::uuid)->>'status', 'ended', 'end replay is idempotent');
select throws_ok($$select public.end_collaboration(
  (select id from test_connection_to_end),
  '60000000-0000-4000-8000-000000000002'::uuid)$$,
  'P0001', 'connection_unavailable', 'ended connection cannot be ended again with a new key');
select is((select count(*)::int from public.collaboration_events
  where connection_id=(select id from test_connection_to_end) and event_type='collaboration_ended'),
  1, 'end replay does not duplicate audit event');

-- A new pending invite is canceled and its participant FK nulled by account erasure.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is(public.create_collaboration_invite('dave@example.test', '20000000-0000-4000-8000-000000000007'::uuid)->>'status',
  'created', 'invite exists before account deletion seam');
delete from public.users where id = '10000000-0000-4000-8000-000000000004';
select is((select status from public.collaboration_invitations
  where invitee_name_snapshot = 'Dave Cancel' order by created_at desc limit 1), 'cancelled',
  'account deletion cancels pending invitations');
select is((select invitee_user_id from public.collaboration_invitations
  where invitee_name_snapshot = 'Dave Cancel' order by created_at desc limit 1), null::uuid,
  'account deletion removes live identity while retaining snapshot');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is(public.create_collaboration_invite('bob@example.test', '20000000-0000-4000-8000-000000000008'::uuid)->>'status',
  'created', 'former participants can start a new connection lifecycle after ending it');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is(public.accept_collaboration_invite(
  (select id from public.collaboration_invitations where idempotency_key='20000000-0000-4000-8000-000000000008'::uuid),
  '30000000-0000-4000-8000-000000000008'::uuid)->>'status', 'accepted', 'new invitation creates a new active relationship history row');
delete from public.users where id = '10000000-0000-4000-8000-000000000002';
select is((select status from public.collaboration_connections
  where created_from_invitation_id = (select id from public.collaboration_invitations
    where idempotency_key='20000000-0000-4000-8000-000000000008'::uuid)), 'ended',
  'deleting a participant ends but retains its active connection history');
select is((select participant_high_id from public.collaboration_connections
  where created_from_invitation_id = (select id from public.collaboration_invitations
    where idempotency_key='20000000-0000-4000-8000-000000000008'::uuid)), null::uuid,
  'deleted participant FK is nulled while display snapshot remains');
select ok(exists (select 1 from public.users where id='10000000-0000-4000-8000-000000000001'),
  'deleting a collaborator leaves the other account intact');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
do $$
declare i integer;
begin
  for i in 1..20 loop
    perform public.create_collaboration_invite(
      'missing-' || i::text || '@example.test', pg_catalog.gen_random_uuid());
  end loop;
end;
$$;
select throws_ok($$select public.create_collaboration_invite('another-missing@example.test',
  '80000000-0000-4000-8000-000000000001'::uuid)$$,
  'P0001', 'rate_limited', 'resolver and invite attempts are durably rate limited');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select is(public.create_collaboration_invite('alice@example.test', '20000000-0000-4000-8000-000000000010'::uuid)->>'status',
  'created', 'pending invitation exists before inviter account deletion');
delete from public.users where id = '10000000-0000-4000-8000-000000000003';
select is((select status from public.collaboration_invitations
  where idempotency_key='20000000-0000-4000-8000-000000000010'::uuid), 'cancelled',
  'account deletion cancels pending invite created by deleted inviter');
select ok(exists (select 1 from public.users where id='10000000-0000-4000-8000-000000000001'),
  'deleting inviter leaves invitee account intact');

select * from finish();
rollback;
