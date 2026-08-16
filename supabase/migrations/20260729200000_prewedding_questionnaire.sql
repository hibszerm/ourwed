-- =============================================================================
-- Pre-Wedding Questionnaire Module
-- =============================================================================
-- Tables:
--   questionnaire_templates       — reusable photographer-owned templates
--   wedding_questionnaires        — one snapshot per wedding (immutable after send)
--   wedding_questionnaire_responses — autosaved + submitted couple answers
--
-- Public access:
--   public_get_prewedding_questionnaire(token text)   — validate token → schema
--   public_autosave_prewedding_questionnaire(token, answers) — debounced autosave
--   public_submit_prewedding_questionnaire(token, answers)   — final submit
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. questionnaire_templates
-- ---------------------------------------------------------------------------

create table public.questionnaire_templates (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  -- source_key: stable built-in key, e.g. 'pre_wedding_default_v1'
  source_key    text,
  title         text not null default '',
  introduction  text not null default '',
  schema_json   jsonb not null default '{"sections":[]}'::jsonb,
  version       integer not null default 1,
  is_default    boolean not null default false,
  is_archived   boolean not null default false,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

comment on table public.questionnaire_templates is
  'Reusable pre-wedding questionnaire templates owned by photographer.';
comment on column public.questionnaire_templates.source_key is
  'Stable built-in template identifier for default-seeding deduplication.';
comment on column public.questionnaire_templates.schema_json is
  'Sections + questions array. See PreWeddingTemplateSchema type.';

create index on public.questionnaire_templates (owner_id, is_archived);

-- Trigger: bump updated_at + version when schema_json changes
create or replace function public.questionnaire_template_version_bump()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  if new.schema_json is distinct from old.schema_json
     or new.title is distinct from old.title
     or new.introduction is distinct from old.introduction then
    new.version = old.version + 1;
  end if;
  return new;
end;
$$;

create trigger questionnaire_template_bump
  before update on public.questionnaire_templates
  for each row execute function public.questionnaire_template_version_bump();

-- Only one default per owner
create unique index questionnaire_templates_default_per_owner
  on public.questionnaire_templates (owner_id)
  where is_default = true and is_archived = false;

alter table public.questionnaire_templates enable row level security;

create policy qt_select_own on public.questionnaire_templates
  for select to authenticated
  using (owner_id = auth.uid());

create policy qt_insert_own on public.questionnaire_templates
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy qt_update_own on public.questionnaire_templates
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy qt_delete_own on public.questionnaire_templates
  for delete to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. wedding_questionnaires
-- ---------------------------------------------------------------------------

create table public.wedding_questionnaires (
  id                    uuid primary key default gen_random_uuid(),
  wedding_id            uuid not null references public.weddings(id) on delete cascade,
  owner_id              uuid not null references auth.users(id) on delete cascade,
  template_id           uuid references public.questionnaire_templates(id) on delete set null,
  template_version      integer,
  title                 text not null default '',
  introduction          text not null default '',
  -- Immutable schema snapshot — frozen at prepare time
  schema_snapshot_json  jsonb not null default '{"sections":[]}'::jsonb,
  -- Prefilled wedding data written at prepare time
  prefill_json          jsonb not null default '{}'::jsonb,
  status                text not null default 'draft'
                          check (status in (
                            'draft','ready','sent','opened',
                            'in_progress','submitted','reopened','archived'
                          )),
  -- Token stored as bcrypt/sha256 hash; plaintext returned only at generate time
  public_token_hash     text unique,
  prepared_at           timestamptz,
  sent_at               timestamptz,
  first_opened_at       timestamptz,
  last_saved_at         timestamptz,
  submitted_at          timestamptz,
  reopened_at           timestamptz,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now())
);

comment on table public.wedding_questionnaires is
  'One questionnaire instance per wedding. Schema frozen at prepare time.';
comment on column public.wedding_questionnaires.public_token_hash is
  'SHA-256 hex of plaintext token. Plaintext is never stored.';
comment on column public.wedding_questionnaires.schema_snapshot_json is
  'Frozen copy of template schema at prepare time. Template edits do not affect this.';

create index on public.wedding_questionnaires (wedding_id);
create index on public.wedding_questionnaires (owner_id);
create index on public.wedding_questionnaires (public_token_hash) where public_token_hash is not null;

create or replace function public.set_wq_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger wq_updated_at
  before update on public.wedding_questionnaires
  for each row execute function public.set_wq_updated_at();

alter table public.wedding_questionnaires enable row level security;

create policy wq_select_own on public.wedding_questionnaires
  for select to authenticated
  using (owner_id = auth.uid());

create policy wq_insert_own on public.wedding_questionnaires
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy wq_update_own on public.wedding_questionnaires
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy wq_delete_own on public.wedding_questionnaires
  for delete to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. wedding_questionnaire_responses
-- ---------------------------------------------------------------------------

create table public.wedding_questionnaire_responses (
  id                   uuid primary key default gen_random_uuid(),
  questionnaire_id     uuid not null unique
                         references public.wedding_questionnaires(id) on delete cascade,
  answers_json         jsonb not null default '{}'::jsonb,
  -- Count of answered required questions at last save
  answered_required    integer not null default 0,
  total_required       integer not null default 0,
  submitted_at         timestamptz,
  created_at           timestamptz not null default timezone('utc', now()),
  updated_at           timestamptz not null default timezone('utc', now())
);

comment on table public.wedding_questionnaire_responses is
  'Couple answers (autosaved + submitted). One row per questionnaire, upserted.';

create index on public.wedding_questionnaire_responses (questionnaire_id);

create trigger wqr_updated_at
  before update on public.wedding_questionnaire_responses
  for each row execute function public.set_wq_updated_at();

alter table public.wedding_questionnaire_responses enable row level security;

-- Photographer can read own responses (via wedding ownership)
create policy wqr_select_own on public.wedding_questionnaire_responses
  for select to authenticated
  using (
    exists (
      select 1 from public.wedding_questionnaires wq
      where wq.id = questionnaire_id
        and wq.owner_id = auth.uid()
    )
  );

-- No authenticated insert/update — couples write via SECURITY DEFINER RPC only
-- Photographer can delete (e.g. reset)
create policy wqr_delete_own on public.wedding_questionnaire_responses
  for delete to authenticated
  using (
    exists (
      select 1 from public.wedding_questionnaires wq
      where wq.id = questionnaire_id
        and wq.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. RPC — generate token (authenticated)
-- ---------------------------------------------------------------------------
-- Called by the photographer to get a plaintext token.
-- Stores only the hash. Returns plaintext once only.

-- pgcrypto is installed in schema "extensions" on Supabase.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.generate_prewedding_token(p_questionnaire_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_hash  text;
  v_owner uuid;
begin
  -- Verify ownership
  select owner_id into v_owner
  from public.wedding_questionnaires
  where id = p_questionnaire_id;

  if v_owner is null then
    raise exception 'questionnaire_not_found';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'not_owner';
  end if;

  -- Generate cryptographically random token
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

  update public.wedding_questionnaires
  set public_token_hash = v_hash,
      updated_at        = timezone('utc', now())
  where id = p_questionnaire_id;

  return v_token;
end;
$$;

revoke all on function public.generate_prewedding_token(uuid) from public, anon;
grant execute on function public.generate_prewedding_token(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC — public_get_prewedding_questionnaire (anon)
-- ---------------------------------------------------------------------------

create or replace function public.public_get_prewedding_questionnaire(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_rec  record;
begin
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select
    wq.id,
    wq.title,
    wq.introduction,
    wq.schema_snapshot_json,
    wq.prefill_json,
    wq.status,
    wq.submitted_at,
    wqr.answers_json,
    wqr.answered_required,
    wqr.total_required
  into v_rec
  from public.wedding_questionnaires wq
  left join public.wedding_questionnaire_responses wqr
    on wqr.questionnaire_id = wq.id
  where wq.public_token_hash = v_hash
    and wq.status not in ('draft', 'archived');

  if not found then
    return null;
  end if;

  -- Mark as opened on first access
  if v_rec.status = 'sent' then
    update public.wedding_questionnaires
    set status         = 'opened',
        first_opened_at = coalesce(first_opened_at, timezone('utc', now())),
        updated_at      = timezone('utc', now())
    where id = v_rec.id;
  end if;

  return jsonb_build_object(
    'id',            v_rec.id,
    'title',         v_rec.title,
    'introduction',  v_rec.introduction,
    'schema',        v_rec.schema_snapshot_json,
    'prefill',       v_rec.prefill_json,
    'status',        v_rec.status,
    'submitted_at',  v_rec.submitted_at,
    'saved_answers', coalesce(v_rec.answers_json, '{}'::jsonb),
    'answered_required', coalesce(v_rec.answered_required, 0),
    'total_required',    coalesce(v_rec.total_required, 0)
  );
end;
$$;

revoke all on function public.public_get_prewedding_questionnaire(text) from public;
grant execute on function public.public_get_prewedding_questionnaire(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC — public_autosave_prewedding_questionnaire (anon)
-- ---------------------------------------------------------------------------

create or replace function public.public_autosave_prewedding_questionnaire(
  p_token          text,
  p_answers        jsonb,
  p_answered_req   integer default 0,
  p_total_req      integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_qid  uuid;
  v_status text;
begin
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select id, status into v_qid, v_status
  from public.wedding_questionnaires
  where public_token_hash = v_hash
    and status not in ('draft', 'archived', 'submitted');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Upsert response row
  insert into public.wedding_questionnaire_responses
    (questionnaire_id, answers_json, answered_required, total_required)
  values
    (v_qid, p_answers, p_answered_req, p_total_req)
  on conflict (questionnaire_id)
  do update set
    answers_json     = excluded.answers_json,
    answered_required = excluded.answered_required,
    total_required   = excluded.total_required,
    updated_at       = timezone('utc', now());

  -- Update questionnaire timestamps
  update public.wedding_questionnaires
  set last_saved_at = timezone('utc', now()),
      status = case
        when status = 'opened' then 'in_progress'
        else status
      end,
      updated_at = timezone('utc', now())
  where id = v_qid;

  return jsonb_build_object('ok', true, 'saved_at', timezone('utc', now()));
end;
$$;

revoke all on function public.public_autosave_prewedding_questionnaire(text, jsonb, integer, integer) from public;
grant execute on function public.public_autosave_prewedding_questionnaire(text, jsonb, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPC — public_submit_prewedding_questionnaire (anon)
-- ---------------------------------------------------------------------------

create or replace function public.public_submit_prewedding_questionnaire(
  p_token        text,
  p_answers      jsonb,
  p_answered_req integer default 0,
  p_total_req    integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash   text;
  v_qid    uuid;
  v_status text;
  v_wid    uuid;
  v_oid    uuid;
  v_couple text;
begin
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select wq.id, wq.status, wq.wedding_id, wq.owner_id
  into v_qid, v_status, v_wid, v_oid
  from public.wedding_questionnaires wq
  where wq.public_token_hash = v_hash
    and wq.status not in ('draft', 'archived');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_status = 'submitted' then
    return jsonb_build_object('ok', true, 'already_submitted', true);
  end if;

  -- Upsert final answers
  insert into public.wedding_questionnaire_responses
    (questionnaire_id, answers_json, answered_required, total_required, submitted_at)
  values
    (v_qid, p_answers, p_answered_req, p_total_req, timezone('utc', now()))
  on conflict (questionnaire_id)
  do update set
    answers_json      = excluded.answers_json,
    answered_required = excluded.answered_required,
    total_required    = excluded.total_required,
    submitted_at      = timezone('utc', now()),
    updated_at        = timezone('utc', now());

  -- Mark questionnaire submitted
  update public.wedding_questionnaires
  set status       = 'submitted',
      submitted_at = timezone('utc', now()),
      last_saved_at = timezone('utc', now()),
      updated_at   = timezone('utc', now())
  where id = v_qid;

  -- Get couple name for notification
  select coalesce(bride_name, '') || ' i ' || coalesce(groom_name, '')
  into v_couple
  from public.weddings
  where id = v_wid;

  -- Create photographer notification
  insert into public.notifications
    (user_id, type, title, content, entity_type, entity_id, link)
  values (
    v_oid,
    'success',
    'Ankieta przedślubna wypełniona',
    'Ankieta przedślubna została wypełniona przez ' || coalesce(v_couple, 'parę') || '.',
    'wedding_questionnaire',
    v_qid,
    '/sluby/' || v_wid
  );

  return jsonb_build_object('ok', true, 'submitted_at', timezone('utc', now()));
end;
$$;

revoke all on function public.public_submit_prewedding_questionnaire(text, jsonb, integer, integer) from public;
grant execute on function public.public_submit_prewedding_questionnaire(text, jsonb, integer, integer) to anon, authenticated;
