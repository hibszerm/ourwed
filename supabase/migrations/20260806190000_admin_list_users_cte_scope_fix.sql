-- =============================================================================
-- Admin Phase 2 — fix 42P01 in admin_list_users (CTE scope)
-- Exact failure: relation "filtered" does not exist
-- Cause: WITH … filtered AS (…) SELECT count INTO total; then a second SELECT
--        referenced filtered — CTEs are statement-scoped in PostgreSQL.
-- =============================================================================

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
begin
  _uid := public.assert_admin_owner_aal2();

  -- Single statement so CTEs remain in scope for both total and page rows.
  with base as (
    select
      u.id,
      u.email,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at,
      u.banned_until,
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
  ),
  filtered as (
    select *
    from base b
    where (
      q is null
      or lower(b.email) = lower(q)
      or b.id::text = q
    )
    and (
      p_status is null
      or (
        p_status = 'active'
        and b.email_confirmed_at is not null
        and (b.banned_until is null or b.banned_until < now())
        and b.last_sign_in_at is not null
      )
      or (
        p_status = 'unconfirmed'
        and b.email_confirmed_at is null
      )
      or (
        p_status = 'banned'
        and b.banned_until is not null
        and b.banned_until > now()
      )
      or (
        p_status = 'inactive'
        and b.email_confirmed_at is not null
        and (b.banned_until is null or b.banned_until < now())
        and (b.last_sign_in_at is null or b.last_sign_in_at < now() - interval '90 days')
      )
    )
  ),
  counted as (
    select count(*)::bigint as total from filtered
  ),
  page as (
    select
      f.id as "userId",
      public.admin_mask_email(f.email) as "maskedEmail",
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

-- Harden user summary: same schema-qualified sources; avoid %rowtype auth dependency pitfalls
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
begin
  _uid := public.assert_admin_owner_aal2();

  select
    au.id,
    au.email,
    au.created_at,
    au.email_confirmed_at,
    au.last_sign_in_at,
    au.banned_until
  into
    u_id,
    u_email,
    u_created_at,
    u_email_confirmed_at,
    u_last_sign_in_at,
    u_banned_until
  from auth.users au
  where au.id = p_user_id;

  if u_id is null then
    raise exception 'admin_user_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'userId', u_id,
    'maskedEmail', public.admin_mask_email(u_email),
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
        from public.payments p
        join public.weddings w on w.id = p.wedding_id
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

notify pgrst, 'reload schema';
