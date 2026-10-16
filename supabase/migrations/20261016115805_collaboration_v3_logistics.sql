-- Collaboration V3 Logistics: narrow shared projection and owner-parity writes.
begin;

alter table collaboration_private.wedding_operational_versions
  drop constraint wedding_operational_versions_resource_type_check,
  add constraint wedding_operational_versions_resource_type_check
    check (resource_type in ('place_address','place_name','operational_time'));

create or replace function collaboration_private.advance_operational_version(
  p_wedding_id uuid,p_resource_type text,p_role text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare v_version bigint;
begin
  if p_wedding_id is null or p_resource_type not in ('place_address','place_name','operational_time')
    or p_role not in ('bride_preparation','groom_preparation','ceremony','reception') then
    raise exception using errcode='22023',message='COLLABORATION_VERSION_KEY_INVALID'; end if;
  insert into collaboration_private.wedding_operational_versions(wedding_id,resource_type,role,version)
    values(p_wedding_id,p_resource_type,p_role,1) on conflict(wedding_id,resource_type,role) do nothing
    returning version into v_version;
  if found then return v_version; end if;
  select version into v_version from collaboration_private.wedding_operational_versions
    where wedding_id=p_wedding_id and resource_type=p_resource_type and role=p_role for update;
  if not found then raise exception using errcode='P0001',message='COLLABORATION_VERSION_UNAVAILABLE'; end if;
  if v_version=9223372036854775807 then raise exception using errcode='22003',message='COLLABORATION_VERSION_EXHAUSTED'; end if;
  update collaboration_private.wedding_operational_versions set version=v_version+1
    where wedding_id=p_wedding_id and resource_type=p_resource_type and role=p_role returning version into v_version;
  return v_version;
end;
$$;

create or replace function collaboration_private.maintain_place_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_exists boolean; v_old_role text; v_new_role text;
begin
  v_old_role:=case when tg_op<>'INSERT' then case when old.role='preparation' then 'bride_preparation' else old.role end end;
  v_new_role:=case when tg_op<>'DELETE' then case when new.role='preparation' then 'bride_preparation' else new.role end end;
  if tg_op='INSERT' then
    if v_new_role in ('bride_preparation','groom_preparation','ceremony','reception')
      and exists(select 1 from public.weddings w where w.id=new.wedding_id) then
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_address',v_new_role);
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_name',v_new_role);
    end if;
    return new;
  elsif tg_op='DELETE' then
    select exists(select 1 from public.weddings w where w.id=old.wedding_id) into v_exists;
    if v_exists and v_old_role in ('bride_preparation','groom_preparation','ceremony','reception') then
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_address',v_old_role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_name',v_old_role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'operational_time',v_old_role);
    end if;
    return old;
  end if;
  if old.wedding_id is distinct from new.wedding_id then
    if v_old_role in ('bride_preparation','groom_preparation','ceremony','reception')
      and exists(select 1 from public.weddings w where w.id=old.wedding_id) then
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_address',v_old_role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_name',v_old_role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'operational_time',v_old_role);
    end if;
    if v_new_role in ('bride_preparation','groom_preparation','ceremony','reception')
      and exists(select 1 from public.weddings w where w.id=new.wedding_id) then
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_address',v_new_role);
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_name',v_new_role);
      perform collaboration_private.advance_operational_version(new.wedding_id,'operational_time',v_new_role);
    end if;
    return new;
  end if;
  if v_old_role is distinct from v_new_role then
    if v_old_role in ('bride_preparation','groom_preparation','ceremony','reception') then
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_address',v_old_role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_name',v_old_role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'operational_time',v_old_role);
    end if;
    if v_new_role in ('bride_preparation','groom_preparation','ceremony','reception') then
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_address',v_new_role);
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_name',v_new_role);
      perform collaboration_private.advance_operational_version(new.wedding_id,'operational_time',v_new_role);
    end if;
  else
    if v_new_role in ('bride_preparation','groom_preparation','ceremony','reception')
      and row(old.formatted_address,old.place_id,old.latitude,old.longitude)
        is distinct from row(new.formatted_address,new.place_id,new.latitude,new.longitude) then
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_address',v_new_role);
    end if;
    if v_new_role in ('bride_preparation','groom_preparation','ceremony','reception')
      and old.label is distinct from new.label then
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_name',v_new_role);
    end if;
  end if;
  return new;
end;
$$;

-- The owner form can save an initially empty core slot. Seed both field
-- generations for those slots so the shared command always has a version to
-- compare before its first insert.
insert into collaboration_private.wedding_operational_versions(wedding_id,resource_type,role,version)
select w.id,r.resource_type,x.role,1
from public.weddings w
cross join unnest(array['place_address','place_name']::text[]) r(resource_type)
cross join unnest(array['bride_preparation','groom_preparation','ceremony','reception']::text[]) x(role)
on conflict(wedding_id,resource_type,role) do nothing;

create function public.get_collaborative_wedding_logistics_v3(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_context jsonb;
  v_level smallint;
  v_owner uuid;
  v_wedding_version bigint;
  v_origin_version bigint;
  v_topology jsonb;
  v_places jsonb;
  v_studio jsonb;
  v_expected jsonb;
  v_segments jsonb;
  v_route_stale boolean;
  v_access_version text;
begin
  if v_actor is null or p_wedding_id is null then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  v_context := collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_level := collaboration_private.resolve_wedding_area_level(p_wedding_id,'logistics');
  if v_level is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_level < 1 then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  select w.user_id into v_owner from public.weddings w
    where w.id=p_wedding_id and w.status='active';
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;

  select version into v_wedding_version from collaboration_private.wedding_route_input_versions
    where wedding_id=p_wedding_id;
  select version into v_origin_version from collaboration_private.studio_route_input_versions
    where user_id=v_owner;
  v_topology := collaboration_private.current_route_topology(p_wedding_id,v_owner);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'role',p.role,'label',p.label,'place_id',p.place_id,
    'formatted_address',p.formatted_address,'latitude',p.latitude,'longitude',p.longitude,
    'sort_order',p.sort_order,'created_at',p.created_at,'updated_at',p.updated_at,
    'resolution_state',case when nullif(btrim(p.formatted_address),'') is null then 'empty'
      when p.latitude between -90 and 90 and p.longitude between -180 and 180 then 'verified'
      else 'needs_verification' end,
    'address_version',coalesce(av.version,1)::text,
    'name_version',coalesce(nv.version,1)::text)
    order by p.sort_order,p.created_at,p.id),'[]'::jsonb)
    into v_places
  from public.wedding_places p
  left join collaboration_private.wedding_operational_versions av
    on av.wedding_id=p.wedding_id and av.resource_type='place_address'
      and av.role=case when p.role='preparation' then 'bride_preparation' else p.role end
  left join collaboration_private.wedding_operational_versions nv
    on nv.wedding_id=p.wedding_id and nv.resource_type='place_name'
      and nv.role=case when p.role='preparation' then 'bride_preparation' else p.role end
  where p.wedding_id=p_wedding_id;

  select coalesce(jsonb_build_object(
    'studio_name',s.studio_name,'street',s.street,'building_number',s.building_number,
    'postal_code',s.postal_code,'city',s.city,'country',s.country,
    'formatted_address',s.formatted_address,'latitude',s.latitude,
    'longitude',s.longitude,'place_id',s.place_id),null)
    into v_studio from public.studio_travel_settings s where s.user_id=v_owner;
  if not found then v_studio := null; end if;

  v_expected := v_topology->'route_topology';
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',ts.id,'wedding_id',ts.wedding_id,'sequence',ts.sequence,
    'origin_kind',ts.origin_kind,'origin_wedding_place_id',ts.origin_wedding_place_id,
    'destination_kind',ts.destination_kind,'destination_wedding_place_id',ts.destination_wedding_place_id,
    'endpoints_hash',ts.endpoints_hash,'distance_meters',ts.distance_meters,
    'distance_text',ts.distance_text,'duration_seconds',ts.duration_seconds,
    'duration_text',ts.duration_text,'travel_mode',ts.travel_mode,'provider',ts.provider,
    'status',ts.status,'error_message',case when ts.status='error' then 'Nie udało się obliczyć tego odcinka' else null end,
    'calculated_at',ts.calculated_at,'created_at',ts.created_at,'updated_at',ts.updated_at)
    order by ts.sequence),'[]'::jsonb)
    into v_segments from public.travel_segments ts where ts.wedding_id=p_wedding_id;

  select jsonb_array_length(v_expected) <> count(*) or exists (
    select 1 from jsonb_array_elements(v_expected) with ordinality e(value,ord)
    left join public.travel_segments ts on ts.wedding_id=p_wedding_id and ts.sequence=e.ord-1
    where ts.id is null or ts.status='stale' or ts.endpoints_hash is distinct from e.value->>'endpoints_hash'
      or ts.origin_kind is distinct from e.value->>'origin_kind'
      or ts.origin_wedding_place_id is distinct from nullif(e.value->>'origin_wedding_place_id','')::uuid
      or ts.destination_kind is distinct from e.value->>'destination_kind'
      or ts.destination_wedding_place_id is distinct from nullif(e.value->>'destination_wedding_place_id','')::uuid
  ) into v_route_stale from public.travel_segments ts where ts.wedding_id=p_wedding_id;
  if not found then v_route_stale := jsonb_array_length(v_expected) <> 0; end if;

  v_access_version := case when v_context->>'relationship'='owner' then 'owner'
    else v_context->>'access_version' end;
  return jsonb_build_object(
    'wedding_id',p_wedding_id,'access_version',v_access_version,'logistics_level',v_level,
    'route_contract_version',1,'provider','google','travel_mode','DRIVE',
    'wedding_route_input_version',coalesce(v_wedding_version,1)::text,
    'studio_origin_version',coalesce(v_origin_version,1)::text,
    'topology_token',v_topology->>'route_topology_token',
    'route_stale',coalesce(v_route_stale,true),
    'places',v_places,'studio',v_studio,
    'route_stops',v_topology->'route_stops','route_topology',v_expected,'segments',v_segments);
end;
$$;

-- Internal route writer shared by the owner wrapper and V3 command. The caller
-- remains auth.uid(); this function is never executable directly by clients.
create function collaboration_private.replace_wedding_travel_segments_checked(
  p_wedding_id uuid,p_actor uuid,p_route_contract_version integer,
  p_expected_wedding_route_input_version text,p_expected_studio_origin_version text,
  p_provider text,p_travel_mode text,p_topology_token text,p_segments jsonb,p_conflict_message text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid; v_current jsonb; v_expected_wedding bigint; v_expected_origin bigint;
  v_current_wedding bigint; v_current_origin bigint; v_expected_count integer; v_count integer; v_bad boolean;
begin
  if p_actor is null or p_actor is distinct from auth.uid() or p_wedding_id is null
    or p_conflict_message is null or p_conflict_message not in ('CONFLICT','STALE_ROUTE_INPUT') then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_route_contract_version is distinct from 1 or p_provider is distinct from 'google'
    or p_travel_mode is distinct from 'DRIVE'
    or p_expected_wedding_route_input_version is null or p_expected_wedding_route_input_version !~ '^[1-9][0-9]*$'
    or p_expected_studio_origin_version is null or p_expected_studio_origin_version !~ '^[1-9][0-9]*$'
    or p_topology_token is null or p_topology_token !~ '^[0-9a-f]{64}$'
    or p_segments is null or jsonb_typeof(p_segments) is distinct from 'array' then
    raise exception using errcode='P0001',message='ROUTE_SEGMENT_INVALID'; end if;
  begin
    v_expected_wedding:=p_expected_wedding_route_input_version::bigint;
    v_expected_origin:=p_expected_studio_origin_version::bigint;
  exception when others then raise exception using errcode='P0001',message='ROUTE_SEGMENT_INVALID'; end;
  select w.user_id into v_owner from public.weddings w where w.id=p_wedding_id for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1330918916,1);
  select version into v_current_wedding from collaboration_private.wedding_route_input_versions
    where wedding_id=p_wedding_id for share;
  select version into v_current_origin from collaboration_private.studio_route_input_versions
    where user_id=v_owner for share;
  v_current:=collaboration_private.current_route_topology(p_wedding_id,v_owner);
  if v_expected_wedding is distinct from coalesce(v_current_wedding,1)
    or v_expected_origin is distinct from coalesce(v_current_origin,1)
    or p_topology_token is distinct from v_current->>'route_topology_token' then
    raise exception using errcode='P0001',message=p_conflict_message; end if;

  v_expected_count:=jsonb_array_length(v_current->'route_topology');
  v_count:=jsonb_array_length(p_segments);
  if v_count<>v_expected_count
    or (select count(distinct (s->>'sequence')::integer) from jsonb_array_elements(p_segments) s)<>v_count
    or (v_count>0 and ((select min((s->>'sequence')::integer) from jsonb_array_elements(p_segments) s)<>0
      or (select max((s->>'sequence')::integer) from jsonb_array_elements(p_segments) s)<>v_count-1)) then
    raise exception using errcode='P0001',message='ROUTE_SEGMENT_INVALID'; end if;
  select exists(
    select 1 from jsonb_array_elements(p_segments) with ordinality s(value,ord)
    left join jsonb_array_elements(v_current->'route_topology') with ordinality t(value,ord) using(ord)
    where t.value is null or jsonb_typeof(s.value)<>'object'
      or (select count(*) from jsonb_object_keys(s.value))<>16
      or not(s.value ?& array['wedding_id','sequence','origin_kind','origin_wedding_place_id','destination_kind','destination_wedding_place_id','endpoints_hash','distance_meters','distance_text','duration_seconds','duration_text','travel_mode','provider','status','error_message','calculated_at'])
      or s.value->>'wedding_id' is null or s.value->>'sequence' is null
      or s.value->>'status' is null or s.value->>'provider' is null or s.value->>'travel_mode' is null
      or (s.value->>'sequence')::integer<0
      or (s.value->>'wedding_id')::uuid is distinct from p_wedding_id
      or (s.value->>'sequence')::integer is distinct from (t.value->>'sequence')::integer
      or s.value->>'origin_kind' is distinct from t.value->>'origin_kind'
      or nullif(s.value->>'origin_wedding_place_id','')::uuid is distinct from nullif(t.value->>'origin_wedding_place_id','')::uuid
      or s.value->>'destination_kind' is distinct from t.value->>'destination_kind'
      or nullif(s.value->>'destination_wedding_place_id','')::uuid is distinct from nullif(t.value->>'destination_wedding_place_id','')::uuid
      or s.value->>'endpoints_hash' is distinct from t.value->>'endpoints_hash'
      or s.value->>'provider' is distinct from 'google' or s.value->>'travel_mode' is distinct from 'DRIVE'
      or s.value->>'status' not in ('ok','error')
      or jsonb_typeof(s.value->'calculated_at') is distinct from 'string'
      or (s.value->>'calculated_at')::timestamptz is null
      or (s.value->>'status'='ok' and (jsonb_typeof(s.value->'distance_meters') is distinct from 'number'
        or jsonb_typeof(s.value->'duration_seconds') is distinct from 'number'
        or (s.value->>'distance_meters')::numeric<0 or (s.value->>'distance_meters')::numeric>2147483647
        or (s.value->>'duration_seconds')::numeric<0 or (s.value->>'duration_seconds')::numeric>2147483647
        or trunc((s.value->>'distance_meters')::numeric)<>(s.value->>'distance_meters')::numeric
        or trunc((s.value->>'duration_seconds')::numeric)<>(s.value->>'duration_seconds')::numeric
        or jsonb_typeof(s.value->'distance_text') is distinct from 'string'
        or jsonb_typeof(s.value->'duration_text') is distinct from 'string'
        or s.value->'error_message'<>'null'::jsonb))
      or (s.value->>'status'='error' and (s.value->'distance_meters'<>'null'::jsonb
        or s.value->'duration_seconds'<>'null'::jsonb or s.value->'distance_text'<>'null'::jsonb
        or s.value->'duration_text'<>'null'::jsonb or jsonb_typeof(s.value->'error_message') is distinct from 'string'))
  ) into v_bad;
  if v_bad then raise exception using errcode='P0001',message='ROUTE_SEGMENT_INVALID'; end if;

  insert into public.travel_segments(wedding_id,sequence,origin_kind,origin_wedding_place_id,destination_kind,
    destination_wedding_place_id,endpoints_hash,distance_meters,distance_text,duration_seconds,duration_text,
    travel_mode,provider,status,error_message,calculated_at)
  select p_wedding_id,(s->>'sequence')::integer,s->>'origin_kind',nullif(s->>'origin_wedding_place_id','')::uuid,
    s->>'destination_kind',nullif(s->>'destination_wedding_place_id','')::uuid,s->>'endpoints_hash',
    nullif(s->>'distance_meters','null')::integer,s->>'distance_text',nullif(s->>'duration_seconds','null')::integer,
    s->>'duration_text','DRIVE','google',s->>'status',nullif(s->>'error_message','null'),(s->>'calculated_at')::timestamptz
  from jsonb_array_elements(p_segments) s
  on conflict(wedding_id,sequence) do update set origin_kind=excluded.origin_kind,
    origin_wedding_place_id=excluded.origin_wedding_place_id,destination_kind=excluded.destination_kind,
    destination_wedding_place_id=excluded.destination_wedding_place_id,endpoints_hash=excluded.endpoints_hash,
    distance_meters=excluded.distance_meters,distance_text=excluded.distance_text,duration_seconds=excluded.duration_seconds,
    duration_text=excluded.duration_text,travel_mode='DRIVE',provider='google',status=excluded.status,
    error_message=excluded.error_message,calculated_at=excluded.calculated_at;
  delete from public.travel_segments ts where ts.wedding_id=p_wedding_id
    and not exists(select 1 from jsonb_array_elements(p_segments) s where (s->>'sequence')::integer=ts.sequence);
  return jsonb_build_object('status','ok','segments',coalesce((select jsonb_agg(to_jsonb(ts) order by ts.sequence)
    from public.travel_segments ts where ts.wedding_id=p_wedding_id),'[]'::jsonb));
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
  raise exception using errcode='P0001',message='ROUTE_SEGMENT_INVALID';
end;
$$;

create or replace function public.replace_wedding_travel_segments_if_current(
  p_wedding_id uuid,p_route_contract_version integer,p_expected_wedding_route_input_version text,
  p_expected_studio_origin_version text,p_provider text,p_travel_mode text,p_topology_token text,p_segments jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_owner uuid;
begin
  if v_actor is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select user_id into v_owner from public.weddings where id=p_wedding_id and status='active';
  if not found or v_owner is distinct from v_actor then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  perform 1 from public.users u where u.id=v_actor for key share;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  return collaboration_private.replace_wedding_travel_segments_checked(
    p_wedding_id,v_actor,p_route_contract_version,p_expected_wedding_route_input_version,
    p_expected_studio_origin_version,p_provider,p_travel_mode,p_topology_token,p_segments,'STALE_ROUTE_INPUT');
end;
$$;

create function public.mutate_collaborative_wedding_logistics_v3(
  p_wedding_id uuid,p_expected_access_version text,p_action text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_context jsonb; v_level smallint; v_owner uuid; v_status text;
  v_membership_id uuid; v_access_version text; v_role text; v_place_id uuid; v_selected_place_id uuid;
  v_place public.wedding_places%rowtype; v_expected_address bigint; v_expected_name bigint;
  v_current_address bigint; v_current_name bigint; v_address text; v_name text;
  v_has_location boolean; v_lat numeric; v_lng numeric; v_changed boolean;
begin
  if v_actor is null or p_wedding_id is null then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_action is null or p_action not in ('upsert_place','replace_route_segments')
    or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  perform 1 from public.users u where u.id=v_actor for key share;
  if not found or not public.wedding_collaboration_lock_users(array[v_actor]) then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select w.user_id,w.status into v_owner,v_status from public.weddings w where w.id=p_wedding_id for update;
  if not found or v_status<>'active' then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1330918916,1);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('source-contract:'||p_wedding_id::text,0));
  v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_level:=collaboration_private.resolve_wedding_area_level(p_wedding_id,'logistics');
  if v_level is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_level<2 then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  if v_context->>'relationship' is distinct from 'collaborator' then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  v_membership_id:=(v_context->>'membership_id')::uuid;
  v_access_version:=v_context->>'access_version';
  perform 1 from public.wedding_collaboration_memberships m
    where m.id=v_membership_id and m.status='active' and m.wedding_id=p_wedding_id for share;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_expected_access_version is distinct from v_access_version then
    raise exception using errcode='P0001',message='CONFLICT';
  end if;

  if p_action='replace_route_segments' then
    if (select count(*) from jsonb_object_keys(p_payload))<>7
      or not(p_payload ?& array['route_contract_version','expected_wedding_route_input_version',
        'expected_studio_origin_version','provider','travel_mode','topology_token','segments']) then
      raise exception using errcode='P0001',message='ROUTE_SEGMENT_INVALID'; end if;
    return collaboration_private.replace_wedding_travel_segments_checked(
      p_wedding_id,v_actor,(p_payload->>'route_contract_version')::integer,
      p_payload->>'expected_wedding_route_input_version',p_payload->>'expected_studio_origin_version',
      p_payload->>'provider',p_payload->>'travel_mode',p_payload->>'topology_token',p_payload->'segments','CONFLICT');
  end if;

  if (select count(*) from jsonb_object_keys(p_payload))<>9
    or not(p_payload ?& array['place_row_id','role','label','formatted_address','place_id',
      'latitude','longitude','expected_address_version','expected_name_version']) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if jsonb_typeof(p_payload->'role') is distinct from 'string'
    or jsonb_typeof(p_payload->'formatted_address') is distinct from 'string'
    or jsonb_typeof(p_payload->'place_row_id') not in ('string','null')
    or jsonb_typeof(p_payload->'label') not in ('string','null')
    or jsonb_typeof(p_payload->'expected_address_version') is distinct from 'string'
    or jsonb_typeof(p_payload->'expected_name_version') is distinct from 'string' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_role:=p_payload->>'role';
  if v_role is null or v_role not in ('bride_preparation','groom_preparation','ceremony','reception') then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_place_id:=nullif(p_payload->>'place_row_id','')::uuid;
  v_name:=nullif(btrim(p_payload->>'label'),'');
  v_address:=btrim(coalesce(p_payload->>'formatted_address',''));
  if char_length(v_name)>120 or char_length(v_address)>500
    or v_name ~ '[[:cntrl:]]' or v_address ~ '[[:cntrl:]]' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if jsonb_typeof(p_payload->'place_id') is distinct from 'string'
    and p_payload->'place_id'<>'null'::jsonb then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if char_length(coalesce(p_payload->>'place_id',''))>255
    or coalesce(p_payload->>'place_id','') ~ '[[:cntrl:]]' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_has_location:=coalesce(nullif(p_payload->>'place_id','') is not null,false)
    or coalesce(p_payload->'latitude'<>'null'::jsonb,false)
    or coalesce(p_payload->'longitude'<>'null'::jsonb,false);
  if jsonb_typeof(p_payload->'latitude') not in ('number','null')
    or jsonb_typeof(p_payload->'longitude') not in ('number','null') then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_lat:=nullif(p_payload->>'latitude','null')::numeric;
  v_lng:=nullif(p_payload->>'longitude','null')::numeric;
  if (v_lat is null)<>(v_lng is null)
    or (v_lat is not null and v_lat not between -90 and 90)
    or (v_lng is not null and v_lng not between -180 and 180) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if v_address='' and v_name is null and v_place_id is null then
    v_has_location:=false;
  end if;
  v_expected_address:=collaboration_private.validate_expected_version(p_payload->>'expected_address_version');
  v_expected_name:=collaboration_private.validate_expected_version(p_payload->>'expected_name_version');
  if v_place_id is null then
    if exists(select 1 from public.wedding_places p where p.wedding_id=p_wedding_id
      and (p.role=v_role or (v_role='bride_preparation' and p.role='preparation'))) then
      raise exception using errcode='P0001',message='CONFLICT'; end if;
  else
    -- The client may only target the same deterministic row exposed by the
    -- shared form: canonical role before legacy preparation, then stable
    -- owner-compatible ordering. Historical siblings remain untouched.
    select p.id into v_selected_place_id from public.wedding_places p
      where p.wedding_id=p_wedding_id
        and (p.role=v_role or (v_role='bride_preparation' and p.role='preparation'))
      order by case when p.role=v_role then 0 else 1 end,
        p.sort_order,p.created_at,p.id limit 1;
    if v_selected_place_id is distinct from v_place_id then
      raise exception using errcode='P0001',message='CONFLICT';
    end if;
    select * into v_place from public.wedding_places p
      where p.id=v_place_id and p.wedding_id=p_wedding_id
        and (p.role=v_role or (v_role='bride_preparation' and p.role='preparation')) for update;
    if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  end if;
  -- Match the existing place-trigger lock order: place row before generation rows.
  select version into v_current_address from collaboration_private.wedding_operational_versions
    where wedding_id=p_wedding_id and resource_type='place_address' and role=v_role for update;
  select version into v_current_name from collaboration_private.wedding_operational_versions
    where wedding_id=p_wedding_id and resource_type='place_name' and role=v_role for update;
  if v_current_address is null or v_current_name is null then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_expected_address is distinct from v_current_address or v_expected_name is distinct from v_current_name then
    raise exception using errcode='P0001',message='CONFLICT'; end if;

  v_changed:=true;
  if v_address='' and v_name is null and v_place_id is not null then
    delete from public.wedding_places where id=v_place_id and wedding_id=p_wedding_id;
    delete from public.wedding_operational_times where wedding_id=p_wedding_id and stop_key=v_place_id::text;
  elsif v_address='' and v_name is null then
    v_changed:=false;
  elsif v_place_id is not null then
    update public.wedding_places set role=v_role,label=v_name,formatted_address=v_address,
      place_id=case when v_has_location then nullif(p_payload->>'place_id','') else null end,
      latitude=case when v_has_location then v_lat else null end,
      longitude=case when v_has_location then v_lng else null end
    where id=v_place_id and wedding_id=p_wedding_id;
  else
    insert into public.wedding_places(wedding_id,role,label,place_id,formatted_address,latitude,longitude,sort_order)
    values(p_wedding_id,v_role,v_name,nullif(p_payload->>'place_id',''),v_address,v_lat,v_lng,
      case v_role when 'bride_preparation' then 15 when 'groom_preparation' then 10
        when 'ceremony' then 20 else 30 end);
  end if;
  return jsonb_build_object('status','ok','changed',v_changed,'wedding_id',p_wedding_id,
    'role',v_role,'place_row_id',v_place_id);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='P0001',message='VALIDATION_ERROR';
end;
$$;

revoke all on function public.get_collaborative_wedding_logistics_v3(uuid) from public,anon,service_role;
grant execute on function public.get_collaborative_wedding_logistics_v3(uuid) to authenticated;
revoke all on function public.mutate_collaborative_wedding_logistics_v3(uuid,text,text,jsonb) from public,anon,service_role;
grant execute on function public.mutate_collaborative_wedding_logistics_v3(uuid,text,text,jsonb) to authenticated;
revoke all on function collaboration_private.replace_wedding_travel_segments_checked(uuid,uuid,integer,text,text,text,text,text,jsonb,text)
  from public,anon,authenticated,service_role;

commit;
