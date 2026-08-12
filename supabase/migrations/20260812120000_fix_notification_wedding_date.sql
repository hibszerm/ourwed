-- Fix notification helpers: public.weddings has wedding_date, not date.
-- 42703 on final pre-wedding submit rolled back finalization; autosave RPCs are separate.

create or replace function public.notify_contract_questionnaire_completed(
  p_instance_id uuid,
  p_answer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_wedding uuid;
  v_couple text;
  v_date text;
  v_path text;
  v_title text;
  v_body text;
  v_key text;
  v_payload jsonb;
begin
  select fi.user_id, fi.wedding_id
  into v_user, v_wedding
  from public.form_instances fi
  where fi.id = p_instance_id;

  if v_user is null then
    return;
  end if;

  if v_wedding is not null then
    select
      nullif(trim(coalesce(w.bride_name, '') ||
        case when coalesce(w.groom_name, '') <> '' and coalesce(w.bride_name, '') <> '' then ' i ' else '' end ||
        coalesce(w.groom_name, '')), ''),
      coalesce(w.wedding_date::text, null)
    into v_couple, v_date
    from public.weddings w
    where w.id = v_wedding;

    v_path := '/sluby/' || v_wedding::text || '?tab=contract_finance';
  else
    v_path := '/ankiety/' || p_instance_id::text;
  end if;

  v_title := 'Nowe dane do umowy';
  if v_couple is not null then
    v_body := v_couple || ' uzupełnili ankietę do umowy. Odpowiedzi czekają na Twoją weryfikację.';
  else
    v_body := 'Para uzupełniła ankietę. Odpowiedzi czekają na Twoją weryfikację.';
  end if;

  v_key := 'questionnaire.contract.completed:' || p_instance_id::text;
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'questionnaireType', 'contract',
    'formInstanceId', p_instance_id,
    'formAnswerId', p_answer_id,
    'weddingId', v_wedding,
    'coupleLabel', v_couple,
    'weddingDate', v_date,
    'targetPath', v_path
  ));

  perform public.enqueue_notification_event(
    v_user,
    'questionnaire.contract.completed',
    'form_instance',
    p_instance_id,
    v_key,
    v_payload,
    v_title,
    v_body,
    v_path
  );
end;
$$;

revoke all on function public.notify_contract_questionnaire_completed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.notify_contract_questionnaire_completed(uuid, uuid) to service_role;

create or replace function public.notify_prewedding_questionnaire_completed(
  p_questionnaire_id uuid,
  p_submitted_at timestamptz,
  p_is_update boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_wedding uuid;
  v_couple text;
  v_date text;
  v_path text;
  v_title text;
  v_body text;
  v_key text;
  v_payload jsonb;
begin
  select wq.owner_id, wq.wedding_id
  into v_owner, v_wedding
  from public.wedding_questionnaires wq
  where wq.id = p_questionnaire_id;

  if v_owner is null or v_wedding is null then
    return;
  end if;

  select
    nullif(trim(coalesce(w.bride_name, '') ||
      case when coalesce(w.groom_name, '') <> '' and coalesce(w.bride_name, '') <> '' then ' i ' else '' end ||
      coalesce(w.groom_name, '')), ''),
    coalesce(w.wedding_date::text, null)
  into v_couple, v_date
  from public.weddings w
  where w.id = v_wedding;

  v_path := '/sluby/' || v_wedding::text || '?tab=pre_wedding_questionnaire';
  v_title := case
    when p_is_update then 'Ankieta przedślubna zaktualizowana'
    else 'Ankieta przedślubna uzupełniona'
  end;
  v_body := 'Plan dnia i informacje organizacyjne są gotowe do sprawdzenia.';

  v_key := 'questionnaire.prewedding.completed:'
    || p_questionnaire_id::text
    || ':'
    || to_char(coalesce(p_submitted_at, timezone('utc', now())), 'YYYYMMDDHH24MISSMS');

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'questionnaireType', 'pre_wedding',
    'questionnaireId', p_questionnaire_id,
    'weddingId', v_wedding,
    'coupleLabel', v_couple,
    'weddingDate', v_date,
    'isUpdate', p_is_update,
    'targetPath', v_path
  ));

  perform public.enqueue_notification_event(
    v_owner,
    'questionnaire.prewedding.completed',
    'wedding_questionnaire',
    p_questionnaire_id,
    v_key,
    v_payload,
    v_title,
    v_body,
    v_path
  );
end;
$$;

revoke all on function public.notify_prewedding_questionnaire_completed(uuid, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.notify_prewedding_questionnaire_completed(uuid, timestamptz, boolean)
  to service_role;

notify pgrst, 'reload schema';
