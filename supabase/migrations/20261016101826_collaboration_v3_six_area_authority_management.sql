-- Collaboration V3: direct six-area authority and management foundation.
-- Domain data reads/writes remain out of scope; H3 identity projection is unchanged.
begin;

lock table public.wedding_collaboration_invitations,
  public.wedding_collaboration_memberships, public.wedding_collaboration_events
  in access exclusive mode nowait;
lock table collaboration_private.permission_presets,
  collaboration_private.permission_preset_grants in access exclusive mode nowait;

alter table public.wedding_collaboration_memberships
  drop constraint if exists wedding_collaboration_member_permission_group_mapping_ver_check,
  drop constraint if exists wedding_collaboration_memberships_permission_group_mapping_vers,
  drop constraint if exists wedding_collaboration_memberships_mapping_version_v3_check,
  add constraint wedding_collaboration_memberships_mapping_version_v3_check
    check (permission_group_mapping_version in ('1','2','3'));

alter table public.wedding_collaboration_invitations
  drop constraint wedding_collaboration_invitations_access_config_check,
  add constraint wedding_collaboration_invitations_access_config_check check (
    (access_configuration_version=0 and role_key is null and custom_role_label is null
      and access_mode is null and permission_group_mapping_version is null)
    or
    (access_configuration_version=1 and role_key is not null
      and (role_key='unspecified' or role_key='custom' or role_key ~ '^system:[a-z][a-z0-9_]{0,62}$')
      and access_mode is not null and access_mode in ('viewer','editor','custom')
      and permission_group_mapping_version is not null
      and permission_group_mapping_version in ('1','2','3')
      and ((role_key='custom' and custom_role_label is not null
              and custom_role_label=pg_catalog.btrim(custom_role_label)
              and custom_role_label ~ '[^[:space:]]'
              and pg_catalog.char_length(custom_role_label) between 1 and 64)
        or (role_key<>'custom' and custom_role_label is null)))
  );

alter table collaboration_private.permission_presets
  drop constraint if exists permission_presets_permission_group_mapping_version_check,
  add constraint permission_presets_permission_group_mapping_version_check
    check (permission_group_mapping_version in ('1','2','3'));

create function collaboration_private.normalize_area_access(p_mode text,p_areas jsonb)
returns jsonb language plpgsql immutable security definer set search_path = '' as $$
declare v_key text; v_count integer; v_result jsonb;
begin
  if p_mode is null or p_mode not in ('viewer','editor','custom') then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  if p_mode='viewer' then
    return '{"logistics":1,"prewedding":1,"contacts":1,"tasks":1,"notes":1,"compensation":0}'::jsonb;
  elsif p_mode='editor' then
    return '{"logistics":2,"prewedding":2,"contacts":2,"tasks":2,"notes":2,"compensation":0}'::jsonb;
  end if;
  if p_areas is null or pg_catalog.jsonb_typeof(p_areas)<>'object' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  select count(*)::integer into v_count from pg_catalog.jsonb_object_keys(p_areas);
  if v_count<>6 then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  foreach v_key in array array['logistics','prewedding','contacts','tasks','notes','compensation'] loop
    if not (p_areas ? v_key) or pg_catalog.jsonb_typeof(p_areas->v_key)<>'number'
      or (p_areas->>v_key) !~ '^[0-2]$' then
      raise exception using errcode='P0001',message='VALIDATION_ERROR';
    end if;
  end loop;
  if exists(select 1 from pg_catalog.jsonb_object_keys(p_areas) k
      where k not in ('logistics','prewedding','contacts','tasks','notes','compensation')) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  select pg_catalog.jsonb_build_object(
    'logistics',(p_areas->>'logistics')::integer,
    'prewedding',(p_areas->>'prewedding')::integer,
    'contacts',(p_areas->>'contacts')::integer,
    'tasks',(p_areas->>'tasks')::integer,
    'notes',(p_areas->>'notes')::integer,
    'compensation',(p_areas->>'compensation')::integer) into v_result;
  return v_result;
end;
$$;
revoke all on function collaboration_private.normalize_area_access(text,jsonb)
  from public,anon,authenticated,service_role;

create table collaboration_private.invitation_area_access (
  invitation_id uuid primary key references public.wedding_collaboration_invitations(id) on delete cascade,
  logistics smallint not null check (logistics between 0 and 2),
  prewedding smallint not null check (prewedding between 0 and 2),
  contacts smallint not null check (contacts between 0 and 2),
  tasks smallint not null check (tasks between 0 and 2),
  notes smallint not null check (notes between 0 and 2),
  compensation smallint not null check (compensation between 0 and 2),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create table collaboration_private.membership_area_access (
  membership_id uuid primary key references public.wedding_collaboration_memberships(id) on delete cascade,
  logistics smallint not null check (logistics between 0 and 2),
  prewedding smallint not null check (prewedding between 0 and 2),
  contacts smallint not null check (contacts between 0 and 2),
  tasks smallint not null check (tasks between 0 and 2),
  notes smallint not null check (notes between 0 and 2),
  compensation smallint not null check (compensation between 0 and 2),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create table collaboration_private.preset_area_access (
  preset_id uuid primary key references collaboration_private.permission_presets(id) on delete cascade,
  logistics smallint not null check (logistics between 0 and 2),
  prewedding smallint not null check (prewedding between 0 and 2),
  contacts smallint not null check (contacts between 0 and 2),
  tasks smallint not null check (tasks between 0 and 2),
  notes smallint not null check (notes between 0 and 2),
  compensation smallint not null check (compensation between 0 and 2),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create table collaboration_private.invitation_v3_idempotency (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  invitation_id uuid not null references public.wedding_collaboration_invitations(id) on delete cascade,
  request_snapshot jsonb not null check (pg_catalog.jsonb_typeof(request_snapshot)='object'),
  created_at timestamptz not null default pg_catalog.now(),
  primary key(owner_user_id,idempotency_key)
);
alter table collaboration_private.invitation_area_access enable row level security;
alter table collaboration_private.invitation_area_access force row level security;
alter table collaboration_private.membership_area_access enable row level security;
alter table collaboration_private.membership_area_access force row level security;
alter table collaboration_private.preset_area_access enable row level security;
alter table collaboration_private.preset_area_access force row level security;
alter table collaboration_private.invitation_v3_idempotency enable row level security;
alter table collaboration_private.invitation_v3_idempotency force row level security;
revoke all on collaboration_private.invitation_area_access,
  collaboration_private.membership_area_access,
  collaboration_private.preset_area_access,
  collaboration_private.invitation_v3_idempotency from public,anon,authenticated,service_role;

create policy invitation_area_access_select_related on collaboration_private.invitation_area_access
  for select using (exists(select 1 from public.wedding_collaboration_invitations i
    where i.id=invitation_id and (i.owner_user_id=auth.uid() or i.invitee_user_id=auth.uid())));
create policy invitation_area_access_insert_owner on collaboration_private.invitation_area_access
  for insert with check (exists(select 1 from public.wedding_collaboration_invitations i
    where i.id=invitation_id and i.owner_user_id=auth.uid()));
create policy invitation_area_access_update_owner on collaboration_private.invitation_area_access
  for update using (exists(select 1 from public.wedding_collaboration_invitations i
    where i.id=invitation_id and i.owner_user_id=auth.uid()))
  with check (exists(select 1 from public.wedding_collaboration_invitations i
    where i.id=invitation_id and i.owner_user_id=auth.uid()));
create policy membership_area_access_select_related on collaboration_private.membership_area_access
  for select using (exists(select 1 from public.wedding_collaboration_memberships m
    where m.id=membership_id and (m.owner_user_id=auth.uid() or m.member_user_id=auth.uid())));
create policy membership_area_access_insert_related on collaboration_private.membership_area_access
  for insert with check (exists(select 1 from public.wedding_collaboration_memberships m
    where m.id=membership_id and m.status='active' and m.member_user_id=auth.uid()));
create policy membership_area_access_update_owner on collaboration_private.membership_area_access
  for update using (exists(select 1 from public.wedding_collaboration_memberships m
    where m.id=membership_id and m.owner_user_id=auth.uid() and m.status='active'))
  with check (exists(select 1 from public.wedding_collaboration_memberships m
    where m.id=membership_id and m.owner_user_id=auth.uid() and m.status='active'));
create policy preset_area_access_select_related on collaboration_private.preset_area_access
  for select using (exists(select 1 from collaboration_private.permission_presets p
    where p.id=preset_id and (p.scope='system' or p.owner_user_id=auth.uid())));
create policy preset_area_access_insert_owner on collaboration_private.preset_area_access
  for insert with check (exists(select 1 from collaboration_private.permission_presets p
    where p.id=preset_id and p.scope='user' and p.owner_user_id=auth.uid()));
create policy preset_area_access_update_owner on collaboration_private.preset_area_access
  for update using (exists(select 1 from collaboration_private.permission_presets p
    where p.id=preset_id and p.scope='user' and p.owner_user_id=auth.uid()))
  with check (exists(select 1 from collaboration_private.permission_presets p
    where p.id=preset_id and p.scope='user' and p.owner_user_id=auth.uid()));
create policy preset_area_access_delete_owner on collaboration_private.preset_area_access
  for delete using (exists(select 1 from collaboration_private.permission_presets p
    where p.id=preset_id and p.scope='user' and p.owner_user_id=auth.uid()));
create policy invitation_v3_idempotency_owner_select on collaboration_private.invitation_v3_idempotency
  for select using (owner_user_id=auth.uid());
create policy invitation_v3_idempotency_owner_insert on collaboration_private.invitation_v3_idempotency
  for insert with check (owner_user_id=auth.uid());

-- The sole actor-bound source for v3 area authority. NULL means unavailable.
create function collaboration_private.resolve_wedding_area_level(p_wedding_id uuid,p_area_key text)
returns smallint language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb; v_level smallint; v_mapping text;
begin
  if p_area_key is null or p_area_key not in ('logistics','prewedding','contacts','tasks','notes','compensation') then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null then return null; end if;
  if v_context->>'relationship'='owner' then return 2; end if;
  v_mapping:=v_context->>'permission_group_mapping_version';
  if v_context->>'relationship' is distinct from 'collaborator' or v_mapping is distinct from '3' then return null; end if;
  execute pg_catalog.format(
    'select %I from collaboration_private.membership_area_access where membership_id=$1',p_area_key)
    into v_level using (v_context->>'membership_id')::uuid;
  return v_level;
end;
$$;
revoke all on function collaboration_private.resolve_wedding_area_level(uuid,text)
  from public,anon,authenticated,service_role;

create function collaboration_private.area_access_json(
  p_logistics smallint,p_prewedding smallint,p_contacts smallint,
  p_tasks smallint,p_notes smallint,p_compensation smallint
) returns jsonb language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('logistics',p_logistics,'prewedding',p_prewedding,
    'contacts',p_contacts,'tasks',p_tasks,'notes',p_notes,'compensation',p_compensation)
$$;
revoke all on function collaboration_private.area_access_json(smallint,smallint,smallint,smallint,smallint,smallint)
  from public,anon,authenticated,service_role;

-- V3 identity is an invariant of an accepted active membership, not a stored
-- permission. Keep the frozen H3 identity projection working without inserting
-- a wedding.identity grant into either the invitation or membership snapshot.
create or replace function collaboration_private.effective_wedding_capability_level(p_wedding_id uuid,p_capability_key text)
returns smallint language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb; v_mapping text; v_result smallint;
begin
  v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null or v_context->>'relationship'<>'collaborator' then return 0; end if;
  v_mapping:=coalesce(v_context->>'permission_group_mapping_version','1');
  if v_mapping='3' and p_capability_key='wedding.identity' then return 1; end if;
  with recursive closure(capability_key,depth,required_level) as (
    select p_capability_key,0,0::smallint
    union all
    select d.parent_capability_key,c.depth+1,d.required_parent_level
      from closure c join collaboration_private.capability_dependencies d
        on d.child_capability_key=c.capability_key and d.minimum_mapping_version<=v_mapping
      where c.depth<32
  ), parent_check as (
    select coalesce(bool_and(c.depth=0 or
      collaboration_private.raw_wedding_capability_level(p_wedding_id,c.capability_key)>=c.required_level),true) as satisfied
      from closure c
  )
  select case when parent_check.satisfied
    then collaboration_private.raw_wedding_capability_level(p_wedding_id,p_capability_key)
    else 0::smallint end into v_result from parent_check;
  return coalesce(v_result,0);
end;
$$;
revoke all on function collaboration_private.effective_wedding_capability_level(uuid,text)
  from public,anon,authenticated,service_role;

create function public.resolve_my_wedding_detail_authority_v3(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb; v_config jsonb; v_effective jsonb; v_id uuid; v_key text;
begin
  if auth.uid() is null or p_wedding_id is null then return jsonb_build_object('kind','unavailable'); end if;
  v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null then return jsonb_build_object('kind','unavailable'); end if;
  if v_context->>'relationship'='owner' then
    return jsonb_build_object('kind','owned','wedding_id',p_wedding_id,'mapping_version','3',
      'access_mode','editor','configured_areas','{"logistics":2,"prewedding":2,"contacts":2,"tasks":2,"notes":2,"compensation":2}'::jsonb,
      'effective_areas','{"logistics":2,"prewedding":2,"contacts":2,"tasks":2,"notes":2,"compensation":2}'::jsonb);
  end if;
  if v_context->>'permission_group_mapping_version' is distinct from '3' then return jsonb_build_object('kind','unavailable'); end if;
  v_id:=(v_context->>'membership_id')::uuid;
  select collaboration_private.area_access_json(logistics,prewedding,contacts,tasks,notes,compensation)
    into v_config from collaboration_private.membership_area_access where membership_id=v_id;
  if v_config is null then return jsonb_build_object('kind','unavailable'); end if;
  v_effective:='{}'::jsonb;
  foreach v_key in array array['logistics','prewedding','contacts','tasks','notes','compensation'] loop
    if collaboration_private.resolve_wedding_area_level(p_wedding_id,v_key) is null then
      return jsonb_build_object('kind','unavailable');
    end if;
    v_effective:=v_effective||pg_catalog.jsonb_build_object(v_key,
      collaboration_private.resolve_wedding_area_level(p_wedding_id,v_key));
  end loop;
  return jsonb_build_object('kind','shared','wedding_id',p_wedding_id,'membership_id',v_id,
    'access_version',v_context->>'access_version','mapping_version','3',
    'role_key',v_context->>'role_key','custom_role_label',v_context->>'custom_role_label',
    'access_mode',v_context->>'access_mode','configured_areas',v_config,'effective_areas',v_effective);
end;
$$;
revoke all on function public.resolve_my_wedding_detail_authority_v3(uuid) from public,anon,service_role;
grant execute on function public.resolve_my_wedding_detail_authority_v3(uuid) to authenticated;

create function public.get_wedding_collaboration_membership_access_management_v3(
  p_wedding_id uuid,p_membership_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_m public.wedding_collaboration_memberships%rowtype; v_wedding public.weddings%rowtype;
  v_areas jsonb;
begin
  select * into v_wedding from public.weddings where id=p_wedding_id and status='active';
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_actor is distinct from v_wedding.user_id then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  select * into v_m from public.wedding_collaboration_memberships where id=p_membership_id
    and wedding_id=p_wedding_id and owner_user_id=v_actor and status='active';
  if not found or v_m.permission_group_mapping_version is distinct from '3' then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select collaboration_private.area_access_json(logistics,prewedding,contacts,tasks,notes,compensation)
    into v_areas from collaboration_private.membership_area_access where membership_id=v_m.id;
  if v_areas is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  return jsonb_build_object('wedding_id',p_wedding_id,'membership_id',v_m.id,'status',v_m.status,
    'role_key',v_m.role_key,'custom_role_label',v_m.custom_role_label,'access_mode',v_m.access_mode,
    'mapping_version','3','access_version',v_m.access_version::text,
    'configured_areas',v_areas,'effective_areas',v_areas);
end; $$;

create function public.update_wedding_collaboration_membership_access_v3(
  p_wedding_id uuid,p_membership_id uuid,p_expected_access_version text,
  p_role_key text,p_custom_role_label text,p_access_mode text,p_custom_areas jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_m public.wedding_collaboration_memberships%rowtype;
  v_peek public.wedding_collaboration_memberships%rowtype; v_wedding public.weddings%rowtype;
  v_areas jsonb; v_old jsonb; v_new_version bigint; v_role_changed boolean; v_mode_changed boolean;
  v_permissions_changed boolean;
begin
  select * into v_peek from public.wedding_collaboration_memberships
    where id=p_membership_id and wedding_id_snapshot=p_wedding_id;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_peek.owner_user_id is distinct from v_actor then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if not public.wedding_collaboration_lock_users(array[v_actor,v_peek.member_user_id]) then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select * into v_wedding from public.weddings where id=p_wedding_id and status='active' for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_actor is distinct from v_wedding.user_id then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  select * into v_m from public.wedding_collaboration_memberships where id=p_membership_id
    and wedding_id=p_wedding_id and owner_user_id=v_actor for update;
  if not found or v_m.status is distinct from 'active' or v_m.permission_group_mapping_version is distinct from '3' then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_expected_access_version is null or pg_catalog.char_length(p_expected_access_version)>19
    or p_expected_access_version !~ '^[1-9][0-9]*$'
    or p_expected_access_version::numeric>9223372036854775807::numeric then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if p_expected_access_version::numeric<>v_m.access_version::numeric then
    raise exception using errcode='P0001',message='CONFLICT'; end if;
  if p_role_key is null or p_role_key not in ('unspecified','custom','system:photographer','system:filmmaker',
    'system:second_shooter','system:wedding_planner','system:assistant','system:content_creator') then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if (p_role_key='custom' and (p_custom_role_label is null or p_custom_role_label<>pg_catalog.btrim(p_custom_role_label)
      or p_custom_role_label !~ '[^[:space:]]' or p_custom_role_label ~ '[[:cntrl:]]'
      or pg_catalog.char_length(p_custom_role_label) not between 1 and 64))
    or (p_role_key<>'custom' and p_custom_role_label is not null) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  v_areas:=collaboration_private.normalize_area_access(p_access_mode,p_custom_areas);
  select collaboration_private.area_access_json(logistics,prewedding,contacts,tasks,notes,compensation)
    into v_old from collaboration_private.membership_area_access where membership_id=v_m.id for update;
  if v_old is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_m.role_key is not distinct from p_role_key and v_m.custom_role_label is not distinct from p_custom_role_label
    and v_m.access_mode is not distinct from p_access_mode and v_old=v_areas then
    return public.get_wedding_collaboration_membership_access_management_v3(p_wedding_id,p_membership_id);
  end if;
  v_role_changed:=v_m.role_key is distinct from p_role_key or v_m.custom_role_label is distinct from p_custom_role_label;
  v_mode_changed:=v_m.access_mode is distinct from p_access_mode;
  v_permissions_changed:=v_old is distinct from v_areas;
  update collaboration_private.membership_area_access set
    logistics=(v_areas->>'logistics')::smallint,prewedding=(v_areas->>'prewedding')::smallint,
    contacts=(v_areas->>'contacts')::smallint,tasks=(v_areas->>'tasks')::smallint,
    notes=(v_areas->>'notes')::smallint,compensation=(v_areas->>'compensation')::smallint,
    updated_at=pg_catalog.now() where membership_id=v_m.id;
  update public.wedding_collaboration_memberships set role_key=p_role_key,
    custom_role_label=p_custom_role_label,access_mode=p_access_mode,
    permission_group_mapping_version='3',access_version=access_version+1,updated_at=pg_catalog.timezone('utc',pg_catalog.now())
    where id=v_m.id returning access_version into v_new_version;
  if v_role_changed then
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,membership_id,actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,v_m.id,v_actor,'role_changed',jsonb_build_object(
      'mapping_version','3','before_role_key',v_m.role_key,'after_role_key',p_role_key,
      'before_custom_role_label',v_m.custom_role_label,'after_custom_role_label',p_custom_role_label,
      'before_version',v_m.access_version::text,'after_version',v_new_version::text));
  end if;
  if v_mode_changed then
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,membership_id,actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,v_m.id,v_actor,'access_mode_changed',jsonb_build_object(
      'mapping_version','3','before_mode',v_m.access_mode,'after_mode',p_access_mode,
      'before_areas',v_old,'after_areas',v_areas,'before_version',v_m.access_version::text,'after_version',v_new_version::text));
  elsif v_permissions_changed then
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,membership_id,actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,v_m.id,v_actor,'permissions_changed',jsonb_build_object(
      'mapping_version','3','before_areas',v_old,'after_areas',v_areas,
      'before_version',v_m.access_version::text,'after_version',v_new_version::text));
  end if;
  return jsonb_build_object('changed',true,'access_version',v_new_version::text,
    'configuration',public.get_wedding_collaboration_membership_access_management_v3(p_wedding_id,p_membership_id));
end; $$;

create function public.create_wedding_collaboration_invitation_v3(
  p_wedding_id uuid,p_connection_id uuid,p_proposed_share_amount numeric,p_idempotency_key uuid,
  p_role_key text,p_custom_role_label text,p_access_mode text,p_custom_areas jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_areas jsonb; v_result jsonb; v_invite_id uuid;
  v_request jsonb; v_prior collaboration_private.invitation_v3_idempotency%rowtype;
  v_grants jsonb:='[]'::jsonb;
begin
  if v_actor is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_areas:=collaboration_private.normalize_area_access(p_access_mode,p_custom_areas);
  v_request:=jsonb_build_object('wedding_id',p_wedding_id,'connection_id',p_connection_id,
    'proposed_share_amount',p_proposed_share_amount,'role_key',p_role_key,
    'custom_role_label',p_custom_role_label,'access_mode',p_access_mode,'areas',v_areas);
  select * into v_prior from collaboration_private.invitation_v3_idempotency
    where owner_user_id=v_actor and idempotency_key=p_idempotency_key for update;
  if found and v_prior.request_snapshot is distinct from v_request then
    raise exception using errcode='P0001',message='CONFLICT';
  end if;
  v_result:=public.create_wedding_collaboration_invitation_configured(
    p_wedding_id,p_connection_id,p_proposed_share_amount,p_idempotency_key,
    p_role_key,p_custom_role_label,'custom',v_grants);
  v_invite_id:=(v_result->>'invitation_id')::uuid;
  insert into collaboration_private.invitation_v3_idempotency(owner_user_id,idempotency_key,invitation_id,request_snapshot)
    values(v_actor,p_idempotency_key,v_invite_id,v_request) on conflict(owner_user_id,idempotency_key) do nothing;
  select * into v_prior from collaboration_private.invitation_v3_idempotency
    where owner_user_id=v_actor and idempotency_key=p_idempotency_key for update;
  if not found or v_prior.request_snapshot is distinct from v_request or v_prior.invitation_id<>v_invite_id then
    raise exception using errcode='P0001',message='CONFLICT';
  end if;
  update public.wedding_collaboration_invitations set access_mode=p_access_mode,
    permission_group_mapping_version='3' where id=v_invite_id and owner_user_id=v_actor;
  -- The old acceptance routine has a frozen raw-grant branch. V3 authority is
  -- the private six-area row; leave no legacy grant payload on the invitation.
  delete from collaboration_private.invitation_permission_grants where invitation_id=v_invite_id;
  insert into collaboration_private.invitation_area_access(invitation_id,logistics,prewedding,contacts,tasks,notes,compensation)
  values(v_invite_id,(v_areas->>'logistics')::smallint,(v_areas->>'prewedding')::smallint,
    (v_areas->>'contacts')::smallint,(v_areas->>'tasks')::smallint,(v_areas->>'notes')::smallint,
    (v_areas->>'compensation')::smallint)
  on conflict(invitation_id) do update set logistics=excluded.logistics,prewedding=excluded.prewedding,
    contacts=excluded.contacts,tasks=excluded.tasks,notes=excluded.notes,compensation=excluded.compensation,updated_at=pg_catalog.now();
  return v_result||jsonb_build_object('mapping_version','3','configured_areas',v_areas);
end; $$;

create function public.get_wedding_collaboration_invitation_access_management_v3(
  p_wedding_id uuid,p_invitation_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_i public.wedding_collaboration_invitations%rowtype;
  v_wedding public.weddings%rowtype; v_areas jsonb;
begin
  select * into v_wedding from public.weddings where id=p_wedding_id and status='active';
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_actor is distinct from v_wedding.user_id then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  select * into v_i from public.wedding_collaboration_invitations where id=p_invitation_id
    and wedding_id=p_wedding_id and owner_user_id=v_actor and status='pending' for share;
  if not found or v_i.permission_group_mapping_version is distinct from '3' then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select collaboration_private.area_access_json(logistics,prewedding,contacts,tasks,notes,compensation)
    into v_areas from collaboration_private.invitation_area_access where invitation_id=v_i.id;
  if v_areas is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  return jsonb_build_object('wedding_id',p_wedding_id,'invitation_id',v_i.id,'status',v_i.status,
    'role_key',v_i.role_key,'custom_role_label',v_i.custom_role_label,'access_mode',v_i.access_mode,
    'mapping_version','3','configuration_revision',v_i.configuration_revision::text,
    'configured_areas',v_areas,'effective_areas',v_areas);
end; $$;

create function public.update_wedding_collaboration_invitation_access_v3(
  p_wedding_id uuid,p_invitation_id uuid,p_expected_configuration_revision text,
  p_role_key text,p_custom_role_label text,p_access_mode text,p_custom_areas jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_areas jsonb; v_before jsonb; v_after jsonb; v_i public.wedding_collaboration_invitations%rowtype;
  v_old_revision bigint; v_result jsonb; v_dummy jsonb;
  v_role_before text; v_label_before text; v_mode_before text;
  v_grants jsonb:='[]'::jsonb;
begin
  v_areas:=collaboration_private.normalize_area_access(p_access_mode,p_custom_areas);
  select * into v_i from public.wedding_collaboration_invitations where id=p_invitation_id
    and wedding_id_snapshot=p_wedding_id and permission_group_mapping_version='3';
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_old_revision:=v_i.configuration_revision;
  v_role_before:=v_i.role_key; v_label_before:=v_i.custom_role_label; v_mode_before:=v_i.access_mode;
  select public.update_wedding_collaboration_invitation_access(
    p_wedding_id,p_invitation_id,p_expected_configuration_revision,p_role_key,p_custom_role_label,'custom',v_grants)
    into v_dummy;
  delete from collaboration_private.invitation_permission_grants where invitation_id=p_invitation_id;
  select * into v_i from public.wedding_collaboration_invitations where id=p_invitation_id for update;
  if not found or v_i.status<>'pending' then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select collaboration_private.area_access_json(logistics,prewedding,contacts,tasks,notes,compensation)
    into v_before from collaboration_private.invitation_area_access where invitation_id=p_invitation_id for update;
  if v_before is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_before is distinct from v_areas and v_i.configuration_revision=v_old_revision then
    update public.wedding_collaboration_invitations set configuration_revision=configuration_revision+1,
      updated_at=pg_catalog.timezone('utc',pg_catalog.now()) where id=p_invitation_id returning * into v_i;
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,
      actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,p_invitation_id,auth.uid(),'permissions_changed',
      jsonb_build_object('mapping_version','3','before_areas',v_before,'after_areas',v_areas,
        'before_version',v_old_revision::text,'after_version',v_i.configuration_revision::text));
  elsif v_before is distinct from v_areas then
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,
      actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,p_invitation_id,auth.uid(),'permissions_changed',
      jsonb_build_object('mapping_version','3','before_areas',v_before,'after_areas',v_areas,
        'before_version',v_old_revision::text,'after_version',v_i.configuration_revision::text));
  end if;
  update collaboration_private.invitation_area_access set logistics=(v_areas->>'logistics')::smallint,
    prewedding=(v_areas->>'prewedding')::smallint,contacts=(v_areas->>'contacts')::smallint,
    tasks=(v_areas->>'tasks')::smallint,notes=(v_areas->>'notes')::smallint,
    compensation=(v_areas->>'compensation')::smallint,updated_at=pg_catalog.now()
    where invitation_id=p_invitation_id;
  if v_role_before is distinct from p_role_key or v_label_before is distinct from p_custom_role_label then
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,
      actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,p_invitation_id,auth.uid(),'role_changed',
      jsonb_build_object('mapping_version','3','before_role_key',v_role_before,'after_role_key',p_role_key,
        'before_custom_role_label',v_label_before,'after_custom_role_label',p_custom_role_label,
        'before_version',v_old_revision::text,'after_version',v_i.configuration_revision::text));
  end if;
  if v_mode_before is distinct from p_access_mode then
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,
      actor_user_id,event_type,metadata)
    values(p_wedding_id,p_wedding_id,p_invitation_id,auth.uid(),'access_mode_changed',
      jsonb_build_object('mapping_version','3','before_mode',v_mode_before,'after_mode',p_access_mode,
        'before_areas',v_before,'after_areas',v_areas,
        'before_version',v_old_revision::text,'after_version',v_i.configuration_revision::text));
  end if;
  update public.wedding_collaboration_invitations set access_mode=p_access_mode,
    permission_group_mapping_version='3' where id=p_invitation_id;
  return jsonb_build_object('changed',true,'configuration_revision',v_i.configuration_revision::text,
    'configuration',public.get_wedding_collaboration_invitation_access_management_v3(p_wedding_id,p_invitation_id));
end; $$;

create function collaboration_private.copy_v3_invitation_area_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_i public.wedding_collaboration_invitations%rowtype; v_area collaboration_private.invitation_area_access%rowtype;
begin
  if new.accepted_invitation_id is null then return new; end if;
  select * into v_i from public.wedding_collaboration_invitations where id=new.accepted_invitation_id;
  if not found or v_i.permission_group_mapping_version is distinct from '3' then return new; end if;
  select * into v_area from collaboration_private.invitation_area_access where invitation_id=v_i.id;
  if not found then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  new.role_key:=v_i.role_key; new.custom_role_label:=v_i.custom_role_label;
  new.access_mode:=v_i.access_mode; new.permission_group_mapping_version:='3';
  return new;
end; $$;
revoke all on function collaboration_private.copy_v3_invitation_area_access() from public,anon,authenticated,service_role;
create trigger zzz_wedding_collaboration_membership_v3_snapshot
  before insert on public.wedding_collaboration_memberships
  for each row execute function collaboration_private.copy_v3_invitation_area_access();

create function collaboration_private.seed_v3_membership_area_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_i public.wedding_collaboration_invitations%rowtype; v_a collaboration_private.invitation_area_access%rowtype;
begin
  if new.accepted_invitation_id is null then return new; end if;
  select * into v_i from public.wedding_collaboration_invitations where id=new.accepted_invitation_id;
  if not found or v_i.permission_group_mapping_version is distinct from '3' then return new; end if;
  select * into v_a from collaboration_private.invitation_area_access where invitation_id=v_i.id;
  if not found then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  insert into collaboration_private.membership_area_access(membership_id,logistics,prewedding,contacts,tasks,notes,compensation)
  values(new.id,v_a.logistics,v_a.prewedding,v_a.contacts,v_a.tasks,v_a.notes,v_a.compensation);
  return new;
end; $$;
revoke all on function collaboration_private.seed_v3_membership_area_access() from public,anon,authenticated,service_role;
create trigger zzz_wedding_collaboration_membership_v3_area_seed
  after insert on public.wedding_collaboration_memberships
  for each row execute function collaboration_private.seed_v3_membership_area_access();

-- V3 presets reuse existing identity/metadata semantics; grants remain empty.
insert into collaboration_private.permission_presets(scope,owner_user_id,system_key,name,description,permission_group_mapping_version)
values ('system',null,'collaboration_viewer_v3','Podgląd',null,'3'),
       ('system',null,'collaboration_editor_v3','Edycja',null,'3');
insert into collaboration_private.preset_area_access(preset_id,logistics,prewedding,contacts,tasks,notes,compensation)
select id,1,1,1,1,1,0 from collaboration_private.permission_presets where system_key='collaboration_viewer_v3'
union all
select id,2,2,2,2,2,0 from collaboration_private.permission_presets where system_key='collaboration_editor_v3';

create function public.list_collaboration_permission_presets_v3()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if v_actor is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('preset_id',p.id,'scope',p.scope,'name',p.name,
    'description',p.description,'version',p.version::text,'updated_at',p.updated_at)
    order by case when p.scope='system' then 0 else 1 end,p.updated_at desc,p.id), '[]'::jsonb)
    into v_result from collaboration_private.permission_presets p
    where p.permission_group_mapping_version='3' and (p.scope='system' or p.owner_user_id=v_actor)
      and p.archived_at is null;
  return v_result;
end; $$;

create function public.get_collaboration_permission_preset_v3(p_preset_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  select jsonb_build_object('preset_id',p.id,'scope',p.scope,'name',p.name,'description',p.description,
    'version',p.version::text,'mapping_version','3','created_at',p.created_at,'updated_at',p.updated_at,
    'areas',collaboration_private.area_access_json(a.logistics,a.prewedding,a.contacts,a.tasks,a.notes,a.compensation))
    into v_result from collaboration_private.permission_presets p
    join collaboration_private.preset_area_access a on a.preset_id=p.id
    where p.id=p_preset_id and p.permission_group_mapping_version='3'
      and p.archived_at is null and (p.scope='system' or p.owner_user_id=v_actor);
  if v_result is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  return v_result;
end; $$;

create function public.create_collaboration_permission_preset_v3(p_name text,p_description text,p_areas jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_areas jsonb; v_id uuid; v_name text;
begin
  if v_actor is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  v_areas:=collaboration_private.normalize_area_access('custom',p_areas);
  v_name:=pg_catalog.btrim(coalesce(p_name,''));
  if v_name='' or pg_catalog.char_length(v_name)>80 or v_name ~ '[[:cntrl:]]'
    or (p_description is not null and (pg_catalog.char_length(p_description)>240 or p_description ~ '[[:cntrl:]]')) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  insert into collaboration_private.permission_presets(scope,owner_user_id,name,description,permission_group_mapping_version)
    values('user',v_actor,v_name,nullif(pg_catalog.btrim(p_description),''),'3') returning id into v_id;
  insert into collaboration_private.preset_area_access(preset_id,logistics,prewedding,contacts,tasks,notes,compensation)
    values(v_id,(v_areas->>'logistics')::smallint,(v_areas->>'prewedding')::smallint,(v_areas->>'contacts')::smallint,
      (v_areas->>'tasks')::smallint,(v_areas->>'notes')::smallint,(v_areas->>'compensation')::smallint);
  return public.get_collaboration_permission_preset_v3(v_id);
end; $$;

create function public.update_collaboration_permission_preset_v3(
  p_preset_id uuid,p_expected_version text,p_name text,p_description text,p_areas jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_p collaboration_private.permission_presets%rowtype; v_areas jsonb;
begin
  select * into v_p from collaboration_private.permission_presets where id=p_preset_id for update;
  if not found or v_p.permission_group_mapping_version is distinct from '3' or v_p.archived_at is not null then
    raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_p.scope='system' then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  if v_p.owner_user_id is distinct from v_actor then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_expected_version is null or pg_catalog.char_length(p_expected_version)>19 or p_expected_version !~ '^[1-9][0-9]*$'
    or p_expected_version::numeric>9223372036854775807::numeric then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if p_expected_version::numeric<>v_p.version::numeric then raise exception using errcode='P0001',message='CONFLICT'; end if;
  v_areas:=collaboration_private.normalize_area_access('custom',p_areas);
  if p_name is null or pg_catalog.btrim(p_name)='' or pg_catalog.char_length(pg_catalog.btrim(p_name))>80
    or p_name ~ '[[:cntrl:]]' or (p_description is not null and (pg_catalog.char_length(p_description)>240 or p_description ~ '[[:cntrl:]]')) then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  update collaboration_private.permission_presets set name=pg_catalog.btrim(p_name),
    description=nullif(pg_catalog.btrim(p_description),''),version=version+1,updated_at=pg_catalog.now() where id=v_p.id;
  update collaboration_private.preset_area_access set logistics=(v_areas->>'logistics')::smallint,
    prewedding=(v_areas->>'prewedding')::smallint,contacts=(v_areas->>'contacts')::smallint,
    tasks=(v_areas->>'tasks')::smallint,notes=(v_areas->>'notes')::smallint,
    compensation=(v_areas->>'compensation')::smallint,updated_at=pg_catalog.now() where preset_id=v_p.id;
  return public.get_collaboration_permission_preset_v3(v_p.id);
end; $$;

create function public.archive_collaboration_permission_preset_v3(p_preset_id uuid,p_expected_version text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_p collaboration_private.permission_presets%rowtype;
begin
  select * into v_p from collaboration_private.permission_presets where id=p_preset_id for update;
  if not found or v_p.permission_group_mapping_version is distinct from '3' or v_p.archived_at is not null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_p.scope='system' then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  if v_p.owner_user_id is distinct from v_actor then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_expected_version is null or pg_catalog.char_length(p_expected_version)>19
    or p_expected_version !~ '^[1-9][0-9]*$'
    or p_expected_version::numeric>9223372036854775807::numeric then
    raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
  if p_expected_version::numeric<>v_p.version::numeric then
    raise exception using errcode='P0001',message='CONFLICT'; end if;
  update collaboration_private.permission_presets set archived_at=pg_catalog.now(),version=version+1,updated_at=pg_catalog.now() where id=v_p.id;
  return jsonb_build_object('archived',true,'version',(v_p.version+1)::text);
end; $$;

create function public.duplicate_collaboration_permission_preset_v3(p_preset_id uuid,p_name text,p_description text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_src jsonb; v_result jsonb;
begin
  v_src:=public.get_collaboration_permission_preset_v3(p_preset_id);
  v_result:=public.create_collaboration_permission_preset_v3(p_name,p_description,v_src->'areas');
  return v_result;
end; $$;

revoke all on function public.get_wedding_collaboration_membership_access_management_v3(uuid,uuid) from public,anon,service_role;
revoke all on function public.get_wedding_collaboration_invitation_access_management_v3(uuid,uuid) from public,anon,service_role;
revoke all on function public.update_wedding_collaboration_membership_access_v3(uuid,uuid,text,text,text,text,jsonb) from public,anon,service_role;
revoke all on function public.update_wedding_collaboration_invitation_access_v3(uuid,uuid,text,text,text,text,jsonb) from public,anon,service_role;
revoke all on function public.create_wedding_collaboration_invitation_v3(uuid,uuid,numeric,uuid,text,text,text,jsonb) from public,anon,service_role;
revoke all on function public.list_collaboration_permission_presets_v3() from public,anon,service_role;
revoke all on function public.get_collaboration_permission_preset_v3(uuid) from public,anon,service_role;
revoke all on function public.create_collaboration_permission_preset_v3(text,text,jsonb) from public,anon,service_role;
revoke all on function public.update_collaboration_permission_preset_v3(uuid,text,text,text,jsonb) from public,anon,service_role;
revoke all on function public.archive_collaboration_permission_preset_v3(uuid,text) from public,anon,service_role;
revoke all on function public.duplicate_collaboration_permission_preset_v3(uuid,text,text) from public,anon,service_role;
grant execute on function public.get_wedding_collaboration_membership_access_management_v3(uuid,uuid) to authenticated;
grant execute on function public.get_wedding_collaboration_invitation_access_management_v3(uuid,uuid) to authenticated;
grant execute on function public.update_wedding_collaboration_membership_access_v3(uuid,uuid,text,text,text,text,jsonb) to authenticated;
grant execute on function public.update_wedding_collaboration_invitation_access_v3(uuid,uuid,text,text,text,text,jsonb) to authenticated;
grant execute on function public.create_wedding_collaboration_invitation_v3(uuid,uuid,numeric,uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.list_collaboration_permission_presets_v3() to authenticated;
grant execute on function public.get_collaboration_permission_preset_v3(uuid) to authenticated;
grant execute on function public.create_collaboration_permission_preset_v3(text,text,jsonb) to authenticated;
grant execute on function public.update_collaboration_permission_preset_v3(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.archive_collaboration_permission_preset_v3(uuid,text) to authenticated;
grant execute on function public.duplicate_collaboration_permission_preset_v3(uuid,text,text) to authenticated;

commit;
