-- Subscription foundation — enrich admin user list with entitlement + filter.
-- Idempotent; does not restart trials.

drop function if exists public.admin_list_users(integer, integer, text, text);
drop function if exists public.admin_list_users(integer, integer, text, text, text);

create or replace function public.admin_list_users(
  p_limit integer default 25,
  p_offset integer default 0,
  p_search text default null,
  p_status text default null,
  p_subscription_filter text default null
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
  _now timestamptz := timezone('utc', now());
  sub_filter text := nullif(trim(coalesce(p_subscription_filter, '')), '');
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
      ) as integrations_count,
      (
        select ba.id
        from public.billing_accounts ba
        where ba.owner_user_id = u.id
        limit 1
      ) as billing_account_id
    from auth.users u
    left join public.profiles p on p.id = u.id
  ),
  with_entitlement as (
    select
      b.*,
      case
        when b.billing_account_id is null then null
        else public.resolve_account_entitlement(b.billing_account_id, _now)
      end as entitlement
    from base b
  ),
  enriched as (
    select
      e.*,
      e.identity ->> 'email' as id_email,
      e.identity ->> 'firstName' as id_first,
      e.identity ->> 'lastName' as id_last,
      e.identity ->> 'displayName' as id_display,
      e.identity ->> 'profileSource' as id_source
    from with_entitlement e
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
    and (
      sub_filter is null
      or (
        sub_filter = 'trial'
        and e.entitlement->>'source' = 'trial'
        and e.entitlement->>'accessLevel' = 'pro'
      )
      or (
        sub_filter = 'trial_ending'
        and e.entitlement->>'source' = 'trial'
        and e.entitlement->>'accessLevel' = 'pro'
        and coalesce((e.entitlement->>'daysRemaining')::numeric, 0) <= 7
        and coalesce((e.entitlement->>'daysRemaining')::numeric, 0) > 0
      )
      or (
        sub_filter = 'pro'
        and e.entitlement->>'accessLevel' = 'pro'
        and e.entitlement->>'source' in ('paid_subscription', 'admin_override')
      )
      or (
        sub_filter = 'expired'
        and (
          e.entitlement is null
          or e.entitlement->>'accessLevel' = 'expired'
        )
      )
      or (
        sub_filter = 'manual'
        and e.entitlement->>'source' = 'admin_override'
        and e.entitlement->>'accessLevel' = 'pro'
      )
      or (
        sub_filter = 'past_due'
        and e.entitlement->>'status' = 'past_due'
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
      f.integrations_count as integrations,
      f.entitlement
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

revoke all on function public.admin_list_users(integer, integer, text, text, text) from public, anon;
grant execute on function public.admin_list_users(integer, integer, text, text, text) to authenticated;

notify pgrst, 'reload schema';
