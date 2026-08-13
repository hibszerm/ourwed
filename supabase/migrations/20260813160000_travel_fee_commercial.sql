-- Travel fee V1: studio free-distance policy + wedding commercial snapshot.
-- contract_value remains the ONE final agreed client total.
-- Migration MUST NOT rewrite existing contract_value values.

-- ---------------------------------------------------------------------------
-- 1. Studio policy (suggestion only — never auto-mutates wedding money)
-- ---------------------------------------------------------------------------

alter table public.studio_travel_settings
  add column if not exists free_distance_km numeric(10, 2)
    check (free_distance_km is null or free_distance_km >= 0);

comment on column public.studio_travel_settings.free_distance_km is
  'Studio free-distance policy in km (decision aid only). Null = unset.';

-- ---------------------------------------------------------------------------
-- 2. Wedding travel-fee commercial snapshot
-- ---------------------------------------------------------------------------

alter table public.weddings
  add column if not exists travel_fee_status text not null default 'unresolved'
    check (travel_fee_status in ('unresolved', 'included', 'charged'));

alter table public.weddings
  add column if not exists travel_fee_amount numeric(12, 2) not null default 0
    check (travel_fee_amount >= 0);

alter table public.weddings
  add column if not exists travel_fee_resolved_at timestamptz;

alter table public.weddings
  add column if not exists travel_fee_free_km_snapshot numeric(10, 2);

alter table public.weddings
  add column if not exists travel_fee_route_distance_m_snapshot integer;

alter table public.weddings
  add column if not exists travel_fee_note text;

-- Status/amount coherence (charged > 0; included/unresolved = 0)
alter table public.weddings
  drop constraint if exists weddings_travel_fee_status_amount_check;

alter table public.weddings
  add constraint weddings_travel_fee_status_amount_check
  check (
    (
      travel_fee_status = 'charged'
      and travel_fee_amount > 0
    )
    or (
      travel_fee_status in ('unresolved', 'included')
      and travel_fee_amount = 0
    )
  );

comment on column public.weddings.travel_fee_status is
  'Commercial travel fee decision: unresolved | included | charged.';
comment on column public.weddings.travel_fee_amount is
  'Agreed travel fee amount when charged; 0 when included/unresolved.';
comment on column public.weddings.travel_fee_resolved_at is
  'When the studio last explicitly resolved the travel fee.';
comment on column public.weddings.travel_fee_free_km_snapshot is
  'Studio free-distance policy (km) at resolve time (audit only).';
comment on column public.weddings.travel_fee_route_distance_m_snapshot is
  'Commercial round-trip distance (meters) at resolve time (audit only).';
comment on column public.weddings.travel_fee_note is
  'Optional studio note for the travel fee decision.';

-- Existing rows receive unresolved / 0 from NOT NULL DEFAULT above.
-- Do NOT UPDATE public.weddings here: weddings_enforce_owner requires auth.uid()
-- (see 20260722180000_enforce_wedding_owner.sql). Defaults already guarantee
-- travel_fee_status/amount without rewriting contract_value.

-- ---------------------------------------------------------------------------
-- 3. Atomic resolve RPC (owner-scoped)
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
  -- package_base = contract_value - extras - previous_travel
  -- contract_value' = package_base + extras + new_travel
  v_package_base := greatest(
    0,
    coalesce(v_row.contract_value, 0) - coalesce(v_extras, 0) - v_prev_travel
  );
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
-- 4. Extras submit path: subtract/re-add effective travel so extras never
--    absorb travel into package_base.
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

    select coalesce(sum(wes.price_snapshot * wes.quantity), 0)
    into extras_after
    from public.wedding_extra_services wes
    where wes.wedding_id = inst.wedding_id;

    -- package_base = CV - extras_before - travel
    -- next = package_base + extras_after + travel
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

  return jsonb_build_object(
    'answer', to_jsonb(answer_row),
    'instance', to_jsonb(inst)
  );
end;
$$;

revoke all on function public.public_submit_form_by_token(text, jsonb) from public;
grant execute on function public.public_submit_form_by_token(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
