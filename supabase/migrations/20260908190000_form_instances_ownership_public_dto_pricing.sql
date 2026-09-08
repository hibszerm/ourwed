-- Form security hardening:
-- 1) form_instances INSERT/UPDATE must own wedding_id when set (lead NULL allowed)
-- 2) public_get_form_by_token returns explicit public DTO (no ownership internals)
-- 3) public_submit_form_by_token fails closed on trusted extra prices (no client JSON prices)

-- ---------------------------------------------------------------------------
-- 2A. form_instances ownership
-- ---------------------------------------------------------------------------

drop policy if exists form_instances_insert_own on public.form_instances;
create policy form_instances_insert_own on public.form_instances
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.account_has_pro_access()
    and (wedding_id is null or public.is_wedding_owner(wedding_id))
  );

drop policy if exists form_instances_update_own on public.form_instances;
create policy form_instances_update_own on public.form_instances
  for update to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access())
  with check (
    user_id = auth.uid()
    and public.account_has_pro_access()
    and (wedding_id is null or public.is_wedding_owner(wedding_id))
  );

-- ---------------------------------------------------------------------------
-- 2B. public_get_form_by_token — explicit public DTO
-- Required by ProductionContractFormPage / getPublicFormByToken:
--   instance.status (+ public-safe timestamps), form.schema,
--   packages, additionalServices, optionsSnapshot, privacy_controller
-- Explicitly OMIT: instance.user_id, instance.wedding_id, form.user_id
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
  instance_public jsonb;
  form_public jsonb;
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

  -- Public-safe instance DTO (no ownership internals).
  instance_public := jsonb_build_object(
    'id', inst.id,
    'form_id', inst.form_id,
    'token', inst.token,
    'status', inst.status,
    'expires_at', inst.expires_at,
    'opened_at', inst.opened_at,
    'submitted_at', inst.submitted_at,
    'approved_at', inst.approved_at,
    'rejected_at', inst.rejected_at,
    'created_at', inst.created_at,
    'options_snapshot', inst.options_snapshot
  );

  -- Public-safe form DTO (schema required; no user_id).
  form_public := jsonb_build_object(
    'id', form_row.id,
    'name', form_row.name,
    'slug', form_row.slug,
    'description', form_row.description,
    'category', form_row.category,
    'schema', form_row.schema,
    'version', form_row.version,
    'is_active', form_row.is_active,
    'created_at', form_row.created_at
  );

  result := jsonb_build_object(
    'instance', instance_public,
    'form', form_public,
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
-- 2C. public_submit_form_by_token — trusted snapshot prices only
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
  price_snap numeric(12, 2);
  extras_before numeric(12, 2) := 0;
  extras_after numeric(12, 2) := 0;
  current_value numeric(12, 2) := 0;
  travel_fee numeric(12, 2) := 0;
  package_base numeric(12, 2) := 0;
  next_value numeric(12, 2) := 0;
  instance_public jsonb;
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

  selected_packages := array[]::text[];
  selected_extras := array[]::text[];

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

  if jsonb_typeof(p_answer_json->'fields'->'selectedAdditionalServiceIds') = 'array' then
    select coalesce(array_agg(elem), array[]::text[])
    into selected_extras
    from (
      select jsonb_array_elements_text(p_answer_json->'fields'->'selectedAdditionalServiceIds') as elem
    ) t
    where length(trim(elem)) > 0;
  end if;

  -- Wedding-bound commercial extras require a trusted options snapshot.
  if inst.wedding_id is not null
     and selected_extras is not null
     and cardinality(selected_extras) > 0
     and snapshot is null then
    raise exception 'MISSING_TRUSTED_PRICE';
  end if;

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

    foreach id_item in array selected_packages loop
      if not (id_item = any (allowed_packages)) then
        raise exception 'INVALID_PACKAGE_ID';
      end if;
    end loop;

    foreach id_item in array selected_extras loop
      if not (id_item = any (allowed_extras)) then
        raise exception 'INVALID_EXTRA_SERVICE_ID';
      end if;
    end loop;
  elsif cardinality(selected_packages) > 0 then
    -- Packages selected without snapshot: reject (no trusted catalog).
    raise exception 'INVALID_PACKAGE_ID';
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

  if inst.wedding_id is not null then
    select coalesce(sum(wes.price_snapshot * wes.quantity), 0)
    into extras_before
    from public.wedding_extra_services wes
    where wes.wedding_id = inst.wedding_id;

    select
      coalesce(w.contract_value, 0),
      case
        when w.travel_fee_status = 'charged'
          then greatest(0, coalesce(w.travel_fee_amount, 0))
        else 0
      end
    into current_value, travel_fee
    from public.weddings w
    where w.id = inst.wedding_id;

    if selected_extras is not null and cardinality(selected_extras) > 0 then
      foreach id_item in array selected_extras loop
        if exists (
          select 1
          from public.wedding_extra_services wes
          where wes.wedding_id = inst.wedding_id
            and wes.extra_service_id = id_item::uuid
        ) then
          continue;
        end if;

        -- Trusted snapshot price only — never client additionalServiceSnapshots.
        select (e->>'price')::numeric
        into price_snap
        from jsonb_array_elements(
          coalesce(snapshot->'additionalServiceOptions', '[]'::jsonb)
        ) e
        where e->>'id' = id_item
          and e ? 'price'
          and nullif(trim(coalesce(e->>'price', '')), '') is not null
        limit 1;

        if price_snap is null then
          raise exception 'MISSING_TRUSTED_PRICE';
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
          price_snap,
          1
        );
      end loop;
    end if;

    select coalesce(sum(wes.price_snapshot * wes.quantity), 0)
    into extras_after
    from public.wedding_extra_services wes
    where wes.wedding_id = inst.wedding_id;

    package_base := greatest(
      0,
      coalesce(current_value, 0) - coalesce(extras_before, 0) - coalesce(travel_fee, 0)
    );
    next_value := package_base + coalesce(extras_after, 0) + coalesce(travel_fee, 0);

    update public.weddings
    set contract_value = next_value
    where id = inst.wedding_id;
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
  end if;

  perform public.notify_contract_questionnaire_completed(inst.id, answer_row.id);

  instance_public := jsonb_build_object(
    'id', inst.id,
    'form_id', inst.form_id,
    'token', inst.token,
    'status', inst.status,
    'expires_at', inst.expires_at,
    'opened_at', inst.opened_at,
    'submitted_at', inst.submitted_at,
    'approved_at', inst.approved_at,
    'rejected_at', inst.rejected_at,
    'created_at', inst.created_at,
    'options_snapshot', inst.options_snapshot
  );

  return jsonb_build_object(
    'answer', jsonb_build_object(
      'id', answer_row.id,
      'instance_id', answer_row.instance_id,
      'answer_json', answer_row.answer_json,
      'created_at', answer_row.created_at
    ),
    'instance', instance_public
  );
end;
$$;

revoke all on function public.public_submit_form_by_token(text, jsonb) from public;
grant execute on function public.public_submit_form_by_token(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
