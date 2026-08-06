-- =============================================================================
-- Admin Phase 1 — single-owner authentication foundation
-- =============================================================================
-- Tables: admin_members, admin_audit_log
-- Invariant: at most one enabled owner
-- Safe RPC: get_admin_session_status() — boolean/minimal only
-- =============================================================================

create table if not exists public.admin_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'owner',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users (id) on delete set null,
  last_access_at timestamptz null,
  constraint admin_members_role_owner_chk check (role = 'owner')
);

comment on table public.admin_members is
  'Platform administrators. Phase 1 allows exactly one enabled owner.';

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  action text not null,
  target_type text null,
  target_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);

create index if not exists admin_audit_log_admin_user_id_idx
  on public.admin_audit_log (admin_user_id);

comment on table public.admin_audit_log is
  'Append-only admin audit events. Clients cannot insert arbitrary rows.';

-- ---------------------------------------------------------------------------
-- Single enabled-owner invariant (database-enforced)
-- ---------------------------------------------------------------------------

create or replace function public.admin_members_enforce_single_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
begin
  if tg_op = 'INSERT' then
    if new.enabled is true then
      select count(*)::integer into active_count
      from public.admin_members
      where enabled = true;

      if active_count >= 1 then
        raise exception 'admin_members_single_owner: only one enabled administrator is allowed'
          using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.enabled is true and (old.enabled is distinct from true) then
      select count(*)::integer into active_count
      from public.admin_members
      where enabled = true
        and user_id <> new.user_id;

      if active_count >= 1 then
        raise exception 'admin_members_single_owner: only one enabled administrator is allowed'
          using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists admin_members_single_owner_trg on public.admin_members;
create trigger admin_members_single_owner_trg
  before insert or update of enabled on public.admin_members
  for each row
  execute function public.admin_members_enforce_single_owner();

-- ---------------------------------------------------------------------------
-- RLS — deny direct client access to admin tables
-- ---------------------------------------------------------------------------

alter table public.admin_members enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on table public.admin_members from anon, authenticated;
revoke all on table public.admin_audit_log from anon, authenticated;

-- Own membership row only (no peer listing; no email column on this table).
create policy admin_members_self_select
  on public.admin_members
  for select
  to authenticated
  using (user_id = auth.uid());

grant select on table public.admin_members to authenticated;

-- No insert/update/delete policies for authenticated → denied.

-- ---------------------------------------------------------------------------
-- Minimal self-check (security definer) — never returns other admins / emails
-- ---------------------------------------------------------------------------

create or replace function public.get_admin_session_status()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
  member public.admin_members%rowtype;
begin
  if uid is null then
    return jsonb_build_object(
      'isAdmin', false,
      'enabled', false,
      'role', null
    );
  end if;

  select * into member
  from public.admin_members
  where user_id = uid;

  if not found then
    return jsonb_build_object(
      'isAdmin', false,
      'enabled', false,
      'role', null
    );
  end if;

  return jsonb_build_object(
    'isAdmin', true,
    'enabled', member.enabled,
    'role', case when member.role = 'owner' then 'owner' else null end
  );
end;
$$;

revoke all on function public.get_admin_session_status() from public;
grant execute on function public.get_admin_session_status() to authenticated;

comment on function public.get_admin_session_status() is
  'Returns {isAdmin, enabled, role} for auth.uid() only. No emails, no peer admins.';

-- ---------------------------------------------------------------------------
-- Audit append — authenticated enabled owner only; no arbitrary admin_user_id
-- ---------------------------------------------------------------------------

create or replace function public.append_admin_audit_event(
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  is_ok boolean := false;
  new_id uuid;
  safe_meta jsonb;
begin
  if uid is null then
    raise exception 'append_admin_audit_event: not authenticated'
      using errcode = '42501';
  end if;

  if p_action is null or length(trim(p_action)) = 0 then
    raise exception 'append_admin_audit_event: action required'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.admin_members m
    where m.user_id = uid
      and m.enabled = true
      and m.role = 'owner'
  ) into is_ok;

  if not is_ok then
    raise exception 'append_admin_audit_event: not an enabled owner'
      using errcode = '42501';
  end if;

  -- Strip obviously sensitive keys if a client ever sends them.
  safe_meta := coalesce(p_metadata, '{}'::jsonb)
    - 'password'
    - 'totp'
    - 'secret'
    - 'token'
    - 'access_token'
    - 'refresh_token'
    - 'service_role'
    - 'service_key';

  insert into public.admin_audit_log (
    admin_user_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    uid,
    left(trim(p_action), 120),
    p_target_type,
    p_target_id,
    safe_meta
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.append_admin_audit_event(text, text, text, jsonb) from public;
grant execute on function public.append_admin_audit_event(text, text, text, jsonb) to authenticated;

-- Owner may read own audit rows (no peer expansion in Phase 1).
create policy admin_audit_log_owner_select
  on public.admin_audit_log
  for select
  to authenticated
  using (
    admin_user_id = auth.uid()
    and exists (
      select 1
      from public.admin_members m
      where m.user_id = auth.uid()
        and m.enabled = true
        and m.role = 'owner'
    )
  );

grant select on table public.admin_audit_log to authenticated;
