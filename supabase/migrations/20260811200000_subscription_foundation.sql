-- Subscription foundation Phase 1
-- Provider-agnostic billing accounts + trial entitlements + admin manual access.
-- No Stripe/Paddle SDK. Idempotent trial initialization.

-- ── Plan constants (display / RPC; app catalog is source for UI copy) ─────────
create or replace function public.billing_plan_catalog()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'trialDays', 30,
    'currency', 'PLN',
    'monthly', jsonb_build_object(
      'plan', 'pro',
      'interval', 'month',
      'amount', 49,
      'label', '49 zł',
      'periodLabel', '/ miesiąc'
    ),
    'annual', jsonb_build_object(
      'plan', 'pro',
      'interval', 'year',
      'amount', 490,
      'label', '490 zł',
      'periodLabel', '/ rok',
      'monthlyEquivalent', '40,83 zł / miesiąc',
      'savingAmount', 98,
      'savingPercent', 17,
      'savingLabel', 'Oszczędzasz 98 zł rocznie',
      'discountLabel', '17% taniej niż plan miesięczny'
    )
  );
$$;

revoke all on function public.billing_plan_catalog() from public;
grant execute on function public.billing_plan_catalog() to anon, authenticated;

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references public.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists billing_accounts_owner_user_id_idx
  on public.billing_accounts (owner_user_id);

comment on table public.billing_accounts is
  'Commercial account root. Today 1:1 with public.users; future Studio members attach here.';

create table if not exists public.account_subscriptions (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null unique
    references public.billing_accounts (id) on delete cascade,
  plan text not null default 'pro'
    check (plan in ('pro')),
  billing_interval text
    check (billing_interval is null or billing_interval in ('month', 'year')),
  status text not null
    check (status in (
      'trialing', 'active', 'expired', 'past_due', 'canceled', 'manual'
    )),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  trial_initialized_at timestamptz,
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  provider text
    check (provider is null or provider in ('stripe', 'paddle', 'other')),
  provider_customer_id text,
  provider_subscription_id text,
  provider_status text,
  manual_access_until timestamptz,
  manual_access_indefinite boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists account_subscriptions_status_idx
  on public.account_subscriptions (status);
create index if not exists account_subscriptions_trial_ends_at_idx
  on public.account_subscriptions (trial_ends_at);
create index if not exists account_subscriptions_manual_until_idx
  on public.account_subscriptions (manual_access_until);

comment on table public.account_subscriptions is
  'Current subscription/access state per billing account. Provider IDs nullable.';

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists billing_accounts_set_updated_at on public.billing_accounts;
create trigger billing_accounts_set_updated_at
  before update on public.billing_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists account_subscriptions_set_updated_at on public.account_subscriptions;
create trigger account_subscriptions_set_updated_at
  before update on public.account_subscriptions
  for each row execute function public.set_updated_at();

-- ── Ensure billing account ───────────────────────────────────────────────────
create or replace function public.ensure_billing_account_for_user(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  if p_user_id is null then
    raise exception 'billing_user_required' using errcode = '22004';
  end if;

  select id into _id
  from public.billing_accounts
  where owner_user_id = p_user_id;

  if _id is not null then
    return _id;
  end if;

  insert into public.billing_accounts (owner_user_id)
  values (p_user_id)
  on conflict (owner_user_id) do update
    set updated_at = timezone('utc', now())
  returning id into _id;

  return _id;
end;
$$;

revoke all on function public.ensure_billing_account_for_user(uuid) from public;
grant execute on function public.ensure_billing_account_for_user(uuid) to authenticated;

-- ── Idempotent trial init ────────────────────────────────────────────────────
create or replace function public.initialize_trial_subscription(
  p_billing_account_id uuid,
  p_started_at timestamptz default timezone('utc', now())
)
returns public.account_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.account_subscriptions;
  _start timestamptz := coalesce(p_started_at, timezone('utc', now()));
  _days integer := 30;
begin
  select * into _row
  from public.account_subscriptions
  where billing_account_id = p_billing_account_id;

  if found then
    -- Never restart an existing trial / paid / manual record.
    return _row;
  end if;

  insert into public.account_subscriptions (
    billing_account_id,
    plan,
    billing_interval,
    status,
    trial_started_at,
    trial_ends_at,
    trial_initialized_at
  )
  values (
    p_billing_account_id,
    'pro',
    null,
    'trialing',
    _start,
    _start + make_interval(days => _days),
    timezone('utc', now())
  )
  returning * into _row;

  return _row;
end;
$$;

revoke all on function public.initialize_trial_subscription(uuid, timestamptz) from public;

-- Trigger: after public.users insert → billing account + trial
create or replace function public.on_public_user_created_init_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _ba uuid;
begin
  _ba := public.ensure_billing_account_for_user(new.id);
  perform public.initialize_trial_subscription(_ba, timezone('utc', now()));
  return new;
end;
$$;

drop trigger if exists on_public_users_created_billing on public.users;
create trigger on_public_users_created_billing
  after insert on public.users
  for each row execute function public.on_public_user_created_init_billing();

-- ── Canonical entitlement resolver ───────────────────────────────────────────
create or replace function public.resolve_account_entitlement(
  p_billing_account_id uuid,
  p_now timestamptz default timezone('utc', now())
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.account_subscriptions;
  _now timestamptz := coalesce(p_now, timezone('utc', now()));
  _manual_active boolean := false;
  _paid_active boolean := false;
  _trial_active boolean := false;
  _access text := 'expired';
  _source text := 'none';
  _status text := 'expired';
  _days numeric := null;
  _trial_days_full integer := null;
begin
  select * into s
  from public.account_subscriptions
  where billing_account_id = p_billing_account_id;

  if not found then
    return jsonb_build_object(
      'accessLevel', 'expired',
      'source', 'none',
      'plan', 'pro',
      'billingInterval', null,
      'status', 'expired',
      'trialStartedAt', null,
      'trialEndsAt', null,
      'currentPeriodStartedAt', null,
      'currentPeriodEndsAt', null,
      'manualAccessUntil', null,
      'manualAccessIndefinite', false,
      'provider', null,
      'providerStatus', null,
      'cancelAtPeriodEnd', false,
      'daysRemaining', null,
      'canUseProFeatures', false,
      'billingAccountId', p_billing_account_id
    );
  end if;

  _manual_active :=
    s.manual_access_indefinite
    or (s.manual_access_until is not null and s.manual_access_until > _now);

  _paid_active :=
    s.status = 'active'
    and (
      s.current_period_ends_at is null
      or s.current_period_ends_at > _now
    );

  _trial_active :=
    s.status = 'trialing'
    and s.trial_ends_at is not null
    and s.trial_ends_at > _now;

  if _manual_active then
    _access := 'pro';
    _source := 'admin_override';
    _status := 'manual';
    if s.manual_access_indefinite then
      _days := null;
    else
      _days := extract(epoch from (s.manual_access_until - _now)) / 86400.0;
    end if;
  elsif _paid_active then
    _access := 'pro';
    _source := 'paid_subscription';
    _status := s.status;
    if s.current_period_ends_at is not null then
      _days := extract(epoch from (s.current_period_ends_at - _now)) / 86400.0;
    end if;
  elsif _trial_active then
    _access := 'pro';
    _source := 'trial';
    _status := 'trialing';
    _days := extract(epoch from (s.trial_ends_at - _now)) / 86400.0;
    if s.trial_started_at is not null and s.trial_ends_at is not null then
      _trial_days_full := greatest(
        1,
        ceil(extract(epoch from (s.trial_ends_at - s.trial_started_at)) / 86400.0)::integer
      );
    end if;
  else
    _access := 'expired';
    _source := 'none';
    if s.status = 'past_due' then
      _status := 'past_due';
    elsif s.status = 'canceled' then
      _status := 'canceled';
    else
      _status := 'expired';
    end if;
    _days := 0;
  end if;

  return jsonb_build_object(
    'accessLevel', _access,
    'source', _source,
    'plan', s.plan,
    'billingInterval', s.billing_interval,
    'status', _status,
    'subscriptionStatus', s.status,
    'trialStartedAt', s.trial_started_at,
    'trialEndsAt', s.trial_ends_at,
    'trialTotalDays', _trial_days_full,
    'currentPeriodStartedAt', s.current_period_started_at,
    'currentPeriodEndsAt', s.current_period_ends_at,
    'manualAccessUntil', s.manual_access_until,
    'manualAccessIndefinite', s.manual_access_indefinite,
    'provider', s.provider,
    'providerStatus', s.provider_status,
    'cancelAtPeriodEnd', s.cancel_at_period_end,
    'daysRemaining', _days,
    'canUseProFeatures', _access = 'pro',
    'billingAccountId', s.billing_account_id,
    'subscriptionId', s.id
  );
end;
$$;

revoke all on function public.resolve_account_entitlement(uuid, timestamptz) from public;
grant execute on function public.resolve_account_entitlement(uuid, timestamptz) to authenticated;

-- Convenience: entitlement for a user id (owner)
create or replace function public.resolve_user_entitlement(
  p_user_id uuid,
  p_now timestamptz default timezone('utc', now())
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _ba uuid;
begin
  select id into _ba
  from public.billing_accounts
  where owner_user_id = p_user_id;

  if _ba is null then
    return public.resolve_account_entitlement('00000000-0000-0000-0000-000000000000'::uuid, p_now)
      || jsonb_build_object('billingAccountId', null, 'missingAccount', true);
  end if;

  return public.resolve_account_entitlement(_ba, p_now);
end;
$$;

revoke all on function public.resolve_user_entitlement(uuid, timestamptz) from public;
grant execute on function public.resolve_user_entitlement(uuid, timestamptz) to authenticated;

-- ── Customer-safe summary ────────────────────────────────────────────────────
create or replace function public.get_my_subscription_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _ba uuid;
  _ent jsonb;
begin
  if _uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  _ba := public.ensure_billing_account_for_user(_uid);
  -- Ensure trial exists for legacy edge cases without restarting paid/manual
  perform public.initialize_trial_subscription(_ba, timezone('utc', now()));

  _ent := public.resolve_account_entitlement(_ba, timezone('utc', now()));

  return jsonb_build_object(
    'entitlement', _ent,
    'plans', public.billing_plan_catalog(),
    'paymentsAvailable', false,
    'paymentsMessage', 'Płatności online będą dostępne wkrótce.'
  );
end;
$$;

revoke all on function public.get_my_subscription_summary() from public, anon;
grant execute on function public.get_my_subscription_summary() to authenticated;

-- ── Admin: subscription metrics ──────────────────────────────────────────────
create or replace function public.admin_get_subscription_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
  _now timestamptz := timezone('utc', now());
begin
  _uid := public.assert_admin_owner_aal2();

  return jsonb_build_object(
    'trialActive', (
      select count(*)::bigint
      from public.account_subscriptions s
      where s.status = 'trialing' and s.trial_ends_at > _now
        and not (
          s.manual_access_indefinite
          or (s.manual_access_until is not null and s.manual_access_until > _now)
        )
        and not (
          s.status = 'active'
          and (s.current_period_ends_at is null or s.current_period_ends_at > _now)
        )
    ),
    'trialEndingSoon', (
      select count(*)::bigint
      from public.account_subscriptions s
      where s.status = 'trialing'
        and s.trial_ends_at > _now
        and s.trial_ends_at <= _now + interval '7 days'
        and not (s.manual_access_indefinite or (s.manual_access_until is not null and s.manual_access_until > _now))
    ),
    'proActive', (
      select count(*)::bigint
      from public.account_subscriptions s
      where (
        (s.status = 'active' and (s.current_period_ends_at is null or s.current_period_ends_at > _now))
        or s.manual_access_indefinite
        or (s.manual_access_until is not null and s.manual_access_until > _now)
      )
    ),
    'expired', (
      select count(*)::bigint
      from public.account_subscriptions s
      where not (
        s.manual_access_indefinite
        or (s.manual_access_until is not null and s.manual_access_until > _now)
        or (s.status = 'active' and (s.current_period_ends_at is null or s.current_period_ends_at > _now))
        or (s.status = 'trialing' and s.trial_ends_at > _now)
      )
    ),
    'manualAccess', (
      select count(*)::bigint
      from public.account_subscriptions s
      where s.manual_access_indefinite
         or (s.manual_access_until is not null and s.manual_access_until > _now)
    ),
    'paymentsConnected', false
  );
end;
$$;

revoke all on function public.admin_get_subscription_metrics() from public, anon;
grant execute on function public.admin_get_subscription_metrics() to authenticated;

-- ── Admin list subscriptions ─────────────────────────────────────────────────
create or replace function public.admin_list_subscriptions(
  p_limit integer default 50,
  p_offset integer default 0,
  p_filter text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
  _now timestamptz := timezone('utc', now());
  _lim integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  _off integer := greatest(coalesce(p_offset, 0), 0);
begin
  _uid := public.assert_admin_owner_aal2();

  return (
    with rows as (
      select
        ba.id as billing_account_id,
        ba.owner_user_id,
        au.email,
        pr.first_name,
        pr.last_name,
        public.resolve_account_entitlement(ba.id, _now) as entitlement,
        s.updated_at
      from public.billing_accounts ba
      join public.account_subscriptions s on s.billing_account_id = ba.id
      join auth.users au on au.id = ba.owner_user_id
      left join public.profiles pr on pr.id = ba.owner_user_id
    ),
    filtered as (
      select *
      from rows r
      where
        p_filter is null
        or p_filter = ''
        or (p_filter = 'trial' and r.entitlement->>'source' = 'trial')
        or (p_filter = 'trial_ending' and r.entitlement->>'source' = 'trial'
            and (r.entitlement->>'daysRemaining')::numeric <= 7
            and (r.entitlement->>'daysRemaining')::numeric > 0)
        or (p_filter = 'pro' and r.entitlement->>'accessLevel' = 'pro'
            and r.entitlement->>'source' in ('paid_subscription', 'admin_override'))
        or (p_filter = 'expired' and r.entitlement->>'accessLevel' = 'expired')
        or (p_filter = 'manual' and r.entitlement->>'source' = 'admin_override')
        or (p_filter = 'past_due' and r.entitlement->>'status' = 'past_due')
    )
    select jsonb_build_object(
      'total', (select count(*)::bigint from filtered),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'billingAccountId', f.billing_account_id,
          'userId', f.owner_user_id,
          'email', f.email,
          'firstName', f.first_name,
          'lastName', f.last_name,
          'entitlement', f.entitlement,
          'updatedAt', f.updated_at
        ) order by f.updated_at desc)
        from (
          select * from filtered
          order by updated_at desc
          limit _lim offset _off
        ) f
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.admin_list_subscriptions(integer, integer, text) from public, anon;
grant execute on function public.admin_list_subscriptions(integer, integer, text) to authenticated;

-- ── Admin mutations ──────────────────────────────────────────────────────────
create or replace function public.admin_extend_trial(
  p_user_id uuid,
  p_days integer default null,
  p_until timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _admin uuid;
  _ba uuid;
  _s public.account_subscriptions;
  _old_end timestamptz;
  _new_end timestamptz;
  _old_ent jsonb;
  _new_ent jsonb;
  _now timestamptz := timezone('utc', now());
begin
  _admin := public.assert_admin_owner_aal2();
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22004';
  end if;
  if p_days is null and p_until is null then
    raise exception 'extend_params_required' using errcode = '22023';
  end if;
  if p_days is not null and p_days not in (7, 14, 30) and p_until is null then
    -- custom day counts allowed only via p_until; named presets 7/14/30
    if p_days < 1 or p_days > 365 then
      raise exception 'invalid_extend_days' using errcode = '22023';
    end if;
  end if;

  _ba := public.ensure_billing_account_for_user(p_user_id);
  perform public.initialize_trial_subscription(_ba, _now);

  select * into _s from public.account_subscriptions where billing_account_id = _ba for update;
  _old_ent := public.resolve_account_entitlement(_ba, _now);
  _old_end := coalesce(_s.trial_ends_at, _now);

  if p_until is not null then
    _new_end := p_until;
  else
    _new_end := greatest(_old_end, _now) + make_interval(days => p_days);
  end if;

  update public.account_subscriptions
  set
    status = 'trialing',
    trial_started_at = coalesce(trial_started_at, _now),
    trial_ends_at = _new_end,
    updated_at = timezone('utc', now())
  where billing_account_id = _ba;

  _new_ent := public.resolve_account_entitlement(_ba, _now);

  perform public.append_admin_audit_event(
    'subscription.trial_extended',
    'billing_account',
    _ba::text,
    jsonb_build_object(
      'targetUserId', p_user_id,
      'oldCategory', _old_ent->>'source',
      'newCategory', _new_ent->>'source',
      'oldEnd', _old_end,
      'newEnd', _new_end,
      'reason', nullif(trim(coalesce(p_reason, '')), '')
    )
  );

  return jsonb_build_object(
    'ok', true,
    'entitlement', _new_ent,
    'trialEndsAt', _new_end
  );
end;
$$;

revoke all on function public.admin_extend_trial(uuid, integer, timestamptz, text) from public, anon;
grant execute on function public.admin_extend_trial(uuid, integer, timestamptz, text) to authenticated;

create or replace function public.admin_grant_manual_pro(
  p_user_id uuid,
  p_until timestamptz default null,
  p_indefinite boolean default false,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _admin uuid;
  _ba uuid;
  _old_ent jsonb;
  _new_ent jsonb;
  _now timestamptz := timezone('utc', now());
  _reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  _admin := public.assert_admin_owner_aal2();
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22004';
  end if;
  if not coalesce(p_indefinite, false) and p_until is null then
    raise exception 'manual_until_or_indefinite_required' using errcode = '22023';
  end if;
  if coalesce(p_indefinite, false) and _reason is null then
    raise exception 'reason_required_for_indefinite' using errcode = '22023';
  end if;

  _ba := public.ensure_billing_account_for_user(p_user_id);
  perform public.initialize_trial_subscription(_ba, _now);
  _old_ent := public.resolve_account_entitlement(_ba, _now);

  update public.account_subscriptions
  set
    manual_access_indefinite = coalesce(p_indefinite, false),
    manual_access_until = case
      when coalesce(p_indefinite, false) then null
      else p_until
    end,
    -- Do not rewrite provider_* or paid period fields
    updated_at = timezone('utc', now())
  where billing_account_id = _ba;

  _new_ent := public.resolve_account_entitlement(_ba, _now);

  perform public.append_admin_audit_event(
    'subscription.manual_access_granted',
    'billing_account',
    _ba::text,
    jsonb_build_object(
      'targetUserId', p_user_id,
      'oldCategory', _old_ent->>'source',
      'newCategory', _new_ent->>'source',
      'oldEnd', _old_ent->'manualAccessUntil',
      'newEnd', _new_ent->'manualAccessUntil',
      'indefinite', coalesce(p_indefinite, false),
      'reason', _reason
    )
  );

  return jsonb_build_object('ok', true, 'entitlement', _new_ent);
end;
$$;

revoke all on function public.admin_grant_manual_pro(uuid, timestamptz, boolean, text) from public, anon;
grant execute on function public.admin_grant_manual_pro(uuid, timestamptz, boolean, text) to authenticated;

create or replace function public.admin_revoke_manual_access(
  p_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _admin uuid;
  _ba uuid;
  _old_ent jsonb;
  _new_ent jsonb;
  _now timestamptz := timezone('utc', now());
begin
  _admin := public.assert_admin_owner_aal2();
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22004';
  end if;

  select id into _ba from public.billing_accounts where owner_user_id = p_user_id;
  if _ba is null then
    raise exception 'billing_account_not_found' using errcode = 'P0002';
  end if;

  _old_ent := public.resolve_account_entitlement(_ba, _now);

  update public.account_subscriptions
  set
    manual_access_indefinite = false,
    manual_access_until = null,
    updated_at = timezone('utc', now())
  where billing_account_id = _ba;

  _new_ent := public.resolve_account_entitlement(_ba, _now);

  perform public.append_admin_audit_event(
    'subscription.manual_access_revoked',
    'billing_account',
    _ba::text,
    jsonb_build_object(
      'targetUserId', p_user_id,
      'oldCategory', _old_ent->>'source',
      'newCategory', _new_ent->>'source',
      'oldEnd', _old_ent->'manualAccessUntil',
      'newEnd', null,
      'reason', nullif(trim(coalesce(p_reason, '')), '')
    )
  );

  return jsonb_build_object('ok', true, 'entitlement', _new_ent);
end;
$$;

revoke all on function public.admin_revoke_manual_access(uuid, text) from public, anon;
grant execute on function public.admin_revoke_manual_access(uuid, text) to authenticated;

-- Admin user entitlement peek (for detail page)
create or replace function public.admin_get_user_subscription(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _admin uuid;
  _ba uuid;
  _s public.account_subscriptions;
  _ent jsonb;
begin
  _admin := public.assert_admin_owner_aal2();
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22004';
  end if;

  select id into _ba from public.billing_accounts where owner_user_id = p_user_id;
  if _ba is null then
    _ba := public.ensure_billing_account_for_user(p_user_id);
    perform public.initialize_trial_subscription(_ba, timezone('utc', now()));
  end if;

  select * into _s from public.account_subscriptions where billing_account_id = _ba;
  _ent := public.resolve_account_entitlement(_ba, timezone('utc', now()));

  return jsonb_build_object(
    'entitlement', _ent,
    'subscription', jsonb_build_object(
      'id', _s.id,
      'status', _s.status,
      'plan', _s.plan,
      'billingInterval', _s.billing_interval,
      'trialStartedAt', _s.trial_started_at,
      'trialEndsAt', _s.trial_ends_at,
      'currentPeriodStartedAt', _s.current_period_started_at,
      'currentPeriodEndsAt', _s.current_period_ends_at,
      'provider', _s.provider,
      'providerStatus', _s.provider_status,
      'providerCustomerId', _s.provider_customer_id,
      'providerSubscriptionId', _s.provider_subscription_id,
      'manualAccessUntil', _s.manual_access_until,
      'manualAccessIndefinite', _s.manual_access_indefinite,
      'createdAt', _s.created_at,
      'updatedAt', _s.updated_at
    )
  );
end;
$$;

revoke all on function public.admin_get_user_subscription(uuid) from public, anon;
grant execute on function public.admin_get_user_subscription(uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.billing_accounts enable row level security;
alter table public.account_subscriptions enable row level security;

revoke all on table public.billing_accounts from anon, authenticated;
revoke all on table public.account_subscriptions from anon, authenticated;

grant select on table public.billing_accounts to authenticated;
grant select on table public.account_subscriptions to authenticated;

drop policy if exists billing_accounts_owner_select on public.billing_accounts;
create policy billing_accounts_owner_select
  on public.billing_accounts
  for select
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists account_subscriptions_owner_select on public.account_subscriptions;
create policy account_subscriptions_owner_select
  on public.account_subscriptions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.billing_accounts ba
      where ba.id = account_subscriptions.billing_account_id
        and ba.owner_user_id = auth.uid()
    )
  );

-- ── Backfill existing users (fresh 30-day trial from deploy time) ─────────────
-- Idempotent: skips users who already have a subscription row.
do $$
declare
  r record;
  _ba uuid;
  _start timestamptz := timezone('utc', now());
begin
  for r in select id from public.users
  loop
    _ba := public.ensure_billing_account_for_user(r.id);
    perform public.initialize_trial_subscription(_ba, _start);
  end loop;
end;
$$;
