-- Contract questionnaire: company config, instance option snapshots,
-- bride/groom preparation locations, multi-package request on weddings.
-- Extends public_get_form_by_token / public_submit_form_by_token safely.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.studio_details
  add column if not exists questionnaire_config jsonb not null default '{}'::jsonb;

comment on column public.studio_details.questionnaire_config is
  'Default contract questionnaire config (greeting, footer, custom fields, section toggles).';

alter table public.form_instances
  add column if not exists options_snapshot jsonb;

comment on column public.form_instances.options_snapshot is
  'Public-safe package/extra/config snapshot taken when the questionnaire is created or sent.';

alter table public.weddings
  add column if not exists bride_preparation_location text,
  add column if not exists groom_preparation_location text,
  add column if not exists selected_package_ids text[];

comment on column public.weddings.bride_preparation_location is
  'Bride preparation location (formatted address). Legacy preparation_location mirrors this when present.';

comment on column public.weddings.groom_preparation_location is
  'Groom preparation location (formatted address).';

comment on column public.weddings.selected_package_ids is
  'Client-requested package IDs from questionnaire (multi-select). package_id remains the primary commercial package.';

-- ---------------------------------------------------------------------------
-- public_get_form_by_token — prefer options_snapshot; live packages as fallback
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

  -- Auto-expire
  if inst.expires_at is not null
     and inst.expires_at <= timezone('utc', now())
     and inst.status not in ('submitted', 'approved', 'expired') then
    update public.form_instances
    set status = 'expired'
    where id = inst.id
      and status not in ('submitted', 'approved', 'expired')
    returning * into inst;
  end if;

  -- First open
  if inst.status = 'pending' then
    update public.form_instances
    set status = 'opened',
        opened_at = timezone('utc', now())
    where id = inst.id
      and status = 'pending'
    returning * into inst;
  end if;

  select * into form_row from public.forms where id = inst.form_id;

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
     and jsonb_typeof(snapshot->'additionalServiceOptions') = 'array' then
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

  result := jsonb_build_object(
    'instance', to_jsonb(inst),
    'form', to_jsonb(form_row),
    'packages', packages_json,
    'additionalServices', extras_json,
    'optionsSnapshot', snapshot
  );
  return result;
end;
$$;

revoke all on function public.public_get_form_by_token(text) from public;
grant execute on function public.public_get_form_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- public_submit_form_by_token — validate package/extra IDs against snapshot
-- ---------------------------------------------------------------------------

create or replace function public.public_submit_form_by_token(
  p_token text,
  p_answer_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inst public.form_instances%rowtype;
  answer_row public.form_answers%rowtype;
  submitted_ts timestamptz := timezone('utc', now());
  note_text text;
  snapshot jsonb;
  allowed_packages text[];
  allowed_extras text[];
  selected_packages text[];
  selected_extras text[];
  legacy_package text;
  id_item text;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    raise exception 'INVALID_TOKEN';
  end if;

  select * into inst
  from public.form_instances
  where token = trim(p_token)
  for update;

  if not found then
    raise exception 'INVALID_TOKEN';
  end if;

  if inst.status in ('submitted', 'approved') then
    raise exception 'ALREADY_SUBMITTED';
  end if;
  if inst.status in ('revoked', 'rejected', 'archived') then
    raise exception 'LINK_REVOKED';
  end if;
  if inst.status = 'expired'
     or (inst.expires_at is not null and inst.expires_at <= submitted_ts) then
    update public.form_instances set status = 'expired' where id = inst.id;
    raise exception 'LINK_EXPIRED';
  end if;

  snapshot := inst.options_snapshot;

  if snapshot is not null then
    select coalesce(array_agg(x), array[]::text[])
    into allowed_packages
    from (
      select jsonb_array_elements(coalesce(snapshot->'packageOptions', '[]'::jsonb))->>'id' as x
    ) s
    where x is not null and length(trim(x)) > 0;

    select coalesce(array_agg(x), array[]::text[])
    into allowed_extras
    from (
      select jsonb_array_elements(coalesce(snapshot->'additionalServiceOptions', '[]'::jsonb))->>'id' as x
    ) s
    where x is not null and length(trim(x)) > 0;

    selected_packages := array[]::text[];
    if jsonb_typeof(p_answer_json->'fields'->'selectedPackageIds') = 'array' then
      select coalesce(array_agg(elem), array[]::text[])
      into selected_packages
      from (
        select jsonb_array_elements_text(p_answer_json->'fields'->'selectedPackageIds') as elem
      ) t
      where length(trim(elem)) > 0;
    end if;

    legacy_package := nullif(trim(coalesce(p_answer_json->'fields'->>'packageId', '')), '');
    if legacy_package is not null
       and not (legacy_package = any (selected_packages)) then
      selected_packages := array_append(selected_packages, legacy_package);
    end if;

    foreach id_item in array selected_packages loop
      if cardinality(allowed_packages) > 0
         and not (id_item = any (allowed_packages)) then
        raise exception 'INVALID_PACKAGE_ID';
      end if;
    end loop;

    selected_extras := array[]::text[];
    if jsonb_typeof(p_answer_json->'fields'->'selectedAdditionalServiceIds') = 'array' then
      select coalesce(array_agg(elem), array[]::text[])
      into selected_extras
      from (
        select jsonb_array_elements_text(p_answer_json->'fields'->'selectedAdditionalServiceIds') as elem
      ) t
      where length(trim(elem)) > 0;
    end if;

    foreach id_item in array selected_extras loop
      if cardinality(allowed_extras) > 0
         and not (id_item = any (allowed_extras)) then
        raise exception 'INVALID_EXTRA_SERVICE_ID';
      end if;
    end loop;
  end if;

  insert into public.form_answers (instance_id, answer_json)
  values (inst.id, coalesce(p_answer_json, '{}'::jsonb))
  returning * into answer_row;

  update public.form_instances
  set
    status = 'submitted',
    submitted_at = submitted_ts,
    opened_at = coalesce(inst.opened_at, submitted_ts)
  where id = inst.id
  returning * into inst;

  note_text := nullif(trim(coalesce(p_answer_json->'fields'->>'additionalNotes', '')), '');
  if inst.wedding_id is not null and note_text is not null then
    insert into public.notes (wedding_id, content, author)
    values (inst.wedding_id, note_text, 'Para');
  end if;

  if inst.wedding_id is not null then
    insert into public.timeline_events (
      wedding_id, type, title, description, system_generated
    )
    values (
      inst.wedding_id,
      'questionnaire_completed',
      'Wypełniono ankietę.',
      'Formularz został przesłany przez parę.',
      true
    );
  elsif inst.user_id is not null then
    insert into public.notifications (
      user_id, title, content, type, entity_type, entity_id, link, read
    )
    values (
      inst.user_id,
      'Nowa ankieta złożona',
      'Para wypełniła ankietę. Sprawdź oczekujące zgłoszenia.',
      'success',
      'form_instance',
      inst.id,
      '/ankiety/' || inst.id::text,
      false
    );
  end if;

  return jsonb_build_object(
    'answer', to_jsonb(answer_row),
    'instance', to_jsonb(inst)
  );
end;
$$;

revoke all on function public.public_submit_form_by_token(text, jsonb) from public;
grant execute on function public.public_submit_form_by_token(text, jsonb) to anon, authenticated;
