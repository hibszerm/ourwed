-- Public questionnaire privacy controller identity (token-bound).
-- Additive only: extends existing public get RPCs with a whitelisted DTO.
-- NO backfill / NO mutation of existing wedding/client/user rows.
--
-- Contact email policy (V1):
--   Only studio_details.email (business contact from Dane firmy).
--   Never expose public.users.email (login email) to anonymous respondents.
--
-- Display name fallback:
--   1) studio_details.company_name
--   2) profiles.first_name + last_name
--   3) public.users.name
--   else null (UI must not invent a controller name)

-- ---------------------------------------------------------------------------
-- Shared resolver (SECURITY DEFINER; not granted to anon)
-- ---------------------------------------------------------------------------

create or replace function public.resolve_public_controller_identity(p_owner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company text;
  v_studio_email text;
  v_first text;
  v_last text;
  v_person text;
  v_user_name text;
  v_display text;
begin
  if p_owner_id is null then
    return null;
  end if;

  select
    nullif(trim(sd.company_name), ''),
    nullif(trim(sd.email), '')
  into v_company, v_studio_email
  from public.studio_details sd
  where sd.user_id = p_owner_id
  limit 1;

  select
    nullif(trim(p.first_name), ''),
    nullif(trim(p.last_name), '')
  into v_first, v_last
  from public.profiles p
  where p.id = p_owner_id
  limit 1;

  v_person := nullif(trim(both ' ' from coalesce(v_first, '') || ' ' || coalesce(v_last, '')), '');

  select nullif(trim(u.name), '')
  into v_user_name
  from public.users u
  where u.id = p_owner_id
  limit 1;

  v_display := coalesce(v_company, v_person, v_user_name);
  if v_display is null then
    return null;
  end if;

  -- Whitelist only. Never include owner UUID, NIP, phone, address, bank, etc.
  return jsonb_build_object(
    'display_name', v_display,
    'contact_email', v_studio_email
  );
end;
$$;

comment on function public.resolve_public_controller_identity(uuid) is
  'Token-path helper: resolve minimal public controller identity for questionnaire privacy notices. Not for direct anon calls.';

revoke all on function public.resolve_public_controller_identity(uuid) from public;
revoke all on function public.resolve_public_controller_identity(uuid) from anon;
revoke all on function public.resolve_public_controller_identity(uuid) from authenticated;
-- Callable only by other SECURITY DEFINER functions / service_role.

-- ---------------------------------------------------------------------------
-- /form/:token — public_get_form_by_token (+ privacy_controller)
-- ---------------------------------------------------------------------------

create or replace function public.public_get_form_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inst public.form_instances%rowtype;
  form_row public.forms%rowtype;
  packages_json jsonb := '[]'::jsonb;
  extras_json jsonb := '[]'::jsonb;
  owner_id uuid;
  snapshot jsonb;
  result jsonb;
  privacy_controller jsonb;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    return null;
  end if;

  select * into inst
  from public.form_instances
  where token = trim(p_token)
  limit 1;

  if not found then
    return null;
  end if;

  if inst.expires_at is not null
     and inst.expires_at <= timezone('utc', now())
     and inst.status not in ('submitted', 'approved', 'expired') then
    update public.form_instances
    set status = 'expired'
    where id = inst.id
      and status not in ('submitted', 'approved', 'expired')
    returning * into inst;
  end if;

  if inst.status = 'pending' then
    update public.form_instances
    set status = 'opened',
        opened_at = timezone('utc', now())
    where id = inst.id
      and status = 'pending'
    returning * into inst;
  end if;

  select * into form_row
  from public.forms
  where id = inst.form_id;

  if not found then
    return null;
  end if;

  snapshot := inst.options_snapshot;
  owner_id := coalesce(inst.user_id, form_row.user_id);

  if snapshot is not null
     and jsonb_typeof(snapshot->'packageOptions') = 'array'
     and jsonb_array_length(snapshot->'packageOptions') > 0 then
    packages_json := snapshot->'packageOptions';
  elsif owner_id is not null then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', p.id::text,
        'name', p.name,
        'description', p.description,
        'price', p.price,
        'currency', coalesce(p.currency, 'PLN')
      )
      order by p.sort_order, p.created_at
    ), '[]'::jsonb)
    into packages_json
    from public.packages p
    where p.user_id = owner_id
      and p.is_active = true;
  end if;

  if snapshot is not null
     and jsonb_typeof(snapshot->'additionalServiceOptions') = 'array'
     and jsonb_array_length(snapshot->'additionalServiceOptions') > 0 then
    extras_json := snapshot->'additionalServiceOptions';
  elsif owner_id is not null then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', e.id::text,
        'name', e.name,
        'description', e.description,
        'price', e.price,
        'currency', coalesce(e.currency, 'PLN')
      )
      order by e.sort_order, e.created_at
    ), '[]'::jsonb)
    into extras_json
    from public.extra_services e
    where e.user_id = owner_id
      and e.is_active = true;
  end if;

  privacy_controller := public.resolve_public_controller_identity(owner_id);

  result := jsonb_build_object(
    'instance', to_jsonb(inst),
    'form', to_jsonb(form_row),
    'packages', packages_json,
    'additionalServices', extras_json,
    'optionsSnapshot', snapshot,
    'privacy_controller', privacy_controller
  );
  return result;
end;
$$;

revoke all on function public.public_get_form_by_token(text) from public;
grant execute on function public.public_get_form_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- /ankieta/:token — public_get_prewedding_questionnaire (+ privacy_controller)
-- Branding studio_name remains company_name-only (unchanged product behavior).
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
  v_studio_name text;
  privacy_controller jsonb;
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

  privacy_controller := public.resolve_public_controller_identity(v_rec.owner_id);

  -- Intentionally omit: owner_id, login email, logo_path, signature_path, NIP, etc.
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
    'studio_name',       v_studio_name,
    'privacy_controller', privacy_controller
  );
end;
$$;

revoke all on function public.public_get_prewedding_questionnaire(text) from public;
grant execute on function public.public_get_prewedding_questionnaire(text) to anon, authenticated;
