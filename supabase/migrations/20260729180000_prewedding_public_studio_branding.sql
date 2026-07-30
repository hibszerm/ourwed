-- Public pre-wedding form: include photographer studio branding (name only).
-- Logo URLs stay out of RPC (private storage); studio_name is enough for brand header.

create or replace function public.public_get_prewedding_questionnaire(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_rec  record;
  v_studio_name text;
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
    wq.owner_id,
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

  select sd.company_name
    into v_studio_name
  from public.studio_details sd
  where sd.user_id = v_rec.owner_id
  limit 1;

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
    'total_required',    coalesce(v_rec.total_required, 0),
    'studio_name',       v_studio_name
  );
end;
$$;

revoke all on function public.public_get_prewedding_questionnaire(text) from public;
grant execute on function public.public_get_prewedding_questionnaire(text) to anon, authenticated;
