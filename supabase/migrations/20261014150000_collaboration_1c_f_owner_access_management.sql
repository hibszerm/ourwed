-- Collaboration 1C-F: owner-managed role and access configuration.
-- The existing 1C-E resolver remains the only effective-authority source.
begin;

-- Match the lifecycle order used by acceptance/create: invitation relation
-- before the referenced registry. NOWAIT is intentional: a busy release gate
-- aborts cleanly instead of waiting while holding the registry lock.
lock table public.wedding_collaboration_invitations in access exclusive mode nowait;
lock table collaboration_private.capability_registry in access exclusive mode nowait;

alter table collaboration_private.capability_registry
  add column max_custom_level smallint not null default 0;
update collaboration_private.capability_registry
set max_custom_level = case capability_key
  when 'wedding.identity' then 1
  when 'places.address' then 2
  when 'schedule.operational_time' then 2
  else 0 end;
alter table collaboration_private.capability_registry
  add constraint capability_registry_max_custom_level_check
    check (max_custom_level between 0 and 2),
  add constraint capability_registry_max_custom_safe_check
    check (
      (active and grantable and not owner_only
        and viewer_default <= max_custom_level
        and editor_default <= max_custom_level)
      or ((not active or not grantable or owner_only) and max_custom_level=0)
    );

alter table public.wedding_collaboration_invitations
  add column configuration_revision bigint not null default 1,
  add constraint wedding_collaboration_invites_configuration_revision_check
    check (configuration_revision > 0);

do $assert_registry$
begin
  if (select count(*) from collaboration_private.capability_registry) <> 13
    or (select count(*) from collaboration_private.capability_registry
        where active and max_custom_level > 0) <> 3
    or exists(select 1 from collaboration_private.capability_registry
        where not active and (viewer_default<>0 or editor_default<>0 or max_custom_level<>0))
    or exists(select 1 from collaboration_private.capability_registry
        where active and capability_key='wedding.identity' and max_custom_level<>1)
    or exists(select 1 from collaboration_private.capability_registry
        where active and capability_key in ('places.address','schedule.operational_time')
          and max_custom_level<>2)
  then
    raise exception 'COLLABORATION_1C_F_REGISTRY_PREFLIGHT_FAILED';
  end if;
end;
$assert_registry$;

create function collaboration_private.validate_owner_access_configuration(
  p_role_key text,
  p_custom_role_label text,
  p_access_mode text,
  p_custom_grants jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_key text;
  v_level smallint;
  v_normalized jsonb;
  v_count integer;
begin
  if p_role_key is null or p_role_key not in (
    'unspecified','custom','system:photographer','system:filmmaker',
    'system:second_shooter','system:wedding_planner','system:assistant','system:content_creator'
  ) then
    raise exception using errcode='P0001', message='VALIDATION_ERROR';
  end if;
  if (p_role_key='custom' and (p_custom_role_label is null
      or p_custom_role_label<>pg_catalog.btrim(p_custom_role_label)
      or p_custom_role_label !~ '[^[:space:]]'
      or p_custom_role_label ~ '[[:cntrl:]]'
      or pg_catalog.char_length(p_custom_role_label) not between 1 and 64))
     or (p_role_key<>'custom' and p_custom_role_label is not null) then
    raise exception using errcode='P0001', message='VALIDATION_ERROR';
  end if;
  if p_access_mode is null or p_access_mode not in ('viewer','editor','custom') then
    raise exception using errcode='P0001', message='VALIDATION_ERROR';
  end if;
  if p_access_mode<>'custom' then
    if p_custom_grants is not null then
      raise exception using errcode='P0001', message='VALIDATION_ERROR';
    end if;
    return '[]'::jsonb;
  end if;
  if p_custom_grants is null or pg_catalog.jsonb_typeof(p_custom_grants)<>'array' then
    raise exception using errcode='P0001', message='VALIDATION_ERROR';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_custom_grants)
  loop
    if pg_catalog.jsonb_typeof(v_item)<>'object'
      or not (v_item ? 'capability_key') or not (v_item ? 'level')
      or pg_catalog.jsonb_typeof(v_item->'capability_key')<>'string'
      or pg_catalog.jsonb_typeof(v_item->'level')<>'number'
      or (v_item->>'level') !~ '^[12]$' then
      raise exception using errcode='P0001', message='VALIDATION_ERROR';
    end if;
    select count(*)::integer into v_count from pg_catalog.jsonb_object_keys(v_item);
    if v_count<>2 then
      raise exception using errcode='P0001', message='VALIDATION_ERROR';
    end if;
    v_key := v_item->>'capability_key';
    v_level := (v_item->>'level')::smallint;
    if not exists(select 1 from collaboration_private.capability_registry c
       where c.capability_key=v_key and c.active and c.grantable and not c.owner_only
         and v_level<=c.max_custom_level) then
      raise exception using errcode='P0001', message='VALIDATION_ERROR';
    end if;
  end loop;
  if exists(select 1 from pg_catalog.jsonb_array_elements(p_custom_grants) x(value)
      group by x.value->>'capability_key' having count(*)>1) then
    raise exception using errcode='P0001', message='VALIDATION_ERROR';
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('capability_key',x.value->>'capability_key',
      'level',(x.value->>'level')::integer)
      order by x.value->>'capability_key'), '[]'::jsonb)
    into v_normalized from pg_catalog.jsonb_array_elements(p_custom_grants) x(value);
  return v_normalized;
end;
$$;
revoke all on function collaboration_private.validate_owner_access_configuration(text,text,text,jsonb)
  from public,anon,authenticated,service_role;

create function collaboration_private.owner_access_preview(p_mode text,p_custom_grants jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('capability_key',c.capability_key,'level',
      case when p_mode='custom' then x.value->'level'
        when p_mode='viewer' then pg_catalog.to_jsonb(c.viewer_default)
        else pg_catalog.to_jsonb(c.editor_default) end)
      order by c.capability_key), '[]'::jsonb)
  from collaboration_private.capability_registry c
  left join lateral pg_catalog.jsonb_array_elements(coalesce(p_custom_grants,'[]'::jsonb)) x(value)
    on x.value->>'capability_key'=c.capability_key
  where c.active and c.grantable and not c.owner_only
    and (case when p_mode='custom' then coalesce((x.value->>'level')::smallint,0)
         when p_mode='viewer' then c.viewer_default else c.editor_default end)>0
$$;
revoke all on function collaboration_private.owner_access_preview(text,jsonb)
  from public,anon,authenticated,service_role;

create function collaboration_private.owner_access_management_dto(
  p_wedding_id uuid,p_target_id uuid,p_pending boolean
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_i public.wedding_collaboration_invitations%rowtype;
  v_m public.wedding_collaboration_memberships%rowtype;
  v_display text;
  v_custom jsonb;
  v_mode text;
  v_role text;
  v_label text;
  v_version integer;
  v_revision bigint;
  v_access_version bigint;
begin
  if p_pending then
    select i.* into v_i from public.wedding_collaboration_invitations i
      where i.id=p_target_id and i.wedding_id_snapshot=p_wedding_id
        and i.status='pending' and i.expires_at>pg_catalog.now();
    if not found then return null; end if;
    select coalesce(nullif(pg_catalog.btrim(u.name),''),'Użytkownik niedostępny')
      into v_display from public.users u where u.id=v_i.invitee_user_id;
    v_display:=coalesce(v_display,'Użytkownik niedostępny');
    if v_i.access_configuration_version=0 then
      v_role:='unspecified'; v_label:=null; v_mode:='custom';
      v_custom:='[{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":2},{"capability_key":"wedding.identity","level":1}]'::jsonb;
    else
      v_role:=v_i.role_key; v_label:=v_i.custom_role_label; v_mode:=v_i.access_mode;
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'capability_key',g.capability_key,'level',g.level) order by g.capability_key),'[]'::jsonb)
        into v_custom from collaboration_private.invitation_permission_grants g where g.invitation_id=v_i.id;
    end if;
    return pg_catalog.jsonb_build_object(
      'wedding_id',p_wedding_id,'invitation_id',v_i.id,'status',v_i.status,
      'invitee_display_name',v_display,'access_configuration_version',v_i.access_configuration_version,
      'configuration_revision',v_i.configuration_revision::text,'role_key',v_role,
      'custom_role_label',v_label,'access_mode',v_mode,
      'effective_preview',collaboration_private.owner_access_preview(v_mode,v_custom),
      'custom_grants',v_custom,
      'viewer_preview',collaboration_private.owner_access_preview('viewer','[]'::jsonb),
      'editor_preview',collaboration_private.owner_access_preview('editor','[]'::jsonb),
      'permission_group_mapping_version','1');
  end if;
  select m.* into v_m from public.wedding_collaboration_memberships m
    where m.id=p_target_id and m.wedding_id_snapshot=p_wedding_id and m.status='active';
  if not found then return null; end if;
  select coalesce(nullif(pg_catalog.btrim(u.name),''),'Użytkownik niedostępny')
    into v_display from public.users u where u.id=v_m.member_user_id;
  v_display:=coalesce(v_display,'Użytkownik niedostępny');
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'capability_key',g.capability_key,'level',g.level) order by g.capability_key),'[]'::jsonb)
    into v_custom from collaboration_private.membership_permission_grants g where g.membership_id=v_m.id;
  return pg_catalog.jsonb_build_object(
    'wedding_id',p_wedding_id,'membership_id',v_m.id,'status',v_m.status,
    'collaborator_display_name',v_display,'role_key',v_m.role_key,
    'custom_role_label',v_m.custom_role_label,'access_mode',v_m.access_mode,
    'access_version',v_m.access_version::text,
    'effective_permissions',collaboration_private.owner_access_preview(v_m.access_mode,v_custom),
    'custom_grants',v_custom,
    'viewer_preview',collaboration_private.owner_access_preview('viewer','[]'::jsonb),
    'editor_preview',collaboration_private.owner_access_preview('editor','[]'::jsonb),
    'permission_group_mapping_version','1');
end;
$$;
revoke all on function collaboration_private.owner_access_management_dto(uuid,uuid,boolean)
  from public,anon,authenticated,service_role;

create function public.get_wedding_collaboration_access_previews(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid();
  v_wedding public.weddings%rowtype;
begin
  if v_actor is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='42501',message='unauthorized'; end if;
  select * into v_wedding from public.weddings w where w.id=p_wedding_id;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_wedding.user_id<>v_actor then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  return pg_catalog.jsonb_build_object(
    'viewer_preview',collaboration_private.owner_access_preview('viewer','[]'::jsonb),
    'editor_preview',collaboration_private.owner_access_preview('editor','[]'::jsonb),
    'permission_group_mapping_version','1');
end; $$;

revoke all on function public.get_wedding_collaboration_access_previews(uuid) from public,anon;
grant execute on function public.get_wedding_collaboration_access_previews(uuid) to authenticated;

create function public.get_wedding_collaboration_membership_access_management(
  p_wedding_id uuid,p_membership_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_owner uuid; v_dto jsonb;
begin
  if v_actor is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  select w.user_id into v_owner from public.weddings w where w.id=p_wedding_id and w.status='active';
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_owner<>v_actor then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  v_dto:=collaboration_private.owner_access_management_dto(p_wedding_id,p_membership_id,false);
  if v_dto is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  return v_dto;
end; $$;

create function public.get_wedding_collaboration_invitation_access_management(
  p_wedding_id uuid,p_invitation_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_owner uuid; v_dto jsonb;
begin
  if v_actor is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  select w.user_id into v_owner from public.weddings w where w.id=p_wedding_id and w.status='active';
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_owner<>v_actor then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  v_dto:=collaboration_private.owner_access_management_dto(p_wedding_id,p_invitation_id,true);
  if v_dto is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  return v_dto;
end; $$;

create function public.update_wedding_collaboration_membership_access(
  p_wedding_id uuid,p_membership_id uuid,p_expected_access_version text,
  p_role_key text,p_custom_role_label text,p_access_mode text,p_custom_grants jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_peek public.wedding_collaboration_memberships%rowtype;
  v_m public.wedding_collaboration_memberships%rowtype; v_owner uuid;
  v_grants jsonb; v_before_grants jsonb; v_before jsonb; v_after jsonb;
  v_role_changed boolean; v_mode_changed boolean; v_permissions_changed boolean;
  v_new_version bigint;
begin
  if v_actor is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  select m.* into v_peek from public.wedding_collaboration_memberships m
    where m.id=p_membership_id and m.wedding_id_snapshot=p_wedding_id;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_peek.owner_user_id<>v_actor then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if not public.wedding_collaboration_lock_users(array[v_actor,v_peek.member_user_id]) then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  select w.user_id into v_owner from public.weddings w where w.id=p_wedding_id and w.status='active' for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_owner<>v_actor then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  select m.* into v_m from public.wedding_collaboration_memberships m
    where m.id=p_membership_id and m.wedding_id=p_wedding_id and m.wedding_id_snapshot=p_wedding_id
      and m.owner_user_id=v_actor for update;
  if not found or v_m.status<>'active' then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_expected_access_version is null or p_expected_access_version !~ '^[1-9][0-9]*$' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  if p_expected_access_version::numeric>9223372036854775807::numeric then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  if p_expected_access_version::numeric<>v_m.access_version::numeric then
    raise exception using errcode='P0001',message='CONFLICT';
  end if;
  v_grants:=collaboration_private.validate_owner_access_configuration(
    p_role_key,p_custom_role_label,p_access_mode,p_custom_grants);
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('capability_key',g.capability_key,'level',g.level)
      order by g.capability_key),'[]'::jsonb) into v_before_grants
    from collaboration_private.membership_permission_grants g where g.membership_id=v_m.id;
  v_role_changed:=v_m.role_key is distinct from p_role_key or v_m.custom_role_label is distinct from p_custom_role_label;
  v_mode_changed:=v_m.access_mode is distinct from p_access_mode;
  v_permissions_changed:=v_before_grants is distinct from v_grants;
  if not v_role_changed and not v_mode_changed and not v_permissions_changed then
    return pg_catalog.jsonb_build_object('changed',false,'access_version',v_m.access_version::text,
      'configuration',collaboration_private.owner_access_management_dto(p_wedding_id,v_m.id,false));
  end if;
  v_before:=pg_catalog.jsonb_build_object('role_key',v_m.role_key,'custom_role_label',v_m.custom_role_label,
    'access_mode',v_m.access_mode,'custom_grants',v_before_grants);
  if v_permissions_changed then
    perform 1 from collaboration_private.membership_permission_grants g
      where g.membership_id=v_m.id order by g.capability_key for update;
    delete from collaboration_private.membership_permission_grants where membership_id=v_m.id;
    if p_access_mode='custom' then
      insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
        select v_m.id,x.value->>'capability_key',(x.value->>'level')::smallint
        from pg_catalog.jsonb_array_elements(v_grants) x(value) order by x.value->>'capability_key';
    end if;
  end if;
  update public.wedding_collaboration_memberships set role_key=p_role_key,
    custom_role_label=p_custom_role_label,access_mode=p_access_mode,
    access_version=access_version+1,updated_at=pg_catalog.timezone('utc',pg_catalog.now())
    where id=v_m.id returning access_version into v_new_version;
  v_after:=pg_catalog.jsonb_build_object('role_key',p_role_key,'custom_role_label',p_custom_role_label,
    'access_mode',p_access_mode,'custom_grants',case when p_access_mode='custom' then v_grants else '[]'::jsonb end);
  if v_role_changed then insert into public.wedding_collaboration_events(
      wedding_id,wedding_id_snapshot,membership_id,actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,v_m.id,v_actor,'role_changed',pg_catalog.jsonb_build_object(
      'before',v_before,'after',v_after,'before_version',v_m.access_version::text,'after_version',v_new_version::text)); end if;
  if v_mode_changed then insert into public.wedding_collaboration_events(
      wedding_id,wedding_id_snapshot,membership_id,actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,v_m.id,v_actor,'access_mode_changed',pg_catalog.jsonb_build_object(
      'before',v_before,'after',v_after,'before_version',v_m.access_version::text,'after_version',v_new_version::text)); end if;
  if v_permissions_changed then insert into public.wedding_collaboration_events(
      wedding_id,wedding_id_snapshot,membership_id,actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,v_m.id,v_actor,'permissions_changed',pg_catalog.jsonb_build_object(
      'before',v_before,'after',v_after,'before_version',v_m.access_version::text,'after_version',v_new_version::text)); end if;
  return pg_catalog.jsonb_build_object('changed',true,'access_version',v_new_version::text,
    'configuration',collaboration_private.owner_access_management_dto(p_wedding_id,v_m.id,false));
end; $$;

create function public.update_wedding_collaboration_invitation_access(
  p_wedding_id uuid,p_invitation_id uuid,p_expected_configuration_revision text,
  p_role_key text,p_custom_role_label text,p_access_mode text,p_custom_grants jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_peek public.wedding_collaboration_invitations%rowtype;
  v_i public.wedding_collaboration_invitations%rowtype; v_connection public.collaboration_connections%rowtype;
  v_wedding public.weddings%rowtype; v_grants jsonb; v_before_grants jsonb; v_before jsonb; v_after jsonb;
  v_old_role text; v_old_label text; v_old_mode text; v_role_changed boolean; v_mode_changed boolean;
  v_permissions_changed boolean; v_new_revision bigint;
begin
  if v_actor is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  select i.* into v_peek from public.wedding_collaboration_invitations i
    where i.id=p_invitation_id and i.wedding_id_snapshot=p_wedding_id;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_peek.owner_user_id<>v_actor then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if not public.wedding_collaboration_lock_users(array[v_actor,v_peek.invitee_user_id]) then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  select * into v_connection from public.collaboration_connections c
    where c.id=v_peek.source_connection_id for update;
  if not found or v_connection.status<>'active'
    or v_actor not in(v_connection.participant_low_id,v_connection.participant_high_id)
    or v_peek.invitee_user_id not in(v_connection.participant_low_id,v_connection.participant_high_id) then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  select w.* into v_wedding from public.weddings w where w.id=p_wedding_id and w.status='active' for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_wedding.user_id<>v_actor then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  select i.* into v_i from public.wedding_collaboration_invitations i
    where i.id=p_invitation_id and i.wedding_id=p_wedding_id and i.wedding_id_snapshot=p_wedding_id
      and i.owner_user_id=v_actor for update;
  if not found or v_i.status<>'pending' or v_i.expires_at<=pg_catalog.now() then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  if v_i.terms_version is distinct from v_wedding.collaboration_terms_version then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  if p_expected_configuration_revision is null or p_expected_configuration_revision !~ '^[1-9][0-9]*$' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  if p_expected_configuration_revision::numeric>9223372036854775807::numeric then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  if p_expected_configuration_revision::numeric<>v_i.configuration_revision::numeric then
    raise exception using errcode='P0001',message='CONFLICT';
  end if;
  v_grants:=collaboration_private.validate_owner_access_configuration(
    p_role_key,p_custom_role_label,p_access_mode,p_custom_grants);
  if v_i.access_configuration_version=0 then
    v_old_role:='unspecified';v_old_label:=null;v_old_mode:='custom';
    v_before_grants:='[{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":2},{"capability_key":"wedding.identity","level":1}]'::jsonb;
  else
    v_old_role:=v_i.role_key;v_old_label:=v_i.custom_role_label;v_old_mode:=v_i.access_mode;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('capability_key',g.capability_key,'level',g.level)
      order by g.capability_key),'[]'::jsonb) into v_before_grants
      from collaboration_private.invitation_permission_grants g where g.invitation_id=v_i.id;
  end if;
  v_role_changed:=v_old_role is distinct from p_role_key or v_old_label is distinct from p_custom_role_label;
  v_mode_changed:=v_old_mode is distinct from p_access_mode;
  v_permissions_changed:=v_before_grants is distinct from v_grants;
  if not v_role_changed and not v_mode_changed and not v_permissions_changed then
    return pg_catalog.jsonb_build_object('changed',false,'configuration_revision',v_i.configuration_revision::text,
      'configuration',collaboration_private.owner_access_management_dto(p_wedding_id,v_i.id,true));
  end if;
  v_before:=pg_catalog.jsonb_build_object('role_key',v_old_role,'custom_role_label',v_old_label,
    'access_mode',v_old_mode,'custom_grants',v_before_grants);
  if v_permissions_changed or (v_i.access_configuration_version=0 and p_access_mode='custom') then
    perform 1 from collaboration_private.invitation_permission_grants g
      where g.invitation_id=v_i.id order by g.capability_key for update;
    delete from collaboration_private.invitation_permission_grants where invitation_id=v_i.id;
    if p_access_mode='custom' then
      insert into collaboration_private.invitation_permission_grants(invitation_id,capability_key,level)
        select v_i.id,x.value->>'capability_key',(x.value->>'level')::smallint
        from pg_catalog.jsonb_array_elements(v_grants) x(value) order by x.value->>'capability_key';
    end if;
  end if;
  update public.wedding_collaboration_invitations set access_configuration_version=1,
    role_key=p_role_key,custom_role_label=p_custom_role_label,access_mode=p_access_mode,
    permission_group_mapping_version='1',configuration_revision=configuration_revision+1,
    updated_at=pg_catalog.timezone('utc',pg_catalog.now()) where id=v_i.id
    returning configuration_revision into v_new_revision;
  v_after:=pg_catalog.jsonb_build_object('role_key',p_role_key,'custom_role_label',p_custom_role_label,
    'access_mode',p_access_mode,'custom_grants',case when p_access_mode='custom' then v_grants else '[]'::jsonb end);
  if v_role_changed then insert into public.wedding_collaboration_events(
      wedding_id,wedding_id_snapshot,invitation_id,actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,v_i.id,v_actor,'role_changed',pg_catalog.jsonb_build_object(
      'before',v_before,'after',v_after,'before_version',v_i.configuration_revision::text,'after_version',v_new_revision::text)); end if;
  if v_mode_changed then insert into public.wedding_collaboration_events(
      wedding_id,wedding_id_snapshot,invitation_id,actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,v_i.id,v_actor,'access_mode_changed',pg_catalog.jsonb_build_object(
      'before',v_before,'after',v_after,'before_version',v_i.configuration_revision::text,'after_version',v_new_revision::text)); end if;
  if v_permissions_changed then insert into public.wedding_collaboration_events(
      wedding_id,wedding_id_snapshot,invitation_id,actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,v_i.id,v_actor,'permissions_changed',pg_catalog.jsonb_build_object(
      'before',v_before,'after',v_after,'before_version',v_i.configuration_revision::text,'after_version',v_new_revision::text)); end if;
  return pg_catalog.jsonb_build_object('changed',true,'configuration_revision',v_new_revision::text,
    'configuration',collaboration_private.owner_access_management_dto(p_wedding_id,v_i.id,true));
end; $$;

create function public.create_wedding_collaboration_invitation_configured(
  p_wedding_id uuid,p_connection_id uuid,p_proposed_share_amount numeric,p_idempotency_key uuid,
  p_role_key text,p_custom_role_label text,p_access_mode text,p_custom_grants jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_connection public.collaboration_connections%rowtype;
  v_peer uuid; v_wedding public.weddings%rowtype; v_invite public.wedding_collaboration_invitations%rowtype;
  v_event public.wedding_collaboration_events%rowtype; v_existing public.wedding_collaboration_invitations%rowtype;
  v_extras jsonb; v_grants jsonb; v_request jsonb;
begin
  if v_actor is null or p_idempotency_key is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='42501',message='UNAVAILABLE';
  end if;
  if p_proposed_share_amount is not null and p_proposed_share_amount<0 then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  v_grants:=collaboration_private.validate_owner_access_configuration(
    p_role_key,p_custom_role_label,p_access_mode,p_custom_grants);
  v_request:=pg_catalog.jsonb_build_object('wedding_id',p_wedding_id,'connection_id',p_connection_id,
    'proposed_share_amount',p_proposed_share_amount,'role_key',p_role_key,
    'custom_role_label',p_custom_role_label,'access_mode',p_access_mode,'custom_grants',v_grants);
  select * into v_event from public.wedding_collaboration_events e
    where e.actor_user_id=v_actor and e.idempotency_key=p_idempotency_key;
  if found then
    if v_event.event_type<>'invitation_created' or v_event.invitation_id is null
      or v_event.metadata->'request' is distinct from v_request then
      raise exception using errcode='P0001',message='CONFLICT'; end if;
    return pg_catalog.jsonb_build_object('status','created','invitation_id',v_event.invitation_id,'duplicate',true);
  end if;
  select * into v_connection from public.collaboration_connections c where c.id=p_connection_id;
  if not found or v_connection.status<>'active'
    or v_actor not in(v_connection.participant_low_id,v_connection.participant_high_id) then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_peer:=case when v_connection.participant_low_id=v_actor then v_connection.participant_high_id else v_connection.participant_low_id end;
  if v_peer is null or v_peer=v_actor
    or not public.wedding_collaboration_lock_users(array[v_actor,v_peer]) then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select * into v_event from public.wedding_collaboration_events e
    where e.actor_user_id=v_actor and e.idempotency_key=p_idempotency_key;
  if found then
    if v_event.event_type<>'invitation_created' or v_event.invitation_id is null
      or v_event.metadata->'request' is distinct from v_request then
      raise exception using errcode='P0001',message='CONFLICT'; end if;
    select * into v_existing from public.wedding_collaboration_invitations i where i.id=v_event.invitation_id;
    if not found or v_existing.access_configuration_version<>1 then
      raise exception using errcode='P0001',message='CONFLICT'; end if;
    return pg_catalog.jsonb_build_object('status','created','invitation_id',v_existing.id,'duplicate',true);
  end if;
  perform 1 from public.collaboration_connections c where c.id=p_connection_id and c.status='active'
    and v_actor in(c.participant_low_id,c.participant_high_id) and v_peer in(c.participant_low_id,c.participant_high_id) for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select * into v_wedding from public.weddings w where w.id=p_wedding_id and w.user_id=v_actor and w.status='active' for update;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if exists(select 1 from public.wedding_collaboration_memberships m where m.wedding_id=p_wedding_id
      and m.member_user_id=v_peer and m.status='active') then raise exception using errcode='P0001',message='CONFLICT'; end if;
  if exists(select 1 from public.wedding_collaboration_invitations i where i.wedding_id=p_wedding_id
      and i.invitee_user_id=v_peer and i.status='pending') then raise exception using errcode='P0001',message='CONFLICT'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',x.id,
      'extra_service_id',x.extra_service_id,'name',x.name_snapshot,'price',x.price_snapshot,'quantity',x.quantity)
      order by x.id),'[]'::jsonb) into v_extras from public.wedding_extra_services x where x.wedding_id=p_wedding_id;
  insert into public.wedding_collaboration_invitations(
    wedding_id,wedding_id_snapshot,owner_user_id,invitee_user_id,source_connection_id,
    terms_version,couple_first_name_snapshot,couple_second_name_snapshot,wedding_date_snapshot,
    package_label_snapshot,contract_value_snapshot,currency_snapshot,proposed_share_amount,
    terms_snapshot,extras_snapshot,idempotency_key,access_configuration_version,
    role_key,custom_role_label,access_mode,permission_group_mapping_version,configuration_revision)
  values(p_wedding_id,p_wedding_id,v_actor,v_peer,v_connection.id,v_wedding.collaboration_terms_version,
    v_wedding.bride_name,v_wedding.groom_name,v_wedding.wedding_date,v_wedding.package_name,
    v_wedding.contract_value,v_wedding.currency,p_proposed_share_amount,
    pg_catalog.jsonb_build_object('deposit_amount',v_wedding.deposit_amount,'package_id',v_wedding.package_id,
      'package_items_snapshot',v_wedding.package_items_snapshot,'selected_package_ids',v_wedding.selected_package_ids,
      'final_payment_terms',v_wedding.final_payment_terms,'final_payment_due_date',v_wedding.final_payment_due_date,
      'coverage_hours',v_wedding.coverage_hours,'coverage_end_time',v_wedding.coverage_end_time,
      'overtime_rate',v_wedding.overtime_rate,'delivery_months',v_wedding.delivery_months,
      'delivery_days',v_wedding.delivery_days,'delivery_due_date',v_wedding.delivery_due_date,
      'travel_fee_status',v_wedding.travel_fee_status,'travel_fee_amount',v_wedding.travel_fee_amount,
      'travel_fee_free_km_snapshot',v_wedding.travel_fee_free_km_snapshot,
      'travel_fee_route_distance_m_snapshot',v_wedding.travel_fee_route_distance_m_snapshot),
    v_extras,p_idempotency_key,1,p_role_key,p_custom_role_label,p_access_mode,'1',1)
  returning * into v_invite;
  if p_access_mode='custom' then
    insert into collaboration_private.invitation_permission_grants(invitation_id,capability_key,level)
      select v_invite.id,x.value->>'capability_key',(x.value->>'level')::smallint
      from pg_catalog.jsonb_array_elements(v_grants) x(value) order by x.value->>'capability_key';
  end if;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,
      actor_user_id,event_type,idempotency_key,metadata)
    values(p_wedding_id,p_wedding_id,v_invite.id,v_actor,'invitation_created',p_idempotency_key,
      pg_catalog.jsonb_build_object('request',v_request));
  return pg_catalog.jsonb_build_object('status','created','invitation_id',v_invite.id,'duplicate',false,
    'access_configuration_version',1,'configuration_revision','1');
end; $$;

-- Align terminal invitation commands with the new pending-edit serialization:
-- users -> connection -> wedding -> invitation -> event.
create or replace function public.cancel_wedding_collaboration_invite(p_invitation_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_peek public.wedding_collaboration_invitations%rowtype;
  v_i public.wedding_collaboration_invitations%rowtype; v_connection public.collaboration_connections%rowtype;
  v_event public.wedding_collaboration_events%rowtype; v_wedding public.weddings%rowtype;
begin
  if v_actor is null or p_idempotency_key is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='42501',message='unauthorized'; end if;
  select * into v_event from public.wedding_collaboration_events e where e.actor_user_id=v_actor and e.idempotency_key=p_idempotency_key;
  if found then
    if v_event.event_type<>'invitation_cancelled' or v_event.invitation_id<>p_invitation_id then
      raise exception using errcode='P0001',message='idempotency_key_reused'; end if;
    return pg_catalog.jsonb_build_object('status','cancelled','duplicate',true);
  end if;
  select * into v_peek from public.wedding_collaboration_invitations i where i.id=p_invitation_id;
  if not found or v_peek.owner_user_id<>v_actor or v_peek.status<>'pending' then
    raise exception using errcode='P0001',message='invitation_unavailable'; end if;
  if not public.wedding_collaboration_lock_users(array[v_actor,v_peek.invitee_user_id]) then
    raise exception using errcode='P0001',message='invitation_unavailable'; end if;
  select * into v_connection from public.collaboration_connections c where c.id=v_peek.source_connection_id for update;
  if not found then raise exception using errcode='P0001',message='invitation_unavailable'; end if;
  select * into v_wedding from public.weddings w where w.id=v_peek.wedding_id and w.user_id=v_actor for update;
  if not found then raise exception using errcode='P0001',message='invitation_unavailable'; end if;
  select * into v_i from public.wedding_collaboration_invitations i where i.id=p_invitation_id for update;
  if not found or v_i.status<>'pending' then raise exception using errcode='P0001',message='invitation_unavailable'; end if;
  update public.wedding_collaboration_invitations set status='cancelled',reason='owner_cancelled',
    cancelled_at=pg_catalog.timezone('utc',pg_catalog.now()),updated_at=pg_catalog.timezone('utc',pg_catalog.now())
    where id=v_i.id;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,
      actor_user_id,event_type,reason,idempotency_key)
    values(v_i.wedding_id,v_i.wedding_id_snapshot,v_i.id,v_actor,'invitation_cancelled','owner_cancelled',p_idempotency_key);
  return pg_catalog.jsonb_build_object('status','cancelled','duplicate',false);
end; $$;

-- Revoke shares the accepted-edit lock order so the event FK cannot invert it.
create or replace function public.revoke_wedding_collaboration_membership(p_membership_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_peek public.wedding_collaboration_memberships%rowtype;
  v_m public.wedding_collaboration_memberships%rowtype; v_event public.wedding_collaboration_events%rowtype;
  v_wedding public.weddings%rowtype;
begin
  if v_actor is null or p_idempotency_key is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='42501',message='unauthorized'; end if;
  select * into v_event from public.wedding_collaboration_events e where e.actor_user_id=v_actor and e.idempotency_key=p_idempotency_key;
  if found then
    if v_event.event_type<>'membership_revoked' or v_event.membership_id<>p_membership_id then
      raise exception using errcode='P0001',message='idempotency_key_reused'; end if;
    return pg_catalog.jsonb_build_object('status','revoked','duplicate',true);
  end if;
  select * into v_peek from public.wedding_collaboration_memberships m where m.id=p_membership_id;
  if not found or v_peek.owner_user_id<>v_actor or v_peek.status<>'active' then
    raise exception using errcode='P0001',message='membership_unavailable'; end if;
  if not public.wedding_collaboration_lock_users(array[v_actor,v_peek.member_user_id]) then
    raise exception using errcode='P0001',message='membership_unavailable'; end if;
  select * into v_wedding from public.weddings w where w.id=v_peek.wedding_id and w.user_id=v_actor for update;
  if not found then raise exception using errcode='P0001',message='membership_unavailable'; end if;
  select * into v_m from public.wedding_collaboration_memberships m where m.id=p_membership_id for update;
  if not found or v_m.status<>'active' then raise exception using errcode='P0001',message='membership_unavailable'; end if;
  update public.wedding_collaboration_memberships set status='revoked',revoked_at=pg_catalog.timezone('utc',pg_catalog.now()),
    access_version=access_version+1,
    updated_at=pg_catalog.timezone('utc',pg_catalog.now()) where id=v_m.id;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,membership_id,actor_user_id,event_type,idempotency_key)
    values(v_m.wedding_id,v_m.wedding_id_snapshot,v_m.id,v_actor,'membership_revoked',p_idempotency_key);
  return pg_catalog.jsonb_build_object('status','revoked','duplicate',false);
end; $$;

create or replace function public.decline_wedding_collaboration_invite(p_invitation_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_peek public.wedding_collaboration_invitations%rowtype;
  v_i public.wedding_collaboration_invitations%rowtype; v_connection public.collaboration_connections%rowtype;
  v_wedding public.weddings%rowtype; v_event public.wedding_collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='42501',message='unauthorized'; end if;
  select * into v_event from public.wedding_collaboration_events e where e.actor_user_id=v_actor and e.idempotency_key=p_idempotency_key;
  if found then
    if v_event.event_type<>'invitation_declined' or v_event.invitation_id<>p_invitation_id then
      raise exception using errcode='P0001',message='idempotency_key_reused'; end if;
    return pg_catalog.jsonb_build_object('status','declined','duplicate',true);
  end if;
  select * into v_peek from public.wedding_collaboration_invitations i where i.id=p_invitation_id;
  if not found or v_peek.invitee_user_id<>v_actor or v_peek.status<>'pending' then
    raise exception using errcode='P0001',message='invitation_unavailable'; end if;
  if not public.wedding_collaboration_lock_users(array[v_actor,v_peek.owner_user_id]) then
    raise exception using errcode='P0001',message='invitation_unavailable'; end if;
  select * into v_connection from public.collaboration_connections c where c.id=v_peek.source_connection_id for update;
  if not found then raise exception using errcode='P0001',message='invitation_unavailable'; end if;
  select * into v_wedding from public.weddings w where w.id=v_peek.wedding_id for update;
  if not found then raise exception using errcode='P0001',message='invitation_unavailable'; end if;
  select * into v_i from public.wedding_collaboration_invitations i where i.id=p_invitation_id for update;
  if not found or v_i.status<>'pending' then raise exception using errcode='P0001',message='invitation_unavailable'; end if;
  update public.wedding_collaboration_invitations set status='declined',declined_at=pg_catalog.timezone('utc',pg_catalog.now()),
    updated_at=pg_catalog.timezone('utc',pg_catalog.now()) where id=v_i.id;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,actor_user_id,event_type,idempotency_key)
    values(v_i.wedding_id,v_i.wedding_id_snapshot,v_i.id,v_actor,'invitation_declined',p_idempotency_key);
  return pg_catalog.jsonb_build_object('status','declined','duplicate',false);
end; $$;

create or replace function public.leave_wedding_collaboration(p_membership_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_peek public.wedding_collaboration_memberships%rowtype;
  v_m public.wedding_collaboration_memberships%rowtype; v_wedding public.weddings%rowtype;
  v_event public.wedding_collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='42501',message='unauthorized'; end if;
  select * into v_event from public.wedding_collaboration_events e where e.actor_user_id=v_actor and e.idempotency_key=p_idempotency_key;
  if found then
    if v_event.event_type<>'membership_left' or v_event.membership_id<>p_membership_id then
      raise exception using errcode='P0001',message='idempotency_key_reused'; end if;
    return pg_catalog.jsonb_build_object('status','left','duplicate',true);
  end if;
  select * into v_peek from public.wedding_collaboration_memberships m where m.id=p_membership_id;
  if not found or v_peek.member_user_id<>v_actor or v_peek.status<>'active' then
    raise exception using errcode='P0001',message='membership_unavailable'; end if;
  if not public.wedding_collaboration_lock_users(array[v_actor,v_peek.owner_user_id]) then
    raise exception using errcode='P0001',message='membership_unavailable'; end if;
  select * into v_wedding from public.weddings w where w.id=v_peek.wedding_id for update;
  if not found then raise exception using errcode='P0001',message='membership_unavailable'; end if;
  select * into v_m from public.wedding_collaboration_memberships m where m.id=p_membership_id for update;
  if not found or v_m.status<>'active' then raise exception using errcode='P0001',message='membership_unavailable'; end if;
  update public.wedding_collaboration_memberships set status='left',left_at=pg_catalog.timezone('utc',pg_catalog.now()),
    access_version=access_version+1,
    updated_at=pg_catalog.timezone('utc',pg_catalog.now()) where id=v_m.id;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,membership_id,actor_user_id,event_type,idempotency_key)
    values(v_m.wedding_id,v_m.wedding_id_snapshot,v_m.id,v_actor,'membership_left',p_idempotency_key);
  return pg_catalog.jsonb_build_object('status','left','duplicate',false);
end; $$;

revoke all on function public.get_wedding_collaboration_membership_access_management(uuid,uuid) from public,anon;
revoke all on function public.get_wedding_collaboration_invitation_access_management(uuid,uuid) from public,anon;
revoke all on function public.update_wedding_collaboration_membership_access(uuid,uuid,text,text,text,text,jsonb) from public,anon;
revoke all on function public.update_wedding_collaboration_invitation_access(uuid,uuid,text,text,text,text,jsonb) from public,anon;
revoke all on function public.create_wedding_collaboration_invitation_configured(uuid,uuid,numeric,uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.get_wedding_collaboration_membership_access_management(uuid,uuid) to authenticated;
grant execute on function public.get_wedding_collaboration_invitation_access_management(uuid,uuid) to authenticated;
grant execute on function public.update_wedding_collaboration_membership_access(uuid,uuid,text,text,text,text,jsonb) to authenticated;
grant execute on function public.update_wedding_collaboration_invitation_access(uuid,uuid,text,text,text,text,jsonb) to authenticated;
grant execute on function public.create_wedding_collaboration_invitation_configured(uuid,uuid,numeric,uuid,text,text,text,jsonb) to authenticated;

do $assert_acl$
begin
  if has_table_privilege('authenticated','collaboration_private.capability_registry','select')
    or has_table_privilege('authenticated','collaboration_private.membership_permission_grants','select')
    or has_table_privilege('authenticated','collaboration_private.invitation_permission_grants','select')
    or has_function_privilege('authenticated','collaboration_private.validate_owner_access_configuration(text,text,text,jsonb)','execute')
    or has_function_privilege('authenticated','collaboration_private.owner_access_preview(text,jsonb)','execute')
    or has_function_privilege('authenticated','collaboration_private.owner_access_management_dto(uuid,uuid,boolean)','execute')
    or not has_function_privilege('authenticated','public.create_wedding_collaboration_invitation_configured(uuid,uuid,numeric,uuid,text,text,text,jsonb)','execute')
    or not has_function_privilege('authenticated','public.get_wedding_collaboration_access_previews(uuid)','execute') then
    raise exception 'COLLABORATION_1C_F_ACL_ASSERTION_FAILED';
  end if;
end;
$assert_acl$;

commit;
