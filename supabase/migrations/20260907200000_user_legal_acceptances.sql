-- Legal acceptance persistence V1 (new signups only).
-- NO BACKFILL of existing auth.users / public.users.
-- Acceptance evidence is created only by trusted handle_new_user after Auth insert.
-- Future Legal version bumps must update BOTH:
--   - src/features/legal/legalMeta.ts LEGAL_VERSION
--   - public.current_production_legal_version() below

-- ---------------------------------------------------------------------------
-- Canonical production legal document version (server-controlled)
-- ---------------------------------------------------------------------------

create or replace function public.current_production_legal_version()
returns text
language sql
immutable
set search_path = ''
as $$
  select '1.1'::text;
$$;

comment on function public.current_production_legal_version() is
  'Trusted current Terms/Privacy document version for signup acceptance. Keep in sync with LEGAL_VERSION in legalMeta.ts.';

revoke all on function public.current_production_legal_version() from public;
revoke all on function public.current_production_legal_version() from anon;
revoke all on function public.current_production_legal_version() from authenticated;
grant execute on function public.current_production_legal_version() to authenticated;
grant execute on function public.current_production_legal_version() to service_role;

-- ---------------------------------------------------------------------------
-- Append-only acceptance evidence (new accounts only — no seed/backfill)
-- ---------------------------------------------------------------------------

create table if not exists public.user_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default timezone('utc', now()),
  source text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_legal_acceptances_source_check
    check (source = 'registration'),
  constraint user_legal_acceptances_terms_version_check
    check (char_length(trim(terms_version)) > 0),
  constraint user_legal_acceptances_privacy_version_check
    check (char_length(trim(privacy_version)) > 0)
);

comment on table public.user_legal_acceptances is
  'Immutable signup legal acceptance evidence. Append-only. No backfill of pre-existing accounts. Deleted with account erasure / Auth cascade.';

create index if not exists user_legal_acceptances_user_id_idx
  on public.user_legal_acceptances (user_id);

create index if not exists user_legal_acceptances_accepted_at_idx
  on public.user_legal_acceptances (accepted_at desc);

alter table public.user_legal_acceptances enable row level security;
alter table public.user_legal_acceptances force row level security;

revoke all on table public.user_legal_acceptances from public;
revoke all on table public.user_legal_acceptances from anon;
revoke all on table public.user_legal_acceptances from authenticated;

-- Owner may read own evidence; never insert/update/delete from clients.
grant select on table public.user_legal_acceptances to authenticated;

drop policy if exists user_legal_acceptances_owner_select on public.user_legal_acceptances;
create policy user_legal_acceptances_owner_select
  on public.user_legal_acceptances
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- No INSERT/UPDATE/DELETE policies for authenticated/anon.
-- Trusted creation: security definer handle_new_user only.
-- Service role bypasses RLS for erasure.

-- ---------------------------------------------------------------------------
-- handle_new_user — require validated legal acceptance metadata; persist row
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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
begin
  -- Legal acceptance gate (fail signup rather than create unproven account).
  v_expected := public.current_production_legal_version();
  v_flag := lower(coalesce(new.raw_user_meta_data->>'legal_registration_accepted', ''));
  if v_flag not in ('true', 't', '1') then
    raise exception 'handle_new_user: legal registration acceptance required';
  end if;

  v_terms := coalesce(nullif(trim(new.raw_user_meta_data->>'terms_version'), ''), '');
  v_privacy := coalesce(nullif(trim(new.raw_user_meta_data->>'privacy_version'), ''), '');
  if v_terms is distinct from v_expected or v_privacy is distinct from v_expected then
    raise exception 'handle_new_user: legal version mismatch';
  end if;

  fname := coalesce(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), '');
  lname := coalesce(nullif(trim(new.raw_user_meta_data->>'last_name'), ''), '');
  prof := coalesce(nullif(trim(new.raw_user_meta_data->>'profession'), ''), '');
  full_name := trim(both ' ' from fname || ' ' || lname);
  if full_name = '' then
    full_name := split_part(coalesce(new.email, 'user'), '@', 1);
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

  -- Immutable acceptance evidence (server timestamp; versions already validated).
  insert into public.user_legal_acceptances (
    user_id,
    terms_version,
    privacy_version,
    accepted_at,
    source
  )
  values (
    new.id,
    v_terms,
    v_privacy,
    timezone('utc', now()),
    'registration'
  );

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Auth signup provisioning. Requires legal_registration_accepted + matching terms/privacy versions. Persists user_legal_acceptances. No backfill of existing users.';

-- ---------------------------------------------------------------------------
-- erase_account_data — delete legal acceptance with active CRM data
-- Decision: V1 deletes acceptance with account erasure (no retention schedule
-- / legal-defense store implemented). FK ON DELETE CASCADE also covers Auth.
-- ---------------------------------------------------------------------------

create or replace function public.erase_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_enabled_admin_count integer;
begin
  if p_user_id is null then
    raise exception 'erase_account_data: user id required';
  end if;

  v_role := coalesce(auth.role(), pg_catalog.current_setting('request.jwt.claim.role', true));
  if v_role is distinct from 'service_role' then
    raise exception 'erase_account_data: forbidden';
  end if;

  if exists (
    select 1
    from public.admin_members am
    where am.user_id = p_user_id
      and am.enabled is true
      and am.role = 'owner'
  ) then
    select count(*)::integer into v_enabled_admin_count
    from public.admin_members am
    where am.enabled is true;

    if v_enabled_admin_count <= 1 then
      raise exception 'erase_account_data: sole_admin_blocked'
        using errcode = 'P0001';
    end if;
  end if;

  if not exists (select 1 from public.users u where u.id = p_user_id) then
    return pg_catalog.jsonb_build_object('ok', true, 'already_erased', true);
  end if;

  perform pg_catalog.set_config('ourwed.account_erasure', 'on', true);

  delete from public.form_answers fa
  using public.form_instances fi
  where fa.instance_id = fi.id
    and fi.user_id = p_user_id;

  delete from public.form_instances
  where user_id = p_user_id;

  delete from public.wedding_questionnaire_responses wqr
  using public.wedding_questionnaires wq
  where wqr.questionnaire_id = wq.id
    and (
      wq.owner_id = p_user_id
      or wq.wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id)
    );

  delete from public.wedding_questionnaires
  where owner_id = p_user_id
     or wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  delete from public.wedding_document_drafts
  where wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  delete from public.wedding_contract_generation_runs
  where wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  delete from public.wedding_documents
  where wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  delete from public.wedding_extra_services
  where wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  delete from public.weddings
  where user_id = p_user_id;

  delete from public.document_template_component_links l
  using public.document_template_versions tv
  join public.document_templates t on t.id = tv.template_id
  where l.template_version_id = tv.id
    and t.user_id = p_user_id;

  delete from public.document_template_component_links l
  using public.document_component_versions cv
  join public.document_components c on c.id = cv.component_id
  where l.component_version_id = cv.id
    and c.user_id = p_user_id;

  delete from public.document_block_conditions bc
  using public.document_blocks b
  join public.document_component_versions cv on cv.id = b.component_version_id
  join public.document_components c on c.id = cv.component_id
  where bc.block_id = b.id
    and c.user_id = p_user_id;

  delete from public.document_blocks b
  using public.document_component_versions cv
  join public.document_components c on c.id = cv.component_id
  where b.component_version_id = cv.id
    and c.user_id = p_user_id;

  delete from public.document_component_versions cv
  using public.document_components c
  where cv.component_id = c.id
    and c.user_id = p_user_id;

  update public.document_components
  set current_version_id = null
  where user_id = p_user_id;

  delete from public.document_components
  where user_id = p_user_id;

  delete from public.wedding_document_generation_sequences s
  using public.document_templates t
  where s.template_id = t.id
    and t.user_id = p_user_id;

  update public.document_templates
  set current_version_id = null,
      questionnaire_form_id = null
  where user_id = p_user_id;

  delete from public.document_template_versions tv
  using public.document_templates t
  where tv.template_id = t.id
    and t.user_id = p_user_id;

  delete from public.document_templates
  where user_id = p_user_id;

  delete from public.document_clause_defs
  where user_id = p_user_id;

  delete from public.forms
  where user_id = p_user_id;

  delete from public.package_items pi
  using public.packages p
  where pi.package_id = p.id
    and p.user_id = p_user_id;

  delete from public.packages
  where user_id = p_user_id;

  delete from public.extra_services
  where user_id = p_user_id;

  delete from public.session_payments sp
  using public.sessions s
  where sp.session_id = s.id
    and s.user_id = p_user_id;

  delete from public.sessions
  where user_id = p_user_id;

  delete from public.tasks
  where user_id = p_user_id;

  delete from public.notifications
  where user_id = p_user_id;

  delete from public.studio_travel_settings
  where user_id = p_user_id;

  delete from public.wedding_source_contracts
  where user_id = p_user_id;

  delete from public.wedding_contract_recoveries
  where user_id = p_user_id;

  delete from public.questionnaire_templates
  where owner_id = p_user_id;

  delete from public.account_subscriptions sub
  using public.billing_accounts ba
  where sub.billing_account_id = ba.id
    and ba.owner_user_id = p_user_id;

  delete from public.billing_accounts
  where owner_user_id = p_user_id;

  delete from public.account_deletion_rate_limits
  where user_id = p_user_id;

  -- Legal acceptance evidence (V1: erase with account; no separate retention store)
  delete from public.user_legal_acceptances
  where user_id = p_user_id;

  delete from public.users
  where id = p_user_id;

  return pg_catalog.jsonb_build_object('ok', true, 'already_erased', false);
end;
$$;

comment on function public.erase_account_data(uuid) is
  'Service-role only. Ordered CRM erasure for one account including user_legal_acceptances. Hardened search_path=''''. Sets ourwed.account_erasure for locked document DELETE. Blocks sole enabled admin owner. Idempotent if public.users already absent. Does not delete auth.users or Storage. Does not delete admin_audit_log.';

revoke all on function public.erase_account_data(uuid) from public;
revoke all on function public.erase_account_data(uuid) from anon;
revoke all on function public.erase_account_data(uuid) from authenticated;
grant execute on function public.erase_account_data(uuid) to service_role;
