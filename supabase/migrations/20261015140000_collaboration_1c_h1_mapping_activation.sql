-- Collaboration 1C-H1: bind accepted invitation mapping metadata and expose
-- an explicit, optimistic owner operation for v1 -> v2 membership migration.
begin;

lock table public.wedding_collaboration_invitations,
  public.wedding_collaboration_memberships,public.wedding_collaboration_events
  in access exclusive mode nowait;
lock table collaboration_private.capability_registry in access exclusive mode nowait;
lock table collaboration_private.permission_presets,
  collaboration_private.permission_preset_grants in access exclusive mode nowait;

create or replace function collaboration_private.resolve_wedding_actor_access(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_owner uuid; v_member public.wedding_collaboration_memberships%rowtype;
begin
  if v_actor is null or p_wedding_id is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then return null; end if;
  select w.user_id into v_owner from public.weddings w where w.id=p_wedding_id and w.status='active';
  if not found then return null; end if;
  if v_owner=v_actor then return pg_catalog.jsonb_build_object('relationship','owner','wedding_id',p_wedding_id); end if;
  select m.* into v_member from public.wedding_collaboration_memberships m
    where m.wedding_id=p_wedding_id and m.owner_user_id=v_owner and m.member_user_id=v_actor and m.status='active';
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object('relationship','collaborator','wedding_id',p_wedding_id,
    'membership_id',v_member.id,'role_key',v_member.role_key,'custom_role_label',v_member.custom_role_label,
    'access_mode',v_member.access_mode,'access_version',v_member.access_version::text,
    'permission_group_mapping_version',v_member.permission_group_mapping_version);
end;
$$;
revoke all on function collaboration_private.resolve_wedding_actor_access(uuid) from public,anon,authenticated,service_role;

create function collaboration_private.seed_membership_mapping_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_mapping text;
begin
  if new.accepted_invitation_id is null then return new; end if;
  select coalesce(i.permission_group_mapping_version,'1') into v_mapping
    from public.wedding_collaboration_invitations i where i.id=new.accepted_invitation_id;
  if found then new.permission_group_mapping_version:=v_mapping; end if;
  return new;
end;
$$;
revoke all on function collaboration_private.seed_membership_mapping_version() from public,anon,authenticated,service_role;
create trigger aaa_wedding_collaboration_membership_mapping_version
  before insert or update of accepted_invitation_id on public.wedding_collaboration_memberships
  for each row execute function collaboration_private.seed_membership_mapping_version();

-- Preserve exact v1 validation on existing 1C-F entry points. The new H1
-- capability is accepted only by version-aware configuration paths.
create or replace function collaboration_private.validate_owner_access_configuration(
  p_role_key text,p_custom_role_label text,p_access_mode text,p_custom_grants jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_key text; v_level smallint; v_normalized jsonb; v_count integer;
begin
  if p_role_key is null or p_role_key not in ('unspecified','custom','system:photographer','system:filmmaker',
    'system:second_shooter','system:wedding_planner','system:assistant','system:content_creator') then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if (p_role_key='custom' and (p_custom_role_label is null or p_custom_role_label<>pg_catalog.btrim(p_custom_role_label)
      or p_custom_role_label !~ '[^[:space:]]' or p_custom_role_label ~ '[[:cntrl:]]'
      or pg_catalog.char_length(p_custom_role_label) not between 1 and 64))
    or (p_role_key<>'custom' and p_custom_role_label is not null) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if p_access_mode is null or p_access_mode not in ('viewer','editor','custom') then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if p_access_mode<>'custom' then
    if p_custom_grants is not null then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    return '[]'::jsonb;
  end if;
  if p_custom_grants is null or pg_catalog.jsonb_typeof(p_custom_grants)<>'array' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_custom_grants) loop
    if pg_catalog.jsonb_typeof(v_item)<>'object' or not (v_item?'capability_key') or not (v_item?'level')
      or pg_catalog.jsonb_typeof(v_item->'capability_key')<>'string'
      or pg_catalog.jsonb_typeof(v_item->'level')<>'number' or (v_item->>'level') !~ '^[12]$' then
      raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    select count(*)::integer into v_count from pg_catalog.jsonb_object_keys(v_item);
    if v_count<>2 then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    v_key:=v_item->>'capability_key'; v_level:=(v_item->>'level')::smallint;
    if not exists(select 1 from collaboration_private.capability_registry c where c.capability_key=v_key
      and c.active and c.grantable and not c.owner_only and not c.h1_mapping_only and v_level<=c.max_custom_level) then
      raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  end loop;
  if exists(select 1 from pg_catalog.jsonb_array_elements(p_custom_grants) x(value)
    group by x.value->>'capability_key' having count(*)>1) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('capability_key',x.value->>'capability_key',
    'level',(x.value->>'level')::integer) order by x.value->>'capability_key'),'[]'::jsonb)
    into v_normalized from pg_catalog.jsonb_array_elements(p_custom_grants) x(value);
  return v_normalized;
end;
$$;
revoke all on function collaboration_private.validate_owner_access_configuration(text,text,text,jsonb) from public,anon,authenticated,service_role;

create function collaboration_private.validate_v2_custom_grants(p_custom_grants jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_item jsonb; v_key text; v_level smallint; v_count integer;
begin
  if p_custom_grants is null or pg_catalog.jsonb_typeof(p_custom_grants)<>'array' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_custom_grants) loop
    if pg_catalog.jsonb_typeof(v_item)<>'object' or not (v_item?'capability_key') or not (v_item?'level')
      or pg_catalog.jsonb_typeof(v_item->'capability_key')<>'string'
      or pg_catalog.jsonb_typeof(v_item->'level')<>'number' or (v_item->>'level') !~ '^[12]$' then
      raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    select count(*)::integer into v_count from pg_catalog.jsonb_object_keys(v_item);
    if v_count<>2 then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    v_key:=v_item->>'capability_key';v_level:=(v_item->>'level')::smallint;
    if not exists(select 1 from collaboration_private.capability_registry c where c.capability_key=v_key
      and c.active and c.grantable and not c.owner_only and v_level<=c.max_custom_level) then
      raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    if v_key='schedule.operational_time' then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  end loop;
  if exists(select 1 from pg_catalog.jsonb_array_elements(p_custom_grants) x(value)
      group by x.value->>'capability_key' having count(*)>1) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements(p_custom_grants) x(value)
      where x.value->>'capability_key'='places.name')
     and not exists(select 1 from pg_catalog.jsonb_array_elements(p_custom_grants) x(value)
       where x.value->>'capability_key'='wedding.identity' and (x.value->>'level')::smallint>=1) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('capability_key',x.value->>'capability_key',
    'level',(x.value->>'level')::integer) order by x.value->>'capability_key'),'[]'::jsonb)
    into v_result from pg_catalog.jsonb_array_elements(p_custom_grants) x(value);
  return v_result;
end;
$$;
revoke all on function collaboration_private.validate_v2_custom_grants(jsonb) from public,anon,authenticated,service_role;

create or replace function collaboration_private.keep_permission_preset_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.scope is distinct from old.scope
    or new.owner_user_id is distinct from old.owner_user_id or new.system_key is distinct from old.system_key
    or new.created_at is distinct from old.created_at
    or new.permission_group_mapping_version is distinct from old.permission_group_mapping_version then
    raise exception using errcode='P0001',message='preset_identity_immutable';
  end if;
  return new;
end;
$$;
revoke all on function collaboration_private.keep_permission_preset_identity() from public,anon,authenticated,service_role;

create function public.create_collaboration_permission_preset_v2(p_name text,p_description text,p_grants jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_name text; v_description text; v_grants jsonb; v_id uuid;
begin
  if v_actor is null then raise exception using errcode='42501',message='UNAVAILABLE'; end if;
  if p_name is null or p_name ~ '[[:cntrl:]]' then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_name:=pg_catalog.regexp_replace(p_name,'^[[:space:]]+|[[:space:]]+$','','g');
  if v_name='' or pg_catalog.char_length(v_name)>80 then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if p_description is not null and p_description ~ '[[:cntrl:]]' then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_description:=case when p_description is null then null else nullif(pg_catalog.regexp_replace(p_description,
    '^[[:space:]]+|[[:space:]]+$','','g'),'') end;
  if v_description is not null and pg_catalog.char_length(v_description)>240 then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_grants:=collaboration_private.validate_v2_custom_grants(p_grants);
  insert into collaboration_private.permission_presets(scope,owner_user_id,name,description,version,permission_group_mapping_version)
    values('user',v_actor,v_name,v_description,1,'2') returning id into v_id;
  insert into collaboration_private.permission_preset_grants(preset_id,capability_key,level)
    select v_id,x.value->>'capability_key',(x.value->>'level')::smallint from pg_catalog.jsonb_array_elements(v_grants) x(value)
    order by x.value->>'capability_key';
  return collaboration_private.permission_preset_detail(v_id);
exception when unique_violation then raise exception using errcode='P0001',message='CONFLICT';
end;
$$;
-- Keep v2 preset creation unavailable until the existing 1C-G read, update,
-- duplicate, and client contracts are all mapping-version aware.
revoke all on function public.create_collaboration_permission_preset_v2(text,text,jsonb)
  from public,anon,authenticated,service_role;

create function public.migrate_wedding_collaboration_membership_to_v2(
  p_wedding_id uuid,p_membership_id uuid,p_expected_access_version text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_peek public.wedding_collaboration_memberships%rowtype;
  v_m public.wedding_collaboration_memberships%rowtype; v_owner uuid; v_next bigint;
begin
  if v_actor is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select m.* into v_peek from public.wedding_collaboration_memberships m
    where m.id=p_membership_id and m.wedding_id_snapshot=p_wedding_id;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_peek.owner_user_id<>v_actor then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if not public.wedding_collaboration_lock_users(array[v_actor,v_peek.member_user_id]) then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select w.user_id into v_owner from public.weddings w where w.id=p_wedding_id and w.status='active' for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_owner<>v_actor then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  select m.* into v_m from public.wedding_collaboration_memberships m where m.id=p_membership_id
    and m.wedding_id=p_wedding_id and m.wedding_id_snapshot=p_wedding_id and m.owner_user_id=v_actor for update;
  if not found or v_m.status<>'active' then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_expected_access_version is null or p_expected_access_version !~ '^[1-9][0-9]*$'
    or p_expected_access_version::numeric>9223372036854775807::numeric then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if p_expected_access_version::numeric<>v_m.access_version::numeric then
    raise exception using errcode='P0001',message='CONFLICT'; end if;
  if v_m.permission_group_mapping_version='2' then
    return pg_catalog.jsonb_build_object('changed',false,'access_version',v_m.access_version::text,
      'permission_group_mapping_version','2'); end if;
  update public.wedding_collaboration_memberships set permission_group_mapping_version='2',
    access_version=access_version+1,updated_at=pg_catalog.timezone('utc',pg_catalog.now())
    where id=v_m.id returning access_version into v_next;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,membership_id,actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,v_m.id,v_actor,'permissions_changed',
      pg_catalog.jsonb_build_object('mapping_version_before','1','mapping_version_after','2',
        'before_version',v_m.access_version::text,'after_version',v_next::text));
  return pg_catalog.jsonb_build_object('changed',true,'access_version',v_next::text,
    'permission_group_mapping_version','2');
end;
$$;
-- Keep the migration implementation available for internal SQL/test use, but
-- do not expose it until H3 ships the version-aware owner-management contract.
revoke all on function public.migrate_wedding_collaboration_membership_to_v2(uuid,uuid,text)
  from public,anon,authenticated,service_role;

commit;
