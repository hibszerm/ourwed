-- Collaboration 1C-H1: separate place-name generation and name-only write.
begin;

lock table public.wedding_places in access exclusive mode nowait;
lock table collaboration_private.wedding_operational_versions in access exclusive mode nowait;

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
    raise exception using errcode='22023',message='COLLABORATION_VERSION_KEY_INVALID';
  end if;
  insert into collaboration_private.wedding_operational_versions(wedding_id,resource_type,role,version)
    values(p_wedding_id,p_resource_type,p_role,1)
    on conflict(wedding_id,resource_type,role) do nothing returning version into v_version;
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
revoke all on function collaboration_private.advance_operational_version(uuid,text,text) from public,anon,authenticated,service_role;

create or replace function collaboration_private.maintain_place_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_exists boolean;
begin
  if tg_op='INSERT' then
    if new.role in ('bride_preparation','groom_preparation','ceremony','reception')
      and exists(select 1 from public.weddings w where w.id=new.wedding_id) then
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_address',new.role);
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_name',new.role);
    end if; return new;
  elsif tg_op='DELETE' then
    select exists(select 1 from public.weddings w where w.id=old.wedding_id) into v_exists;
    if v_exists and old.role in ('bride_preparation','groom_preparation','ceremony','reception') then
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_address',old.role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_name',old.role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'operational_time',old.role);
    end if; return old;
  end if;
  if old.wedding_id is distinct from new.wedding_id then
    if old.role in ('bride_preparation','groom_preparation','ceremony','reception')
      and exists(select 1 from public.weddings w where w.id=old.wedding_id) then
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_address',old.role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_name',old.role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'operational_time',old.role);
    end if;
    if new.role in ('bride_preparation','groom_preparation','ceremony','reception')
      and exists(select 1 from public.weddings w where w.id=new.wedding_id) then
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_address',new.role);
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_name',new.role);
      perform collaboration_private.advance_operational_version(new.wedding_id,'operational_time',new.role);
    end if; return new;
  end if;
  if old.role is distinct from new.role then
    if old.role in ('bride_preparation','groom_preparation','ceremony','reception') then
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_address',old.role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_name',old.role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'operational_time',old.role);
    end if;
    if new.role in ('bride_preparation','groom_preparation','ceremony','reception') then
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_address',new.role);
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_name',new.role);
      perform collaboration_private.advance_operational_version(new.wedding_id,'operational_time',new.role);
    end if;
  else
    if new.role in ('bride_preparation','groom_preparation','ceremony','reception')
      and row(old.formatted_address,old.place_id,old.latitude,old.longitude)
        is distinct from row(new.formatted_address,new.place_id,new.latitude,new.longitude) then
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_address',new.role);
    end if;
    if new.role in ('bride_preparation','groom_preparation','ceremony','reception')
      and old.label is distinct from new.label then
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_name',new.role);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function collaboration_private.maintain_place_version() from public,anon,authenticated,service_role;

insert into collaboration_private.wedding_operational_versions(wedding_id,resource_type,role,version)
select wedding_id,'place_name',role,1 from public.wedding_places
where role in ('bride_preparation','groom_preparation','ceremony','reception')
on conflict do nothing;

create function public.update_collaborative_wedding_place_name(
  p_wedding_id uuid,p_role text,p_name text,p_expected_version text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_owner uuid; v_status text; v_place public.wedding_places%rowtype;
  v_version bigint; v_expected bigint; v_name text;
begin
  if p_role is null or p_role not in ('bride_preparation','groom_preparation','ceremony','reception')
    or p_name is null or p_name ~ '[[:cntrl:]]' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_name:=pg_catalog.regexp_replace(p_name,'^[[:space:]]+|[[:space:]]+$','','g');
  if v_name='' or pg_catalog.char_length(v_name)>120 then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_expected:=collaboration_private.validate_expected_version(p_expected_version);
  if v_actor is null or p_wedding_id is null
    or not public.wedding_collaboration_lock_users(array[v_actor])
    or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select w.user_id,w.status into v_owner,v_status from public.weddings w where w.id=p_wedding_id for update;
  if not found or v_status<>'active' then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1330918916,1);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('source-contract:'||p_wedding_id::text,0));
  if not exists(select 1 from public.wedding_collaboration_memberships m
    where m.wedding_id=p_wedding_id and m.owner_user_id=v_owner and m.member_user_id=v_actor
      and m.status='active' for share) then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if not collaboration_private.has_wedding_capability(p_wedding_id,'places.name',2::smallint) then
    raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  select * into v_place from public.wedding_places p where p.wedding_id=p_wedding_id and p.role=p_role for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select v.version into v_version from collaboration_private.wedding_operational_versions v
    where v.wedding_id=p_wedding_id and v.resource_type='place_name' and v.role=p_role for update;
  if v_place.label is not distinct from v_name then
    return pg_catalog.jsonb_build_object('wedding_id',p_wedding_id,'role',p_role,
      'name',v_place.label,'name_version',v_version::text,'changed',false); end if;
  if v_expected is distinct from v_version then raise exception using errcode='P0001',message='CONFLICT'; end if;
  update public.wedding_places set label=v_name where id=v_place.id;
  select version into v_version from collaboration_private.wedding_operational_versions
    where wedding_id=p_wedding_id and resource_type='place_name' and role=p_role;
  return pg_catalog.jsonb_build_object('wedding_id',p_wedding_id,'role',p_role,
    'name',v_name,'name_version',v_version::text,'changed',true);
end;
$$;
revoke all on function public.update_collaborative_wedding_place_name(uuid,text,text,text) from public,anon;
grant execute on function public.update_collaborative_wedding_place_name(uuid,text,text,text) to authenticated;

create or replace function public.get_collaborative_wedding_detail(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_first text; v_second text; v_date date; v_ceremony time;
  v_identity boolean; v_address boolean; v_name boolean; v_time boolean; v_places jsonb;
begin
  if v_actor is null or p_wedding_id is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then return null; end if;
  select w.bride_name,w.groom_name,w.wedding_date,w.ceremony_time into v_first,v_second,v_date,v_ceremony
  from public.wedding_collaboration_memberships m join public.weddings w
    on w.id=m.wedding_id and w.user_id=m.owner_user_id
  where m.member_user_id=v_actor and m.wedding_id=p_wedding_id and m.status='active' and w.status='active';
  if not found then return null; end if;
  v_identity:=collaboration_private.has_wedding_capability(p_wedding_id,'wedding.identity',1::smallint);
  v_address:=collaboration_private.has_wedding_capability(p_wedding_id,'places.address',1::smallint);
  v_name:=collaboration_private.has_wedding_capability(p_wedding_id,'places.name',1::smallint);
  v_time:=collaboration_private.has_wedding_capability(p_wedding_id,'schedule.operational_time',1::smallint);
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'role',p.role,'name',case when v_name then p.label else null end,
    'name_version',case when v_name then nv.version::text else null end,
    'formatted_address',case when v_address then p.formatted_address else null end,
    'operational_time',case when v_time then case
      when ot.operational_time ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' then ot.operational_time
      when p.role='ceremony' and v_ceremony is not null then pg_catalog.to_char(v_ceremony,'HH24:MI')
      else null end else null end) order by p.sort_order,p.id),'[]'::jsonb)
  into v_places from public.wedding_places p
  left join public.wedding_operational_times ot on ot.wedding_id=p.wedding_id and ot.stop_key=p.id::text
  left join collaboration_private.wedding_operational_versions nv on nv.wedding_id=p.wedding_id
    and nv.resource_type='place_name' and nv.role=p.role
  where p.wedding_id=p_wedding_id and p.role in ('bride_preparation','groom_preparation','ceremony','reception')
    and (v_name or v_address or v_time);
  return pg_catalog.jsonb_build_object('wedding_id',p_wedding_id,
    'couple_first_name',case when v_identity then v_first else null end,
    'couple_second_name',case when v_identity then v_second else null end,
    'wedding_date',case when v_identity then v_date else null end,'places',v_places);
end;
$$;
revoke all on function public.get_collaborative_wedding_detail(uuid) from public,anon;
grant execute on function public.get_collaborative_wedding_detail(uuid) to authenticated;

create or replace function public.get_collaborative_wedding_operational_edit_state(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_owner uuid; v_ceremony text;
  v_address boolean; v_name boolean; v_time boolean; v_places jsonb;
begin
  if v_actor is null or p_wedding_id is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select w.user_id,case when w.ceremony_time is not null and pg_catalog.to_char(w.ceremony_time,'HH24:MI') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    then pg_catalog.to_char(w.ceremony_time,'HH24:MI') else null end into v_owner,v_ceremony
  from public.wedding_collaboration_memberships m join public.weddings w on w.id=m.wedding_id and w.user_id=m.owner_user_id
  where m.member_user_id=v_actor and m.wedding_id=p_wedding_id and m.status='active' and w.status='active';
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_address:=collaboration_private.has_wedding_capability(p_wedding_id,'places.address',1::smallint);
  v_name:=collaboration_private.has_wedding_capability(p_wedding_id,'places.name',1::smallint);
  v_time:=collaboration_private.has_wedding_capability(p_wedding_id,'schedule.operational_time',1::smallint);
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role',r.role,
    'name',case when v_name then coalesce(p.label,'') else null end,
    'name_version',case when v_name then nv.version::text else null end,
    'formatted_address',case when v_address then coalesce(p.formatted_address,'') else null end,
    'address_version',case when v_address then av.version::text else null end,
    'operational_time_override',case when v_time then ot.operational_time else null end,
    'effective_operational_time',case when v_time then case
      when ot.operational_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then ot.operational_time
      when r.role='ceremony' then v_ceremony else null end else null end,
    'time_source',case when v_time then case when ot.operational_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then 'override'
      when r.role='ceremony' and v_ceremony is not null then 'ceremony_fallback' else 'none' end else null end,
    'time_version',case when v_time then tv.version::text else null end) order by r.ordinality)
  into v_places from pg_catalog.unnest(array['bride_preparation','groom_preparation','ceremony','reception']::text[])
    with ordinality r(role,ordinality)
  left join public.wedding_places p on p.wedding_id=p_wedding_id and p.role=r.role
  left join public.wedding_operational_times ot on ot.wedding_id=p_wedding_id and ot.stop_key=p.id::text
  left join collaboration_private.wedding_operational_versions av on av.wedding_id=p_wedding_id and av.resource_type='place_address' and av.role=r.role
  left join collaboration_private.wedding_operational_versions nv on nv.wedding_id=p_wedding_id and nv.resource_type='place_name' and nv.role=r.role
  left join collaboration_private.wedding_operational_versions tv on tv.wedding_id=p_wedding_id and tv.resource_type='operational_time' and tv.role=r.role
  where v_address or v_name or v_time;
  return pg_catalog.jsonb_build_object('wedding_id',p_wedding_id,'places',coalesce(v_places,'[]'::jsonb));
end;
$$;
revoke all on function public.get_collaborative_wedding_operational_edit_state(uuid) from public,anon;
grant execute on function public.get_collaborative_wedding_operational_edit_state(uuid) to authenticated;

comment on function public.update_collaborative_wedding_place_name(uuid,text,text,text) is
  'Renames an existing canonical place row only; does not change address, coordinates, order, slot structure, or travel.';

commit;
