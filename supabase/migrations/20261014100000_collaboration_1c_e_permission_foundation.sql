-- Collaboration 1C-E permission foundation.
-- Atomic authority backfill; browser access remains RPC-only.
begin;

do $preflight$
begin
  if to_regclass('public.wedding_collaboration_memberships') is null
     or to_regclass('public.wedding_collaboration_invitations') is null
     or to_regclass('public.wedding_collaboration_events') is null
     or to_regclass('public.weddings') is null
     or to_regclass('collaboration_private.wedding_operational_versions') is null then
    raise exception 'COLLABORATION_1C_E_REQUIRED_OBJECT_MISSING';
  end if;
  if exists(select 1 from public.wedding_collaboration_memberships where status='active'
      and (wedding_id is null or accepted_invitation_id is null or owner_user_id is null or member_user_id is null)) then
    raise exception 'COLLABORATION_1C_E_INVALID_ACTIVE_MEMBERSHIP';
  end if;
  if exists(select 1 from public.wedding_collaboration_memberships where status not in ('active','revoked','left')) then
    raise exception 'COLLABORATION_1C_E_UNKNOWN_MEMBERSHIP_STATUS';
  end if;
  if exists(select 1 from public.wedding_collaboration_memberships where status='active'
      group by wedding_id,member_user_id having count(*)>1) then
    raise exception 'COLLABORATION_1C_E_DUPLICATE_ACTIVE_MEMBERSHIP';
  end if;
  if exists(select 1 from public.wedding_collaboration_memberships m
      where m.status='active' and not exists(
        select 1 from public.wedding_collaboration_invitations i
        where i.id=m.accepted_invitation_id and i.status='accepted'
          and i.wedding_id_snapshot=m.wedding_id_snapshot
          and i.owner_user_id=m.owner_user_id and i.invitee_user_id=m.member_user_id)) then
    raise exception 'COLLABORATION_1C_E_INVALID_ACCEPTED_INVITATION_LINK';
  end if;
end;
$preflight$;

create temporary table _collaboration_1ce_membership_snapshot on commit drop as
  select id,pg_catalog.to_jsonb(m) as snapshot from public.wedding_collaboration_memberships m;
create temporary table _collaboration_1ce_invitation_snapshot on commit drop as
  select id,pg_catalog.to_jsonb(i) as snapshot from public.wedding_collaboration_invitations i;
create temporary table _collaboration_1ce_event_snapshot on commit drop as
  select id,pg_catalog.to_jsonb(e) as snapshot from public.wedding_collaboration_events e;
create temporary table _collaboration_1ce_operational_version_snapshot on commit drop as
  select wedding_id,resource_type,role,version from collaboration_private.wedding_operational_versions;

create schema if not exists collaboration_private;
revoke all on schema collaboration_private from public,anon,authenticated,service_role;

create table collaboration_private.capability_registry (
  capability_key text primary key check (capability_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  active boolean not null,
  grantable boolean not null,
  owner_only boolean not null,
  viewer_default smallint not null check (viewer_default between 0 and 2),
  editor_default smallint not null check (editor_default between 0 and 2),
  introduced_version integer not null check (introduced_version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (not owner_only or (not grantable and viewer_default=0 and editor_default=0)),
  check (active or (viewer_default=0 and editor_default=0)),
  check (grantable or (viewer_default=0 and editor_default=0))
);
alter table collaboration_private.capability_registry enable row level security;
alter table collaboration_private.capability_registry force row level security;
revoke all on collaboration_private.capability_registry from public,anon,authenticated,service_role;

insert into collaboration_private.capability_registry
  (capability_key,active,grantable,owner_only,viewer_default,editor_default,introduced_version)
values
  ('wedding.identity',true,true,false,1,1,1),
  ('places.address',true,true,false,1,2,1),
  ('places.structure',false,true,false,0,0,1),
  ('places.location_resolution',false,true,false,0,0,1),
  ('schedule.operational_time',true,true,false,1,2,1),
  ('schedule.timeline',false,true,false,0,0,1),
  ('schedule.completion',false,true,false,0,0,1),
  ('brief.curated',false,true,false,0,0,1),
  ('brief.artifact',false,true,false,0,0,1),
  ('tasks',false,true,false,0,0,1),
  ('notes',false,true,false,0,0,1),
  ('travel.route',false,true,false,0,0,1),
  ('travel.commercial',false,true,false,0,0,1);

create table collaboration_private.membership_permission_grants (
  membership_id uuid not null references public.wedding_collaboration_memberships(id) on delete cascade,
  capability_key text not null references collaboration_private.capability_registry(capability_key) on delete restrict,
  level smallint not null check (level in (1,2)),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (membership_id,capability_key)
);
alter table collaboration_private.membership_permission_grants enable row level security;
alter table collaboration_private.membership_permission_grants force row level security;
revoke all on collaboration_private.membership_permission_grants from public,anon,authenticated,service_role;

create table collaboration_private.invitation_permission_grants (
  invitation_id uuid not null references public.wedding_collaboration_invitations(id) on delete cascade,
  capability_key text not null references collaboration_private.capability_registry(capability_key) on delete restrict,
  level smallint not null check (level in (1,2)),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (invitation_id,capability_key)
);
alter table collaboration_private.invitation_permission_grants enable row level security;
alter table collaboration_private.invitation_permission_grants force row level security;
revoke all on collaboration_private.invitation_permission_grants from public,anon,authenticated,service_role;

alter table public.wedding_collaboration_memberships
  add column role_key text not null default 'unspecified',
  add column custom_role_label text,
  add column access_mode text not null default 'custom',
  add column access_version bigint not null default 1;
alter table public.wedding_collaboration_invitations
  add column access_configuration_version integer not null default 0,
  add column role_key text,
  add column custom_role_label text,
  add column access_mode text,
  add column permission_group_mapping_version text;

update public.wedding_collaboration_memberships
  set role_key='unspecified',custom_role_label=null,access_mode='custom',access_version=1
  where role_key is distinct from 'unspecified' or custom_role_label is not null
     or access_mode is distinct from 'custom' or access_version is distinct from 1;

insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
select m.id,g.capability_key,g.level
from public.wedding_collaboration_memberships m
cross join (values ('wedding.identity'::text,1::smallint),
                   ('places.address'::text,2::smallint),
                   ('schedule.operational_time'::text,2::smallint)) g(capability_key,level)
where m.status='active';

alter table public.wedding_collaboration_memberships
  add constraint wedding_collaboration_memberships_role_key_check
    check (role_key='unspecified' or role_key='custom' or role_key ~ '^system:[a-z][a-z0-9_]{0,62}$'),
  add constraint wedding_collaboration_memberships_custom_role_label_check
    check ((role_key='custom' and custom_role_label is not null
              and custom_role_label=pg_catalog.btrim(custom_role_label)
              and pg_catalog.char_length(custom_role_label) between 1 and 64)
        or (role_key<>'custom' and custom_role_label is null)),
  add constraint wedding_collaboration_memberships_access_mode_check
    check (access_mode in ('viewer','editor','custom')),
  add constraint wedding_collaboration_memberships_access_version_check
    check (access_version > 0);

alter table public.wedding_collaboration_invitations
  add constraint wedding_collaboration_invitations_access_config_check
  check (
    (access_configuration_version=0 and role_key is null and custom_role_label is null
      and access_mode is null and permission_group_mapping_version is null)
    or
    (access_configuration_version=1
      and (role_key='unspecified' or role_key='custom' or role_key ~ '^system:[a-z][a-z0-9_]{0,62}$')
      and access_mode in ('viewer','editor','custom')
      and permission_group_mapping_version='1'
      and ((role_key='custom' and custom_role_label is not null
              and custom_role_label=pg_catalog.btrim(custom_role_label)
              and pg_catalog.char_length(custom_role_label) between 1 and 64)
        or (role_key<>'custom' and custom_role_label is null)))
  );

alter table public.wedding_collaboration_events
  drop constraint if exists wedding_collaboration_events_event_type_check,
  add constraint wedding_collaboration_events_event_type_check
    check (event_type in ('invitation_created','invitation_accepted','invitation_declined',
      'invitation_cancelled','invitation_expired','invitation_superseded','membership_revoked',
      'membership_left','role_changed','access_mode_changed','permissions_changed','preset_applied'));


create function collaboration_private.resolve_wedding_actor_access(p_wedding_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_owner_id uuid;
  v_membership public.wedding_collaboration_memberships%rowtype;
begin
  if v_actor is null or p_wedding_id is null or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    return null;
  end if;
  select w.user_id into v_owner_id from public.weddings w
    where w.id=p_wedding_id and w.status='active';
  if not found then return null; end if;
  if v_owner_id=v_actor then
    return pg_catalog.jsonb_build_object('relationship','owner','wedding_id',p_wedding_id);
  end if;
  select m.* into v_membership
    from public.wedding_collaboration_memberships m
    where m.wedding_id=p_wedding_id and m.owner_user_id=v_owner_id
      and m.member_user_id=v_actor and m.status='active';
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object(
    'relationship','collaborator','wedding_id',p_wedding_id,
    'membership_id',v_membership.id,'role_key',v_membership.role_key,
    'custom_role_label',v_membership.custom_role_label,'access_mode',v_membership.access_mode,
    'access_version',v_membership.access_version::text);
end;
$$;

create function collaboration_private.effective_wedding_capability_level(
  p_wedding_id uuid,
  p_capability_key text
)
returns smallint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_mode text;
  v_membership_id uuid;
  v_level smallint := 0;
  v_capability collaboration_private.capability_registry%rowtype;
begin
  v_context := collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null or v_context->>'relationship' <> 'collaborator' then return 0; end if;
  select c.* into v_capability from collaboration_private.capability_registry c
    where c.capability_key=p_capability_key;
  if not found or not v_capability.active or not v_capability.grantable or v_capability.owner_only then return 0; end if;
  v_mode := v_context->>'access_mode';
  v_membership_id := (v_context->>'membership_id')::uuid;
  if v_mode='custom' then
    select coalesce(g.level,0)::smallint into v_level
      from (select 1) seed
      left join collaboration_private.membership_permission_grants g
        on g.membership_id=v_membership_id and g.capability_key=p_capability_key;
    return coalesce(v_level,0);
  elsif v_mode='viewer' then
    return v_capability.viewer_default;
  elsif v_mode='editor' then
    return v_capability.editor_default;
  end if;
  return 0;
end;
$$;

create function collaboration_private.has_wedding_capability(
  p_wedding_id uuid,
  p_capability_key text,
  p_required_level smallint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_required_level between 1 and 2
    and collaboration_private.effective_wedding_capability_level(p_wedding_id,p_capability_key) >= p_required_level
$$;

create function public.get_my_wedding_access_context(p_wedding_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_member_id uuid;
  v_caps jsonb;
begin
  v_context := collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_context->>'relationship'='owner' then
    return pg_catalog.jsonb_build_object('wedding_id',p_wedding_id,'relationship','owner');
  end if;
  v_member_id := (v_context->>'membership_id')::uuid;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('key',c.capability_key,
      'level',case when l.level=1 then 'view' else 'edit' end)
    order by c.capability_key),'[]'::jsonb)
    into v_caps
    from collaboration_private.capability_registry c
    cross join lateral (
      select collaboration_private.effective_wedding_capability_level(p_wedding_id,c.capability_key) as level
    ) l
    where c.active and c.grantable and not c.owner_only and l.level>0;
  return pg_catalog.jsonb_build_object(
    'wedding_id',p_wedding_id,'relationship','collaborator',
    'role_key',v_context->>'role_key','custom_role_label',v_context->'custom_role_label',
    'access_mode',v_context->>'access_mode','access_version',v_context->>'access_version',
    'capabilities',v_caps);
end;
$$;

create or replace function public.list_my_collaborative_weddings(
  p_after_wedding_date date default null,
  p_after_wedding_id uuid default null,
  p_limit integer default 50
)
returns table (
  wedding_id uuid,
  couple_first_name text,
  couple_second_name text,
  wedding_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1
    from auth.users au
    join public.users u on u.id = au.id
    where au.id = v_actor
      and au.email_confirmed_at is not null
      and au.deleted_at is null
      and not au.is_anonymous
      and (au.banned_until is null or au.banned_until <= pg_catalog.now())
  ) then
    return;
  end if;

  if p_after_wedding_date is not null and p_after_wedding_id is null then
    raise exception using errcode = '22023', message = 'invalid_cursor';
  end if;

  return query
  select w.id, w.bride_name, w.groom_name, w.wedding_date
  from public.wedding_collaboration_memberships m
  join public.weddings w
    on w.id = m.wedding_id
   and w.user_id = m.owner_user_id
  where m.member_user_id = v_actor
    and m.status = 'active'
    and m.wedding_id is not null
    and w.status = 'active'
    and collaboration_private.has_wedding_capability(w.id, 'wedding.identity', 1::smallint)
    and (
      p_after_wedding_id is null
      or (
        p_after_wedding_date is not null
        and (
          w.wedding_date > p_after_wedding_date
          or (w.wedding_date = p_after_wedding_date and w.id > p_after_wedding_id)
          or w.wedding_date is null
        )
      )
      or (
        p_after_wedding_date is null
        and p_after_wedding_id is not null
        and w.wedding_date is null
        and w.id > p_after_wedding_id
      )
    )
  order by w.wedding_date asc nulls last, w.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 50);
end;
$$;
create or replace function public.get_collaborative_wedding_detail(p_wedding_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_first_name text;
  v_second_name text;
  v_wedding_date date;
  v_ceremony_time time without time zone;
  v_places jsonb;
  v_can_identity boolean;
  v_can_address boolean;
  v_can_time boolean;
begin
  if v_actor is null or p_wedding_id is null or not exists (
    select 1
    from auth.users au
    join public.users u on u.id = au.id
    where au.id = v_actor
      and au.email_confirmed_at is not null
      and au.deleted_at is null
      and not au.is_anonymous
      and (au.banned_until is null or au.banned_until <= pg_catalog.now())
  ) then
    return null;
  end if;

  select w.bride_name, w.groom_name, w.wedding_date, w.ceremony_time
    into v_first_name, v_second_name, v_wedding_date, v_ceremony_time
  from public.wedding_collaboration_memberships m
  join public.weddings w
    on w.id = m.wedding_id
   and w.user_id = m.owner_user_id
  where m.member_user_id = v_actor
    and m.wedding_id = p_wedding_id
    and m.status = 'active'
    and w.status = 'active';

  if not found then
    return null;
  end if;

  v_can_identity := collaboration_private.has_wedding_capability(p_wedding_id, 'wedding.identity', 1::smallint);
  v_can_address := collaboration_private.has_wedding_capability(p_wedding_id, 'places.address', 1::smallint);
  v_can_time := collaboration_private.has_wedding_capability(p_wedding_id, 'schedule.operational_time', 1::smallint);

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'role', p.role,
        'formatted_address', case when v_can_address then p.formatted_address else null end,
        'operational_time', case when v_can_time then
          case
            when ot.operational_time ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'
              then ot.operational_time
            when p.role = 'ceremony' and v_ceremony_time is not null
              then pg_catalog.to_char(v_ceremony_time, 'HH24:MI')
            else null
          end else null end
      ) order by p.sort_order, p.id
    ),
    '[]'::jsonb
  )
  into v_places
  from public.wedding_places p
  left join public.wedding_operational_times ot
    on ot.wedding_id = p.wedding_id
   and ot.stop_key = p.id::text
  where p.wedding_id = p_wedding_id
    and p.role in ('bride_preparation', 'groom_preparation', 'ceremony', 'reception')
    and (v_can_address or v_can_time);

  return pg_catalog.jsonb_build_object(
    'wedding_id', p_wedding_id,
    'couple_first_name', case when v_can_identity then v_first_name else null end,
    'couple_second_name', case when v_can_identity then v_second_name else null end,
    'wedding_date', case when v_can_identity then v_wedding_date else null end,
    'places', v_places
  );
end;
$$;
create or replace function public.get_collaborative_wedding_operational_edit_state(p_wedding_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_owner_id uuid;
  v_ceremony_time text;
  v_places jsonb;
  v_can_address boolean;
  v_can_time boolean;
begin
  if v_actor is null or p_wedding_id is null
     or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='P0001', message='UNAVAILABLE';
  end if;

  select w.user_id, case when w.ceremony_time is not null
      and pg_catalog.to_char(w.ceremony_time,'HH24:MI') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    then pg_catalog.to_char(w.ceremony_time,'HH24:MI') else null end
  into v_owner_id,v_ceremony_time
  from public.wedding_collaboration_memberships m
  join public.weddings w on w.id=m.wedding_id and w.user_id=m.owner_user_id
  where m.member_user_id=v_actor and m.wedding_id=p_wedding_id
    and m.status='active' and w.status='active';
  if not found then raise exception using errcode='P0001', message='UNAVAILABLE'; end if;
  v_can_address := collaboration_private.has_wedding_capability(p_wedding_id,'places.address',1::smallint);
  v_can_time := collaboration_private.has_wedding_capability(p_wedding_id,'schedule.operational_time',1::smallint);

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'role',r.role,
      'formatted_address',case when v_can_address then coalesce(p.formatted_address,'') else null end,
      'address_version',case when v_can_address then av.version::text else null end,
      'operational_time_override',case when v_can_time then ot.operational_time else null end,
      'effective_operational_time',case when v_can_time then case
        when ot.operational_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then ot.operational_time
        when r.role='ceremony' then v_ceremony_time
        else null end else null end,
      'time_source',case when v_can_time then case
        when ot.operational_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then 'override'
        when r.role='ceremony' and v_ceremony_time is not null then 'ceremony_fallback'
        else 'none' end else null end,
      'time_version',case when v_can_time then tv.version::text else null end
    ) order by r.ordinality
  ) into v_places
  from pg_catalog.unnest(array['bride_preparation','groom_preparation','ceremony','reception']::text[])
       with ordinality as r(role,ordinality)
  left join public.wedding_places p on p.wedding_id=p_wedding_id and p.role=r.role
  left join public.wedding_operational_times ot on ot.wedding_id=p_wedding_id and ot.stop_key=p.id::text
  left join collaboration_private.wedding_operational_versions av
    on av.wedding_id=p_wedding_id and av.resource_type='place_address' and av.role=r.role
  left join collaboration_private.wedding_operational_versions tv
    on tv.wedding_id=p_wedding_id and tv.resource_type='operational_time' and tv.role=r.role
  where v_can_address or v_can_time;

  return pg_catalog.jsonb_build_object('wedding_id',p_wedding_id,'places',coalesce(v_places,'[]'::jsonb));
end;
$$;
create or replace function public.update_collaborative_wedding_place(
  p_wedding_id uuid,
  p_role text,
  p_formatted_address text,
  p_expected_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_owner_id uuid;
  v_wedding_status text;
  v_member_id uuid;
  v_place public.wedding_places%rowtype;
  v_has_place boolean := false;
  v_current_version bigint;
  v_expected bigint;
  v_address text;
  v_custom_order boolean := false;
  v_max_order integer := 0;
  v_sort_order integer;
  v_changed boolean;
begin
  if p_role is null or p_role not in ('bride_preparation','groom_preparation','ceremony','reception')
     or p_formatted_address is null then
    raise exception using errcode='P0001', message='VALIDATION_ERROR';
  end if;
  v_address := pg_catalog.regexp_replace(p_formatted_address,'^[[:space:]]+|[[:space:]]+$','','g');
  if pg_catalog.char_length(v_address)>500
     or exists(select 1 from pg_catalog.generate_series(1,31) n where pg_catalog.strpos(v_address,pg_catalog.chr(n))>0)
     or exists(select 1 from pg_catalog.generate_series(127,159) n where pg_catalog.strpos(v_address,pg_catalog.chr(n))>0) then
    raise exception using errcode='P0001', message='VALIDATION_ERROR';
  end if;
  v_expected := collaboration_private.validate_expected_version(p_expected_version);
  if v_address='' and not exists(select 1 from public.wedding_places p where p.wedding_id=p_wedding_id and p.role=p_role) then
    raise exception using errcode='P0001', message='VALIDATION_ERROR';
  end if;

  if v_actor is null or p_wedding_id is null
     or not public.wedding_collaboration_lock_users(array[v_actor])
     or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='P0001', message='UNAVAILABLE';
  end if;
  select w.user_id,w.status into v_owner_id,v_wedding_status
  from public.weddings w where w.id=p_wedding_id for update;
  if not found or v_wedding_status<>'active' then raise exception using errcode='P0001', message='UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1330918916,1);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('source-contract:' || p_wedding_id::text, 0));
  select m.id into v_member_id from public.wedding_collaboration_memberships m
  where m.wedding_id=p_wedding_id and m.owner_user_id=v_owner_id
    and m.member_user_id=v_actor and m.status='active' for share;
  if not found then raise exception using errcode='P0001', message='UNAVAILABLE'; end if;
  if not collaboration_private.has_wedding_capability(p_wedding_id,'places.address',2::smallint) then
    raise exception using errcode='P0001', message='FORBIDDEN';
  end if;

  select * into v_place from public.wedding_places p
  where p.wedding_id=p_wedding_id and p.role=p_role for update;
  v_has_place := found;
  select v.version into v_current_version
  from collaboration_private.wedding_operational_versions v
  where v.wedding_id=p_wedding_id and v.resource_type='place_address' and v.role=p_role
  for update;

  if v_has_place and v_place.formatted_address is not distinct from v_address then
    return pg_catalog.jsonb_build_object(
      'wedding_id',p_wedding_id,'role',p_role,'formatted_address',v_place.formatted_address,
      'address_version',v_current_version::text,'changed',false);
  end if;
  if v_expected is distinct from v_current_version then
    raise exception using errcode='P0001', message='CONFLICT';
  end if;

  if v_has_place then
    update public.wedding_places set formatted_address=v_address,place_id=null,latitude=null,longitude=null
    where id=v_place.id;
  else
    select coalesce(pg_catalog.max(p.sort_order),0) into v_max_order
    from public.wedding_places p where p.wedding_id=p_wedding_id;
    select exists(select 1 from public.wedding_places p where p.wedding_id=p_wedding_id and p.sort_order>=1000)
      or (
        (select count(*)=count(distinct p.sort_order) from public.wedding_places p where p.wedding_id=p_wedding_id)
        and exists(select 1 from public.wedding_places p where p.wedding_id=p_wedding_id)
        and not (
          not exists(select 1 from public.wedding_places p where p.wedding_id=p_wedding_id and p.sort_order is distinct from
            case p.role when 'groom_preparation' then 10 when 'bride_preparation' then 15 when 'preparation' then 15
              when 'ceremony' then 20 when 'reception' then 30 when 'hotel' then 40 when 'airport' then 50 when 'other' then 100 end)
          or
          not exists(select 1 from public.wedding_places p where p.wedding_id=p_wedding_id and p.sort_order is distinct from
            case p.role when 'groom_preparation' then 15 when 'bride_preparation' then 10 when 'preparation' then 10
              when 'ceremony' then 20 when 'reception' then 30 when 'hotel' then 40 when 'airport' then 50 when 'other' then 100 end)
        )
      ) into v_custom_order;
    v_sort_order := case when v_custom_order then pg_catalog.greatest(v_max_order,0)+1000 else
      case p_role when 'groom_preparation' then 10 when 'bride_preparation' then 15
        when 'ceremony' then 20 when 'reception' then 30 end end;
    insert into public.wedding_places(wedding_id,role,label,place_id,formatted_address,latitude,longitude,sort_order)
    values(p_wedding_id,p_role,null,null,v_address,null,null,v_sort_order);
  end if;

  delete from public.travel_segments ts where ts.wedding_id=p_wedding_id;
  select version into v_current_version from collaboration_private.wedding_operational_versions
  where wedding_id=p_wedding_id and resource_type='place_address' and role=p_role;
  select formatted_address into v_address from public.wedding_places p
  where p.wedding_id=p_wedding_id and p.role=p_role;
  return pg_catalog.jsonb_build_object(
    'wedding_id',p_wedding_id,'role',p_role,'formatted_address',v_address,
    'address_version',v_current_version::text,'changed',true);
end;
$$;
create or replace function public.update_collaborative_operational_time(
  p_wedding_id uuid,
  p_role text,
  p_operational_time text,
  p_expected_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_owner_id uuid;
  v_wedding_status text;
  v_member_id uuid;
  v_place public.wedding_places%rowtype;
  v_has_place boolean := false;
  v_override text;
  v_has_override boolean := false;
  v_effective text;
  v_source text;
  v_current_version bigint;
  v_expected bigint;
  v_changed boolean := false;
begin
  if p_role is null or p_role not in ('bride_preparation','groom_preparation','ceremony','reception')
     or (p_operational_time is not null and p_operational_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
    raise exception using errcode='P0001', message='VALIDATION_ERROR';
  end if;
  v_expected := collaboration_private.validate_expected_version(p_expected_version);
  if v_actor is null or p_wedding_id is null
     or not public.wedding_collaboration_lock_users(array[v_actor])
     or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception using errcode='P0001', message='UNAVAILABLE';
  end if;
  select w.user_id,w.status into v_owner_id,v_wedding_status
  from public.weddings w where w.id=p_wedding_id for update;
  if not found or v_wedding_status<>'active' then raise exception using errcode='P0001', message='UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1330918916,1);
  select m.id into v_member_id from public.wedding_collaboration_memberships m
  where m.wedding_id=p_wedding_id and m.owner_user_id=v_owner_id
    and m.member_user_id=v_actor and m.status='active' for share;
  if not found then raise exception using errcode='P0001', message='UNAVAILABLE'; end if;
  if not collaboration_private.has_wedding_capability(p_wedding_id,'schedule.operational_time',2::smallint) then
    raise exception using errcode='P0001', message='FORBIDDEN';
  end if;

  select * into v_place from public.wedding_places p
  where p.wedding_id=p_wedding_id and p.role=p_role for update;
  v_has_place := found;
  if v_has_place then
    select ot.operational_time into v_override from public.wedding_operational_times ot
    where ot.wedding_id=p_wedding_id and ot.stop_key=v_place.id::text for update;
    v_has_override := found;
  elsif p_operational_time is not null then
    raise exception using errcode='P0001', message='UNAVAILABLE';
  end if;
  select v.version into v_current_version
  from collaboration_private.wedding_operational_versions v
  where v.wedding_id=p_wedding_id and v.resource_type='operational_time' and v.role=p_role
  for update;

  if p_operational_time is null and not v_has_override then
    v_changed := false;
  elsif v_has_override and v_override is not distinct from p_operational_time then
    v_changed := false;
  else
    if v_expected is distinct from v_current_version then
      raise exception using errcode='P0001', message='CONFLICT';
    end if;
    if p_operational_time is null then
      delete from public.wedding_operational_times
      where wedding_id=p_wedding_id and stop_key=v_place.id::text;
    else
      insert into public.wedding_operational_times(wedding_id,stop_key,operational_time)
      values(p_wedding_id,v_place.id::text,p_operational_time)
      on conflict(wedding_id,stop_key) do update set operational_time=excluded.operational_time;
    end if;
    v_changed := true;
  end if;

  select version into v_current_version from collaboration_private.wedding_operational_versions
  where wedding_id=p_wedding_id and resource_type='operational_time' and role=p_role;
  if v_has_place then
    select ot.operational_time into v_override from public.wedding_operational_times ot
    where ot.wedding_id=p_wedding_id and ot.stop_key=v_place.id::text;
    v_has_override := found;
  else
    v_override := null;
    v_has_override := false;
  end if;
  if v_has_override and v_override ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    v_effective := v_override; v_source := 'override';
  elsif p_role='ceremony' then
    select case when w.ceremony_time is not null
      and pg_catalog.to_char(w.ceremony_time,'HH24:MI') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then pg_catalog.to_char(w.ceremony_time,'HH24:MI') else null end
    into v_effective from public.weddings w where w.id=p_wedding_id;
    v_source := case when v_effective is null then 'none' else 'ceremony_fallback' end;
  else
    v_effective := null; v_source := 'none';
  end if;

  return pg_catalog.jsonb_build_object(
    'wedding_id',p_wedding_id,'role',p_role,'operational_time_override',case when v_has_override then v_override else null end,
    'effective_operational_time',v_effective,'time_source',v_source,
    'time_version',v_current_version::text,'changed',v_changed);
end;
$$;
create or replace function public.accept_wedding_collaboration_invite(p_invitation_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_peek public.wedding_collaboration_invitations%rowtype;
  v_connection public.collaboration_connections%rowtype; v_wedding public.weddings%rowtype;
  v_invite public.wedding_collaboration_invitations%rowtype; v_event public.wedding_collaboration_events%rowtype;
  v_membership public.wedding_collaboration_memberships%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into v_peek from public.wedding_collaboration_invitations where id=p_invitation_id;
  if not found or v_peek.invitee_user_id<>v_actor then raise exception 'invitation_unavailable' using errcode='P0001'; end if;
  if not public.wedding_collaboration_lock_users(array[v_peek.owner_user_id,v_actor])
    or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception 'invitation_unavailable' using errcode='P0001';
  end if;
  select * into v_event from public.wedding_collaboration_events e where e.actor_user_id=v_actor and e.idempotency_key=p_idempotency_key;
  if found then
    if v_event.invitation_id<>p_invitation_id or v_event.event_type not in
      ('invitation_accepted','invitation_expired','invitation_superseded','invitation_cancelled') then
      raise exception 'idempotency_key_reused' using errcode='P0001'; end if;
    if v_event.event_type='invitation_accepted' and not exists (
      select 1 from public.wedding_collaboration_invitations i
      join public.wedding_collaboration_memberships m
        on m.id=v_event.membership_id and m.accepted_invitation_id=i.id
      where i.id=p_invitation_id and i.invitee_user_id=v_actor and i.status='accepted'
        and m.member_user_id=v_actor
    ) then
      raise exception 'invitation_unavailable' using errcode='P0001';
    end if;
    return jsonb_build_object('status',case v_event.event_type when 'invitation_accepted' then 'accepted'
      when 'invitation_expired' then 'expired' when 'invitation_superseded' then 'superseded' else 'unavailable' end,
      'membership_id',v_event.membership_id,'duplicate',true);
  end if;
  if v_peek.status<>'pending' then raise exception 'invitation_unavailable' using errcode='P0001'; end if;
  select * into v_connection from public.collaboration_connections where id=v_peek.source_connection_id for update;
  select * into v_wedding from public.weddings where id=v_peek.wedding_id for update;
  select * into v_invite from public.wedding_collaboration_invitations where id=p_invitation_id for update;
  if not found then raise exception 'invitation_unavailable' using errcode='P0001'; end if;
  -- A concurrent replay can pass the initial event lookup before the winning
  -- transaction commits, then wait on the connection/wedding/invitation locks.
  -- Once it wakes, return the already-created period instead of reporting a
  -- spurious unavailable result or attempting a second membership insert.
  if v_invite.status='accepted' and v_invite.invitee_user_id=v_actor then
    select * into v_membership from public.wedding_collaboration_memberships m
      where m.accepted_invitation_id=v_invite.id and m.member_user_id=v_actor;
    if found then
      return jsonb_build_object('status','accepted','membership_id',v_membership.id,'duplicate',true);
    end if;
  end if;
  if v_invite.status<>'pending' then raise exception 'invitation_unavailable' using errcode='P0001'; end if;
  if v_wedding.id is null or v_wedding.user_id is distinct from v_invite.owner_user_id then
    update public.wedding_collaboration_invitations set status='cancelled',reason='wedding_deleted',
      cancelled_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_invite.id;
    insert into public.wedding_collaboration_events(wedding_id_snapshot,invitation_id,actor_user_id,event_type,reason)
      values(v_invite.wedding_id_snapshot,v_invite.id,v_actor,'invitation_cancelled','wedding_deleted');
    return jsonb_build_object('status','unavailable');
  end if;
  if v_invite.expires_at<=timezone('utc',now()) then
    update public.wedding_collaboration_invitations set status='expired',reason='expired',expired_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_invite.id;
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,actor_user_id,event_type,reason,idempotency_key)
      values(v_wedding.id,v_wedding.id,v_invite.id,v_actor,'invitation_expired','expired',p_idempotency_key);
    return jsonb_build_object('status','expired');
  end if;
  if v_invite.terms_version<>v_wedding.collaboration_terms_version then
    update public.wedding_collaboration_invitations set status='superseded',reason='commercial_terms_changed',superseded_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_invite.id;
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,actor_user_id,event_type,reason,idempotency_key)
      values(v_wedding.id,v_wedding.id,v_invite.id,v_actor,'invitation_superseded','commercial_terms_changed',p_idempotency_key);
    return jsonb_build_object('status','superseded');
  end if;
  if v_connection.id is null or v_connection.status<>'active'
     or v_actor not in(v_connection.participant_low_id,v_connection.participant_high_id)
     or v_invite.owner_user_id not in(v_connection.participant_low_id,v_connection.participant_high_id) then
    update public.wedding_collaboration_invitations set status='cancelled',reason='global_connection_ended',cancelled_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_invite.id;
    insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,actor_user_id,event_type,reason,idempotency_key,metadata)
      values(v_wedding.id,v_wedding.id,v_invite.id,v_actor,'invitation_cancelled','global_connection_ended',p_idempotency_key,'{"system":true}'::jsonb);
    return jsonb_build_object('status','unavailable');
  end if;
  update public.wedding_collaboration_invitations set status='accepted',accepted_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=v_invite.id;
  insert into public.wedding_collaboration_memberships(wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,
    accepted_invitation_id,status,accepted_at,role_key,custom_role_label,access_mode,access_version)
  values(v_wedding.id,v_wedding.id,v_invite.owner_user_id,v_actor,v_invite.id,'active',timezone('utc',now()),
    case when v_invite.access_configuration_version=0 then 'unspecified' else v_invite.role_key end,
    case when v_invite.access_configuration_version=0 then null else v_invite.custom_role_label end,
    case when v_invite.access_configuration_version=0 then 'custom' else v_invite.access_mode end,1)
  returning * into v_membership;
  if v_invite.access_configuration_version=0 then
    insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
    values (v_membership.id,'wedding.identity',1),
      (v_membership.id,'places.address',2),
      (v_membership.id,'schedule.operational_time',2);
  elsif v_invite.access_configuration_version=1 then
    if v_invite.access_mode in ('viewer','editor') and exists (
      select 1 from collaboration_private.invitation_permission_grants g where g.invitation_id=v_invite.id
    ) then raise exception using errcode='P0001', message='VALIDATION_ERROR'; end if;
    if exists (
      select 1 from collaboration_private.invitation_permission_grants g
      join collaboration_private.capability_registry c using(capability_key)
      where g.invitation_id=v_invite.id and (not c.active or not c.grantable or c.owner_only)
    ) then raise exception using errcode='P0001', message='VALIDATION_ERROR'; end if;
    insert into collaboration_private.membership_permission_grants(membership_id,capability_key,level)
      select v_membership.id,g.capability_key,g.level
      from collaboration_private.invitation_permission_grants g where g.invitation_id=v_invite.id;
  else
    raise exception using errcode='P0001', message='VALIDATION_ERROR';
  end if;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,invitation_id,membership_id,
    actor_user_id,event_type,idempotency_key,metadata)
  values(v_wedding.id,v_wedding.id,v_invite.id,v_membership.id,v_actor,'invitation_accepted',p_idempotency_key,
    jsonb_build_object('proposed_share_amount',v_invite.proposed_share_amount,'currency',v_invite.currency_snapshot));
  return jsonb_build_object('status','accepted','membership_id',v_membership.id,'duplicate',false);
end; $$;
create or replace function public.revoke_wedding_collaboration_membership(
  p_membership_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_wedding_id uuid;
  v_member_id uuid;
  v_membership public.wedding_collaboration_memberships%rowtype;
  v_event public.wedding_collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  if not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  select * into v_event
  from public.wedding_collaboration_events
  where actor_user_id=v_actor and idempotency_key=p_idempotency_key;
  if found then
    if v_event.event_type<>'membership_revoked' or v_event.membership_id<>p_membership_id then
      raise exception 'idempotency_key_reused' using errcode='P0001';
    end if;
    return pg_catalog.jsonb_build_object('status','revoked','duplicate',true);
  end if;

  select * into v_membership
  from public.wedding_collaboration_memberships
  where id=p_membership_id;
  if not found or v_membership.owner_user_id is distinct from v_actor
     or v_membership.status<>'active' or v_membership.wedding_id is null then
    raise exception 'membership_unavailable' using errcode='P0001';
  end if;
  v_wedding_id:=v_membership.wedding_id;
  v_member_id:=v_membership.member_user_id;

  if not public.wedding_collaboration_lock_users(array[v_actor,v_member_id])
     or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  -- Another request with the same key may have completed while this request
  -- waited for the canonical participant-user locks.
  select * into v_event
  from public.wedding_collaboration_events
  where actor_user_id=v_actor and idempotency_key=p_idempotency_key;
  if found then
    if v_event.event_type<>'membership_revoked' or v_event.membership_id<>p_membership_id then
      raise exception 'idempotency_key_reused' using errcode='P0001';
    end if;
    return pg_catalog.jsonb_build_object('status','revoked','duplicate',true);
  end if;

  perform 1 from public.weddings w
  where w.id=v_wedding_id for update;
  if not found then
    raise exception 'membership_unavailable' using errcode='P0001';
  end if;

  select * into v_membership
  from public.wedding_collaboration_memberships
  where id=p_membership_id for update;
  if not found or v_membership.owner_user_id is distinct from v_actor
     or v_membership.status<>'active'
     or v_membership.wedding_id is distinct from v_wedding_id
     or v_membership.member_user_id is distinct from v_member_id then
    raise exception 'membership_unavailable' using errcode='P0001';
  end if;

  update public.wedding_collaboration_memberships
  set status='revoked',revoked_at=pg_catalog.timezone('utc',pg_catalog.now()),
      access_version=access_version+1,updated_at=pg_catalog.timezone('utc',pg_catalog.now())
  where id=v_membership.id;
  insert into public.wedding_collaboration_events(
    wedding_id,wedding_id_snapshot,membership_id,actor_user_id,event_type,idempotency_key
  ) values (
    v_membership.wedding_id,v_membership.wedding_id_snapshot,v_membership.id,
    v_actor,'membership_revoked',p_idempotency_key
  );
  return pg_catalog.jsonb_build_object('status','revoked','duplicate',false);
end;
$$;
create or replace function public.leave_wedding_collaboration(p_membership_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_m public.wedding_collaboration_memberships%rowtype; v_e public.wedding_collaboration_events%rowtype;
begin
  if v_actor is null or p_idempotency_key is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not public.wedding_collaboration_lock_users(array[v_actor])
    or not public.wedding_collaboration_actor_is_eligible(v_actor) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into v_e from public.wedding_collaboration_events where actor_user_id=v_actor and idempotency_key=p_idempotency_key;
  if found then if v_e.event_type<>'membership_left' or v_e.membership_id<>p_membership_id then raise exception 'idempotency_key_reused' using errcode='P0001'; end if; return jsonb_build_object('status','left','duplicate',true); end if;
  select * into v_m from public.wedding_collaboration_memberships where id=p_membership_id for update;
  if not found or v_m.member_user_id<>v_actor or v_m.status<>'active' then raise exception 'membership_unavailable' using errcode='P0001'; end if;
  update public.wedding_collaboration_memberships set status='left',left_at=timezone('utc',now()),access_version=access_version+1,updated_at=timezone('utc',now()) where id=v_m.id;
  insert into public.wedding_collaboration_events(wedding_id,wedding_id_snapshot,membership_id,actor_user_id,event_type,idempotency_key)
    values(v_m.wedding_id,v_m.wedding_id_snapshot,v_m.id,v_actor,'membership_left',p_idempotency_key);
  return jsonb_build_object('status','left','duplicate',false);
end; $$;

revoke all on function collaboration_private.resolve_wedding_actor_access(uuid) from public,anon,authenticated,service_role;
revoke all on function collaboration_private.effective_wedding_capability_level(uuid,text) from public,anon,authenticated,service_role;
revoke all on function collaboration_private.has_wedding_capability(uuid,text,smallint) from public,anon,authenticated,service_role;

revoke all on function public.get_my_wedding_access_context(uuid) from public,anon;
grant execute on function public.get_my_wedding_access_context(uuid) to authenticated;
revoke all on function public.list_my_collaborative_weddings(date,uuid,integer) from public,anon;
revoke all on function public.get_collaborative_wedding_detail(uuid) from public,anon;
revoke all on function public.get_collaborative_wedding_operational_edit_state(uuid) from public,anon;
revoke all on function public.update_collaborative_wedding_place(uuid,text,text,text) from public,anon;
revoke all on function public.update_collaborative_operational_time(uuid,text,text,text) from public,anon;
grant execute on function public.list_my_collaborative_weddings(date,uuid,integer) to authenticated;
grant execute on function public.get_collaborative_wedding_detail(uuid) to authenticated;
grant execute on function public.get_collaborative_wedding_operational_edit_state(uuid) to authenticated;
grant execute on function public.update_collaborative_wedding_place(uuid,text,text,text) to authenticated;
grant execute on function public.update_collaborative_operational_time(uuid,text,text,text) to authenticated;

do $postflight$
declare
  v_active bigint;
  v_exact bigint;
begin
  select count(*) into v_active from public.wedding_collaboration_memberships where status='active';
  select count(*) into v_exact from public.wedding_collaboration_memberships m
    where m.status='active' and m.role_key='unspecified' and m.custom_role_label is null
      and m.access_mode='custom' and m.access_version=1
      and (select count(*) from collaboration_private.membership_permission_grants g where g.membership_id=m.id)=3
      and exists(select 1 from collaboration_private.membership_permission_grants g where g.membership_id=m.id and g.capability_key='wedding.identity' and g.level=1)
      and exists(select 1 from collaboration_private.membership_permission_grants g where g.membership_id=m.id and g.capability_key='places.address' and g.level=2)
      and exists(select 1 from collaboration_private.membership_permission_grants g where g.membership_id=m.id and g.capability_key='schedule.operational_time' and g.level=2);
  if v_active<>v_exact then raise exception 'COLLABORATION_1C_E_BACKFILL_MISMATCH'; end if;
  if exists(select 1 from public.wedding_collaboration_memberships m
      join collaboration_private.membership_permission_grants g on g.membership_id=m.id
      where m.status<>'active') then raise exception 'COLLABORATION_1C_E_INACTIVE_GRANT'; end if;
  if exists(select 1 from public.wedding_collaboration_invitations
      where access_configuration_version<>0 or role_key is not null or custom_role_label is not null
       or access_mode is not null or permission_group_mapping_version is not null) then
    raise exception 'COLLABORATION_1C_E_INVITATION_BACKFILL_MISMATCH';
  end if;
  if exists(
    select 1 from _collaboration_1ce_membership_snapshot s
    full join (select id,pg_catalog.to_jsonb(m)-array['role_key','custom_role_label','access_mode','access_version'] as snapshot
      from public.wedding_collaboration_memberships m) c using(id)
    where s.id is null or c.id is null or s.snapshot is distinct from c.snapshot
  ) then raise exception 'COLLABORATION_1C_E_MEMBERSHIP_LIFECYCLE_CHANGED'; end if;
  if exists(
    select 1 from _collaboration_1ce_invitation_snapshot s
    full join (select id,pg_catalog.to_jsonb(i)-array['access_configuration_version','role_key',
      'custom_role_label','access_mode','permission_group_mapping_version'] as snapshot
      from public.wedding_collaboration_invitations i) c using(id)
    where s.id is null or c.id is null or s.snapshot is distinct from c.snapshot
  ) then raise exception 'COLLABORATION_1C_E_INVITATION_LIFECYCLE_CHANGED'; end if;
  if exists(
    select 1 from _collaboration_1ce_event_snapshot s
    full join (select id,pg_catalog.to_jsonb(e) as snapshot from public.wedding_collaboration_events e) c using(id)
    where s.id is null or c.id is null or s.snapshot is distinct from c.snapshot
  ) then raise exception 'COLLABORATION_1C_E_EVENT_HISTORY_CHANGED'; end if;
  if exists(
    select 1 from _collaboration_1ce_operational_version_snapshot s
    full join collaboration_private.wedding_operational_versions v
      using(wedding_id,resource_type,role,version)
    where s.wedding_id is null or v.wedding_id is null
  ) then raise exception 'COLLABORATION_1C_E_OPERATIONAL_VERSIONS_CHANGED'; end if;
end;
$postflight$;

commit;
