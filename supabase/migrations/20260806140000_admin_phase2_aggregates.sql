-- =============================================================================
-- Admin Phase 2 — privacy-safe aggregates (owner + AAL2)
-- =============================================================================

create or replace function public.assert_admin_owner_aal2()
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
  aal text;
begin
  if uid is null then
    raise exception 'admin_forbidden' using errcode = '42501';
  end if;

  aal := coalesce(auth.jwt() ->> 'aal', 'aal1');
  if aal is distinct from 'aal2' then
    raise exception 'admin_aal2_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.admin_members m
    where m.user_id = uid
      and m.enabled = true
      and m.role = 'owner'
  ) then
    raise exception 'admin_forbidden' using errcode = '42501';
  end if;

  return uid;
end;
$$;

revoke all on function public.assert_admin_owner_aal2() from public;

create or replace function public.admin_mask_email(p_email text)
returns text
language sql
immutable
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then '—'
    else left(split_part(p_email, '@', 1), 2)
      || '••••@'
      || split_part(p_email, '@', 2)
  end;
$$;

revoke all on function public.admin_mask_email(text) from public;

-- Range helper: p_range in ('today','7d','30d'), Europe/Warsaw bounds as timestamptz UTC
create or replace function public.admin_range_bounds(p_range text)
returns table(range_start timestamptz, range_end timestamptz, label text)
language plpgsql
immutable
as $$
declare
  r text := lower(coalesce(p_range, '30d'));
  now_w timestamp := timezone('Europe/Warsaw', now());
  start_local timestamp;
  end_local timestamp := date_trunc('day', now_w) + interval '1 day';
begin
  if r = 'today' then
    start_local := date_trunc('day', now_w);
    label := 'today';
  elsif r = '7d' then
    start_local := date_trunc('day', now_w) - interval '6 days';
    label := '7d';
  else
    start_local := date_trunc('day', now_w) - interval '29 days';
    label := '30d';
  end if;

  range_start := start_local at time zone 'Europe/Warsaw';
  range_end := end_local at time zone 'Europe/Warsaw';
  return next;
end;
$$;

revoke all on function public.admin_range_bounds(text) from public;

-- ---------------------------------------------------------------------------
-- Overview metrics
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_overview_metrics(p_range text default '30d')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
  b record;
  accounts_total bigint;
  accounts_in_range bigint;
  accounts_confirmed bigint;
  active_users bigint;
  weddings_total bigint;
  weddings_upcoming bigint;
  weddings_in_range bigint;
  sessions_total bigint;
  sessions_upcoming bigint;
  sessions_in_range bigint;
begin
  _uid := public.assert_admin_owner_aal2();
  select * into b from public.admin_range_bounds(p_range);

  select count(*) into accounts_total from auth.users;
  select count(*) into accounts_confirmed from auth.users where email_confirmed_at is not null;
  select count(*) into accounts_in_range
  from auth.users
  where created_at >= b.range_start and created_at < b.range_end;

  select count(*) into active_users
  from auth.users
  where last_sign_in_at is not null
    and last_sign_in_at >= b.range_start
    and last_sign_in_at < b.range_end;

  select count(*) into weddings_total from public.weddings;
  select count(*) into weddings_upcoming
  from public.weddings
  where wedding_date is not null
    and wedding_date >= (timezone('Europe/Warsaw', now()))::date
    and status = 'active';
  select count(*) into weddings_in_range
  from public.weddings
  where created_at >= b.range_start and created_at < b.range_end;

  select count(*) into sessions_total from public.sessions;
  select count(*) into sessions_upcoming
  from public.sessions
  where session_date >= (timezone('Europe/Warsaw', now()))::date;
  select count(*) into sessions_in_range
  from public.sessions
  where created_at >= b.range_start and created_at < b.range_end;

  return jsonb_build_object(
    'range', b.label,
    'rangeStart', b.range_start,
    'rangeEnd', b.range_end,
    'timezone', 'Europe/Warsaw',
    'updatedAt', now(),
    'accounts', jsonb_build_object(
      'total', accounts_total,
      'createdInRange', accounts_in_range,
      'confirmed', accounts_confirmed
    ),
    'activeUsers', jsonb_build_object(
      'count', active_users,
      'definition', 'auth.users.last_sign_in_at within selected range',
      'confirmedDenominator', accounts_confirmed
    ),
    'weddings', jsonb_build_object(
      'total', weddings_total,
      'upcoming', weddings_upcoming,
      'createdInRange', weddings_in_range
    ),
    'sessions', jsonb_build_object(
      'total', sessions_total,
      'upcoming', sessions_upcoming,
      'createdInRange', sessions_in_range
    )
  );
end;
$$;

revoke all on function public.admin_get_overview_metrics(text) from public;
grant execute on function public.admin_get_overview_metrics(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Registration series (daily, last N days, Europe/Warsaw)
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_registration_series(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
  days int := greatest(1, least(coalesce(p_days, 30), 90));
  series jsonb;
begin
  _uid := public.assert_admin_owner_aal2();

  with days as (
    select generate_series(
      (timezone('Europe/Warsaw', now()))::date - (days - 1),
      (timezone('Europe/Warsaw', now()))::date,
      1
    )::date as day
  ),
  counts as (
    select (timezone('Europe/Warsaw', u.created_at))::date as day, count(*)::bigint as c
    from auth.users u
    where u.created_at >= ((timezone('Europe/Warsaw', now()))::date - (days - 1))::timestamp
      at time zone 'Europe/Warsaw'
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', d.day,
      'count', coalesce(c.c, 0)
    ) order by d.day
  ), '[]'::jsonb)
  into series
  from days d
  left join counts c on c.day = d.day;

  return jsonb_build_object(
    'timezone', 'Europe/Warsaw',
    'days', days,
    'points', series,
    'updatedAt', now()
  );
end;
$$;

revoke all on function public.admin_get_registration_series(integer) from public;
grant execute on function public.admin_get_registration_series(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Product usage (exact counts; unavailable metrics omitted as null)
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_product_usage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
begin
  _uid := public.assert_admin_owner_aal2();

  return jsonb_build_object(
    'updatedAt', now(),
    'formQuestionnairesIssued', (select count(*) from public.form_instances),
    'formQuestionnairesSubmitted', (
      select count(*) from public.form_instances where status = 'submitted'
    ),
    'preweddingSent', (
      select count(*) from public.wedding_questionnaires where sent_at is not null
    ),
    'preweddingSubmitted', (
      select count(*) from public.wedding_questionnaires
      where submitted_at is not null or status = 'submitted'
    ),
    'documentsGenerated', (select count(*) from public.wedding_documents),
    'documentsSigned', (
      select count(*) from public.wedding_documents where lock_status = 'signed'
    ),
    'paymentsRecorded', (select count(*) from public.payments),
    'briefsDownloaded', null,
    'briefsDownloadedStatus', 'unavailable',
    'googleCalendarActive', (
      select count(*) from public.calendar_integrations
      where provider = 'google'
        and enabled = true
        and google_connected_at is not null
        and google_revoked_at is null
    ),
    'appleCalendarActive', (
      select count(*) from public.calendar_integrations
      where provider = 'apple' and enabled = true
    )
  );
end;
$$;

revoke all on function public.admin_get_product_usage() from public;
grant execute on function public.admin_get_product_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- Activation funnel (absolute counts; not claiming chronological conversion)
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_activation_funnel()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
  accounts bigint;
begin
  _uid := public.assert_admin_owner_aal2();
  select count(*) into accounts from auth.users;

  return jsonb_build_object(
    'updatedAt', now(),
    'note', 'Absolute cohort sizes; not proven chronological conversion',
    'steps', jsonb_build_array(
      jsonb_build_object(
        'id', 'account_created',
        'label', 'Konto utworzone',
        'count', accounts,
        'definition', 'count(auth.users)'
      ),
      jsonb_build_object(
        'id', 'email_confirmed',
        'label', 'E-mail potwierdzony',
        'count', (select count(*) from auth.users where email_confirmed_at is not null),
        'definition', 'auth.users.email_confirmed_at is not null'
      ),
      jsonb_build_object(
        'id', 'first_assignment',
        'label', 'Pierwsze zlecenie utworzone',
        'count', (
          select count(distinct uid) from (
            select user_id as uid from public.weddings
            union
            select user_id from public.sessions
          ) t
        ),
        'definition', 'distinct users with ≥1 wedding or session'
      ),
      jsonb_build_object(
        'id', 'first_questionnaire',
        'label', 'Pierwsza ankieta wysłana',
        'count', (
          select count(distinct uid) from (
            select w.user_id as uid
            from public.form_instances fi
            join public.weddings w on w.id = fi.wedding_id
            union
            select owner_id from public.wedding_questionnaires where sent_at is not null
          ) t
        ),
        'definition', 'distinct owners with form_instance (via wedding) or prewedding sent_at'
      ),
      jsonb_build_object(
        'id', 'first_document',
        'label', 'Pierwszy dokument wygenerowany',
        'count', (
          select count(distinct w.user_id)
          from public.wedding_documents d
          join public.weddings w on w.id = d.wedding_id
        ),
        'definition', 'distinct wedding owners with ≥1 wedding_documents row'
      ),
      jsonb_build_object(
        'id', 'calendar_connected',
        'label', 'Kalendarz połączony',
        'count', (
          select count(distinct user_id)
          from public.calendar_integrations
          where enabled = true
        ),
        'definition', 'distinct users with enabled calendar_integrations'
      )
    )
  );
end;
$$;

revoke all on function public.admin_get_activation_funnel() from public;
grant execute on function public.admin_get_activation_funnel() to authenticated;

-- ---------------------------------------------------------------------------
-- Attention items
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_attention_items()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
  items jsonb := '[]'::jsonb;
  n bigint;
begin
  _uid := public.assert_admin_owner_aal2();

  select count(*) into n from public.admin_members where enabled = false;
  if n > 0 then
    items := items || jsonb_build_array(jsonb_build_object(
      'id', 'disabled_owner',
      'title', 'Wyłączone konto właściciela',
      'count', n,
      'href', '/system',
      'updatedAt', now()
    ));
  end if;

  select count(*) into n
  from public.admin_audit_log
  where created_at >= now() - interval '7 days'
    and action like '%unauthorized%';
  if n > 0 then
    items := items || jsonb_build_array(jsonb_build_object(
      'id', 'unauthorized_attempts',
      'title', 'Nieautoryzowane próby dostępu (7 dni)',
      'count', n,
      'href', '/audit',
      'updatedAt', now()
    ));
  end if;

  select count(*) into n
  from public.calendar_integrations
  where last_error_at is not null
    and last_error_at >= now() - interval '30 days';
  if n > 0 then
    items := items || jsonb_build_array(jsonb_build_object(
      'id', 'calendar_errors',
      'title', 'Integracje kalendarza z błędem (30 dni)',
      'count', n,
      'href', '/integrations',
      'updatedAt', now()
    ));
  end if;

  select count(*) into n
  from auth.users
  where email_confirmed_at is null
    and created_at < now() - interval '7 days';
  if n > 0 then
    items := items || jsonb_build_array(jsonb_build_object(
      'id', 'unconfirmed_email',
      'title', 'Niepotwierdzony e-mail > 7 dni',
      'count', n,
      'href', '/users',
      'updatedAt', now()
    ));
  end if;

  return jsonb_build_object('items', items, 'updatedAt', now());
end;
$$;

revoke all on function public.admin_get_attention_items() from public;
grant execute on function public.admin_get_attention_items() to authenticated;

-- ---------------------------------------------------------------------------
-- Users list (paginated, masked)
-- ---------------------------------------------------------------------------

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
  lim int := greatest(1, least(coalesce(p_limit, 25), 100));
  off int := greatest(0, coalesce(p_offset, 0));
  total bigint;
  rows jsonb;
  q text := nullif(trim(coalesce(p_search, '')), '');
begin
  _uid := public.assert_admin_owner_aal2();

  with base as (
    select
      u.id,
      u.email,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at,
      u.banned_until,
      (select count(*) from public.weddings w where w.user_id = u.id) as weddings_count,
      (select count(*) from public.sessions s where s.user_id = u.id) as sessions_count,
      (
        select count(*)
        from public.wedding_documents d
        join public.weddings w on w.id = d.wedding_id
        where w.user_id = u.id
      ) as documents_count,
      (
        select count(*)
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
  )
  select count(*) into total from filtered;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into rows
  from (
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
  ) x;

  return jsonb_build_object(
    'total', total,
    'limit', lim,
    'offset', off,
    'rows', rows,
    'updatedAt', now()
  );
end;
$$;

revoke all on function public.admin_list_users(integer, integer, text, text) from public;
grant execute on function public.admin_list_users(integer, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- User summary
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_user_summary(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
  u auth.users%rowtype;
begin
  _uid := public.assert_admin_owner_aal2();

  select * into u from auth.users where id = p_user_id;
  if not found then
    raise exception 'admin_user_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'userId', u.id,
    'maskedEmail', public.admin_mask_email(u.email),
    'shortId', left(u.id::text, 8),
    'createdAt', u.created_at,
    'emailConfirmed', u.email_confirmed_at is not null,
    'emailConfirmedAt', u.email_confirmed_at,
    'lastSignInAt', u.last_sign_in_at,
    'bannedUntil', u.banned_until,
    'mfaFactors', (
      select count(*) from auth.mfa_factors mf
      where mf.user_id = u.id and mf.status = 'verified'
    ),
    'usage', jsonb_build_object(
      'weddings', (select count(*) from public.weddings where user_id = u.id),
      'sessions', (select count(*) from public.sessions where user_id = u.id),
      'documents', (
        select count(*)
        from public.wedding_documents d
        join public.weddings w on w.id = d.wedding_id
        where w.user_id = u.id
      ),
      'questionnaires', (
        select
          (
            select count(*)
            from public.form_instances fi
            join public.weddings w on w.id = fi.wedding_id
            where w.user_id = u.id
          )
          + (select count(*) from public.wedding_questionnaires where owner_id = u.id)
      ),
      'payments', (
        select count(*)
        from public.payments p
        join public.weddings w on w.id = p.wedding_id
        where w.user_id = u.id
      ),
      'calendarIntegrations', (
        select count(*) from public.calendar_integrations where user_id = u.id
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
      where ci.user_id = u.id
    ),
    'lookedUpAt', now()
  );
end;
$$;

revoke all on function public.admin_get_user_summary(uuid) from public;
grant execute on function public.admin_get_user_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Integrations / system / audit / emails
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_integration_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
begin
  _uid := public.assert_admin_owner_aal2();

  return jsonb_build_object(
    'updatedAt', now(),
    'google', jsonb_build_object(
      'connected', (
        select count(*) from public.calendar_integrations
        where provider = 'google'
          and google_connected_at is not null
          and google_revoked_at is null
      ),
      'enabled', (
        select count(*) from public.calendar_integrations
        where provider = 'google' and enabled = true
      ),
      'withError', (
        select count(*) from public.calendar_integrations
        where provider = 'google' and last_error_at is not null
      ),
      'lastSuccessfulSyncAt', (
        select max(last_sync_at) from public.calendar_integrations
        where provider = 'google' and last_sync_at is not null
      )
    ),
    'apple', jsonb_build_object(
      'enabled', (
        select count(*) from public.calendar_integrations
        where provider = 'apple' and enabled = true
      ),
      'withError', (
        select count(*) from public.calendar_integrations
        where provider = 'apple' and last_error_at is not null
      ),
      'lastSuccessfulSyncAt', (
        select max(last_sync_at) from public.calendar_integrations
        where provider = 'apple' and last_sync_at is not null
      )
    ),
    'resend', jsonb_build_object(
      'smtpConfigured', 'unknown',
      'webhookConnected', (
        select exists (select 1 from public.admin_email_events)
      ),
      'lastWebhookEventAt', (
        select max(occurred_at) from public.admin_email_events
      ),
      'status', case
        when exists (select 1 from public.admin_email_events) then 'receiving'
        else 'not_connected'
      end
    ),
    'supabase', jsonb_build_object(
      'database', 'ok',
      'adminRpc', 'ok'
    )
  );
end;
$$;

revoke all on function public.admin_get_integration_health() from public;
grant execute on function public.admin_get_integration_health() to authenticated;

create or replace function public.admin_get_system_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
  t0 timestamptz := clock_timestamp();
  db_ok boolean := false;
begin
  _uid := public.assert_admin_owner_aal2();
  perform 1;
  db_ok := true;

  return jsonb_build_object(
    'checkedAt', now(),
    'checks', jsonb_build_array(
      jsonb_build_object(
        'id', 'database_read',
        'label', 'Database read',
        'status', case when db_ok then 'ok' else 'error' end,
        'durationMs', round(extract(epoch from (clock_timestamp() - t0)) * 1000)
      ),
      jsonb_build_object(
        'id', 'admin_rpc',
        'label', 'Admin RPC',
        'status', 'ok',
        'durationMs', round(extract(epoch from (clock_timestamp() - t0)) * 1000)
      ),
      jsonb_build_object(
        'id', 'auth_users',
        'label', 'Auth admin endpoint',
        'status', case
          when (select count(*) from auth.users) >= 0 then 'ok'
          else 'unknown'
        end,
        'durationMs', null
      ),
      jsonb_build_object(
        'id', 'resend_webhook',
        'label', 'Resend webhook recency',
        'status', case
          when exists (select 1 from public.admin_email_events) then 'ok'
          else 'not_connected'
        end,
        'durationMs', null,
        'note', (
          select max(occurred_at)::text from public.admin_email_events
        )
      ),
      jsonb_build_object(
        'id', 'uptime',
        'label', 'Uptime',
        'status', 'unknown',
        'note', 'No monitoring history'
      )
    )
  );
end;
$$;

revoke all on function public.admin_get_system_health() from public;
grant execute on function public.admin_get_system_health() to authenticated;

create or replace function public.admin_list_audit(
  p_limit integer default 50,
  p_offset integer default 0,
  p_action text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
  lim int := greatest(1, least(coalesce(p_limit, 50), 100));
  off int := greatest(0, coalesce(p_offset, 0));
  total bigint;
  rows jsonb;
begin
  _uid := public.assert_admin_owner_aal2();

  select count(*) into total
  from public.admin_audit_log a
  where p_action is null or a.action = p_action;

  select coalesce(jsonb_agg(to_jsonb(x) order by x."createdAt" desc), '[]'::jsonb)
  into rows
  from (
    select
      a.id,
      a.created_at as "createdAt",
      public.admin_mask_email((select email from auth.users u where u.id = a.admin_user_id)) as "adminMaskedEmail",
      a.action,
      a.target_type as "targetType",
      a.target_id as "targetId",
      case
        when a.action like '%fail%' or a.action like '%unauthorized%' then 'error'
        else 'ok'
      end as result
    from public.admin_audit_log a
    where p_action is null or a.action = p_action
    order by a.created_at desc
    limit lim offset off
  ) x;

  return jsonb_build_object(
    'total', total,
    'limit', lim,
    'offset', off,
    'rows', rows,
    'updatedAt', now()
  );
end;
$$;

revoke all on function public.admin_list_audit(integer, integer, text) from public;
grant execute on function public.admin_list_audit(integer, integer, text) to authenticated;

-- Email events foundation (webhook not yet connected)
create table if not exists public.admin_email_events (
  id uuid primary key default gen_random_uuid(),
  external_email_id text not null,
  event_type text not null,
  category text null,
  recipient_domain text null,
  recipient_hash text null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload_version text not null default '1',
  constraint admin_email_events_unique unique (external_email_id, event_type, occurred_at)
);

alter table public.admin_email_events enable row level security;
revoke all on table public.admin_email_events from anon, authenticated;

create or replace function public.admin_get_email_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
  n bigint;
begin
  _uid := public.assert_admin_owner_aal2();
  select count(*) into n from public.admin_email_events;

  if n = 0 then
    return jsonb_build_object(
      'status', 'not_collecting',
      'message', 'Statystyki dostarczalności nie są jeszcze zbierane.',
      'smtpConfigured', 'unknown',
      'webhookConnected', false,
      'updatedAt', now()
    );
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'sent', (select count(*) from public.admin_email_events where event_type = 'email.sent'),
    'delivered', (select count(*) from public.admin_email_events where event_type = 'email.delivered'),
    'bounced', (select count(*) from public.admin_email_events where event_type = 'email.bounced'),
    'failed', (select count(*) from public.admin_email_events where event_type = 'email.failed'),
    'complained', (select count(*) from public.admin_email_events where event_type = 'email.complained'),
    'suppressed', (select count(*) from public.admin_email_events where event_type = 'email.suppressed'),
    'deliveryDelayed', (select count(*) from public.admin_email_events where event_type = 'email.delivery_delayed'),
    'lastEventAt', (select max(occurred_at) from public.admin_email_events),
    'updatedAt', now()
  );
end;
$$;

revoke all on function public.admin_get_email_metrics() from public;
grant execute on function public.admin_get_email_metrics() to authenticated;

comment on table public.admin_email_events is
  'Privacy-safe Resend webhook events. No full recipient email or body.';

-- Query-pattern indexes (admin aggregates / range filters)
create index if not exists weddings_created_at_idx
  on public.weddings (created_at);

create index if not exists sessions_created_at_idx
  on public.sessions (created_at);

create index if not exists admin_email_events_occurred_at_idx
  on public.admin_email_events (occurred_at desc);

create index if not exists admin_email_events_event_type_idx
  on public.admin_email_events (event_type);
