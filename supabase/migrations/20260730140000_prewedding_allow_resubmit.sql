-- Allow couples to edit and re-submit a Pre-Wedding Questionnaire via the same
-- public link. Status stays "submitted"; photographer Apply flow is unchanged.
-- Legacy "reopened" rows are normalized to "submitted".

update public.wedding_questionnaires
set status = 'submitted',
    updated_at = timezone('utc', now())
where status = 'reopened';

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
    and status not in ('draft', 'archived');

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

  -- Keep submitted as submitted so the photographer status stays "Wypełniona".
  -- Legacy reopened is normalized to submitted. opened → in_progress.
  update public.wedding_questionnaires
  set last_saved_at = timezone('utc', now()),
      status = case
        when status = 'opened' then 'in_progress'
        when status = 'reopened' then 'submitted'
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
  v_was_submitted boolean;
  v_submitted_at timestamptz;
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

  v_was_submitted := v_status in ('submitted', 'reopened');
  v_submitted_at := timezone('utc', now());

  insert into public.wedding_questionnaire_responses
    (questionnaire_id, answers_json, answered_required, total_required, submitted_at)
  values
    (v_qid, p_answers, p_answered_req, p_total_req, v_submitted_at)
  on conflict (questionnaire_id)
  do update set
    answers_json      = excluded.answers_json,
    answered_required = excluded.answered_required,
    total_required    = excluded.total_required,
    submitted_at      = excluded.submitted_at,
    updated_at        = timezone('utc', now());

  update public.wedding_questionnaires
  set status        = 'submitted',
      submitted_at  = v_submitted_at,
      reopened_at   = null,
      last_saved_at = v_submitted_at,
      updated_at    = v_submitted_at
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
    case
      when v_was_submitted then 'Ankieta przedślubna zaktualizowana'
      else 'Ankieta przedślubna wypełniona'
    end,
    case
      when v_was_submitted then
        'Para zaktualizowała ankietę przedślubną (' || coalesce(v_couple, 'para') || ').'
      else
        'Ankieta przedślubna została wypełniona przez ' || coalesce(v_couple, 'parę') || '.'
    end,
    'wedding_questionnaire',
    v_qid,
    '/sluby/' || v_wid
  );

  return jsonb_build_object(
    'ok', true,
    'submitted_at', v_submitted_at,
    'updated', v_was_submitted
  );
end;
$$;

revoke all on function public.public_submit_prewedding_questionnaire(text, jsonb, integer, integer) from public;
grant execute on function public.public_submit_prewedding_questionnaire(text, jsonb, integer, integer) to anon, authenticated;
