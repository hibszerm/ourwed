-- Collaboration 1C-H1: actor-specific workspace projection and versioned
-- authority foundations. This migration does not widen core table RLS.
begin;

-- Match the released lifecycle lock order. NOWAIT makes a busy local/test
-- deployment retry cleanly instead of waiting while holding later locks.
lock table public.wedding_collaboration_invitations,
  public.wedding_collaboration_memberships,public.wedding_collaboration_events
  in access exclusive mode nowait;
lock table collaboration_private.capability_registry in access exclusive mode nowait;
lock table collaboration_private.permission_presets,
  collaboration_private.permission_preset_grants in access exclusive mode nowait;

alter table public.wedding_collaboration_memberships
  add column permission_group_mapping_version text not null default '1'
    check (permission_group_mapping_version in ('1','2'));

alter table public.wedding_collaboration_invitations
  drop constraint wedding_collaboration_invitations_access_config_check,
  add constraint wedding_collaboration_invitations_access_config_check check (
    (access_configuration_version=0 and role_key is null and custom_role_label is null
      and access_mode is null and permission_group_mapping_version is null)
    or
    (access_configuration_version=1 and role_key is not null
      and (role_key='unspecified' or role_key='custom' or role_key ~ '^system:[a-z][a-z0-9_]{0,62}$')
      and access_mode is not null and access_mode in ('viewer','editor','custom')
      and permission_group_mapping_version is not null and permission_group_mapping_version in ('1','2')
      and ((role_key='custom' and custom_role_label is not null
              and custom_role_label=pg_catalog.btrim(custom_role_label)
              and custom_role_label ~ '[^[:space:]]'
              and pg_catalog.char_length(custom_role_label) between 1 and 64)
        or (role_key<>'custom' and custom_role_label is null)))
  );

alter table collaboration_private.capability_registry
  add column h1_mapping_only boolean not null default false;

insert into collaboration_private.capability_registry
  (capability_key,active,grantable,owner_only,viewer_default,editor_default,
   introduced_version,max_custom_level,h1_mapping_only)
values
  ('places.name',true,true,false,0,0,2,2,true),
  ('prewedding.plan_day',false,false,false,0,0,2,0,false);

create table collaboration_private.permission_mapping_defaults (
  mapping_version text not null check (mapping_version in ('1','2')),
  access_mode text not null check (access_mode in ('viewer','editor')),
  capability_key text not null references collaboration_private.capability_registry(capability_key),
  level smallint not null check (level between 0 and 2),
  primary key (mapping_version,access_mode,capability_key)
);
alter table collaboration_private.permission_mapping_defaults enable row level security;
alter table collaboration_private.permission_mapping_defaults force row level security;
revoke all on collaboration_private.permission_mapping_defaults from public,anon,authenticated,service_role;

-- v1 copies released mode defaults. v2 separates place name and keeps Plan Day
-- unavailable until that parent capability is explicitly activated later.
insert into collaboration_private.permission_mapping_defaults
  (mapping_version,access_mode,capability_key,level)
values
  ('1','viewer','wedding.identity',1),('1','viewer','places.address',1),
  ('1','viewer','places.name',0),('1','viewer','schedule.operational_time',1),
  ('1','editor','wedding.identity',1),('1','editor','places.address',2),
  ('1','editor','places.name',0),('1','editor','schedule.operational_time',2),
  ('2','viewer','wedding.identity',1),('2','viewer','places.address',1),
  ('2','viewer','places.name',1),('2','viewer','schedule.operational_time',0),
  ('2','editor','wedding.identity',1),('2','editor','places.address',2),
  ('2','editor','places.name',2),('2','editor','schedule.operational_time',0);

create table collaboration_private.capability_dependencies (
  child_capability_key text not null references collaboration_private.capability_registry(capability_key),
  parent_capability_key text not null references collaboration_private.capability_registry(capability_key),
  required_parent_level smallint not null check (required_parent_level in (1,2)),
  minimum_mapping_version text not null check (minimum_mapping_version in ('1','2')),
  primary key (child_capability_key,parent_capability_key),
  check (child_capability_key<>parent_capability_key)
);
alter table collaboration_private.capability_dependencies enable row level security;
alter table collaboration_private.capability_dependencies force row level security;
revoke all on collaboration_private.capability_dependencies from public,anon,authenticated,service_role;

create function collaboration_private.reject_capability_dependency_cycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    with recursive ancestors(key) as (
      select new.parent_capability_key
      union
      select d.parent_capability_key
      from collaboration_private.capability_dependencies d
      join ancestors a on d.child_capability_key=a.key
      where not (d.child_capability_key=new.child_capability_key
        and d.parent_capability_key=new.parent_capability_key)
    )
    select 1 from ancestors where key=new.child_capability_key
  ) then raise exception using errcode='23514',message='capability_dependency_cycle'; end if;
  return new;
end;
$$;
revoke all on function collaboration_private.reject_capability_dependency_cycle() from public,anon,authenticated,service_role;
create trigger capability_dependencies_cycle_guard
  before insert or update on collaboration_private.capability_dependencies
  for each row execute function collaboration_private.reject_capability_dependency_cycle();

insert into collaboration_private.capability_dependencies
  (child_capability_key,parent_capability_key,required_parent_level,minimum_mapping_version)
values ('schedule.operational_time','prewedding.plan_day',1,'2'),('places.name','wedding.identity',1,'2');

create function collaboration_private.raw_wedding_capability_level(p_wedding_id uuid,p_capability_key text)
returns smallint language plpgsql stable security definer set search_path = '' as $$
declare
  v_context jsonb; v_mapping text; v_mode text; v_member_id uuid;
  v_level smallint:=0; v_active boolean; v_grantable boolean; v_owner_only boolean;
begin
  v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null or v_context->>'relationship'<>'collaborator' then return 0; end if;
  select c.active,c.grantable,c.owner_only into v_active,v_grantable,v_owner_only
    from collaboration_private.capability_registry c where c.capability_key=p_capability_key;
  if not found or not v_active or not v_grantable or v_owner_only then return 0; end if;
  v_mode:=v_context->>'access_mode';
  v_mapping:=coalesce(v_context->>'permission_group_mapping_version','1');
  v_member_id:=(v_context->>'membership_id')::uuid;
  if v_mode='custom' then
    if v_mapping='1' and exists(select 1 from collaboration_private.capability_registry c
      where c.capability_key=p_capability_key and c.h1_mapping_only) then return 0; end if;
    select coalesce(g.level,0)::smallint into v_level
      from (select 1) seed left join collaboration_private.membership_permission_grants g
        on g.membership_id=v_member_id and g.capability_key=p_capability_key;
    return coalesce(v_level,0);
  end if;
  select coalesce(d.level,0)::smallint into v_level
    from collaboration_private.permission_mapping_defaults d
    where d.mapping_version=v_mapping and d.access_mode=v_mode and d.capability_key=p_capability_key;
  return coalesce(v_level,0);
end;
$$;
revoke all on function collaboration_private.raw_wedding_capability_level(uuid,text) from public,anon,authenticated,service_role;

create or replace function collaboration_private.effective_wedding_capability_level(p_wedding_id uuid,p_capability_key text)
returns smallint language plpgsql stable security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_mapping_version text;
  v_result smallint;
begin
  v_context:=collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  v_mapping_version:=coalesce(v_context->>'permission_group_mapping_version','1');

  -- Dependency metadata is versioned: v1 keeps its released authority behavior,
  -- while v2 and later mappings use the new parent/child closure.
  with recursive closure(capability_key,depth,required_level) as (
    select p_capability_key,0,0::smallint
    union all
    select d.parent_capability_key,c.depth+1,d.required_parent_level
    from closure c join collaboration_private.capability_dependencies d
      on d.child_capability_key=c.capability_key
      and d.minimum_mapping_version<=v_mapping_version
    where c.depth<32
  ), parent_check as (
    select coalesce(bool_and(c.depth=0 or
      collaboration_private.raw_wedding_capability_level(p_wedding_id,c.capability_key)>=c.required_level),true) as satisfied
    from closure c
  )
  select case when parent_check.satisfied
      then collaboration_private.raw_wedding_capability_level(p_wedding_id,p_capability_key)
      else 0::smallint end
    into v_result from parent_check;
  return coalesce(v_result,0);
end;
$$;

alter table collaboration_private.permission_presets
  add column permission_group_mapping_version text not null default '1'
    check (permission_group_mapping_version in ('1','2'));
create or replace function collaboration_private.permission_preset_detail(p_preset_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'preset_id',p.id,'scope',p.scope,'name',p.name,'description',p.description,
    'version',p.version::text,'permission_group_mapping_version',p.permission_group_mapping_version,
    'grants',coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('capability_key',g.capability_key,'level',g.level)
      order by g.capability_key) from collaboration_private.permission_preset_grants g
      where g.preset_id=p.id),'[]'::jsonb),
    'created_at',p.created_at,'updated_at',p.updated_at)
  from collaboration_private.permission_presets p where p.id=p_preset_id;
$$;
revoke all on function collaboration_private.permission_preset_detail(uuid) from public,anon,authenticated,service_role;

create index wedding_collaboration_memberships_workspace_idx
  on public.wedding_collaboration_memberships(member_user_id,status,wedding_id,owner_user_id)
  where status='active';
create index weddings_workspace_owner_date_idx
  on public.weddings(user_id,wedding_date,id) where status='active';

create function public.list_my_workspace_weddings(
  p_after_wedding_date date default null,p_after_wedding_id uuid default null,
  p_limit integer default 50,p_scope text default 'all'
) returns table (
  wedding_id uuid,ownership_kind text,couple_first_name text,couple_second_name text,
  wedding_date date,owner_display_name text,membership_id uuid,access_version text,
  permission_group_mapping_version text,effective_capabilities jsonb
) language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then return; end if;
  if p_scope is null or p_scope not in ('all','owned','shared') then raise exception using errcode='22023',message='invalid_scope'; end if;
  if p_after_wedding_date is not null and p_after_wedding_id is null then
    raise exception using errcode='22023',message='invalid_cursor'; end if;
  return query
  with eligible as (
    select w.id as id,'owned'::text as kind,w.bride_name,w.groom_name,w.wedding_date,
      null::text as owner_name,null::uuid as member_id,null::text as version,null::text as mapping
    from public.weddings w where w.user_id=v_actor and w.status='active' and p_scope in ('all','owned')
    union all
    select w.id,'shared',w.bride_name,w.groom_name,w.wedding_date,
      coalesce(nullif(pg_catalog.btrim(u.name),''),'Użytkownik niedostępny'),m.id,
      m.access_version::text,m.permission_group_mapping_version
    from public.wedding_collaboration_memberships m
    join public.weddings w on w.id=m.wedding_id and w.user_id=m.owner_user_id and w.status='active'
    join public.users u on u.id=m.owner_user_id
    where m.member_user_id=v_actor and m.status='active' and p_scope in ('all','shared')
      and collaboration_private.effective_wedding_capability_level(w.id,'wedding.identity')>=1
  )
  select e.id,e.kind,e.bride_name,e.groom_name,e.wedding_date,e.owner_name,e.member_id,e.version,e.mapping,
    case when e.kind='owned' then '[]'::jsonb else coalesce(caps.value,'[]'::jsonb) end
  from eligible e left join lateral (
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key',c.capability_key,
      'level',case l.level when 1 then 'view' else 'edit' end) order by c.capability_key) as value
    from collaboration_private.capability_registry c
    cross join lateral (select collaboration_private.effective_wedding_capability_level(e.id,c.capability_key) level) l
    where c.active and c.grantable and not c.owner_only and l.level>0
  ) caps on e.kind='shared'
  where p_after_wedding_id is null
    or (p_after_wedding_date is null and e.wedding_date is null and e.id>p_after_wedding_id)
    or (p_after_wedding_date is not null and (e.wedding_date>p_after_wedding_date or e.wedding_date is null
      or (e.wedding_date=p_after_wedding_date and e.id>p_after_wedding_id)))
  order by e.wedding_date nulls last,e.id limit greatest(1,least(coalesce(p_limit,50),50));
end;
$$;
revoke all on function public.list_my_workspace_weddings(date,uuid,integer,text) from public,anon;
grant execute on function public.list_my_workspace_weddings(date,uuid,integer,text) to authenticated;

create function public.get_wedding_collaboration_invitation_decision(p_invitation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if v_actor is null or p_invitation_id is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then return null; end if;
  select pg_catalog.jsonb_build_object(
    'invitation_id',i.id,'status',i.status,'reason',i.reason,
    'couple_first_name',i.couple_first_name_snapshot,'couple_second_name',i.couple_second_name_snapshot,
    'wedding_date',i.wedding_date_snapshot,
    'inviter_display_name',coalesce(nullif(pg_catalog.btrim(u.name),''),'Użytkownik niedostępny'),
    'proposed_share_amount',i.proposed_share_amount,'currency',i.currency_snapshot,
    'permission_group_mapping_version',coalesce(i.permission_group_mapping_version,'1'),
    'created_at',i.created_at,'expires_at',i.expires_at,'accepted_at',i.accepted_at,
    'declined_at',i.declined_at,'cancelled_at',i.cancelled_at,'expired_at',i.expired_at,
    'superseded_at',i.superseded_at,
    'membership_status',(select m.status from public.wedding_collaboration_memberships m
      where m.accepted_invitation_id=i.id and m.member_user_id=v_actor order by m.accepted_at desc,m.id desc limit 1))
  into v_result from public.wedding_collaboration_invitations i
  left join public.users u on u.id=i.owner_user_id where i.id=p_invitation_id and i.invitee_user_id=v_actor;
  return v_result;
end;
$$;
revoke all on function public.get_wedding_collaboration_invitation_decision(uuid) from public,anon;
grant execute on function public.get_wedding_collaboration_invitation_decision(uuid) to authenticated;

commit;
