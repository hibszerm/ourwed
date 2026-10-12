-- Internal QA accounts: private runtime registry + one-time trusted bootstrap authorization.
-- Additive only. No user backfill and no remote/prod operations.

begin;

create table public.internal_qa_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  provisioned_by text not null check (pg_catalog.length(pg_catalog.btrim(provisioned_by)) between 1 and 160),
  purpose text not null check (pg_catalog.length(pg_catalog.btrim(purpose)) between 1 and 500)
);

comment on table public.internal_qa_accounts is
  'Service-only authoritative marker for synthetic Internal QA accounts. Not a customer role or admin grant.';

alter table public.internal_qa_accounts enable row level security;
alter table public.internal_qa_accounts force row level security;
revoke all on table public.internal_qa_accounts from public, anon, authenticated;
grant select on table public.internal_qa_accounts to service_role;

create table public.internal_qa_provisioning_authorizations (
  authorization_id uuid primary key default extensions.gen_random_uuid(),
  nonce_hash text not null unique check (nonce_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  provisioned_by text not null check (pg_catalog.length(pg_catalog.btrim(provisioned_by)) between 1 and 160),
  purpose text not null check (pg_catalog.length(pg_catalog.btrim(purpose)) between 1 and 500),
  constraint internal_qa_authorization_expiry_window
    check (expires_at > created_at and expires_at <= created_at + interval '15 minutes'),
  constraint internal_qa_authorization_consumed_after_create
    check (consumed_at is null or consumed_at >= created_at)
);

create index internal_qa_authorizations_expiry_idx
  on public.internal_qa_provisioning_authorizations (expires_at)
  where consumed_at is null;

comment on table public.internal_qa_provisioning_authorizations is
  'One-time service-created QA Auth bootstrap grants. Stores only a SHA-256 nonce hash.';

alter table public.internal_qa_provisioning_authorizations enable row level security;
alter table public.internal_qa_provisioning_authorizations force row level security;
revoke all on table public.internal_qa_provisioning_authorizations from public, anon, authenticated, service_role;

create or replace function public.create_internal_qa_provisioning_authorization(
  p_nonce text,
  p_provisioned_by text,
  p_purpose text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_at timestamptz := pg_catalog.timezone('utc', pg_catalog.now());
  v_expires_at timestamptz := v_created_at + interval '10 minutes';
  v_authorization_id uuid;
  v_nonce_hash text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'create_internal_qa_provisioning_authorization: service role required'
      using errcode = '42501';
  end if;
  if p_nonce is null or p_nonce !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'create_internal_qa_provisioning_authorization: nonce must be 256-bit hex'
      using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_provisioned_by, ''))) not between 1 and 160
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_purpose, ''))) not between 1 and 500 then
    raise exception 'create_internal_qa_provisioning_authorization: operator and purpose required'
      using errcode = '22023';
  end if;

  v_nonce_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_nonce, 'UTF8'), 'sha256'), 'hex'
  );
  insert into public.internal_qa_provisioning_authorizations (
    nonce_hash, created_at, expires_at, provisioned_by, purpose
  ) values (
    v_nonce_hash, v_created_at, v_expires_at,
    pg_catalog.btrim(p_provisioned_by), pg_catalog.btrim(p_purpose)
  ) returning authorization_id into v_authorization_id;

  return pg_catalog.jsonb_build_object(
    'authorizationId', v_authorization_id,
    'expiresAt', v_expires_at
  );
end;
$$;

revoke all on function public.create_internal_qa_provisioning_authorization(text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_internal_qa_provisioning_authorization(text, text, text)
  to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fname text;
  lname text;
  full_name text;
  prof text;
  template_package record;
  new_package_id uuid;
  template_form record;
  v_expected text;
  v_terms text;
  v_privacy text;
  v_flag text;
  v_is_internal_qa boolean := coalesce(new.raw_app_meta_data -> 'internal_qa' = 'true'::jsonb, false);
  v_nonce_hash text := nullif(pg_catalog.btrim(new.raw_app_meta_data ->> 'internal_qa_bootstrap_nonce_hash'), '');
  v_pending_nonce_hash text := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'internal_qa_bootstrap_nonce_hash'), '');
  v_authorization public.internal_qa_provisioning_authorizations%rowtype;
begin
  -- GoTrue applies Admin API app_metadata in a follow-up UPDATE, after the
  -- auth.users INSERT trigger. A matching one-time nonce hash in user metadata
  -- only defers bootstrap; it does not classify or authorize a QA account.
  -- The UPDATE trigger below requires trusted raw_app_meta_data before the
  -- authorization is consumed and any application rows are created.
  if tg_op = 'INSERT' and not v_is_internal_qa and v_pending_nonce_hash is not null then
    if v_pending_nonce_hash !~ '^[0-9a-fA-F]{64}$' then
      raise exception 'handle_new_user: invalid internal QA bootstrap handoff';
    end if;

    perform 1
    from public.internal_qa_provisioning_authorizations a
    where a.nonce_hash = pg_catalog.lower(v_pending_nonce_hash)
      and a.consumed_at is null
      and a.expires_at > pg_catalog.now();

    if found then
      return new;
    end if;
  end if;

  if v_is_internal_qa then
    if v_nonce_hash is null or v_nonce_hash !~ '^[0-9a-fA-F]{64}$' then
      raise exception 'handle_new_user: valid internal QA authorization required';
    end if;
    v_nonce_hash := pg_catalog.lower(v_nonce_hash);

    select * into v_authorization
    from public.internal_qa_provisioning_authorizations a
    where a.nonce_hash = v_nonce_hash
      and a.consumed_at is null
      and a.expires_at > pg_catalog.now()
    for update;

    if not found then
      raise exception 'handle_new_user: internal QA authorization invalid, expired, or consumed';
    end if;

    update public.internal_qa_provisioning_authorizations
    set consumed_at = pg_catalog.timezone('utc', pg_catalog.now())
    where authorization_id = v_authorization.authorization_id
      and consumed_at is null
      and expires_at > pg_catalog.now();

    if not found then
      raise exception 'handle_new_user: internal QA authorization could not be consumed';
    end if;

    insert into public.internal_qa_accounts (user_id, provisioned_by, purpose)
    values (new.id, v_authorization.provisioned_by, v_authorization.purpose);
  else
    if v_nonce_hash is not null then
      raise exception 'handle_new_user: internal QA nonce without trusted app metadata';
    end if;

    -- Customer legal acceptance gate; preserve the current 1.1 behavior.
    v_expected := public.current_production_legal_version();
    v_flag := pg_catalog.lower(coalesce(new.raw_user_meta_data->>'legal_registration_accepted', ''));
    if v_flag not in ('true', 't', '1') then
      raise exception 'handle_new_user: legal registration acceptance required';
    end if;

    v_terms := coalesce(nullif(pg_catalog.btrim(new.raw_user_meta_data->>'terms_version'), ''), '');
    v_privacy := coalesce(nullif(pg_catalog.btrim(new.raw_user_meta_data->>'privacy_version'), ''), '');
    if v_terms is distinct from v_expected or v_privacy is distinct from v_expected then
      raise exception 'handle_new_user: legal version mismatch';
    end if;
  end if;

  fname := coalesce(nullif(pg_catalog.btrim(new.raw_user_meta_data->>'first_name'), ''), '');
  lname := coalesce(nullif(pg_catalog.btrim(new.raw_user_meta_data->>'last_name'), ''), '');
  prof := coalesce(nullif(pg_catalog.btrim(new.raw_user_meta_data->>'profession'), ''), '');
  full_name := pg_catalog.btrim(fname || ' ' || lname, ' ');
  if full_name = '' then
    full_name := pg_catalog.split_part(coalesce(new.email, 'user'), '@', 1);
  end if;

  insert into public.profiles (id, first_name, last_name, profession)
  values (new.id, fname, lname, prof)
  on conflict (id) do update
    set
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      profession = excluded.profession,
      updated_at = timezone('utc', now());

  insert into public.users (id, email, name)
  values (new.id, coalesce(new.email, ''), full_name)
  on conflict (id) do update
    set
      email = excluded.email,
      name = excluded.name;

  -- ONLY explicit system templates (never another studio's private rows)
  for template_form in
    select *
    from public.forms
    where is_system_template = true
      and is_active = true
  loop
    if not exists (
      select 1
      from public.forms f
      where f.user_id = new.id
        and f.slug = template_form.slug
        and f.version = template_form.version
    ) then
      insert into public.forms (
        name, slug, description, category, schema, version, is_active,
        user_id, is_system_template
      )
      values (
        template_form.name,
        template_form.slug,
        template_form.description,
        template_form.category,
        template_form.schema,
        template_form.version,
        template_form.is_active,
        new.id,
        false
      );
    end if;
  end loop;

  for template_package in
    select *
    from public.packages
    where is_system_template = true
      and is_active = true
  loop
    if exists (
      select 1
      from public.packages p
      where p.user_id = new.id
        and p.slug = template_package.slug
    ) then
      continue;
    end if;

    insert into public.packages (
      name, slug, description, price, deposit_amount, currency, color,
      is_active, sort_order, user_id, is_system_template
    )
    values (
      template_package.name,
      template_package.slug,
      template_package.description,
      template_package.price,
      template_package.deposit_amount,
      template_package.currency,
      template_package.color,
      template_package.is_active,
      template_package.sort_order,
      new.id,
      false
    )
    returning id into new_package_id;

    insert into public.package_items (
      package_id, title, description, sort_order
    )
    select
      new_package_id,
      pi.title,
      pi.description,
      pi.sort_order
    from public.package_items pi
    where pi.package_id = template_package.id;
  end loop;

  insert into public.extra_services (
    name, slug, description, price, currency, is_active, sort_order,
    user_id, is_system_template
  )
  select
    es.name,
    es.slug,
    es.description,
    es.price,
    es.currency,
    es.is_active,
    es.sort_order,
    new.id,
    false
  from public.extra_services es
  where es.is_system_template = true
    and es.is_active = true
    and not exists (
      select 1
      from public.extra_services own
      where own.user_id = new.id
        and own.slug = es.slug
    );

  perform public.provision_official_pre_wedding_presets(new.id);

  -- QA accounts are not customer registrations and have no consent evidence.
  if not v_is_internal_qa then
    insert into public.user_legal_acceptances (
      user_id, terms_version, privacy_version, accepted_at, source
    )
    values (
      new.id, v_terms, v_privacy, pg_catalog.timezone('utc', pg_catalog.now()), 'registration'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;

create trigger on_auth_user_qa_metadata_updated
  after update of raw_app_meta_data on auth.users
  for each row
  when (new.raw_app_meta_data -> 'internal_qa' = 'true'::jsonb)
  execute function public.handle_new_user();

create or replace function public.on_public_user_created_init_billing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _ba uuid;
begin
  if exists (
    select 1 from public.internal_qa_accounts qa where qa.user_id = new.id
  ) then
    return new;
  end if;

  _ba := public.ensure_billing_account_for_user(new.id);
  perform public.initialize_trial_subscription(_ba, timezone('utc', now()));
  return new;
end;
$$;

revoke all on function public.on_public_user_created_init_billing() from public, anon, authenticated, service_role;

create or replace function public.get_my_subscription_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _ba uuid;
  _ent jsonb;
begin
  if _uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if exists (select 1 from public.internal_qa_accounts qa where qa.user_id = _uid) then
    return pg_catalog.jsonb_build_object(
      'entitlement', pg_catalog.jsonb_build_object(
        'accessLevel', 'pro', 'source', 'internal_qa', 'plan', 'pro',
        'billingInterval', null, 'status', 'internal_qa',
        'trialStartedAt', null, 'trialEndsAt', null, 'trialTotalDays', null,
        'currentPeriodStartedAt', null, 'currentPeriodEndsAt', null,
        'manualAccessUntil', null, 'manualAccessIndefinite', false,
        'provider', null, 'providerStatus', null, 'cancelAtPeriodEnd', false,
        'daysRemaining', null, 'canUseProFeatures', true,
        'billingAccountId', null, 'subscriptionId', null
      ),
      'plans', '[]'::jsonb,
      'paymentsAvailable', false,
      'paymentsMessage', null
    );
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
      where not exists (
        select 1
        from public.billing_accounts qa_ba
        join public.internal_qa_accounts qa on qa.user_id = qa_ba.owner_user_id
        where qa_ba.id = s.billing_account_id
      )
        and s.status = 'trialing' and s.trial_ends_at > _now
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
      where not exists (
        select 1
        from public.billing_accounts qa_ba
        join public.internal_qa_accounts qa on qa.user_id = qa_ba.owner_user_id
        where qa_ba.id = s.billing_account_id
      )
        and s.status = 'trialing'
        and s.trial_ends_at > _now
        and s.trial_ends_at <= _now + interval '7 days'
        and not (s.manual_access_indefinite or (s.manual_access_until is not null and s.manual_access_until > _now))
    ),
    'proActive', (
      select count(*)::bigint
      from public.account_subscriptions s
      where not exists (
        select 1
        from public.billing_accounts qa_ba
        join public.internal_qa_accounts qa on qa.user_id = qa_ba.owner_user_id
        where qa_ba.id = s.billing_account_id
      )
        and (
        (s.status = 'active' and (s.current_period_ends_at is null or s.current_period_ends_at > _now))
        or s.manual_access_indefinite
        or (s.manual_access_until is not null and s.manual_access_until > _now)
      )
    ),
    'expired', (
      select count(*)::bigint
      from public.account_subscriptions s
      where not exists (
        select 1
        from public.billing_accounts qa_ba
        join public.internal_qa_accounts qa on qa.user_id = qa_ba.owner_user_id
        where qa_ba.id = s.billing_account_id
      )
        and not (
        s.manual_access_indefinite
        or (s.manual_access_until is not null and s.manual_access_until > _now)
        or (s.status = 'active' and (s.current_period_ends_at is null or s.current_period_ends_at > _now))
        or (s.status = 'trialing' and s.trial_ends_at > _now)
      )
    ),
    'manualAccess', (
      select count(*)::bigint
      from public.account_subscriptions s
      where not exists (
        select 1
        from public.billing_accounts qa_ba
        join public.internal_qa_accounts qa on qa.user_id = qa_ba.owner_user_id
        where qa_ba.id = s.billing_account_id
      )
        and (
          s.manual_access_indefinite
          or (s.manual_access_until is not null and s.manual_access_until > _now)
        )
    ),
    'paymentsConnected', false
  );
end;
$$;

revoke all on function public.admin_get_subscription_metrics() from public, anon;
grant execute on function public.admin_get_subscription_metrics() to authenticated;

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
      where not exists (
        select 1 from public.internal_qa_accounts qa where qa.user_id = ba.owner_user_id
      )
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

-- The preset helper is only called from this trusted Auth trigger.
alter function public.provision_official_pre_wedding_presets(uuid) set search_path = '';
revoke all on function public.provision_official_pre_wedding_presets(uuid)
  from public, anon, authenticated, service_role;

-- Guard commercial admin listings defensively, even if an unexpected billing row exists.

commit;
