-- Sync questionnaire-selected additional services onto wedding_extra_services
-- when public_submit_form_by_token runs against an instance that already has
-- wedding_id (sent from an existing wedding).
--
-- Additive / idempotent: insert missing (wedding_id, extra_service_id) only.
-- Never delete existing extras. Never update weddings.price or payments.
-- Lead submissions (wedding_id IS NULL) remain handled by studio approve path.

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
  opt jsonb;
  price_snap numeric(12, 2);
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
  else
    selected_extras := array[]::text[];
    if jsonb_typeof(p_answer_json->'fields'->'selectedAdditionalServiceIds') = 'array' then
      select coalesce(array_agg(elem), array[]::text[])
      into selected_extras
      from (
        select jsonb_array_elements_text(p_answer_json->'fields'->'selectedAdditionalServiceIds') as elem
      ) t
      where length(trim(elem)) > 0;
    end if;
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

  -- Associate selected extras with the wedding when the instance already
  -- belongs to one. Additive only — preserve manually added services.
  if inst.wedding_id is not null
     and selected_extras is not null
     and cardinality(selected_extras) > 0 then
    foreach id_item in array selected_extras loop
      if exists (
        select 1
        from public.wedding_extra_services wes
        where wes.wedding_id = inst.wedding_id
          and wes.extra_service_id = id_item::uuid
      ) then
        continue;
      end if;

      price_snap := 0;
      if snapshot is not null then
        select (e->>'price')::numeric
        into price_snap
        from jsonb_array_elements(
          coalesce(snapshot->'additionalServiceOptions', '[]'::jsonb)
        ) e
        where e->>'id' = id_item
        limit 1;
      end if;

      if price_snap is null then
        select (e->>'price')::numeric
        into price_snap
        from jsonb_array_elements(
          coalesce(p_answer_json->'additionalServiceSnapshots', '[]'::jsonb)
        ) e
        where e->>'id' = id_item
        limit 1;
      end if;

      insert into public.wedding_extra_services (
        wedding_id,
        extra_service_id,
        price_snapshot,
        quantity
      )
      values (
        inst.wedding_id,
        id_item::uuid,
        coalesce(price_snap, 0),
        1
      );
    end loop;
  end if;

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
