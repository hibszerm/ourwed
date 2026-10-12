-- Collaboration V1 / Wave 1C-A. Lifecycle foundation only: no wedding RLS is
-- widened and accepted membership remains non-authorizing in this wave.
begin;

alter table public.weddings
  add column collaboration_terms_version integer not null default 1
    check (collaboration_terms_version > 0);

create table public.wedding_collaboration_invitations (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid references public.weddings(id) on delete set null,
  wedding_id_snapshot uuid not null,
  owner_user_id uuid references public.users(id) on delete set null,
  invitee_user_id uuid references public.users(id) on delete set null,
  source_connection_id uuid references public.collaboration_connections(id) on delete set null,
  status text not null default 'pending' check (status in
    ('pending','accepted','declined','cancelled','expired','superseded')),
  reason text check (reason is null or reason in
    ('owner_cancelled','global_connection_ended','commercial_terms_changed',
     'replaced','expired','account_deleted','wedding_deleted')),
  terms_version integer not null check (terms_version > 0),
  couple_first_name_snapshot text,
  couple_second_name_snapshot text,
  wedding_date_snapshot date,
  package_label_snapshot text,
  contract_value_snapshot numeric(12,2) check (contract_value_snapshot is null or contract_value_snapshot >= 0),
  currency_snapshot text not null,
  proposed_share_amount numeric(12,2) check (proposed_share_amount is null or proposed_share_amount >= 0),
  terms_snapshot jsonb not null check (jsonb_typeof(terms_snapshot) = 'object'),
  extras_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(extras_snapshot) = 'array'),
  idempotency_key uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '14 days'),
  accepted_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  superseded_at timestamptz,
  constraint wedding_collaboration_invites_parties check
    (owner_user_id is null or invitee_user_id is null or owner_user_id <> invitee_user_id),
  constraint wedding_collaboration_invites_pending_refs check
    (status <> 'pending' or (wedding_id is not null and owner_user_id is not null
      and invitee_user_id is not null and source_connection_id is not null)),
  constraint wedding_collaboration_invites_terminal_timestamp check (
    (status='pending' and accepted_at is null and declined_at is null and cancelled_at is null
      and expired_at is null and superseded_at is null)
    or (status='accepted' and accepted_at is not null and declined_at is null and cancelled_at is null
      and expired_at is null and superseded_at is null)
    or (status='declined' and accepted_at is null and declined_at is not null and cancelled_at is null
      and expired_at is null and superseded_at is null)
    or (status='cancelled' and accepted_at is null and declined_at is null and cancelled_at is not null
      and expired_at is null and superseded_at is null)
    or (status='expired' and accepted_at is null and declined_at is null and cancelled_at is null
      and expired_at is not null and superseded_at is null)
    or (status='superseded' and accepted_at is null and declined_at is null and cancelled_at is null
      and expired_at is null and superseded_at is not null)
  ),
  constraint wedding_collaboration_invites_idempotency unique (owner_user_id,idempotency_key)
);

create unique index wedding_collaboration_invites_one_pending_idx
  on public.wedding_collaboration_invitations(wedding_id, invitee_user_id)
  where status = 'pending' and wedding_id is not null;
create index wedding_collaboration_invites_owner_status_idx
  on public.wedding_collaboration_invitations(owner_user_id,status,created_at desc);
create index wedding_collaboration_invites_invitee_status_idx
  on public.wedding_collaboration_invitations(invitee_user_id,status,created_at desc);
create index wedding_collaboration_invites_connection_pending_idx
  on public.wedding_collaboration_invitations(source_connection_id,wedding_id,id)
  where status = 'pending';

create table public.wedding_collaboration_memberships (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid references public.weddings(id) on delete set null,
  wedding_id_snapshot uuid not null,
  owner_user_id uuid references public.users(id) on delete set null,
  member_user_id uuid references public.users(id) on delete set null,
  accepted_invitation_id uuid references public.wedding_collaboration_invitations(id) on delete set null,
  status text not null check (status in ('active','revoked','left')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz not null,
  revoked_at timestamptz,
  left_at timestamptz,
  constraint wedding_collaboration_memberships_parties check
    (owner_user_id is null or member_user_id is null or owner_user_id <> member_user_id),
  constraint wedding_collaboration_memberships_active_refs check
    (status <> 'active' or (wedding_id is not null and owner_user_id is not null
      and member_user_id is not null and accepted_invitation_id is not null)),
  constraint wedding_collaboration_memberships_terminal_timestamp check (
    (status='active' and revoked_at is null and left_at is null)
    or (status='revoked' and revoked_at is not null and left_at is null)
    or (status='left' and revoked_at is null and left_at is not null)
  )
);
create unique index wedding_collaboration_memberships_one_active_idx
  on public.wedding_collaboration_memberships(wedding_id,member_user_id)
  where status = 'active' and wedding_id is not null;
create index wedding_collaboration_memberships_wedding_history_idx
  on public.wedding_collaboration_memberships(wedding_id_snapshot,created_at desc);

create function public.wedding_collaboration_membership_invitation_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_invite public.wedding_collaboration_invitations%rowtype;
begin
  if new.accepted_invitation_id is null then
    if new.status='active' then
      raise exception 'membership_requires_accepted_invitation' using errcode='23514';
    end if;
    return new;
  end if;
  select * into v_invite from public.wedding_collaboration_invitations
    where id=new.accepted_invitation_id;
  if not found or v_invite.status<>'accepted'
    or v_invite.wedding_id_snapshot is distinct from new.wedding_id_snapshot
    or v_invite.owner_user_id is distinct from new.owner_user_id
    or v_invite.invitee_user_id is distinct from new.member_user_id then
    raise exception 'membership_requires_matching_accepted_invitation' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger wedding_collaboration_membership_invitation_guard
  before insert or update of accepted_invitation_id,status,wedding_id_snapshot,owner_user_id,member_user_id
  on public.wedding_collaboration_memberships
  for each row execute function public.wedding_collaboration_membership_invitation_guard();

create table public.wedding_collaboration_events (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid references public.weddings(id) on delete set null,
  wedding_id_snapshot uuid not null,
  invitation_id uuid references public.wedding_collaboration_invitations(id) on delete set null,
  membership_id uuid references public.wedding_collaboration_memberships(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in (
    'invitation_created','invitation_accepted','invitation_declined','invitation_cancelled',
    'invitation_expired','invitation_superseded','membership_revoked','membership_left')),
  reason text check (reason is null or reason in
    ('owner_cancelled','global_connection_ended','commercial_terms_changed',
     'replaced','expired','account_deleted','wedding_deleted')),
  idempotency_key uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);
create unique index wedding_collaboration_events_actor_idempotency_idx
  on public.wedding_collaboration_events(actor_user_id,idempotency_key)
  where idempotency_key is not null;
create index wedding_collaboration_events_wedding_idx
  on public.wedding_collaboration_events(wedding_id_snapshot,created_at desc);
create index wedding_collaboration_events_invitation_idx
  on public.wedding_collaboration_events(invitation_id,created_at desc);

comment on table public.wedding_collaboration_invitations is
  'Immutable invitation and financial proposal snapshot; does not grant wedding access.';
comment on table public.wedding_collaboration_memberships is
  'Historical wedding membership periods. Active membership does not grant access in 1C-A.';
comment on table public.wedding_collaboration_events is
  'Append-only, PII-minimized audit trail for wedding-specific collaboration consent.';
comment on column public.weddings.collaboration_terms_version is
  'Monotonic version for invitation-visible commercial and couple/date snapshots.';

create function public.wedding_collaboration_actor_is_eligible(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users au join public.users u on u.id=au.id
    where au.id=p_user_id and au.email_confirmed_at is not null and au.deleted_at is null
      and not au.is_anonymous and (au.banned_until is null or au.banned_until<=pg_catalog.now()))
$$;

-- Lock every participant user row in UUID order before acquiring lifecycle
-- locks. Account erasure starts by locking public.users, so commands that may
-- write user FKs must follow the same user -> connection -> wedding order.
create function public.wedding_collaboration_lock_users(p_user_ids uuid[])
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid; v_locked integer := 0; v_expected integer;
begin
  select count(distinct ids.user_id)::integer into v_expected
    from pg_catalog.unnest(p_user_ids) as ids(user_id) where ids.user_id is not null;
  for v_user_id in
    select u.id from public.users u
      where u.id = any(p_user_ids) order by u.id for update
  loop
    v_locked := v_locked + 1;
  end loop;
  return v_locked = v_expected;
end; $$;

alter table public.wedding_collaboration_invitations enable row level security;
alter table public.wedding_collaboration_invitations force row level security;
alter table public.wedding_collaboration_memberships enable row level security;
alter table public.wedding_collaboration_memberships force row level security;
alter table public.wedding_collaboration_events enable row level security;
alter table public.wedding_collaboration_events force row level security;
revoke all on public.wedding_collaboration_invitations, public.wedding_collaboration_memberships,
  public.wedding_collaboration_events from public, anon, authenticated;
grant all on public.wedding_collaboration_invitations, public.wedding_collaboration_memberships,
  public.wedding_collaboration_events to service_role;

create function public.wedding_collaboration_events_fk_nulling_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.id = old.id
    and new.wedding_id_snapshot = old.wedding_id_snapshot
    and new.event_type = old.event_type and new.reason is not distinct from old.reason
    and new.idempotency_key is not distinct from old.idempotency_key
    and new.metadata = old.metadata and new.created_at = old.created_at
    and (new.wedding_id is null or new.wedding_id is not distinct from old.wedding_id)
    and (new.invitation_id is null or new.invitation_id is not distinct from old.invitation_id)
    and (new.membership_id is null or new.membership_id is not distinct from old.membership_id)
    and (new.actor_user_id is null or new.actor_user_id is not distinct from old.actor_user_id) then
    return new;
  end if;
  raise exception 'wedding_collaboration_events_are_append_only' using errcode = '42501';
end; $$;
create trigger wedding_collaboration_events_append_only
  before update or delete on public.wedding_collaboration_events
  for each row execute function public.wedding_collaboration_events_fk_nulling_only();

-- Lifecycle RPCs take participant users before a global connection, then the
-- wedding, invitation, and membership. Standalone wedding mutations begin at
-- the wedding row and never acquire user or connection locks afterward.
-- Extra-row mutations take their target extra row before sorted parent wedding
-- rows; no path holding a wedding lock then waits on an existing extra row.
create function public.wedding_collaboration_lock_extra_wedding()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_wedding uuid; v_found integer := 0; v_expected integer;
begin
  if tg_op = 'UPDATE' and old.wedding_id is distinct from new.wedding_id then
    select count(distinct ids.wedding_id)::integer into v_expected
      from (values (old.wedding_id),(new.wedding_id)) as ids(wedding_id);
    for v_wedding in
      select w.id from public.weddings w
        where w.id in (old.wedding_id,new.wedding_id) order by w.id for update
    loop
      v_found := v_found + 1;
    end loop;
  else
    v_expected := 1;
    v_wedding := case when tg_op = 'DELETE' then old.wedding_id else new.wedding_id end;
    perform 1 from public.weddings w where w.id = v_wedding for update;
    if found then
      v_found := 1;
    elsif tg_op = 'DELETE' then
      -- ON DELETE CASCADE may invoke this trigger after its parent row has
      -- become invisible to the deleting transaction. The FK proves this
      -- child row belonged to that parent; the wedding deletion hook handles
      -- invitation invalidation, so no terms bump is needed here.
      return old;
    end if;
  end if;
  if v_found <> v_expected then raise exception 'wedding_unavailable' using errcode = 'P0001'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
create function public.wedding_collaboration_extra_mutation_statement_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Statement-level locking runs before row tuples are acquired. Sharing this
  -- lock with wedding deletion prevents the row-lock inversion between an
  -- extra update/delete and ON DELETE CASCADE on its wedding.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ourwed:wedding-extra-mutation',0));
  return null;
end; $$;
create trigger wedding_extra_collaboration_statement_lock
  before update or delete on public.wedding_extra_services
  for each statement execute function public.wedding_collaboration_extra_mutation_statement_lock();
create trigger weddings_collaboration_extra_delete_statement_lock
  before delete on public.weddings
  for each statement execute function public.wedding_collaboration_extra_mutation_statement_lock();
create trigger wedding_extra_collaboration_terms_lock
  before insert or update or delete on public.wedding_extra_services
  for each row execute function public.wedding_collaboration_lock_extra_wedding();

create function public.wedding_collaboration_terms_before_update()
returns trigger language plpgsql set search_path = '' as $$
declare v_changed boolean;
begin
  v_changed := row(new.bride_name,new.groom_name,new.wedding_date,new.package_name,new.package_id,
      new.contract_value,new.deposit_amount,new.currency,new.package_items_snapshot,new.selected_package_ids,
      new.final_payment_terms,new.final_payment_due_date,new.coverage_hours,new.coverage_end_time,
      new.overtime_rate,new.delivery_months,new.delivery_days,new.delivery_due_date,
      new.travel_fee_status,new.travel_fee_amount,
      new.travel_fee_free_km_snapshot,new.travel_fee_route_distance_m_snapshot)
    is distinct from
    row(old.bride_name,old.groom_name,old.wedding_date,old.package_name,old.package_id,
      old.contract_value,old.deposit_amount,old.currency,old.package_items_snapshot,old.selected_package_ids,
      old.final_payment_terms,old.final_payment_due_date,old.coverage_hours,old.coverage_end_time,
      old.overtime_rate,old.delivery_months,old.delivery_days,old.delivery_due_date,
      old.travel_fee_status,old.travel_fee_amount,
      old.travel_fee_free_km_snapshot,old.travel_fee_route_distance_m_snapshot);
  if v_changed then
    new.collaboration_terms_version := old.collaboration_terms_version + 1;
  elsif new.collaboration_terms_version is distinct from old.collaboration_terms_version then
    -- The extras trigger sets a transaction-local capability after taking the
    -- parent wedding lock; arbitrary client attempts to write the version fail.
    if pg_catalog.current_setting('ourwed.collaboration_terms_bump',true) is distinct from 'on' then
      raise exception 'collaboration_terms_version_is_managed' using errcode = '42501';
    end if;
    new.collaboration_terms_version := old.collaboration_terms_version + 1;
  else
    new.collaboration_terms_version := old.collaboration_terms_version;
  end if;
  return new;
end; $$;
create function public.wedding_collaboration_terms_after_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.wedding_collaboration_invitations%rowtype;
begin
  if new.collaboration_terms_version = old.collaboration_terms_version then return new; end if;
  for r in select * from public.wedding_collaboration_invitations i
    where i.wedding_id = new.id and i.status = 'pending'
      and i.terms_version <> new.collaboration_terms_version order by i.id for update
  loop
    update public.wedding_collaboration_invitations set status='superseded', reason='commercial_terms_changed',
      superseded_at=timezone('utc',now()), updated_at=timezone('utc',now()) where id=r.id;
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,
      actor_user_id,event_type,reason,metadata)
    values (new.id,new.id,r.id,null,'invitation_superseded','commercial_terms_changed',
      jsonb_build_object('terms_version',new.collaboration_terms_version));
  end loop;
  return new;
end; $$;
create trigger weddings_collaboration_terms_before
  before update on public.weddings for each row execute function public.wedding_collaboration_terms_before_update();
create trigger weddings_collaboration_terms_after
  after update on public.weddings for each row execute function public.wedding_collaboration_terms_after_update();

create function public.wedding_collaboration_extra_terms_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_wedding uuid; v_weddings uuid[];
begin
  if tg_op = 'UPDATE' and row(new.wedding_id,new.extra_service_id,new.name_snapshot,
      new.price_snapshot,new.quantity) is not distinct from row(old.wedding_id,old.extra_service_id,
      old.name_snapshot,old.price_snapshot,old.quantity) then return new; end if;
  if tg_op = 'UPDATE' and old.wedding_id is distinct from new.wedding_id then
    select array_agg(ids.wedding_id order by ids.wedding_id) into v_weddings
      from (select distinct wedding_id from (values (old.wedding_id),(new.wedding_id)) as pairs(wedding_id)) ids;
  else
    v_weddings := array[case when tg_op = 'DELETE' then old.wedding_id else new.wedding_id end];
  end if;
  perform pg_catalog.set_config('ourwed.collaboration_terms_bump','on',true);
  foreach v_wedding in array v_weddings loop
    update public.weddings set collaboration_terms_version=collaboration_terms_version+1 where id=v_wedding;
  end loop;
  perform pg_catalog.set_config('ourwed.collaboration_terms_bump','off',true);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
create trigger wedding_extra_collaboration_terms_after
  after insert or update or delete on public.wedding_extra_services
  for each row execute function public.wedding_collaboration_extra_terms_changed();

create function public.wedding_collaboration_connection_ended()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record; i public.wedding_collaboration_invitations%rowtype;
begin
  if old.status <> 'active' or new.status <> 'ended' then return new; end if;
  -- Lock impacted weddings in UUID order before invitation rows; accepted
  -- memberships are intentionally untouched.
  for r in select distinct invite_row.wedding_id from public.wedding_collaboration_invitations invite_row
    where invite_row.source_connection_id=new.id and invite_row.status='pending' and invite_row.wedding_id is not null
    order by invite_row.wedding_id
  loop
    perform 1 from public.weddings w where w.id=r.wedding_id for update;
  end loop;
  for i in select * from public.wedding_collaboration_invitations x
    where x.source_connection_id=new.id and x.status='pending' order by x.wedding_id,x.id for update
  loop
    update public.wedding_collaboration_invitations set status='cancelled',reason='global_connection_ended',
      cancelled_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=i.id;
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,
      event_type,reason,metadata)
    values (i.wedding_id,i.wedding_id_snapshot,i.id,'invitation_cancelled','global_connection_ended',
      jsonb_build_object('source_connection_id',new.id,'system',true));
  end loop;
  return new;
end; $$;
create trigger collaboration_connection_end_wedding_invites
  after update of status on public.collaboration_connections
  for each row execute function public.wedding_collaboration_connection_ended();

-- Preserve the released 1B end semantics while serializing both participants
-- before the connection lock. Account erasure begins at public.users.
create or replace function public.end_collaboration(p_connection_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_peek public.collaboration_connections%rowtype;
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
    return jsonb_build_object('status',v_existing.metadata->>'outcome','duplicate',true);
  end if;
  select * into v_peek from public.collaboration_connections where id = p_connection_id;
  if not found or v_actor not in (v_peek.participant_low_id,v_peek.participant_high_id) then
    raise exception 'connection_unavailable' using errcode = 'P0001';
  end if;
  if not public.wedding_collaboration_lock_users(array[v_peek.participant_low_id,v_peek.participant_high_id]) then
    raise exception 'connection_unavailable' using errcode = 'P0001';
  end if;
  select coalesce(nullif(btrim(u.name), ''), 'Użytkownik') into v_actor_name
    from auth.users au join public.users u on u.id=au.id
    where au.id=v_actor and au.email_confirmed_at is not null and au.deleted_at is null
      and not au.is_anonymous and (au.banned_until is null or au.banned_until<=pg_catalog.now());
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  -- A concurrent end may have committed while this command waited for users.
  select * into v_existing from public.collaboration_events
    where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.metadata->>'command' is distinct from 'end_collaboration'
      or v_existing.connection_id is distinct from p_connection_id then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    return jsonb_build_object('status',v_existing.metadata->>'outcome','duplicate',true);
  end if;
  select * into v_connection from public.collaboration_connections where id = p_connection_id for update;
  if not found or v_connection.status <> 'active'
    or v_actor not in (v_connection.participant_low_id,v_connection.participant_high_id) then
    raise exception 'connection_unavailable' using errcode = 'P0001';
  end if;
  v_other := case when v_connection.participant_low_id = v_actor
    then v_connection.participant_high_id else v_connection.participant_low_id end;
  update public.collaboration_connections set status='ended',ended_at=timezone('utc',now()),
    updated_at=timezone('utc',now()) where id=v_connection.id;
  insert into public.collaboration_events(connection_id,actor_user_id,actor_name_snapshot,event_type,idempotency_key,metadata)
    values(v_connection.id,v_actor,v_actor_name,'collaboration_ended',p_idempotency_key,
      jsonb_build_object('command','end_collaboration','outcome','ended'));
  perform public.enqueue_notification_event(v_other,'collaboration.ended','collaboration_connection',
    v_connection.id,'collaboration.ended:'||v_connection.id::text,'{}'::jsonb,
    'Współpraca zakończona',v_actor_name||' zakończył(a) współpracę.','/ustawienia/wspolpraca');
  return jsonb_build_object('status','ended','duplicate',false);
end; $$;

-- The released 1B invite response commands write events with actor_user_id.
-- Lock the actor first so account erasure cannot hold public.users while
-- waiting on the invitation row that the response command already owns.
create or replace function public.decline_collaboration_invite(p_invitation_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid();
  v_actor_name text;
  v_invite public.collaboration_invitations%rowtype;
  v_existing public.collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  if not public.wedding_collaboration_lock_users(array[v_actor])
    or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  select * into v_existing from public.collaboration_events
    where actor_user_id=v_actor and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.metadata->>'command' is distinct from 'decline_collaboration_invite'
      or v_existing.invitation_id is distinct from p_invitation_id then
      raise exception 'idempotency_key_reused' using errcode='P0001';
    end if;
    return jsonb_build_object('status',v_existing.metadata->>'outcome','duplicate',true);
  end if;
  select coalesce(nullif(btrim(u.name),''),'Użytkownik') into v_actor_name
    from auth.users au join public.users u on u.id=au.id
    where au.id=v_actor and au.email_confirmed_at is not null and au.deleted_at is null
      and not au.is_anonymous and (au.banned_until is null or au.banned_until<=pg_catalog.now());
  if not found then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into v_invite from public.collaboration_invitations where id=p_invitation_id for update;
  if not found or v_invite.invitee_user_id<>v_actor or v_invite.status<>'pending' then
    raise exception 'invitation_unavailable' using errcode='P0001';
  end if;
  update public.collaboration_invitations set status='declined',responded_at=timezone('utc',now()),
    updated_at=timezone('utc',now()) where id=v_invite.id;
  insert into public.collaboration_events(invitation_id,actor_user_id,actor_name_snapshot,event_type,idempotency_key,metadata)
    values(v_invite.id,v_actor,v_actor_name,'collaboration_invite_declined',p_idempotency_key,
      jsonb_build_object('command','decline_collaboration_invite','outcome','declined'));
  perform public.enqueue_notification_event(v_invite.inviter_user_id,'collaboration.invitation.declined',
    'collaboration_invitation',v_invite.id,'collaboration.invitation.declined:'||v_invite.id::text,
    '{}'::jsonb,'Zaproszenie odrzucone',v_actor_name||' odrzucił(a) zaproszenie do współpracy.',
    '/ustawienia/wspolpraca');
  return jsonb_build_object('status','declined','duplicate',false);
end; $$;

create or replace function public.cancel_collaboration_invite(p_invitation_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid();
  v_actor_name text;
  v_invite public.collaboration_invitations%rowtype;
  v_existing public.collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  if not public.wedding_collaboration_lock_users(array[v_actor])
    or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  select * into v_existing from public.collaboration_events
    where actor_user_id=v_actor and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.metadata->>'command' is distinct from 'cancel_collaboration_invite'
      or v_existing.invitation_id is distinct from p_invitation_id then
      raise exception 'idempotency_key_reused' using errcode='P0001';
    end if;
    return jsonb_build_object('status',v_existing.metadata->>'outcome','duplicate',true);
  end if;
  select coalesce(nullif(btrim(u.name),''),'Użytkownik') into v_actor_name
    from auth.users au join public.users u on u.id=au.id
    where au.id=v_actor and au.email_confirmed_at is not null and au.deleted_at is null
      and not au.is_anonymous and (au.banned_until is null or au.banned_until<=pg_catalog.now());
  if not found then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into v_invite from public.collaboration_invitations where id=p_invitation_id for update;
  if not found or v_invite.inviter_user_id<>v_actor or v_invite.status<>'pending' then
    raise exception 'invitation_unavailable' using errcode='P0001';
  end if;
  update public.collaboration_invitations set status='cancelled',responded_at=timezone('utc',now()),
    updated_at=timezone('utc',now()) where id=v_invite.id;
  insert into public.collaboration_events(invitation_id,actor_user_id,actor_name_snapshot,event_type,idempotency_key,metadata)
    values(v_invite.id,v_actor,v_actor_name,'collaboration_invite_cancelled',p_idempotency_key,
      jsonb_build_object('command','cancel_collaboration_invite','outcome','cancelled'));
  perform public.enqueue_notification_event(v_invite.invitee_user_id,'collaboration.invitation.cancelled',
    'collaboration_invitation',v_invite.id,'collaboration.invitation.cancelled:'||v_invite.id::text,
    '{}'::jsonb,'Zaproszenie wycofane','Zaproszenie do współpracy zostało wycofane.',
    '/ustawienia/wspolpraca');
  return jsonb_build_object('status','cancelled','duplicate',false);
end; $$;

create function public.wedding_collaboration_before_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare i public.wedding_collaboration_invitations%rowtype; m public.wedding_collaboration_memberships%rowtype;
begin
  for i in select * from public.wedding_collaboration_invitations x
    where x.wedding_id=old.id and x.status='pending' order by x.id for update
  loop
    update public.wedding_collaboration_invitations set status='cancelled',reason='wedding_deleted',
      cancelled_at=timezone('utc',now()),updated_at=timezone('utc',now()),
      couple_first_name_snapshot=null,couple_second_name_snapshot=null,wedding_date_snapshot=null,
      package_label_snapshot=null,contract_value_snapshot=null,terms_snapshot='{}'::jsonb,extras_snapshot='[]'::jsonb
      where id=i.id;
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,
      event_type,reason,metadata)
    values (old.id,old.id,i.id,'invitation_cancelled','wedding_deleted','{"system":true}'::jsonb);
  end loop;
  for m in select * from public.wedding_collaboration_memberships x
    where x.wedding_id=old.id and x.status='active' order by x.id for update
  loop
    update public.wedding_collaboration_memberships set status='revoked',revoked_at=timezone('utc',now()),
      updated_at=timezone('utc',now()) where id=m.id;
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,membership_id,
      event_type,reason,metadata)
    values (old.id,old.id,m.id,'membership_revoked','wedding_deleted','{"system":true}'::jsonb);
  end loop;
  update public.wedding_collaboration_invitations set couple_first_name_snapshot=null,
    couple_second_name_snapshot=null,wedding_date_snapshot=null,package_label_snapshot=null,
    contract_value_snapshot=null,terms_snapshot='{}'::jsonb,extras_snapshot='[]'::jsonb
  where wedding_id=old.id;
  return old;
end; $$;
create trigger wedding_collaboration_before_delete
  before delete on public.weddings for each row execute function public.wedding_collaboration_before_delete();

-- Keep the released 1B erasure behavior but end global connections before
-- locking invitation rows. The connection-end trigger takes wedding and 1C
-- invitation locks, so this order agrees with the lifecycle RPCs and wedding
-- commercial updates.
create or replace function public.collaboration_before_user_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.collaboration_invitations%rowtype; c public.collaboration_connections%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ourwed:wedding-extra-mutation',0));
  for c in select * from public.collaboration_connections x
    where x.status='active' and old.id in (x.participant_low_id,x.participant_high_id)
    order by x.id for update
  loop
    update public.collaboration_connections set status='ended',ended_at=timezone('utc',now()),
      updated_at=timezone('utc',now()) where id=c.id;
    insert into public.collaboration_events(connection_id,actor_user_id,actor_name_snapshot,event_type,metadata)
      values(c.id,old.id,coalesce(nullif(btrim(old.name),''),'Użytkownik'),'collaboration_ended',
        jsonb_build_object('reason','account_deleted'));
  end loop;
  for r in select * from public.collaboration_invitations i
    where i.status='pending' and old.id in (i.inviter_user_id,i.invitee_user_id)
    order by i.id for update
  loop
    update public.collaboration_invitations set status='cancelled',
      responded_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=r.id;
    insert into public.collaboration_events(invitation_id,actor_user_id,actor_name_snapshot,event_type,metadata)
      values(r.id,old.id,coalesce(nullif(btrim(old.name),''),'Użytkownik'),'collaboration_invite_cancelled',
        jsonb_build_object('reason','account_deleted'));
  end loop;
  return old;
end; $$;

create function public.wedding_collaboration_before_user_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare i public.wedding_collaboration_invitations%rowtype; m public.wedding_collaboration_memberships%rowtype;
  r record;
begin
  -- The 1B deletion hook has already ended this user's global connections.
  -- Lock owned weddings before 1C invitation rows so an owner deletion cannot
  -- hold an invite while waiting on a concurrent commercial terms update.
  for r in select w.id from public.weddings w where w.user_id=old.id order by w.id for update
  loop
    null;
  end loop;
  for i in select * from public.wedding_collaboration_invitations x
    where x.status='pending' and old.id in (x.owner_user_id,x.invitee_user_id)
    order by x.wedding_id,x.id for update
  loop
    update public.wedding_collaboration_invitations set status='cancelled',reason='account_deleted',
      cancelled_at=timezone('utc',now()),updated_at=timezone('utc',now()),
      couple_first_name_snapshot=null,couple_second_name_snapshot=null,wedding_date_snapshot=null,
      package_label_snapshot=null,contract_value_snapshot=null,terms_snapshot='{}'::jsonb,extras_snapshot='[]'::jsonb
      where id=i.id;
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,
      actor_user_id,event_type,reason,metadata)
    values (i.wedding_id,i.wedding_id_snapshot,i.id,old.id,'invitation_cancelled','account_deleted','{"system":true}'::jsonb);
  end loop;
  for m in select * from public.wedding_collaboration_memberships x
    where x.status='active' and (x.member_user_id=old.id or x.owner_user_id=old.id)
    order by x.wedding_id,x.id for update
  loop
    if m.member_user_id=old.id then
      update public.wedding_collaboration_memberships set status='left',left_at=timezone('utc',now()),
        updated_at=timezone('utc',now()) where id=m.id;
      insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,membership_id,
        actor_user_id,event_type,reason,metadata)
      values (m.wedding_id,m.wedding_id_snapshot,m.id,old.id,'membership_left','account_deleted','{"system":true,"subject":"member"}'::jsonb);
    else
      update public.wedding_collaboration_memberships set status='revoked',revoked_at=timezone('utc',now()),
        updated_at=timezone('utc',now()) where id=m.id;
      insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,membership_id,
        actor_user_id,event_type,reason,metadata)
      values (m.wedding_id,m.wedding_id_snapshot,m.id,null,'membership_revoked','account_deleted','{"system":true,"subject":"owner"}'::jsonb);
    end if;
  end loop;
  -- Redact live identity FKs inside BEFORE DELETE. Owned-wedding cascade
  -- triggers run after the public.users row is removed and must not update
  -- rows that still reference the deleted owner.
  update public.wedding_collaboration_invitations set owner_user_id=null,
    invitee_user_id=null,
    couple_first_name_snapshot=null,
    couple_second_name_snapshot=null,wedding_date_snapshot=null,package_label_snapshot=null,
    contract_value_snapshot=null,terms_snapshot='{}'::jsonb,extras_snapshot='[]'::jsonb
  where old.id in (owner_user_id,invitee_user_id);
  update public.wedding_collaboration_memberships set owner_user_id=null,member_user_id=null
    where old.id in (owner_user_id,member_user_id);
  update public.wedding_collaboration_events set actor_user_id=null where actor_user_id=old.id;
  return old;
end; $$;
create trigger wedding_collaboration_before_user_delete
  before delete on public.users for each row execute function public.wedding_collaboration_before_user_delete();

create function public.create_wedding_collaboration_invite(
  p_wedding_id uuid,p_invitee_user_id uuid,p_proposed_share_amount numeric,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_wedding public.weddings%rowtype;
  v_connection public.collaboration_connections%rowtype; v_existing public.wedding_collaboration_invitations%rowtype;
  v_invite public.wedding_collaboration_invitations%rowtype; v_event public.wedding_collaboration_events%rowtype;
  v_extras jsonb; v_request jsonb;
begin
  if v_actor is null or p_idempotency_key is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_invitee_user_id is null or p_invitee_user_id=v_actor then raise exception 'invalid_invitee' using errcode='P0001'; end if;
  if p_proposed_share_amount is not null and p_proposed_share_amount<0 then raise exception 'invalid_share_amount' using errcode='22003'; end if;
  v_request := jsonb_build_object('wedding_id',p_wedding_id,
    'invitee_user_id',p_invitee_user_id,'proposed_share_amount',p_proposed_share_amount);
  select * into v_event from public.wedding_collaboration_events e where e.actor_user_id=v_actor and e.idempotency_key=p_idempotency_key;
  if found then
    if v_event.event_type<>'invitation_created' or v_event.metadata->'request' is distinct from v_request then
      raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    return jsonb_build_object('status','created','invitation_id',v_event.invitation_id,'duplicate',true);
  end if;
  if not public.wedding_collaboration_lock_users(array[v_actor,p_invitee_user_id]) then
    raise exception 'invitee_unavailable' using errcode='P0001';
  end if;
  if not public.wedding_collaboration_actor_is_eligible(v_actor) then raise exception 'unauthorized' using errcode='42501'; end if;
  -- Another invocation using this key may have completed while this call waited
  -- for the participant rows. Recheck before taking connection/wedding locks.
  select * into v_event from public.wedding_collaboration_events e where e.actor_user_id=v_actor and e.idempotency_key=p_idempotency_key;
  if found then
    if v_event.event_type<>'invitation_created' or v_event.metadata->'request' is distinct from v_request then
      raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    return jsonb_build_object('status','created','invitation_id',v_event.invitation_id,'duplicate',true);
  end if;
  select * into v_connection from public.collaboration_connections c
    where c.status='active' and ((c.participant_low_id=v_actor and c.participant_high_id=p_invitee_user_id)
      or (c.participant_high_id=v_actor and c.participant_low_id=p_invitee_user_id)) for update;
  if not found then raise exception 'active_connection_required' using errcode='P0001'; end if;
  select * into v_wedding from public.weddings w where w.id=p_wedding_id and w.user_id=v_actor for update;
  if not found then raise exception 'wedding_unavailable' using errcode='42501'; end if;
  if exists(select 1 from public.wedding_collaboration_memberships m where m.wedding_id=p_wedding_id
      and m.member_user_id=p_invitee_user_id and m.status='active') then raise exception 'active_membership_exists' using errcode='P0001'; end if;
  if exists(select 1 from public.wedding_collaboration_invitations i where i.wedding_id=p_wedding_id
      and i.invitee_user_id=p_invitee_user_id and i.status='pending') then raise exception 'pending_invitation_exists' using errcode='P0001'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'extra_service_id',x.extra_service_id,
    'name',x.name_snapshot,'price',x.price_snapshot,'quantity',x.quantity) order by x.id),'[]'::jsonb)
    into v_extras from public.wedding_extra_services x where x.wedding_id=p_wedding_id;
  insert into public.wedding_collaboration_invitations(wedding_id,wedding_id_snapshot,owner_user_id,
    invitee_user_id,source_connection_id,terms_version,couple_first_name_snapshot,couple_second_name_snapshot,
    wedding_date_snapshot,package_label_snapshot,contract_value_snapshot,currency_snapshot,
    proposed_share_amount,terms_snapshot,extras_snapshot,idempotency_key)
  values(p_wedding_id,p_wedding_id,v_actor,p_invitee_user_id,v_connection.id,v_wedding.collaboration_terms_version,
    v_wedding.bride_name,v_wedding.groom_name,v_wedding.wedding_date,v_wedding.package_name,
    v_wedding.contract_value,v_wedding.currency,p_proposed_share_amount,
    jsonb_build_object('deposit_amount',v_wedding.deposit_amount,'package_id',v_wedding.package_id,
      'package_items_snapshot',v_wedding.package_items_snapshot,'selected_package_ids',v_wedding.selected_package_ids,
      'final_payment_terms',v_wedding.final_payment_terms,'final_payment_due_date',v_wedding.final_payment_due_date,
      'coverage_hours',v_wedding.coverage_hours,'coverage_end_time',v_wedding.coverage_end_time,
      'overtime_rate',v_wedding.overtime_rate,'delivery_months',v_wedding.delivery_months,
      'delivery_days',v_wedding.delivery_days,'delivery_due_date',v_wedding.delivery_due_date,
      'travel_fee_status',v_wedding.travel_fee_status,
      'travel_fee_amount',v_wedding.travel_fee_amount,'travel_fee_free_km_snapshot',v_wedding.travel_fee_free_km_snapshot,
      'travel_fee_route_distance_m_snapshot',v_wedding.travel_fee_route_distance_m_snapshot),v_extras,p_idempotency_key) returning * into v_invite;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,
    actor_user_id,event_type,idempotency_key,metadata)
  values(p_wedding_id,p_wedding_id,v_invite.id,v_actor,'invitation_created',p_idempotency_key,
    jsonb_build_object('request',v_request));
  return jsonb_build_object('status','created','invitation_id',v_invite.id,'duplicate',false);
end; $$;

create function public.accept_wedding_collaboration_invite(p_invitation_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_peek public.wedding_collaboration_invitations%rowtype;
  v_connection public.collaboration_connections%rowtype; v_wedding public.weddings%rowtype;
  v_invite public.wedding_collaboration_invitations%rowtype; v_event public.wedding_collaboration_events%rowtype;
  v_membership public.wedding_collaboration_memberships%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into v_peek from public.wedding_collaboration_invitations where id=p_invitation_id;
  if not found or v_peek.invitee_user_id<>v_actor then raise exception 'invitation_unavailable' using errcode='P0001'; end if;
  if not public.wedding_collaboration_lock_users(array[v_peek.owner_user_id,v_actor])
    or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception 'invitation_unavailable' using errcode='P0001';
  end if;
  select * into v_event from public.wedding_collaboration_events e where e.actor_user_id=v_actor and e.idempotency_key=p_idempotency_key;
  if found then
    if v_event.invitation_id<>p_invitation_id or v_event.event_type not in
      ('invitation_accepted','invitation_expired','invitation_superseded','invitation_cancelled') then
      raise exception 'idempotency_key_reused' using errcode='P0001'; end if;
    if v_event.event_type='invitation_accepted' and not exists (
      select 1 from public.wedding_collaboration_invitations i
      join public.wedding_collaboration_memberships m
        on m.id=v_event.membership_id and m.accepted_invitation_id=i.id
      where i.id=p_invitation_id and i.invitee_user_id=v_actor and i.status='accepted'
        and m.member_user_id=v_actor
    ) then
      raise exception 'invitation_unavailable' using errcode='P0001';
    end if;
    return jsonb_build_object('status',case v_event.event_type when 'invitation_accepted' then 'accepted'
      when 'invitation_expired' then 'expired' when 'invitation_superseded' then 'superseded' else 'unavailable' end,
      'membership_id',v_event.membership_id,'duplicate',true);
  end if;
  if v_peek.status<>'pending' then raise exception 'invitation_unavailable' using errcode='P0001'; end if;
  select * into v_connection from public.collaboration_connections where id=v_peek.source_connection_id for update;
  select * into v_wedding from public.weddings where id=v_peek.wedding_id for update;
  select * into v_invite from public.wedding_collaboration_invitations where id=p_invitation_id for update;
  if not found then raise exception 'invitation_unavailable' using errcode='P0001'; end if;
  -- A concurrent replay can pass the initial event lookup before the winning
  -- transaction commits, then wait on the connection/wedding/invitation locks.
  -- Once it wakes, return the already-created period instead of reporting a
  -- spurious unavailable result or attempting a second membership insert.
  if v_invite.status='accepted' and v_invite.invitee_user_id=v_actor then
    select * into v_membership from public.wedding_collaboration_memberships m
      where m.accepted_invitation_id=v_invite.id and m.member_user_id=v_actor;
    if found then
      return jsonb_build_object('status','accepted','membership_id',v_membership.id,'duplicate',true);
    end if;
  end if;
  if v_invite.status<>'pending' then raise exception 'invitation_unavailable' using errcode='P0001'; end if;
  if v_wedding.id is null or v_wedding.user_id is distinct from v_invite.owner_user_id then
    update public.wedding_collaboration_invitations set status='cancelled',reason='wedding_deleted',
      cancelled_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_invite.id;
    insert into public.wedding_collaboration_events(wedding_id_snapshot,invitation_id,actor_user_id,event_type,reason)
      values(v_invite.wedding_id_snapshot,v_invite.id,v_actor,'invitation_cancelled','wedding_deleted');
    return jsonb_build_object('status','unavailable');
  end if;
  if v_invite.expires_at<=timezone('utc',now()) then
    update public.wedding_collaboration_invitations set status='expired',reason='expired',expired_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_invite.id;
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,actor_user_id,event_type,reason,idempotency_key)
      values(v_wedding.id,v_wedding.id,v_invite.id,v_actor,'invitation_expired','expired',p_idempotency_key);
    return jsonb_build_object('status','expired');
  end if;
  if v_invite.terms_version<>v_wedding.collaboration_terms_version then
    update public.wedding_collaboration_invitations set status='superseded',reason='commercial_terms_changed',superseded_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_invite.id;
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,actor_user_id,event_type,reason,idempotency_key)
      values(v_wedding.id,v_wedding.id,v_invite.id,v_actor,'invitation_superseded','commercial_terms_changed',p_idempotency_key);
    return jsonb_build_object('status','superseded');
  end if;
  if v_connection.id is null or v_connection.status<>'active'
     or v_actor not in(v_connection.participant_low_id,v_connection.participant_high_id)
     or v_invite.owner_user_id not in(v_connection.participant_low_id,v_connection.participant_high_id) then
    update public.wedding_collaboration_invitations set status='cancelled',reason='global_connection_ended',cancelled_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_invite.id;
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,actor_user_id,event_type,reason,idempotency_key,metadata)
      values(v_wedding.id,v_wedding.id,v_invite.id,v_actor,'invitation_cancelled','global_connection_ended',p_idempotency_key,'{"system":true}'::jsonb);
    return jsonb_build_object('status','unavailable');
  end if;
  update public.wedding_collaboration_invitations set status='accepted',accepted_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_invite.id;
  insert into public.wedding_collaboration_memberships(wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,
    accepted_invitation_id,status,accepted_at)
  values(v_wedding.id,v_wedding.id,v_invite.owner_user_id,v_actor,v_invite.id,'active',timezone('utc',now())) returning * into v_membership;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,membership_id,
    actor_user_id,event_type,idempotency_key,metadata)
  values(v_wedding.id,v_wedding.id,v_invite.id,v_membership.id,v_actor,'invitation_accepted',p_idempotency_key,
    jsonb_build_object('proposed_share_amount',v_invite.proposed_share_amount,'currency',v_invite.currency_snapshot));
  return jsonb_build_object('status','accepted','membership_id',v_membership.id,'duplicate',false);
end; $$;

create function public.decline_wedding_collaboration_invite(p_invitation_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_i public.wedding_collaboration_invitations%rowtype; v_e public.wedding_collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not public.wedding_collaboration_lock_users(array[v_actor])
    or not public.wedding_collaboration_actor_is_eligible(v_actor) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into v_e from public.wedding_collaboration_events where actor_user_id=v_actor and idempotency_key=p_idempotency_key;
  if found then if v_e.event_type<>'invitation_declined' or v_e.invitation_id<>p_invitation_id then raise exception 'idempotency_key_reused' using errcode='P0001'; end if; return jsonb_build_object('status','declined','duplicate',true); end if;
  select * into v_i from public.wedding_collaboration_invitations where id=p_invitation_id for update;
  if not found or v_i.invitee_user_id<>v_actor then raise exception 'invitation_unavailable' using errcode='P0001'; end if;
  if v_i.status='declined' then return jsonb_build_object('status','declined','duplicate',true); end if;
  if v_i.status<>'pending' then raise exception 'invitation_unavailable' using errcode='P0001'; end if;
  update public.wedding_collaboration_invitations set status='declined',declined_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_i.id;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,actor_user_id,event_type,idempotency_key)
    values(v_i.wedding_id,v_i.wedding_id_snapshot,v_i.id,v_actor,'invitation_declined',p_idempotency_key);
  return jsonb_build_object('status','declined','duplicate',false);
end; $$;

create function public.cancel_wedding_collaboration_invite(p_invitation_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_i public.wedding_collaboration_invitations%rowtype; v_e public.wedding_collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not public.wedding_collaboration_lock_users(array[v_actor])
    or not public.wedding_collaboration_actor_is_eligible(v_actor) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into v_e from public.wedding_collaboration_events where actor_user_id=v_actor and idempotency_key=p_idempotency_key;
  if found then if v_e.event_type<>'invitation_cancelled' or v_e.invitation_id<>p_invitation_id then raise exception 'idempotency_key_reused' using errcode='P0001'; end if; return jsonb_build_object('status','cancelled','duplicate',true); end if;
  select * into v_i from public.wedding_collaboration_invitations where id=p_invitation_id for update;
  if not found or v_i.owner_user_id<>v_actor or v_i.status<>'pending' then raise exception 'invitation_unavailable' using errcode='P0001'; end if;
  update public.wedding_collaboration_invitations set status='cancelled',reason='owner_cancelled',cancelled_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_i.id;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,actor_user_id,event_type,reason,idempotency_key)
    values(v_i.wedding_id,v_i.wedding_id_snapshot,v_i.id,v_actor,'invitation_cancelled','owner_cancelled',p_idempotency_key);
  return jsonb_build_object('status','cancelled','duplicate',false);
end; $$;

create function public.revoke_wedding_collaboration_membership(p_membership_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_m public.wedding_collaboration_memberships%rowtype; v_e public.wedding_collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not public.wedding_collaboration_lock_users(array[v_actor])
    or not public.wedding_collaboration_actor_is_eligible(v_actor) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into v_e from public.wedding_collaboration_events where actor_user_id=v_actor and idempotency_key=p_idempotency_key;
  if found then if v_e.event_type<>'membership_revoked' or v_e.membership_id<>p_membership_id then raise exception 'idempotency_key_reused' using errcode='P0001'; end if; return jsonb_build_object('status','revoked','duplicate',true); end if;
  select * into v_m from public.wedding_collaboration_memberships where id=p_membership_id for update;
  if not found or v_m.owner_user_id<>v_actor or v_m.status<>'active' then raise exception 'membership_unavailable' using errcode='P0001'; end if;
  update public.wedding_collaboration_memberships set status='revoked',revoked_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_m.id;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,membership_id,actor_user_id,event_type,idempotency_key)
    values(v_m.wedding_id,v_m.wedding_id_snapshot,v_m.id,v_actor,'membership_revoked',p_idempotency_key);
  return jsonb_build_object('status','revoked','duplicate',false);
end; $$;

create function public.leave_wedding_collaboration(p_membership_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_m public.wedding_collaboration_memberships%rowtype; v_e public.wedding_collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not public.wedding_collaboration_lock_users(array[v_actor])
    or not public.wedding_collaboration_actor_is_eligible(v_actor) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into v_e from public.wedding_collaboration_events where actor_user_id=v_actor and idempotency_key=p_idempotency_key;
  if found then if v_e.event_type<>'membership_left' or v_e.membership_id<>p_membership_id then raise exception 'idempotency_key_reused' using errcode='P0001'; end if; return jsonb_build_object('status','left','duplicate',true); end if;
  select * into v_m from public.wedding_collaboration_memberships where id=p_membership_id for update;
  if not found or v_m.member_user_id<>v_actor or v_m.status<>'active' then raise exception 'membership_unavailable' using errcode='P0001'; end if;
  update public.wedding_collaboration_memberships set status='left',left_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_m.id;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,membership_id,actor_user_id,event_type,idempotency_key)
    values(v_m.wedding_id,v_m.wedding_id_snapshot,v_m.id,v_actor,'membership_left',p_idempotency_key);
  return jsonb_build_object('status','left','duplicate',false);
end; $$;

revoke all on function public.wedding_collaboration_events_fk_nulling_only() from public,anon,authenticated;
revoke all on function public.wedding_collaboration_membership_invitation_guard() from public,anon,authenticated;
revoke all on function public.wedding_collaboration_actor_is_eligible(uuid) from public,anon,authenticated;
revoke all on function public.wedding_collaboration_lock_users(uuid[]) from public,anon,authenticated;
revoke all on function public.wedding_collaboration_lock_extra_wedding() from public,anon,authenticated;
revoke all on function public.wedding_collaboration_extra_mutation_statement_lock() from public,anon,authenticated;
revoke all on function public.wedding_collaboration_terms_before_update() from public,anon,authenticated;
revoke all on function public.wedding_collaboration_terms_after_update() from public,anon,authenticated;
revoke all on function public.wedding_collaboration_extra_terms_changed() from public,anon,authenticated;
revoke all on function public.wedding_collaboration_connection_ended() from public,anon,authenticated;
revoke all on function public.wedding_collaboration_before_delete() from public,anon,authenticated;
revoke all on function public.wedding_collaboration_before_user_delete() from public,anon,authenticated;
revoke all on function public.create_wedding_collaboration_invite(uuid,uuid,numeric,uuid) from public,anon;
revoke all on function public.accept_wedding_collaboration_invite(uuid,uuid) from public,anon;
revoke all on function public.decline_wedding_collaboration_invite(uuid,uuid) from public,anon;
revoke all on function public.cancel_wedding_collaboration_invite(uuid,uuid) from public,anon;
revoke all on function public.revoke_wedding_collaboration_membership(uuid,uuid) from public,anon;
revoke all on function public.leave_wedding_collaboration(uuid,uuid) from public,anon;
grant execute on function public.create_wedding_collaboration_invite(uuid,uuid,numeric,uuid) to authenticated;
grant execute on function public.accept_wedding_collaboration_invite(uuid,uuid) to authenticated;
grant execute on function public.decline_wedding_collaboration_invite(uuid,uuid) to authenticated;
grant execute on function public.cancel_wedding_collaboration_invite(uuid,uuid) to authenticated;
grant execute on function public.revoke_wedding_collaboration_membership(uuid,uuid) to authenticated;
grant execute on function public.leave_wedding_collaboration(uuid,uuid) to authenticated;

commit;
