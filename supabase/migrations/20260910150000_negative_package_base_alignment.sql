-- Negative derived package-base alignment.
-- Client already preserves packageBase = CV - extras - effectiveTravel (may be < 0).
-- These RPCs previously clamped package_base with greatest(0, …), silently
-- inflating agreed contract_value when CV < extras + travel.
--
-- Function-definition only. No row backfill. No schema/RLS/Auth changes.
-- Keeps travel amount greatest(0, …) when reading charged effective travel.

-- ---------------------------------------------------------------------------
-- 1. resolve_wedding_travel_fee — unclamp derived package_base
-- ---------------------------------------------------------------------------

create or replace function public.resolve_wedding_travel_fee(
  p_wedding_id uuid,
  p_status text,
  p_amount numeric,
  p_free_km_snapshot numeric default null,
  p_route_distance_m_snapshot integer default null,
  p_note text default null
)
returns public.weddings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.weddings%rowtype;
  v_extras numeric(12, 2) := 0;
  v_prev_travel numeric(12, 2) := 0;
  v_new_travel numeric(12, 2) := 0;
  v_amount numeric(12, 2) := coalesce(p_amount, 0);
  v_package_base numeric(12, 2) := 0;
  v_next_value numeric(12, 2) := 0;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if v_status not in ('unresolved', 'included', 'charged') then
    raise exception 'INVALID_TRAVEL_FEE_STATUS';
  end if;

  if v_amount < 0 then
    raise exception 'INVALID_TRAVEL_FEE_AMOUNT';
  end if;

  if v_status = 'charged' then
    if v_amount <= 0 then
      raise exception 'CHARGED_REQUIRES_POSITIVE_AMOUNT';
    end if;
    v_new_travel := v_amount;
  else
    -- included / unresolved always store amount 0
    v_amount := 0;
    v_new_travel := 0;
  end if;

  select *
  into v_row
  from public.weddings w
  where w.id = p_wedding_id
  for update;

  if not found then
    raise exception 'WEDDING_NOT_FOUND';
  end if;

  if v_row.user_id is distinct from v_uid then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(sum(wes.price_snapshot * wes.quantity), 0)
  into v_extras
  from public.wedding_extra_services wes
  where wes.wedding_id = p_wedding_id;

  if v_row.travel_fee_status = 'charged' then
    v_prev_travel := greatest(0, coalesce(v_row.travel_fee_amount, 0));
  else
    v_prev_travel := 0;
  end if;

  -- Idempotent component formula:
  -- package_base = contract_value - extras - previous_travel (MAY BE NEGATIVE)
  -- contract_value' = package_base + extras + new_travel
  v_package_base :=
    coalesce(v_row.contract_value, 0) - coalesce(v_extras, 0) - v_prev_travel;
  v_next_value := v_package_base + coalesce(v_extras, 0) + v_new_travel;

  update public.weddings
  set
    travel_fee_status = v_status,
    travel_fee_amount = v_amount,
    travel_fee_resolved_at = case
      when v_status = 'unresolved' then null
      else timezone('utc', now())
    end,
    travel_fee_free_km_snapshot = case
      when v_status = 'unresolved' then null
      else p_free_km_snapshot
    end,
    travel_fee_route_distance_m_snapshot = case
      when v_status = 'unresolved' then null
      else p_route_distance_m_snapshot
    end,
    travel_fee_note = nullif(trim(coalesce(p_note, '')), ''),
    contract_value = v_next_value,
    updated_at = timezone('utc', now())
  where id = p_wedding_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.resolve_wedding_travel_fee(
  uuid, text, numeric, numeric, integer, text
) from public;
grant execute on function public.resolve_wedding_travel_fee(
  uuid, text, numeric, numeric, integer, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. public_submit_form_by_token — unclamp derived package_base
--    Body matches 20260908194500 except package_base arithmetic.
-- ---------------------------------------------------------------------------

create or replace function public.public_submit_form_by_token(
  p_token text,
  p_answer_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
  v_hash text;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    raise exception 'INVALID_TOKEN';
  end if;

  v_hash := encode(digest(convert_to(trim(p_token), 'UTF8'), 'sha256'), 'hex');

  select * into inst
  from public.form_instances
  where token_hash = v_hash
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

    -- package_base MAY BE NEGATIVE to preserve agreed contract_value
    package_base :=
      coalesce(current_value, 0)
      - coalesce(extras_before, 0)
      - coalesce(travel_fee, 0);
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
