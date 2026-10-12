-- Collaboration V1 / Wave 1B: existing OurWed accounts only.
-- This migration creates global connection state and grants no wedding access.

begin;

create table public.collaboration_invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid references public.users(id) on delete set null,
  inviter_name_snapshot text not null,
  invitee_user_id uuid references public.users(id) on delete set null,
  invitee_name_snapshot text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'superseded')),
  idempotency_key uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  constraint collaboration_invitations_distinct_users
    check (inviter_user_id is null or invitee_user_id is null or inviter_user_id <> invitee_user_id),
  constraint collaboration_invitations_pending_users
    check (status <> 'pending' or (inviter_user_id is not null and invitee_user_id is not null)),
  constraint collaboration_invitations_idempotency_unique
    unique (inviter_user_id, idempotency_key)
);

create unique index collaboration_invitations_pending_pair_unique
  on public.collaboration_invitations (
    least(inviter_user_id, invitee_user_id), greatest(inviter_user_id, invitee_user_id)
  ) where status = 'pending';
create index collaboration_invitations_inviter_status_idx
  on public.collaboration_invitations (inviter_user_id, status, created_at desc);
create index collaboration_invitations_invitee_status_idx
  on public.collaboration_invitations (invitee_user_id, status, created_at desc);

create table public.collaboration_connections (
  id uuid primary key default gen_random_uuid(),
  participant_low_id uuid references public.users(id) on delete set null,
  participant_high_id uuid references public.users(id) on delete set null,
  participant_low_name_snapshot text not null,
  participant_high_name_snapshot text not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_from_invitation_id uuid references public.collaboration_invitations(id) on delete set null,
  connected_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint collaboration_connections_canonical_pair check (
    participant_low_id is null or participant_high_id is null
    or participant_low_id < participant_high_id
  ),
  constraint collaboration_connections_status_dates check (
    (status = 'active' and ended_at is null
      and participant_low_id is not null and participant_high_id is not null)
    or (status = 'ended' and ended_at is not null)
  )
);

create unique index collaboration_connections_active_pair_unique
  on public.collaboration_connections (participant_low_id, participant_high_id)
  where status = 'active';
create index collaboration_connections_low_active_idx
  on public.collaboration_connections (participant_low_id, connected_at desc)
  where status = 'active';
create index collaboration_connections_high_active_idx
  on public.collaboration_connections (participant_high_id, connected_at desc)
  where status = 'active';

create table public.collaboration_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid references public.collaboration_invitations(id) on delete set null,
  connection_id uuid references public.collaboration_connections(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_name_snapshot text not null,
  event_type text not null check (event_type in (
    'collaboration_invite_created', 'collaboration_invite_not_found',
    'collaboration_invite_noop', 'collaboration_invite_accepted',
    'collaboration_invite_declined', 'collaboration_invite_cancelled',
    'collaboration_started', 'collaboration_ended'
  )),
  idempotency_key uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index collaboration_events_actor_idempotency_unique
  on public.collaboration_events (actor_user_id, idempotency_key)
  where idempotency_key is not null;
create index collaboration_events_actor_created_idx
  on public.collaboration_events (actor_user_id, created_at desc);
create index collaboration_events_invitation_created_idx
  on public.collaboration_events (invitation_id, created_at desc);
create index collaboration_events_connection_created_idx
  on public.collaboration_events (connection_id, created_at desc);

comment on table public.collaboration_invitations is
  'Existing-user global connection invitations only; grants no wedding or client-data access.';
comment on table public.collaboration_connections is
  'Durable global account connection, separate from wedding membership and authorization.';
comment on table public.collaboration_events is
  'Append-only privacy-minimal audit trail for Collaboration V1 Wave 1B.';

alter table public.collaboration_invitations enable row level security;
alter table public.collaboration_invitations force row level security;
alter table public.collaboration_connections enable row level security;
alter table public.collaboration_connections force row level security;
alter table public.collaboration_events enable row level security;
alter table public.collaboration_events force row level security;

revoke all on public.collaboration_invitations from public, anon, authenticated;
revoke all on public.collaboration_connections from public, anon, authenticated;
revoke all on public.collaboration_events from public, anon, authenticated;
grant select on public.collaboration_invitations to authenticated;
grant select on public.collaboration_connections to authenticated;
grant select on public.collaboration_events to authenticated;
grant all on public.collaboration_invitations to service_role;
grant all on public.collaboration_connections to service_role;
grant all on public.collaboration_events to service_role;

create policy collaboration_invitations_participants_select
  on public.collaboration_invitations for select to authenticated
  using (auth.uid() in (inviter_user_id, invitee_user_id));
create policy collaboration_connections_participants_select
  on public.collaboration_connections for select to authenticated
  using (auth.uid() in (participant_low_id, participant_high_id));
create policy collaboration_events_participants_select
  on public.collaboration_events for select to authenticated
  using (
    actor_user_id = auth.uid()
    or exists (
      select 1 from public.collaboration_invitations i
      where i.id = collaboration_events.invitation_id
        and auth.uid() in (i.inviter_user_id, i.invitee_user_id)
    )
    or exists (
      select 1 from public.collaboration_connections c
      where c.id = collaboration_events.connection_id
        and auth.uid() in (c.participant_low_id, c.participant_high_id)
    )
  );

-- Permit only FK-driven nulling on erasure while keeping audit rows append-only.
create function public.collaboration_events_allow_fk_nulling()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.id = old.id
    and new.actor_name_snapshot = old.actor_name_snapshot
    and new.event_type = old.event_type
    and new.idempotency_key is not distinct from old.idempotency_key
    and new.metadata = old.metadata
    and new.created_at = old.created_at
    and ((old.invitation_id is not null and new.invitation_id is null
          and new.connection_id is not distinct from old.connection_id
          and new.actor_user_id is not distinct from old.actor_user_id)
      or (old.connection_id is not null and new.connection_id is null
          and new.invitation_id is not distinct from old.invitation_id
          and new.actor_user_id is not distinct from old.actor_user_id)
      or (old.actor_user_id is not null and new.actor_user_id is null
          and new.invitation_id is not distinct from old.invitation_id
          and new.connection_id is not distinct from old.connection_id)) then
    return new;
  end if;
  raise exception 'collaboration_event_append_only' using errcode = '42501';
end;
$$;

create trigger collaboration_events_append_only
  before update or delete on public.collaboration_events
  for each row execute function public.collaboration_events_allow_fk_nulling();

create function public.create_collaboration_invite(p_email text, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
  v_actor_name text;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_invitee uuid;
  v_invitee_count integer;
  v_invitee_name text;
  v_invitation_id uuid;
  v_pair_lock text;
  v_previous public.collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_email = '' or length(v_email) > 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  select lower(btrim(au.email)), coalesce(nullif(btrim(u.name), ''), 'Użytkownik')
    into v_actor_email, v_actor_name
  from auth.users au join public.users u on u.id = au.id
  where au.id = v_actor and au.email_confirmed_at is not null
    and au.deleted_at is null and not au.is_anonymous
    and (au.banned_until is null or au.banned_until <= pg_catalog.now());
  if not found then raise exception 'verified_account_required' using errcode = 'P0001'; end if;
  if v_email = v_actor_email then raise exception 'self_invite' using errcode = 'P0001'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('collaboration-invite-rate:' || v_actor::text, 0)
  );
  select * into v_previous from public.collaboration_events e
  where e.actor_user_id = v_actor and e.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.metadata->>'command' is distinct from 'create_collaboration_invite' then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    return jsonb_build_object('status', v_previous.metadata->>'outcome',
      'invitation_id', v_previous.invitation_id, 'duplicate', true);
  end if;
  if (select count(*) from public.collaboration_events e
      where e.actor_user_id = v_actor
        and e.metadata->>'command' = 'create_collaboration_invite'
        and e.created_at > timezone('utc', now()) - interval '24 hours') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- auth.users is the canonical verified email source; public.users is required
  -- so only a fully provisioned OurWed account can be invited.
  select count(*)::integer,
    (pg_catalog.array_agg(au.id order by au.id))[1],
    (pg_catalog.array_agg(coalesce(nullif(btrim(u.name), ''), 'Użytkownik') order by au.id))[1]
    into v_invitee_count, v_invitee, v_invitee_name
  from auth.users au join public.users u on u.id = au.id
  where lower(btrim(au.email)) = v_email and au.email_confirmed_at is not null
    and au.deleted_at is null and not au.is_anonymous
    and (au.banned_until is null or au.banned_until <= pg_catalog.now());

  if v_invitee_count = 0 then
    insert into public.collaboration_events (
      actor_user_id, actor_name_snapshot, event_type, idempotency_key, metadata
    ) values (v_actor, v_actor_name, 'collaboration_invite_not_found', p_idempotency_key,
      jsonb_build_object('command', 'create_collaboration_invite', 'outcome', 'account_not_found'));
    return jsonb_build_object('status', 'account_not_found', 'duplicate', false);
  end if;
  if v_invitee_count > 1 then
    insert into public.collaboration_events (
      actor_user_id, actor_name_snapshot, event_type, idempotency_key, metadata
    ) values (v_actor, v_actor_name, 'collaboration_invite_noop', p_idempotency_key,
      jsonb_build_object('command', 'create_collaboration_invite', 'outcome', 'account_ambiguous'));
    return jsonb_build_object('status', 'account_ambiguous', 'duplicate', false);
  end if;

  if v_invitee = v_actor then raise exception 'self_invite' using errcode = 'P0001'; end if;

  v_pair_lock := least(v_actor, v_invitee)::text || ':' || greatest(v_actor, v_invitee)::text;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('collaboration-pair:' || v_pair_lock, 0)
  );

  if exists (select 1 from public.collaboration_connections c
      where c.status = 'active' and c.participant_low_id = least(v_actor, v_invitee)
        and c.participant_high_id = greatest(v_actor, v_invitee)) then
    insert into public.collaboration_events (
      actor_user_id, actor_name_snapshot, event_type, idempotency_key, metadata
    ) values (v_actor, v_actor_name, 'collaboration_invite_noop', p_idempotency_key,
      jsonb_build_object('command', 'create_collaboration_invite', 'outcome', 'already_connected'));
    return jsonb_build_object('status', 'already_connected', 'duplicate', false);
  end if;
  if exists (select 1 from public.collaboration_invitations i
      where i.status = 'pending'
        and least(i.inviter_user_id, i.invitee_user_id) = least(v_actor, v_invitee)
        and greatest(i.inviter_user_id, i.invitee_user_id) = greatest(v_actor, v_invitee)) then
    insert into public.collaboration_events (
      actor_user_id, actor_name_snapshot, event_type, idempotency_key, metadata
    ) values (v_actor, v_actor_name, 'collaboration_invite_noop', p_idempotency_key,
      jsonb_build_object('command', 'create_collaboration_invite', 'outcome', 'pending_exists'));
    return jsonb_build_object('status', 'pending_exists', 'duplicate', false);
  end if;

  insert into public.collaboration_invitations (
    inviter_user_id, inviter_name_snapshot, invitee_user_id, invitee_name_snapshot, idempotency_key
  ) values (v_actor, v_actor_name, v_invitee, v_invitee_name, p_idempotency_key)
  returning id into v_invitation_id;

  insert into public.collaboration_events (
    invitation_id, actor_user_id, actor_name_snapshot, event_type, idempotency_key, metadata
  ) values (v_invitation_id, v_actor, v_actor_name, 'collaboration_invite_created',
    p_idempotency_key, jsonb_build_object('command', 'create_collaboration_invite', 'outcome', 'created'));

  perform public.enqueue_notification_event(
    v_invitee, 'collaboration.invitation.received', 'collaboration_invitation',
    v_invitation_id, 'collaboration.invitation.received:' || v_invitation_id::text, '{}'::jsonb,
    'Zaproszenie do współpracy', v_actor_name || ' zaprasza Cię do współpracy w OurWed.',
    '/ustawienia/wspolpraca'
  );
  return jsonb_build_object('status', 'created', 'invitation_id', v_invitation_id, 'duplicate', false);
end;
$$;

create function public.accept_collaboration_invite(p_invitation_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_invite public.collaboration_invitations%rowtype;
  v_connection uuid;
  v_existing public.collaboration_events%rowtype;
  v_locked_participants integer;
  v_low_name text;
  v_high_name text;
  v_inviter_name text;
begin
  if v_actor is null or p_idempotency_key is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into v_existing from public.collaboration_events
  where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.metadata->>'command' is distinct from 'accept_collaboration_invite'
      or v_existing.invitation_id is distinct from p_invitation_id then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    return jsonb_build_object('status', v_existing.metadata->>'outcome', 'duplicate', true);
  end if;

  select coalesce(nullif(btrim(u.name), ''), 'Użytkownik') into v_actor_name
  from auth.users au join public.users u on u.id = au.id
  where au.id = v_actor and au.email_confirmed_at is not null
    and au.deleted_at is null and not au.is_anonymous
    and (au.banned_until is null or au.banned_until <= pg_catalog.now());
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  -- Peek without taking the invitation lock so account erasure and acceptance
  -- lock users before invitations in the same order.
  select * into v_invite from public.collaboration_invitations
  where id = p_invitation_id;
  if not found or v_invite.invitee_user_id <> v_actor or v_invite.status <> 'pending' then
    raise exception 'invitation_unavailable' using errcode = 'P0001';
  end if;

  perform 1 from auth.users au join public.users u on u.id = au.id
  where au.id in (v_actor, v_invite.inviter_user_id)
    and au.email_confirmed_at is not null
    and au.deleted_at is null and not au.is_anonymous
    and (au.banned_until is null or au.banned_until <= pg_catalog.now())
  order by au.id
  for key share of au, u;
  get diagnostics v_locked_participants = row_count;
  if v_locked_participants <> 2 then
    raise exception 'invitation_unavailable' using errcode = 'P0001';
  end if;

  select * into v_invite from public.collaboration_invitations
  where id = p_invitation_id for update;
  if not found or v_invite.invitee_user_id <> v_actor or v_invite.status <> 'pending' then
    raise exception 'invitation_unavailable' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'collaboration-pair:' || least(v_actor, v_invite.inviter_user_id)::text || ':'
      || greatest(v_actor, v_invite.inviter_user_id)::text, 0));
  if exists (select 1 from public.collaboration_connections c
      where c.status = 'active' and c.participant_low_id = least(v_actor, v_invite.inviter_user_id)
        and c.participant_high_id = greatest(v_actor, v_invite.inviter_user_id)) then
    update public.collaboration_invitations set status = 'superseded', responded_at = timezone('utc', now()),
      updated_at = timezone('utc', now()) where id = v_invite.id;
    insert into public.collaboration_events (
      invitation_id, actor_user_id, actor_name_snapshot, event_type, idempotency_key, metadata
    ) values (v_invite.id, v_actor, v_actor_name, 'collaboration_invite_noop', p_idempotency_key,
      jsonb_build_object('command', 'accept_collaboration_invite', 'outcome', 'already_connected'));
    return jsonb_build_object('status', 'already_connected', 'duplicate', false);
  end if;

  v_low_name := case when v_actor < v_invite.inviter_user_id then v_actor_name else v_invite.inviter_name_snapshot end;
  v_high_name := case when v_actor < v_invite.inviter_user_id then v_invite.inviter_name_snapshot else v_actor_name end;
  insert into public.collaboration_connections (
    participant_low_id, participant_high_id, participant_low_name_snapshot,
    participant_high_name_snapshot, status, created_from_invitation_id
  ) values (
    least(v_actor, v_invite.inviter_user_id), greatest(v_actor, v_invite.inviter_user_id),
    v_low_name, v_high_name, 'active', v_invite.id
  ) returning id into v_connection;
  update public.collaboration_invitations set status = 'accepted', responded_at = timezone('utc', now()),
    updated_at = timezone('utc', now()) where id = v_invite.id;
  insert into public.collaboration_events (
    invitation_id, connection_id, actor_user_id, actor_name_snapshot,
    event_type, idempotency_key, metadata
  ) values (v_invite.id, v_connection, v_actor, v_actor_name, 'collaboration_invite_accepted',
    p_idempotency_key, jsonb_build_object('command', 'accept_collaboration_invite', 'outcome', 'accepted'));
  insert into public.collaboration_events (
    invitation_id, connection_id, actor_user_id, actor_name_snapshot, event_type
  ) values (v_invite.id, v_connection, v_actor, v_actor_name, 'collaboration_started');

  select coalesce(nullif(btrim(name), ''), 'Współpracownik') into v_inviter_name
  from public.users where id = v_invite.inviter_user_id;
  perform public.enqueue_notification_event(
    v_invite.inviter_user_id, 'collaboration.invitation.accepted', 'collaboration_invitation',
    v_invite.id, 'collaboration.invitation.accepted:' || v_invite.id::text, '{}'::jsonb,
    'Zaproszenie zaakceptowane', v_actor_name || ' zaakceptował(a) zaproszenie do współpracy.',
    '/ustawienia/wspolpraca'
  );
  return jsonb_build_object('status', 'accepted', 'connection_id', v_connection, 'duplicate', false);
end;
$$;

create function public.decline_collaboration_invite(p_invitation_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_invite public.collaboration_invitations%rowtype;
  v_existing public.collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into v_existing from public.collaboration_events
  where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.metadata->>'command' is distinct from 'decline_collaboration_invite'
      or v_existing.invitation_id is distinct from p_invitation_id then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    return jsonb_build_object('status', v_existing.metadata->>'outcome', 'duplicate', true);
  end if;
  select coalesce(nullif(btrim(u.name), ''), 'Użytkownik') into v_actor_name
  from auth.users au join public.users u on u.id = au.id
  where au.id = v_actor and au.email_confirmed_at is not null
    and au.deleted_at is null and not au.is_anonymous
    and (au.banned_until is null or au.banned_until <= pg_catalog.now());
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into v_invite from public.collaboration_invitations where id = p_invitation_id for update;
  if not found or v_invite.invitee_user_id <> v_actor or v_invite.status <> 'pending' then
    raise exception 'invitation_unavailable' using errcode = 'P0001';
  end if;
  update public.collaboration_invitations set status = 'declined', responded_at = timezone('utc', now()),
    updated_at = timezone('utc', now()) where id = v_invite.id;
  insert into public.collaboration_events (
    invitation_id, actor_user_id, actor_name_snapshot, event_type, idempotency_key, metadata
  ) values (v_invite.id, v_actor, v_actor_name, 'collaboration_invite_declined', p_idempotency_key,
    jsonb_build_object('command', 'decline_collaboration_invite', 'outcome', 'declined'));
  perform public.enqueue_notification_event(
    v_invite.inviter_user_id, 'collaboration.invitation.declined', 'collaboration_invitation',
    v_invite.id, 'collaboration.invitation.declined:' || v_invite.id::text, '{}'::jsonb,
    'Zaproszenie odrzucone', v_actor_name || ' odrzucił(a) zaproszenie do współpracy.',
    '/ustawienia/wspolpraca'
  );
  return jsonb_build_object('status', 'declined', 'duplicate', false);
end;
$$;

create function public.cancel_collaboration_invite(p_invitation_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_invite public.collaboration_invitations%rowtype;
  v_existing public.collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into v_existing from public.collaboration_events
  where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.metadata->>'command' is distinct from 'cancel_collaboration_invite'
      or v_existing.invitation_id is distinct from p_invitation_id then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    return jsonb_build_object('status', v_existing.metadata->>'outcome', 'duplicate', true);
  end if;
  select coalesce(nullif(btrim(u.name), ''), 'Użytkownik') into v_actor_name
  from auth.users au join public.users u on u.id = au.id
  where au.id = v_actor and au.email_confirmed_at is not null
    and au.deleted_at is null and not au.is_anonymous
    and (au.banned_until is null or au.banned_until <= pg_catalog.now());
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into v_invite from public.collaboration_invitations where id = p_invitation_id for update;
  if not found or v_invite.inviter_user_id <> v_actor or v_invite.status <> 'pending' then
    raise exception 'invitation_unavailable' using errcode = 'P0001';
  end if;
  update public.collaboration_invitations set status = 'cancelled', responded_at = timezone('utc', now()),
    updated_at = timezone('utc', now()) where id = v_invite.id;
  insert into public.collaboration_events (
    invitation_id, actor_user_id, actor_name_snapshot, event_type, idempotency_key, metadata
  ) values (v_invite.id, v_actor, v_actor_name, 'collaboration_invite_cancelled', p_idempotency_key,
    jsonb_build_object('command', 'cancel_collaboration_invite', 'outcome', 'cancelled'));
  perform public.enqueue_notification_event(
    v_invite.invitee_user_id, 'collaboration.invitation.cancelled', 'collaboration_invitation',
    v_invite.id, 'collaboration.invitation.cancelled:' || v_invite.id::text, '{}'::jsonb,
    'Zaproszenie wycofane', 'Zaproszenie do współpracy zostało wycofane.', '/ustawienia/wspolpraca'
  );
  return jsonb_build_object('status', 'cancelled', 'duplicate', false);
end;
$$;

create function public.end_collaboration(p_connection_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_connection public.collaboration_connections%rowtype;
  v_other uuid;
  v_existing public.collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into v_existing from public.collaboration_events
  where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.metadata->>'command' is distinct from 'end_collaboration'
      or v_existing.connection_id is distinct from p_connection_id then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    return jsonb_build_object('status', v_existing.metadata->>'outcome', 'duplicate', true);
  end if;
  select coalesce(nullif(btrim(u.name), ''), 'Użytkownik') into v_actor_name
  from auth.users au join public.users u on u.id = au.id
  where au.id = v_actor and au.email_confirmed_at is not null
    and au.deleted_at is null and not au.is_anonymous
    and (au.banned_until is null or au.banned_until <= pg_catalog.now());
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into v_connection from public.collaboration_connections where id = p_connection_id for update;
  if not found or v_connection.status <> 'active'
    or v_actor not in (v_connection.participant_low_id, v_connection.participant_high_id) then
    raise exception 'connection_unavailable' using errcode = 'P0001';
  end if;
  v_other := case when v_connection.participant_low_id = v_actor
    then v_connection.participant_high_id else v_connection.participant_low_id end;
  update public.collaboration_connections set status = 'ended', ended_at = timezone('utc', now()),
    updated_at = timezone('utc', now()) where id = v_connection.id;
  insert into public.collaboration_events (
    connection_id, actor_user_id, actor_name_snapshot, event_type, idempotency_key, metadata
  ) values (v_connection.id, v_actor, v_actor_name, 'collaboration_ended', p_idempotency_key,
    jsonb_build_object('command', 'end_collaboration', 'outcome', 'ended'));
  perform public.enqueue_notification_event(
    v_other, 'collaboration.ended', 'collaboration_connection', v_connection.id,
    'collaboration.ended:' || v_connection.id::text, '{}'::jsonb,
    'Współpraca zakończona', v_actor_name || ' zakończył(a) współpracę.', '/ustawienia/wspolpraca'
  );
  return jsonb_build_object('status', 'ended', 'duplicate', false);
end;
$$;

create function public.get_collaboration_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_incoming jsonb;
  v_outgoing jsonb;
  v_connections jsonb;
begin
  if v_actor is null or not exists (
    select 1 from auth.users au join public.users u on u.id = au.id
    where au.id = v_actor and au.email_confirmed_at is not null
      and au.deleted_at is null and not au.is_anonymous
      and (au.banned_until is null or au.banned_until <= pg_catalog.now())
  ) then raise exception 'unauthorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'display_name', i.inviter_name_snapshot, 'created_at', i.created_at
  ) order by i.created_at desc), '[]'::jsonb) into v_incoming
  from public.collaboration_invitations i where i.invitee_user_id = v_actor and i.status = 'pending';
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'display_name', i.invitee_name_snapshot, 'created_at', i.created_at
  ) order by i.created_at desc), '[]'::jsonb) into v_outgoing
  from public.collaboration_invitations i where i.inviter_user_id = v_actor and i.status = 'pending';
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'display_name', case when c.participant_low_id = v_actor
      then c.participant_high_name_snapshot else c.participant_low_name_snapshot end,
    'connected_at', c.connected_at
  ) order by c.connected_at desc), '[]'::jsonb) into v_connections
  from public.collaboration_connections c
  where c.status = 'active' and v_actor in (c.participant_low_id, c.participant_high_id);
  return jsonb_build_object('incoming_pending', v_incoming,
    'outgoing_pending', v_outgoing, 'connections', v_connections);
end;
$$;

-- Account deletion cancels operational invitations and ends active relationships
-- before ON DELETE SET NULL preserves minimal historical snapshots.
create function public.collaboration_before_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.collaboration_invitations%rowtype;
  c public.collaboration_connections%rowtype;
begin
  for r in select * from public.collaboration_invitations i
    where i.status = 'pending' and old.id in (i.inviter_user_id, i.invitee_user_id)
    order by i.id for update
  loop
    update public.collaboration_invitations set status = 'cancelled',
      responded_at = timezone('utc', now()), updated_at = timezone('utc', now()) where id = r.id;
    insert into public.collaboration_events (
      invitation_id, actor_user_id, actor_name_snapshot, event_type, metadata
    ) values (r.id, old.id, coalesce(nullif(btrim(old.name), ''), 'Użytkownik'),
      'collaboration_invite_cancelled', jsonb_build_object('reason', 'account_deleted'));
  end loop;
  for c in select * from public.collaboration_connections x
    where x.status = 'active' and old.id in (x.participant_low_id, x.participant_high_id)
    order by x.id for update
  loop
    update public.collaboration_connections set status = 'ended', ended_at = timezone('utc', now()),
      updated_at = timezone('utc', now()) where id = c.id;
    insert into public.collaboration_events (
      connection_id, actor_user_id, actor_name_snapshot, event_type, metadata
    ) values (c.id, old.id, coalesce(nullif(btrim(old.name), ''), 'Użytkownik'),
      'collaboration_ended', jsonb_build_object('reason', 'account_deleted'));
  end loop;
  return old;
end;
$$;

create trigger collaboration_before_user_delete
  before delete on public.users
  for each row execute function public.collaboration_before_user_delete();

revoke all on function public.collaboration_events_allow_fk_nulling() from public, anon, authenticated;
revoke all on function public.collaboration_before_user_delete() from public, anon, authenticated;
revoke all on function public.create_collaboration_invite(text, uuid) from public, anon;
revoke all on function public.accept_collaboration_invite(uuid, uuid) from public, anon;
revoke all on function public.decline_collaboration_invite(uuid, uuid) from public, anon;
revoke all on function public.cancel_collaboration_invite(uuid, uuid) from public, anon;
revoke all on function public.end_collaboration(uuid, uuid) from public, anon;
revoke all on function public.get_collaboration_state() from public, anon;
grant execute on function public.create_collaboration_invite(text, uuid) to authenticated;
grant execute on function public.accept_collaboration_invite(uuid, uuid) to authenticated;
grant execute on function public.decline_collaboration_invite(uuid, uuid) to authenticated;
grant execute on function public.cancel_collaboration_invite(uuid, uuid) to authenticated;
grant execute on function public.end_collaboration(uuid, uuid) to authenticated;
grant execute on function public.get_collaboration_state() to authenticated;

commit;
