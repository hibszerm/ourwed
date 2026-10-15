-- Keep existing owner access-management DTOs truthful after an explicit v2
-- migration, while the released UI continues receiving v1 for old records.
begin;

create function collaboration_private.owner_access_preview_for_mapping(
  p_mapping_version text,p_mode text,p_custom_grants jsonb
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'capability_key',c.capability_key,'level',l.level) order by c.capability_key),'[]'::jsonb)
  from collaboration_private.capability_registry c
  cross join lateral (select case when p_mode='custom'
    then coalesce((select (x.value->>'level')::smallint from pg_catalog.jsonb_array_elements(coalesce(p_custom_grants,'[]'::jsonb)) x(value)
      where x.value->>'capability_key'=c.capability_key),0)
    else coalesce((select d.level from collaboration_private.permission_mapping_defaults d
      where d.mapping_version=p_mapping_version and d.access_mode=p_mode and d.capability_key=c.capability_key),0)
    end as level) l
  where c.active and c.grantable and not c.owner_only and l.level>0
    and not (p_mapping_version='1' and c.h1_mapping_only)
$$;
revoke all on function collaboration_private.owner_access_preview_for_mapping(text,text,jsonb)
  from public,anon,authenticated,service_role;

create or replace function collaboration_private.owner_access_management_dto(
  p_wedding_id uuid,p_target_id uuid,p_pending boolean
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_i public.wedding_collaboration_invitations%rowtype;
  v_m public.wedding_collaboration_memberships%rowtype;
  v_display text; v_custom jsonb; v_mode text; v_role text; v_label text;
  v_mapping text;
begin
  if p_pending then
    select i.* into v_i from public.wedding_collaboration_invitations i
      where i.id=p_target_id and i.wedding_id_snapshot=p_wedding_id
        and i.status='pending' and i.expires_at>pg_catalog.now();
    if not found then return null; end if;
    select coalesce(nullif(pg_catalog.btrim(u.name),''),'Użytkownik niedostępny') into v_display
      from public.users u where u.id=v_i.invitee_user_id;
    v_display:=coalesce(v_display,'Użytkownik niedostępny');
    v_mapping:=coalesce(v_i.permission_group_mapping_version,'1');
    if v_i.access_configuration_version=0 then
      v_role:='unspecified';v_label:=null;v_mode:='custom';
      v_custom:='[{"capability_key":"places.address","level":2},{"capability_key":"schedule.operational_time","level":2},{"capability_key":"wedding.identity","level":1}]'::jsonb;
    else
      v_role:=v_i.role_key;v_label:=v_i.custom_role_label;v_mode:=v_i.access_mode;
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('capability_key',g.capability_key,'level',g.level)
        order by g.capability_key),'[]'::jsonb) into v_custom
        from collaboration_private.invitation_permission_grants g where g.invitation_id=v_i.id;
    end if;
    return pg_catalog.jsonb_build_object('wedding_id',p_wedding_id,'invitation_id',v_i.id,'status',v_i.status,
      'invitee_display_name',v_display,'access_configuration_version',v_i.access_configuration_version,
      'configuration_revision',v_i.configuration_revision::text,'role_key',v_role,'custom_role_label',v_label,
      'access_mode',v_mode,'effective_preview',collaboration_private.owner_access_preview_for_mapping(v_mapping,v_mode,v_custom),
      'custom_grants',v_custom,'viewer_preview',collaboration_private.owner_access_preview_for_mapping(v_mapping,'viewer','[]'::jsonb),
      'editor_preview',collaboration_private.owner_access_preview_for_mapping(v_mapping,'editor','[]'::jsonb),
      'permission_group_mapping_version',v_mapping);
  end if;
  select m.* into v_m from public.wedding_collaboration_memberships m
    where m.id=p_target_id and m.wedding_id_snapshot=p_wedding_id and m.status='active';
  if not found then return null; end if;
  select coalesce(nullif(pg_catalog.btrim(u.name),''),'Użytkownik niedostępny') into v_display
    from public.users u where u.id=v_m.member_user_id;
  v_display:=coalesce(v_display,'Użytkownik niedostępny');
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('capability_key',g.capability_key,'level',g.level)
    order by g.capability_key),'[]'::jsonb) into v_custom
    from collaboration_private.membership_permission_grants g where g.membership_id=v_m.id;
  v_mapping:=v_m.permission_group_mapping_version;
  return pg_catalog.jsonb_build_object('wedding_id',p_wedding_id,'membership_id',v_m.id,'status',v_m.status,
    'collaborator_display_name',v_display,'role_key',v_m.role_key,'custom_role_label',v_m.custom_role_label,
    'access_mode',v_m.access_mode,'access_version',v_m.access_version::text,
    'effective_permissions',collaboration_private.owner_access_preview_for_mapping(v_mapping,v_m.access_mode,v_custom),
    'custom_grants',v_custom,'viewer_preview',collaboration_private.owner_access_preview_for_mapping(v_mapping,'viewer','[]'::jsonb),
    'editor_preview',collaboration_private.owner_access_preview_for_mapping(v_mapping,'editor','[]'::jsonb),
    'permission_group_mapping_version',v_mapping);
end;
$$;
revoke all on function collaboration_private.owner_access_management_dto(uuid,uuid,boolean)
  from public,anon,authenticated,service_role;

create or replace function public.get_my_wedding_access_context(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb; v_caps jsonb;
begin
  v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_context->>'relationship'='owner' then
    return pg_catalog.jsonb_build_object('wedding_id',p_wedding_id,'relationship','owner'); end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key',c.capability_key,
    'level',case l.level when 1 then 'view' else 'edit' end) order by c.capability_key),'[]'::jsonb)
    into v_caps from collaboration_private.capability_registry c
    cross join lateral (select collaboration_private.effective_wedding_capability_level(p_wedding_id,c.capability_key) level) l
    where c.active and c.grantable and not c.owner_only and l.level>0;
  return pg_catalog.jsonb_build_object('wedding_id',p_wedding_id,'relationship','collaborator',
    'role_key',v_context->>'role_key','custom_role_label',v_context->'custom_role_label',
    'access_mode',v_context->>'access_mode','access_version',v_context->>'access_version',
    'permission_group_mapping_version',v_context->>'permission_group_mapping_version','capabilities',v_caps);
end;
$$;
revoke all on function public.get_my_wedding_access_context(uuid) from public,anon;
grant execute on function public.get_my_wedding_access_context(uuid) to authenticated;

commit;
