-- Fix pre-wedding token RPCs: pgcrypto lives in schema "extensions",
-- but functions used search_path = public only → gen_random_bytes / digest missing.
-- Does not weaken RLS. Ownership checks unchanged.

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
  select owner_id into v_owner
  from public.wedding_questionnaires
  where id = p_questionnaire_id;

  if v_owner is null then
    raise exception 'questionnaire_not_found';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'not_owner';
  end if;

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

  if v_rec.status = 'sent' then
    update public.wedding_questionnaires
    set status          = 'opened',
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

  insert into public.wedding_questionnaire_responses
    (questionnaire_id, answers_json, answered_required, total_required)
  values
    (v_qid, p_answers, p_answered_req, p_total_req)
  on conflict (questionnaire_id)
  do update set
    answers_json      = excluded.answers_json,
    answered_required = excluded.answered_required,
    total_required    = excluded.total_required,
    updated_at        = timezone('utc', now());

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

  update public.wedding_questionnaires
  set status        = 'submitted',
      submitted_at  = timezone('utc', now()),
      last_saved_at = timezone('utc', now()),
      updated_at    = timezone('utc', now())
  where id = v_qid;

  select coalesce(bride_name, '') || ' i ' || coalesce(groom_name, '')
  into v_couple
  from public.weddings
  where id = v_wid;

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
