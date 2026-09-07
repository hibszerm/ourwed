-- =============================================================================
-- Account erasure pipeline (P0) — Phase 2A.3 production hardening
-- =============================================================================
-- Unshipped feature migration (never applied remotely yet). Updated in place
-- rather than stacking a corrective migration, for cleanest history.
--
-- REMOTE SUPABASE TARGET (sole hosted project):
--   xyycwllsovpxlcustpcv  — live OurWed infrastructure (production-like).
-- Controlled QA must use synthetic disposable accounts only.
--
-- Objects:
-- 1) Locked-document trigger — DELETE exemption only under erasure GUC
-- 2) erase_account_data(uuid) — SECURITY DEFINER, hardened search_path=''
-- 3) account_deletion_rate_limits + check RPC (service_role)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Locked-document trigger: DELETE exemption only under erasure GUC
-- ---------------------------------------------------------------------------

create or replace function public.prevent_locked_wedding_document_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.lock_status in ('finalized', 'signed', 'locked') then
      if new.file_path is distinct from old.file_path
        or new.file_name is distinct from old.file_name
        or new.snapshot_json is distinct from old.snapshot_json
        or new.version_number is distinct from old.version_number
        or new.format is distinct from old.format
        or new.draft_id is distinct from old.draft_id
        or new.template_version_id is distinct from old.template_version_id
      then
        raise exception 'Locked wedding document % is immutable', old.id;
      end if;
      if new.lock_status is distinct from old.lock_status
        and new.lock_status not in ('finalized', 'signed', 'locked')
      then
        raise exception 'Cannot unlock wedding document %', old.id;
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    if old.lock_status in ('finalized', 'signed', 'locked') then
      -- Account erasure only: transaction-local GUC set by erase_account_data.
      if pg_catalog.current_setting('ourwed.account_erasure', true) is distinct from 'on' then
        raise exception 'Cannot delete locked wedding document %', old.id;
      end if;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.prevent_locked_wedding_document_mutation() is
  'Blocks mutation of finalized/signed/locked wedding_documents. DELETE allowed only when transaction-local ourwed.account_erasure=on (account erasure RPC). UPDATE never exempted.';

-- ---------------------------------------------------------------------------
-- Rate limit table (service-role Edge Function only)
-- ---------------------------------------------------------------------------

create table if not exists public.account_deletion_rate_limits (
  user_id uuid primary key,
  window_started_at timestamptz not null,
  attempt_count integer not null default 0
    check (attempt_count >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.account_deletion_rate_limits is
  'Per-user attempt counters for delete-account password reauth. Service-role only.';

alter table public.account_deletion_rate_limits enable row level security;
alter table public.account_deletion_rate_limits force row level security;

revoke all on table public.account_deletion_rate_limits from public;
revoke all on table public.account_deletion_rate_limits from anon;
revoke all on table public.account_deletion_rate_limits from authenticated;
-- No policies for authenticated/anon — Edge uses service_role.

create or replace function public.account_deletion_rate_limit_consume(
  p_user_id uuid,
  p_window_seconds integer default 900,
  p_max_attempts integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_now timestamptz := pg_catalog.timezone('utc', pg_catalog.now());
  v_row public.account_deletion_rate_limits%rowtype;
  -- GREATEST is SQL-keyword syntax (cannot use pg_catalog.greatest under search_path='').
  v_window_seconds integer := GREATEST(coalesce(p_window_seconds, 900), 60);
  v_max_attempts integer := GREATEST(coalesce(p_max_attempts, 5), 1);
  v_retry_after integer;
begin
  if p_user_id is null then
    raise exception 'account_deletion_rate_limit_consume: user id required';
  end if;

  v_role := coalesce(auth.role(), pg_catalog.current_setting('request.jwt.claim.role', true));
  if v_role is distinct from 'service_role' then
    raise exception 'account_deletion_rate_limit_consume: forbidden';
  end if;

  select * into v_row
  from public.account_deletion_rate_limits
  where user_id = p_user_id
  for update;

  if not found then
    insert into public.account_deletion_rate_limits (
      user_id, window_started_at, attempt_count, updated_at
    ) values (
      p_user_id, v_now, 1, v_now
    );
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'allowed', true,
      'attempt_count', 1,
      'max_attempts', v_max_attempts
    );
  end if;

  if v_row.window_started_at + (v_window_seconds * interval '1 second') <= v_now then
    update public.account_deletion_rate_limits
    set window_started_at = v_now,
        attempt_count = 1,
        updated_at = v_now
    where user_id = p_user_id;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'allowed', true,
      'attempt_count', 1,
      'max_attempts', v_max_attempts
    );
  end if;

  if v_row.attempt_count >= v_max_attempts then
    -- EXTRACT is SQL-keyword syntax (cannot be schema-qualified as pg_catalog.extract).
    v_retry_after := GREATEST(
      1,
      pg_catalog.ceil(
        EXTRACT(
          EPOCH FROM (
            (v_row.window_started_at + (v_window_seconds * interval '1 second')) - v_now
          )
        )
      )::integer
    );
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'allowed', false,
      'attempt_count', v_row.attempt_count,
      'max_attempts', v_max_attempts,
      'retry_after_seconds', v_retry_after
    );
  end if;

  update public.account_deletion_rate_limits
  set attempt_count = v_row.attempt_count + 1,
      updated_at = v_now
  where user_id = p_user_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'allowed', true,
    'attempt_count', v_row.attempt_count + 1,
    'max_attempts', v_max_attempts
  );
end;
$$;

comment on function public.account_deletion_rate_limit_consume(uuid, integer, integer) is
  'Service-role only. Consumes one delete-account attempt in a sliding fixed window.';

revoke all on function public.account_deletion_rate_limit_consume(uuid, integer, integer) from public;
revoke all on function public.account_deletion_rate_limit_consume(uuid, integer, integer) from anon;
revoke all on function public.account_deletion_rate_limit_consume(uuid, integer, integer) from authenticated;
grant execute on function public.account_deletion_rate_limit_consume(uuid, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- erase_account_data — CRM database erasure for one verified account
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

  -- Trusted Edge Function must call with service_role. Never expose to clients.
  v_role := coalesce(auth.role(), pg_catalog.current_setting('request.jwt.claim.role', true));
  if v_role is distinct from 'service_role' then
    raise exception 'erase_account_data: forbidden';
  end if;

  -- Block deletion of the sole enabled platform admin/owner.
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

  -- Idempotent: CRM root already gone → success (Auth/Storage handled by Edge).
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    return pg_catalog.jsonb_build_object('ok', true, 'already_erased', true);
  end if;

  -- Transaction-local erasure context for locked-document DELETE.
  perform pg_catalog.set_config('ourwed.account_erasure', 'on', true);

  -- 1) Public questionnaire / form token trees (before forms catalog)
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

  -- 2) Document draft / generation RESTRICT blockers (before templates)
  delete from public.wedding_document_drafts
  where wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  delete from public.wedding_contract_generation_runs
  where wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  -- Locked docs: allowed only because ourwed.account_erasure=on
  delete from public.wedding_documents
  where wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  -- 3) Extras junction before owned catalog extras
  delete from public.wedding_extra_services
  where wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  -- 4) Remaining wedding trees (CASCADE covers places, payments, contacts, etc.)
  delete from public.weddings
  where user_id = p_user_id;

  -- 5) Document component links (RESTRICT on component versions) then components
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

  -- 6) Templates / versions (owned only — never system/null)
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

  -- 7) Owned catalog (never user_id IS NULL / system seeds)
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

  -- 8) Direct CRM ownership remnants
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

  -- Prewedding templates owned by this auth id (also auth-cascade later)
  delete from public.questionnaire_templates
  where owner_id = p_user_id;

  -- Billing placeholder (CASCADE from public.users also covers this)
  delete from public.account_subscriptions sub
  using public.billing_accounts ba
  where sub.billing_account_id = ba.id
    and ba.owner_user_id = p_user_id;

  delete from public.billing_accounts
  where owner_user_id = p_user_id;

  -- Rate-limit row for this user (optional cleanup; not required for Auth cascade)
  delete from public.account_deletion_rate_limits
  where user_id = p_user_id;

  -- 9) CRM root last
  delete from public.users
  where id = p_user_id;

  return pg_catalog.jsonb_build_object('ok', true, 'already_erased', false);
end;
$$;

comment on function public.erase_account_data(uuid) is
  'Service-role only. Ordered CRM erasure for one account. Hardened search_path=''''. Sets ourwed.account_erasure for locked document DELETE. Blocks sole enabled admin owner. Idempotent if public.users already absent. Does not delete auth.users or Storage. Does not delete admin_audit_log.';

revoke all on function public.erase_account_data(uuid) from public;
revoke all on function public.erase_account_data(uuid) from anon;
revoke all on function public.erase_account_data(uuid) from authenticated;
grant execute on function public.erase_account_data(uuid) to service_role;

-- LEGAL / P0 PAYMENT ACCOUNT-DELETION INTEGRATION:
-- When a production PSP is selected, extend account erasure to cancel active
-- subscriptions, retain legally required invoice/tax records, and coordinate
-- webhook races. Do not invent PSP behavior before provider selection.
