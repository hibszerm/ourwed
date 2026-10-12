-- Persist the approved package name on the wedding alongside its historical source snapshot.
create or replace function public.apply_wedding_contract_recovery(
  p_recovery_id uuid,
  p_source_contract_id uuid,
  p_wedding_id uuid,
  p_expected_wedding_updated_at timestamptz,
  p_decisions jsonb,
  p_include_package boolean,
  p_selected_extra_indexes integer[] default '{}',
  p_selected_note_indexes integer[] default '{}'
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_recovery public.wedding_contract_recoveries%rowtype;
  v_source public.wedding_source_contracts%rowtype;
  v_wedding public.weddings%rowtype;
  v_patch jsonb := '{}'::jsonb;
  v_decision jsonb;
  v_field jsonb;
  v_key text;
  v_action text;
  v_value jsonb;
  v_previous jsonb;
  v_applied text[] := '{}';
  v_skipped text[] := '{}';
  v_package_id uuid;
  v_service jsonb;
  v_extra_index integer;
  v_item text;
  v_old_place public.wedding_places%rowtype;
  v_role text;
  v_place_text text;
  v_notes text[] := '{}';
  v_note text;
  v_count integer := 0;
  v_related jsonb;
begin
  if v_uid is null then raise exception 'CONTRACT_RECOVERY_UNAUTHORIZED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('source-contract:' || p_wedding_id::text, 0));
  if jsonb_typeof(coalesce(p_decisions, '[]'::jsonb)) <> 'array' then
    raise exception 'CONTRACT_RECOVERY_INVALID_DECISIONS';
  end if;
  if (select count(*) from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb))) <>
     (select count(distinct value->>'fieldKey') from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb))) then
    raise exception 'CONTRACT_RECOVERY_INVALID_DECISIONS';
  end if;

  select * into v_recovery
  from public.wedding_contract_recoveries
  where id = p_recovery_id
  for update;
  if not found then raise exception 'CONTRACT_RECOVERY_NOT_FOUND'; end if;
  if v_recovery.user_id <> v_uid
     or v_recovery.wedding_id <> p_wedding_id
     or v_recovery.source_contract_id <> p_source_contract_id
     or v_recovery.superseded_by_id is not null then
    raise exception 'CONTRACT_RECOVERY_NOT_FOUND';
  end if;
  if v_recovery.status = 'applied' then
    raise exception 'CONTRACT_RECOVERY_ALREADY_APPLIED';
  end if;
  if v_recovery.status <> 'ready_for_review' then
    raise exception 'CONTRACT_RECOVERY_NOT_FOUND';
  end if;

  select * into v_source
  from public.wedding_source_contracts
  where id = p_source_contract_id
  for update;
  if not found or v_source.user_id <> v_uid or v_source.wedding_id <> p_wedding_id
     or v_source.status <> 'ready_for_review' then
    raise exception 'CONTRACT_RECOVERY_NOT_FOUND';
  end if;

  select * into v_wedding
  from public.weddings
  where id = p_wedding_id and user_id = v_uid
  for update;
  if not found then raise exception 'CONTRACT_RECOVERY_UNAUTHORIZED'; end if;
  if v_recovery.wedding_updated_at_snapshot is distinct from p_expected_wedding_updated_at
     or v_wedding.updated_at is distinct from p_expected_wedding_updated_at then
    raise exception 'CONTRACT_RECOVERY_WEDDING_CHANGED';
  end if;
  v_related := public.wedding_contract_related_state_snapshot(p_wedding_id);
  if v_recovery.related_state_snapshot is distinct from v_related then
    raise exception 'CONTRACT_RECOVERY_WEDDING_CHANGED';
  end if;

  if exists (select 1 from unnest(coalesce(p_selected_extra_indexes, '{}')) as selected(idx)
             where idx < 0 or idx >= jsonb_array_length(coalesce(v_recovery.normalized_extraction->'additionalServices', '[]'::jsonb)))
     or cardinality(coalesce(p_selected_extra_indexes, '{}')) <>
       (select count(distinct idx) from unnest(coalesce(p_selected_extra_indexes, '{}')) as selected(idx))
     or exists (select 1 from unnest(coalesce(p_selected_note_indexes, '{}')) as selected(idx)
             where idx < 0 or idx >= jsonb_array_length(to_jsonb(regexp_split_to_array(coalesce(v_recovery.normalized_extraction->'noteEligibleFacts'->>'value',''), E'\n+'))))
     or cardinality(coalesce(p_selected_note_indexes, '{}')) <>
       (select count(distinct idx) from unnest(coalesce(p_selected_note_indexes, '{}')) as selected(idx)) then
    raise exception 'CONTRACT_RECOVERY_INVALID_DECISIONS';
  end if;

  update public.wedding_contract_recoveries set status = 'applying'
  where id = p_recovery_id;

  for v_decision in select value from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb))
  loop
    v_key := v_decision->>'fieldKey';
    v_action := v_decision->>'action';
    if v_action is null or v_action not in ('use_extracted', 'keep_current', 'skip') then
      raise exception 'CONTRACT_RECOVERY_INVALID_DECISIONS';
    end if;
    v_field := null;
    select value into v_field
    from jsonb_array_elements(coalesce(v_recovery.comparison_proposal->'fields', '[]'::jsonb))
    where value->>'fieldKey' = v_key limit 1;
    if v_field is null then raise exception 'CONTRACT_RECOVERY_INVALID_DECISIONS'; end if;
    if v_action = 'use_extracted' then
      if v_field->>'state' in ('invalid_extracted','missing_extracted','unsupported') then
        raise exception 'CONTRACT_RECOVERY_INVALID_DECISIONS';
      end if;
      v_value := v_field->'normalizedExtractedValue';
      case v_key
        when 'partner1.fullName' then v_patch := v_patch || jsonb_build_object('bride_name', v_value);
        when 'partner2.fullName' then v_patch := v_patch || jsonb_build_object('groom_name', v_value);
        when 'partner1.email' then v_patch := v_patch || jsonb_build_object('email', v_value);
        when 'partner1.phone' then v_patch := v_patch || jsonb_build_object('phone', v_value);
        when 'partner2.phone' then v_patch := v_patch || jsonb_build_object('groom_phone', v_value);
        when 'partner1.addressLine' then v_patch := v_patch || jsonb_build_object('contract_address', v_value);
        when 'partner1.postalCode' then v_patch := v_patch || jsonb_build_object('contract_postal_code', v_value);
        when 'partner1.city' then v_patch := v_patch || jsonb_build_object('contract_city', v_value);
        when 'wedding.date' then v_patch := v_patch || jsonb_build_object('wedding_date', v_value);
        when 'wedding.ceremonyTime' then v_patch := v_patch || jsonb_build_object('ceremony_time', v_value);
        when 'location.ceremony' then v_patch := v_patch || jsonb_build_object('ceremony_location', v_value);
        when 'location.reception' then v_patch := v_patch || jsonb_build_object('venue', v_value);
        when 'location.bridePreparation' then v_patch := v_patch || jsonb_build_object('bride_preparation_location', v_value);
        when 'location.groomPreparation' then v_patch := v_patch || jsonb_build_object('groom_preparation_location', v_value);
        when 'finances.contractValue' then v_patch := v_patch || jsonb_build_object('contract_value', v_value);
        when 'finances.depositAmount' then v_patch := v_patch || jsonb_build_object('deposit_amount', v_value);
    when 'finances.currency' then v_patch := v_patch || jsonb_build_object('currency', v_value);
        when 'finances.finalPaymentDueDate' then v_patch := v_patch || jsonb_build_object('final_payment_due_date', v_value);
        when 'finances.travelStatus' then v_patch := v_patch || jsonb_build_object('travel_fee_status', v_value);
        when 'finances.travelAmount' then v_patch := v_patch || jsonb_build_object('travel_fee_amount', v_value);
        when 'delivery.dueDate' then v_patch := v_patch || jsonb_build_object('delivery_due_date', v_value);
        when 'package.name' then v_patch := v_patch || jsonb_build_object('package_name', v_value);
        else raise exception 'CONTRACT_RECOVERY_UNSUPPORTED_FIELD';
      end case;
      v_applied := array_append(v_applied, v_key);
    else
      v_skipped := array_append(v_skipped, v_key);
    end if;
    v_previous := v_field->'currentValue';
    insert into public.wedding_contract_recovery_decisions
      (user_id, recovery_id, field_key, action, previous_value, approved_value)
    values (v_uid, p_recovery_id, v_key, v_action, v_previous,
      case when v_action = 'use_extracted' then v_value else null end);
  end loop;

  if v_patch->>'travel_fee_status' = 'included' then
    if coalesce((v_patch->>'travel_fee_amount')::numeric, 0) > 0 then
      raise exception 'CONTRACT_RECOVERY_INVALID_DECISIONS';
    end if;
    v_patch := v_patch || jsonb_build_object('travel_fee_amount', 0);
  elsif v_patch->>'travel_fee_status' = 'charged'
        and not (v_patch ? 'travel_fee_amount')
        and coalesce(v_wedding.travel_fee_status, 'unresolved') <> 'charged' then
    raise exception 'CONTRACT_RECOVERY_INVALID_DECISIONS';
  end if;
  if v_patch ? 'travel_fee_amount'
     and coalesce(v_patch->>'travel_fee_status', v_wedding.travel_fee_status) <> 'charged'
     and v_patch->>'travel_fee_status' is distinct from 'included' then
    raise exception 'CONTRACT_RECOVERY_INVALID_DECISIONS';
  end if;

  update public.weddings w set
    bride_name = coalesce(v_patch->>'bride_name', w.bride_name),
    groom_name = coalesce(v_patch->>'groom_name', w.groom_name),
    email = coalesce(v_patch->>'email', w.email),
    phone = coalesce(v_patch->>'phone', w.phone),
    groom_phone = coalesce(v_patch->>'groom_phone', w.groom_phone),
    contract_address = coalesce(v_patch->>'contract_address', w.contract_address),
    contract_postal_code = coalesce(v_patch->>'contract_postal_code', w.contract_postal_code),
    contract_city = coalesce(v_patch->>'contract_city', w.contract_city),
    wedding_date = coalesce((v_patch->>'wedding_date')::date, w.wedding_date),
    ceremony_time = coalesce((v_patch->>'ceremony_time')::time, w.ceremony_time),
    venue = coalesce(v_patch->>'venue', w.venue),
    contract_value = coalesce((v_patch->>'contract_value')::numeric, w.contract_value),
    deposit_amount = coalesce((v_patch->>'deposit_amount')::numeric, w.deposit_amount),
    currency = coalesce(v_patch->>'currency', w.currency),
    final_payment_due_date = coalesce((v_patch->>'final_payment_due_date')::date, w.final_payment_due_date),
    travel_fee_status = coalesce(v_patch->>'travel_fee_status', w.travel_fee_status),
    travel_fee_amount = coalesce((v_patch->>'travel_fee_amount')::numeric, w.travel_fee_amount),
    travel_fee_resolved_at = case when v_patch ? 'travel_fee_status' then timezone('utc', now()) else w.travel_fee_resolved_at end,
    delivery_due_date = coalesce((v_patch->>'delivery_due_date')::date, w.delivery_due_date),
    delivery_due_source = case when v_patch ? 'delivery_due_date' then 'manual' else w.delivery_due_source end,
    package_name = coalesce(v_patch->>'package_name', w.package_name),
    bride_preparation_location = coalesce(v_patch->>'bride_preparation_location', w.bride_preparation_location),
    groom_preparation_location = coalesce(v_patch->>'groom_preparation_location', w.groom_preparation_location)
  where w.id = p_wedding_id;

  for v_key, v_role in select * from (values
    ('location.ceremony','ceremony'),('location.reception','reception'),
    ('location.bridePreparation','bride_preparation'),('location.groomPreparation','groom_preparation')
  ) as roles(field_key, role_name)
  loop
    if v_key = 'location.ceremony' then v_place_text := v_patch->>'ceremony_location';
    elsif v_key = 'location.reception' then v_place_text := v_patch->>'venue';
    elsif v_key = 'location.bridePreparation' then v_place_text := v_patch->>'bride_preparation_location';
    else v_place_text := v_patch->>'groom_preparation_location'; end if;
    if v_place_text is not null then
      update public.wedding_places set formatted_address = v_place_text,
        label = null, place_id = null, latitude = null, longitude = null
      where wedding_id = p_wedding_id and role = v_role;
      get diagnostics v_count = row_count;
      if v_count = 0 then
        insert into public.wedding_places (wedding_id, role, formatted_address, sort_order)
        values (p_wedding_id, v_role, v_place_text,
          case v_role when 'bride_preparation' then 10 when 'groom_preparation' then 20 when 'ceremony' then 30 else 40 end);
      end if;
    end if;
  end loop;

  if p_include_package and jsonb_typeof(v_recovery.comparison_proposal->'packageSnapshotProposal') = 'object' then
    insert into public.wedding_contract_package_snapshots
      (user_id,wedding_id,source_contract_id,recovery_id,name,original_description,included_items,coverage_hours,delivery_deadline_text,base_price,currency,metadata)
    select v_uid,p_wedding_id,p_source_contract_id,p_recovery_id,
      nullif(p->>'name',''), nullif(p->>'originalDescription',''),
      coalesce(p->'includedItems','[]'::jsonb), nullif(p->>'coverageHours','')::numeric,
      nullif(p->>'deliveryDeadlineText',''), nullif(p->>'basePrice','')::numeric,
      nullif(p->>'currency',''), jsonb_build_object('source','contract_recovery','coverageTimeRange',p->'coverageTimeRange','deliveryDays',p->'deliveryDays')
    from (select v_recovery.comparison_proposal->'packageSnapshotProposal' p) q
    returning id into v_package_id;
  end if;

  foreach v_extra_index in array coalesce(p_selected_extra_indexes, '{}') loop
    v_service := v_recovery.normalized_extraction->'additionalServices'->v_extra_index;
    if v_service is null or nullif(btrim(v_service->>'name'),'') is null then raise exception 'CONTRACT_RECOVERY_INVALID_DECISIONS'; end if;
    if nullif(v_service->>'price','') is null or (v_service->>'price')::numeric < 0
       or coalesce(nullif(v_service->>'currency',''), v_wedding.currency) <> v_wedding.currency then
      raise exception 'CONTRACT_RECOVERY_INVALID_DECISIONS';
    end if;
    if not exists (
      select 1 from public.wedding_extra_services wes
      where wes.wedding_id = p_wedding_id
        and lower(regexp_replace(btrim(wes.name_snapshot), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(v_service->>'name'), '\s+', ' ', 'g'))
        and abs(coalesce(wes.price_snapshot,0) - coalesce((v_service->>'price')::numeric,0)) < 0.01
    ) then
      insert into public.wedding_extra_services (wedding_id,extra_service_id,price_snapshot,quantity,name_snapshot)
      values (p_wedding_id,null,coalesce((v_service->>'price')::numeric,0),1,btrim(v_service->>'name'));
    end if;
  end loop;

  for v_service, v_extra_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(coalesce(v_recovery.normalized_extraction->'additionalServices','[]'::jsonb)) with ordinality as services(value, ordinality)
  loop
    insert into public.wedding_contract_recovery_decisions
      (user_id,recovery_id,field_key,action,previous_value,approved_value)
    values (v_uid,p_recovery_id,'extra.' || v_extra_index::text,
      case when v_extra_index = any(coalesce(p_selected_extra_indexes,'{}')) then 'use_extracted' else 'skip' end,
      null,
      case when v_extra_index = any(coalesce(p_selected_extra_indexes,'{}')) then v_service else null end);
  end loop;

  for v_item, v_extra_index in
    select value, ordinality::integer - 1
    from regexp_split_to_table(coalesce(v_recovery.normalized_extraction->'noteEligibleFacts'->>'value',''), E'\n+') with ordinality as facts(value, ordinality)
  loop
    if v_extra_index = any(coalesce(p_selected_note_indexes, '{}')) and nullif(btrim(v_item),'') is not null then
      v_notes := array_append(v_notes, btrim(v_item));
    end if;
  end loop;
  if cardinality(v_notes) > 0 then
    insert into public.notes (wedding_id,content,author)
    values (p_wedding_id, 'Ustalenia z umowy źródłowej' || E'\n\n' || array_to_string(v_notes, E'\n'), 'Studio');
  end if;
  for v_item, v_extra_index in
    select value, ordinality::integer - 1
    from regexp_split_to_table(coalesce(v_recovery.normalized_extraction->'noteEligibleFacts'->>'value',''), E'\n+') with ordinality as facts(value, ordinality)
  loop
    insert into public.wedding_contract_recovery_decisions
      (user_id,recovery_id,field_key,action,previous_value,approved_value)
    values (v_uid,p_recovery_id,'note.' || v_extra_index::text,
      case when v_extra_index = any(coalesce(p_selected_note_indexes,'{}')) then 'use_extracted' else 'skip' end,
      null, null);
  end loop;

  update public.wedding_source_contracts set status = 'applied' where id = p_source_contract_id;
  update public.wedding_contract_recoveries set status = 'applied', applied_at = timezone('utc',now()) where id = p_recovery_id;
  return jsonb_build_object('appliedFieldKeys',to_jsonb(v_applied),'skippedFieldKeys',to_jsonb(v_skipped),'packageSnapshotId',v_package_id);
end;
$$;

revoke all on function public.apply_wedding_contract_recovery(uuid,uuid,uuid,timestamptz,jsonb,boolean,integer[],integer[]) from public, anon;
grant execute on function public.apply_wedding_contract_recovery(uuid,uuid,uuid,timestamptz,jsonb,boolean,integer[],integer[]) to authenticated;
