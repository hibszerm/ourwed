-- =============================================================================
-- Admin Phase 2 — full account email + current profile name for owner view
-- Sources:
--   email: auth.users.email
--   name:  public.profiles.first_name / last_name (priority),
--          then auth.users.raw_user_meta_data first_name/last_name/name
-- =============================================================================

-- Narrow composition helper — no Auth table access; not granted to clients.
create or replace function public.admin_compose_account_identity(
  p_email text,
  p_profile_first text,
  p_profile_last text,
  p_meta jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  pf text := nullif(trim(coalesce(p_profile_first, '')), '');
  pl text := nullif(trim(coalesce(p_profile_last, '')), '');
  mf text := nullif(trim(coalesce(p_meta ->> 'first_name', '')), '');
  ml text := nullif(trim(coalesce(p_meta ->> 'last_name', '')), '');
  mn text := nullif(trim(coalesce(p_meta ->> 'name', '')), '');
  first_name text;
  last_name text;
  display_name text;
  profile_source text;
begin
  if pf is not null or pl is not null then
    first_name := pf;
    last_name := pl;
    profile_source := 'profile';
  elsif mf is not null or ml is not null then
    first_name := mf;
    last_name := ml;
    profile_source := 'auth_metadata';
  elsif mn is not null then
    -- Combined metadata name only: do not invent first/last split beyond first token.
    first_name := nullif(split_part(mn, ' ', 1), '');
    last_name := nullif(trim(substr(mn, length(split_part(mn, ' ', 1)) + 1)), '');
    profile_source := 'auth_metadata';
  else
    first_name := null;
    last_name := null;
    profile_source := 'none';
  end if;

  display_name := nullif(trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '');
  if display_name is null and profile_source = 'auth_metadata' then
    display_name := mn;
  end if;

  return jsonb_build_object(
    'email', nullif(trim(coalesce(p_email, '')), ''),
    'firstName', first_name,
    'lastName', last_name,
    'displayName', display_name,
    'profileSource', profile_source
  );
end;
$$;

revoke all on function public.admin_compose_account_identity(text, text, text, jsonb)
  from public, anon, authenticated;

create or replace function public.admin_list_users(
  p_limit integer default 25,
  p_offset integer default 0,
  p_search text default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
  lim integer := greatest(1, least(coalesce(p_limit, 25), 100));
  off integer := greatest(0, coalesce(p_offset, 0));
  result jsonb;
  q text := nullif(trim(coalesce(p_search, '')), '');
  q_lower text;
begin
  _uid := public.assert_admin_owner_aal2();
  q_lower := lower(q);

  with base as (
    select
      u.id,
      u.email,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at,
      u.banned_until,
      public.admin_compose_account_identity(
        u.email,
        p.first_name,
        p.last_name,
        u.raw_user_meta_data
      ) as identity,
      (select count(*)::bigint from public.weddings w where w.user_id = u.id) as weddings_count,
      (select count(*)::bigint from public.sessions s where s.user_id = u.id) as sessions_count,
      (
        select count(*)::bigint
        from public.wedding_documents d
        join public.weddings w on w.id = d.wedding_id
        where w.user_id = u.id
      ) as documents_count,
      (
        select count(*)::bigint
        from public.calendar_integrations ci
        where ci.user_id = u.id and ci.enabled = true
      ) as integrations_count
    from auth.users u
    left join public.profiles p on p.id = u.id
  ),
  enriched as (
    select
      b.*,
      b.identity ->> 'email' as id_email,
      b.identity ->> 'firstName' as id_first,
      b.identity ->> 'lastName' as id_last,
      b.identity ->> 'displayName' as id_display,
      b.identity ->> 'profileSource' as id_source
    from base b
  ),
  filtered as (
    select *
    from enriched e
    where (
      q is null
      or e.id::text = q
      or lower(coalesce(e.id_email, '')) = q_lower
      or lower(coalesce(e.id_email, '')) like '%' || q_lower || '%'
      or lower(coalesce(e.id_first, '')) like '%' || q_lower || '%'
      or lower(coalesce(e.id_last, '')) like '%' || q_lower || '%'
      or lower(coalesce(e.id_display, '')) like '%' || q_lower || '%'
    )
    and (
      p_status is null
      or (
        p_status = 'active'
        and e.email_confirmed_at is not null
        and (e.banned_until is null or e.banned_until < now())
        and e.last_sign_in_at is not null
      )
      or (
        p_status = 'unconfirmed'
        and e.email_confirmed_at is null
      )
      or (
        p_status = 'banned'
        and e.banned_until is not null
        and e.banned_until > now()
      )
      or (
        p_status = 'inactive'
        and e.email_confirmed_at is not null
        and (e.banned_until is null or e.banned_until < now())
        and (e.last_sign_in_at is null or e.last_sign_in_at < now() - interval '90 days')
      )
    )
  ),
  counted as (
    select count(*)::bigint as total from filtered
  ),
  page as (
    select
      f.id as "userId",
      f.id_email as email,
      f.id_first as "firstName",
      f.id_last as "lastName",
      f.id_display as "displayName",
      f.id_source as "profileSource",
      left(f.id::text, 8) as "shortId",
      case
        when f.banned_until is not null and f.banned_until > now() then 'banned'
        when f.email_confirmed_at is null then 'unconfirmed'
        when f.last_sign_in_at is null
          or f.last_sign_in_at < now() - interval '90 days' then 'inactive'
        else 'active'
      end as status,
      f.created_at as "createdAt",
      f.last_sign_in_at as "lastSignInAt",
      f.weddings_count as weddings,
      f.sessions_count as sessions,
      f.documents_count as documents,
      f.integrations_count as integrations
    from filtered f
    order by f.created_at desc
    limit lim offset off
  )
  select jsonb_build_object(
    'total', (select total from counted),
    'limit', lim,
    'offset', off,
    'rows', coalesce(
      (
        select jsonb_agg(to_jsonb(p) order by p."createdAt" desc)
        from page p
      ),
      '[]'::jsonb
    ),
    'updatedAt', now()
  )
  into result;

  return result;
end;
$$;

revoke all on function public.admin_list_users(integer, integer, text, text) from public, anon;
grant execute on function public.admin_list_users(integer, integer, text, text) to authenticated;

create or replace function public.admin_get_user_summary(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
  u_id uuid;
  u_email text;
  u_created_at timestamptz;
  u_email_confirmed_at timestamptz;
  u_last_sign_in_at timestamptz;
  u_banned_until timestamptz;
  u_meta jsonb;
  p_first text;
  p_last text;
  identity jsonb;
begin
  _uid := public.assert_admin_owner_aal2();

  select
    au.id,
    au.email,
    au.created_at,
    au.email_confirmed_at,
    au.last_sign_in_at,
    au.banned_until,
    au.raw_user_meta_data,
    pr.first_name,
    pr.last_name
  into
    u_id,
    u_email,
    u_created_at,
    u_email_confirmed_at,
    u_last_sign_in_at,
    u_banned_until,
    u_meta,
    p_first,
    p_last
  from auth.users au
  left join public.profiles pr on pr.id = au.id
  where au.id = p_user_id;

  if u_id is null then
    raise exception 'admin_user_not_found' using errcode = 'P0002';
  end if;

  identity := public.admin_compose_account_identity(u_email, p_first, p_last, u_meta);

  return jsonb_build_object(
    'userId', u_id,
    'email', identity ->> 'email',
    'firstName', identity ->> 'firstName',
    'lastName', identity ->> 'lastName',
    'displayName', identity ->> 'displayName',
    'profileSource', identity ->> 'profileSource',
    'shortId', left(u_id::text, 8),
    'createdAt', u_created_at,
    'emailConfirmed', u_email_confirmed_at is not null,
    'emailConfirmedAt', u_email_confirmed_at,
    'lastSignInAt', u_last_sign_in_at,
    'bannedUntil', u_banned_until,
    'mfaFactors', (
      select count(*)::bigint
      from auth.mfa_factors mf
      where mf.user_id = u_id and mf.status = 'verified'
    ),
    'usage', jsonb_build_object(
      'weddings', (select count(*)::bigint from public.weddings w where w.user_id = u_id),
      'sessions', (select count(*)::bigint from public.sessions s where s.user_id = u_id),
      'documents', (
        select count(*)::bigint
        from public.wedding_documents d
        join public.weddings w on w.id = d.wedding_id
        where w.user_id = u_id
      ),
      'questionnaires', (
        (
          select count(*)::bigint
          from public.form_instances fi
          join public.weddings w on w.id = fi.wedding_id
          where w.user_id = u_id
        )
        + (
          select count(*)::bigint
          from public.wedding_questionnaires wq
          where wq.owner_id = u_id
        )
      ),
      'payments', (
        select count(*)::bigint
        from public.payments pay
        join public.weddings w on w.id = pay.wedding_id
        where w.user_id = u_id
      ),
      'calendarIntegrations', (
        select count(*)::bigint
        from public.calendar_integrations ci
        where ci.user_id = u_id
      )
    ),
    'integrations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'provider', ci.provider,
        'enabled', ci.enabled,
        'lastSyncAt', ci.last_sync_at,
        'lastErrorCode', ci.last_error_code,
        'lastErrorAt', ci.last_error_at,
        'googleConnected', ci.google_connected_at is not null and ci.google_revoked_at is null
      )), '[]'::jsonb)
      from public.calendar_integrations ci
      where ci.user_id = u_id
    ),
    'lookedUpAt', now()
  );
end;
$$;

revoke all on function public.admin_get_user_summary(uuid) from public, anon;
grant execute on function public.admin_get_user_summary(uuid) to authenticated;

-- Support search on profiles (partial name). auth.users email indexes are platform-managed.
create index if not exists profiles_first_name_lower_idx
  on public.profiles (lower(first_name));

create index if not exists profiles_last_name_lower_idx
  on public.profiles (lower(last_name));

notify pgrst, 'reload schema';
