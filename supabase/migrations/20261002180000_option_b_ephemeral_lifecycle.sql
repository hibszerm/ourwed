-- Give Option B generation runs an active-flow lifetime without changing the
-- shared seven-day default used by legacy payment-schedule runs.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema net;

alter table public.wedding_contract_generation_runs
  add column ephemeral_lifecycle_version smallint,
  add constraint wedding_contract_generation_runs_ephemeral_lifecycle_version_check
    check (ephemeral_lifecycle_version is null or ephemeral_lifecycle_version = 1);

create index wedding_contract_generation_runs_ephemeral_cleanup_idx
  on public.wedding_contract_generation_runs (expires_at)
  where session_kind = 'option_b' and ephemeral_lifecycle_version = 1;

create or replace function public.begin_option_b_generation(
  p_owner_id uuid,
  p_wedding_id uuid,
  p_template_id uuid,
  p_template_version_id uuid,
  p_source_sha256 text,
  p_authority_fingerprint text,
  p_execution_id uuid,
  p_request_id uuid
)
returns table(session_row jsonb, superseded_candidates jsonb, replay boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_owner_id uuid := p_owner_id;
  v_existing public.wedding_contract_generation_runs%rowtype;
  v_new public.wedding_contract_generation_runs%rowtype;
  v_candidates jsonb;
begin
  if auth.role() <> 'service_role' or v_owner_id is null then
    raise exception 'trusted generation boundary required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner_id::text || ':' || p_wedding_id::text, 0));

  select * into v_existing
  from public.wedding_contract_generation_runs
  where owner_user_id = v_owner_id and session_kind = 'option_b' and idempotency_key = p_request_id
  limit 1;
  if found then
    return query select to_jsonb(v_existing), '[]'::jsonb, true;
    return;
  end if;

  if not exists (
    select 1 from public.weddings
    where id = p_wedding_id and user_id = v_owner_id
  ) or not exists (
    select 1
    from public.document_templates template
    join public.document_template_versions version
      on version.template_id = template.id
    where template.id = p_template_id
      and version.id = p_template_version_id
      and template.user_id = v_owner_id
  ) or p_source_sha256 !~ '^[a-f0-9]{64}$'
    or p_authority_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'generation scope invalid';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('sessionId', id, 'path', intermediate_docx_path))
                    filter (where intermediate_docx_path is not null), '[]'::jsonb)
    into v_candidates
  from public.wedding_contract_generation_runs
  where owner_user_id = v_owner_id and wedding_id = p_wedding_id and session_kind = 'option_b'
    and session_state in ('processing', 'awaiting_input', 'completed');

  update public.wedding_contract_generation_runs
  set session_state = 'abandoned', generation_status = 'failed',
      missing_inputs_json = '[]'::jsonb, user_answers_json = '[]'::jsonb,
      resolved_values_json = '{}'::jsonb, authority_fingerprint = null,
      ephemeral_lifecycle_version = 1,
      expires_at = timezone('utc', now()) + interval '30 minutes'
  where owner_user_id = v_owner_id and wedding_id = p_wedding_id and session_kind = 'option_b'
    and session_state in ('processing', 'awaiting_input', 'completed');

  insert into public.wedding_contract_generation_runs (
    wedding_id, template_id, template_version_id, generation_status, resolved_values_json,
    owner_user_id, session_kind, session_state, missing_inputs_json, user_answers_json,
    source_sha256, authority_fingerprint, execution_id, idempotency_key, expires_at,
    ephemeral_lifecycle_version
  ) values (
    p_wedding_id, p_template_id, p_template_version_id, 'processing', '{}'::jsonb,
    v_owner_id, 'option_b', 'processing',
    '{"version":1,"pending":[],"history":[]}'::jsonb, '[]'::jsonb,
    p_source_sha256, p_authority_fingerprint, p_execution_id, p_request_id,
    timezone('utc', now()) + interval '30 minutes', 1
  ) returning * into v_new;

  return query select to_jsonb(v_new), v_candidates, false;
end;
$$;

revoke all on function public.begin_option_b_generation(uuid, uuid, uuid, uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_option_b_generation(uuid, uuid, uuid, uuid, text, text, uuid, uuid)
  to service_role;

create or replace function public.invoke_option_b_ephemeral_cleanup()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_project_url text;
  v_publishable_key text;
  v_cleanup_token text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_publishable_key
  from vault.decrypted_secrets where name = 'publishable_key' limit 1;
  select decrypted_secret into v_cleanup_token
  from vault.decrypted_secrets where name = 'option_b_cleanup_token' limit 1;
  if coalesce(v_project_url, '') = '' or coalesce(v_publishable_key, '') = ''
    or coalesce(v_cleanup_token, '') = '' then
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/contract-generation-boundary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json', 'apikey', v_publishable_key,
      'Authorization', 'Bearer ' || v_cleanup_token
    ),
    body := '{"version":1,"action":"cleanup_expired","request":{}}'::jsonb
  );
end;
$$;

revoke all on function public.invoke_option_b_ephemeral_cleanup() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'option-b-ephemeral-cleanup';
    perform cron.schedule(
      'option-b-ephemeral-cleanup',
      '* * * * *',
      'select public.invoke_option_b_ephemeral_cleanup();'
    );
  end if;
end;
$$;

comment on function public.begin_option_b_generation(uuid, uuid, uuid, uuid, text, text, uuid, uuid) is
  'Atomically supersedes prior active/preview Option B runs and starts a 30-minute ephemeral transaction for the owner validated by the authenticated Edge boundary.';
comment on column public.wedding_contract_generation_runs.ephemeral_lifecycle_version is
  'Option B cleanup generation marker. Null preserves pre-existing historical and legacy rows; version 1 is owned by the 30-minute ephemeral lifecycle.';
comment on function public.invoke_option_b_ephemeral_cleanup() is
  'Scheduled Option B-only cleanup dispatcher. Configure Vault secrets project_url, publishable_key, and option_b_cleanup_token, plus matching Edge secret OPTION_B_CLEANUP_TOKEN.';
