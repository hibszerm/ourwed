-- Collaboration 1C-D: narrowly controlled address and operational-time writes.
-- Direct table ACL/RLS is intentionally unchanged; collaborators use RPCs only.
begin;

lock table public.wedding_places, public.wedding_operational_times
  in share row exclusive mode;

create schema if not exists collaboration_private;
revoke all on schema collaboration_private from public, anon, authenticated, service_role;

create table collaboration_private.wedding_operational_versions (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  resource_type text not null check (resource_type in ('place_address','operational_time')),
  role text not null check (role in ('bride_preparation','groom_preparation','ceremony','reception')),
  version bigint not null check (version > 0),
  primary key (wedding_id, resource_type, role)
);
alter table collaboration_private.wedding_operational_versions enable row level security;
alter table collaboration_private.wedding_operational_versions force row level security;
revoke all on collaboration_private.wedding_operational_versions from public, anon, authenticated, service_role;

alter table public.wedding_places
  add column updated_by_user_id uuid references public.users(id) on delete set null,
  add column updated_source text not null default 'system'
    check (updated_source in ('owner','collaborator','system'));
alter table public.wedding_operational_times
  add column updated_by_user_id uuid references public.users(id) on delete set null,
  add column updated_source text not null default 'system'
    check (updated_source in ('owner','collaborator','system'));

insert into collaboration_private.wedding_operational_versions(wedding_id,resource_type,role,version)
select wedding_id, 'place_address', role, 1
from public.wedding_places
where role in ('bride_preparation','groom_preparation','ceremony','reception')
on conflict do nothing;

insert into collaboration_private.wedding_operational_versions(wedding_id,resource_type,role,version)
select distinct ot.wedding_id, 'operational_time', wp.role, 1
from public.wedding_operational_times ot
join public.wedding_places wp
  on wp.wedding_id=ot.wedding_id and wp.id::text=ot.stop_key
where wp.role in ('bride_preparation','groom_preparation','ceremony','reception')
on conflict do nothing;

create function collaboration_private.lock_operational_mutations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(1330918916, 1);
  return null;
end;
$$;

create trigger wedding_places_1cd_statement_lock
  before insert or update or delete on public.wedding_places
  for each statement execute function collaboration_private.lock_operational_mutations();
create trigger wedding_operational_times_1cd_statement_lock
  before insert or update or delete on public.wedding_operational_times
  for each statement execute function collaboration_private.lock_operational_mutations();

-- A user-row lock is acquired first because contract recovery and lifecycle
-- notifications can touch the same public.users row. Then take the extra
-- mutation barrier before PostgreSQL locks any wedding row. Account erasure
-- already holds its target user row and the barrier before it deletes weddings.
create function collaboration_private.lock_operational_wedding_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is not null then
    perform 1
    from public.users u
    where u.id in (
      select v_actor
      union
      select m.member_user_id
      from public.weddings w
      join public.wedding_collaboration_memberships m on m.wedding_id=w.id
      where w.user_id=v_actor and m.status='active'
      union
      select i.invitee_user_id
      from public.weddings w
      join public.wedding_collaboration_invitations i on i.wedding_id=w.id
      where w.user_id=v_actor and i.status='pending'
    )
    order by u.id
    for update;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ourwed:wedding-extra-mutation',0));
  return null;
end;
$$;
create trigger a_wedding_1cd_operational_delete_lock
  before delete on public.weddings
  for each statement execute function collaboration_private.lock_operational_wedding_delete();

-- Keep the O barrier at row scope, after the wedding row lock. The statement
-- trigger above has already acquired the user and E barriers in recovery order.
create function collaboration_private.lock_operational_wedding_delete_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(1330918916, 1);
  return old;
end;
$$;
create trigger b_wedding_1cd_operational_delete_lock
  before delete on public.weddings
  for each row execute function collaboration_private.lock_operational_wedding_delete_row();

create function collaboration_private.set_operational_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wedding_id uuid;
  v_owner_id uuid;
  v_actor uuid := auth.uid();
begin
  v_wedding_id := case when tg_op='DELETE' then old.wedding_id else new.wedding_id end;
  select w.user_id into v_owner_id from public.weddings w where w.id=v_wedding_id;

  if v_actor is null then
    new.updated_by_user_id := null;
    new.updated_source := 'system';
  elsif v_actor=v_owner_id then
    new.updated_by_user_id := v_actor;
    new.updated_source := 'owner';
  elsif exists (
    select 1 from public.wedding_collaboration_memberships m
    where m.wedding_id=v_wedding_id and m.owner_user_id=v_owner_id
      and m.member_user_id=v_actor and m.status='active'
  ) then
    new.updated_by_user_id := v_actor;
    new.updated_source := 'collaborator';
  else
    raise exception using errcode='42501', message='COLLABORATION_WRITE_FORBIDDEN';
  end if;

  new.updated_at := pg_catalog.timezone('utc', pg_catalog.now());
  return new;
end;
$$;

drop trigger if exists wedding_places_set_updated_at on public.wedding_places;
drop trigger if exists wedding_operational_times_set_updated_at on public.wedding_operational_times;
create trigger wedding_places_1cd_metadata
  before insert or update on public.wedding_places
  for each row execute function collaboration_private.set_operational_metadata();
create trigger wedding_operational_times_1cd_metadata
  before insert or update on public.wedding_operational_times
  for each row execute function collaboration_private.set_operational_metadata();

create function collaboration_private.advance_operational_version(
  p_wedding_id uuid,
  p_resource_type text,
  p_role text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version bigint;
begin
  if p_wedding_id is null or p_resource_type not in ('place_address','operational_time')
     or p_role not in ('bride_preparation','groom_preparation','ceremony','reception') then
    raise exception using errcode='22023', message='COLLABORATION_VERSION_KEY_INVALID';
  end if;

  insert into collaboration_private.wedding_operational_versions(wedding_id,resource_type,role,version)
  values (p_wedding_id,p_resource_type,p_role,1)
  on conflict (wedding_id,resource_type,role) do nothing
  returning version into v_version;
  if found then return v_version; end if;

  select version into v_version
  from collaboration_private.wedding_operational_versions
  where wedding_id=p_wedding_id and resource_type=p_resource_type and role=p_role
  for update;
  if not found then
    raise exception using errcode='P0001', message='COLLABORATION_VERSION_UNAVAILABLE';
  end if;
  if v_version=9223372036854775807 then
    raise exception using errcode='22003', message='COLLABORATION_VERSION_EXHAUSTED';
  end if;
  update collaboration_private.wedding_operational_versions
  set version=v_version+1
  where wedding_id=p_wedding_id and resource_type=p_resource_type and role=p_role
  returning version into v_version;
  return v_version;
end;
$$;

create function collaboration_private.maintain_place_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  if tg_op='INSERT' then
    if new.role in ('bride_preparation','groom_preparation','ceremony','reception')
       and exists(select 1 from public.weddings w where w.id=new.wedding_id) then
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_address',new.role);
    end if;
    return new;
  elsif tg_op='DELETE' then
    select exists(select 1 from public.weddings w where w.id=old.wedding_id) into v_exists;
    if v_exists and old.role in ('bride_preparation','groom_preparation','ceremony','reception') then
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_address',old.role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'operational_time',old.role);
    end if;
    return old;
  end if;

  if old.wedding_id is distinct from new.wedding_id then
    if old.role in ('bride_preparation','groom_preparation','ceremony','reception')
       and exists(select 1 from public.weddings w where w.id=old.wedding_id) then
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_address',old.role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'operational_time',old.role);
    end if;
    if new.role in ('bride_preparation','groom_preparation','ceremony','reception')
       and exists(select 1 from public.weddings w where w.id=new.wedding_id) then
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_address',new.role);
      perform collaboration_private.advance_operational_version(new.wedding_id,'operational_time',new.role);
    end if;
    return new;
  end if;

  if old.role is distinct from new.role then
    if old.role in ('bride_preparation','groom_preparation','ceremony','reception') then
      perform collaboration_private.advance_operational_version(old.wedding_id,'place_address',old.role);
      perform collaboration_private.advance_operational_version(old.wedding_id,'operational_time',old.role);
    end if;
    if new.role in ('bride_preparation','groom_preparation','ceremony','reception') then
      perform collaboration_private.advance_operational_version(new.wedding_id,'place_address',new.role);
      perform collaboration_private.advance_operational_version(new.wedding_id,'operational_time',new.role);
    end if;
  elsif new.role in ('bride_preparation','groom_preparation','ceremony','reception')
    and row(old.formatted_address,old.place_id,old.latitude,old.longitude)
      is distinct from row(new.formatted_address,new.place_id,new.latitude,new.longitude) then
    perform collaboration_private.advance_operational_version(new.wedding_id,'place_address',new.role);
  end if;
  return new;
end;
$$;
create trigger wedding_places_1cd_version_after
  after insert or update or delete on public.wedding_places
  for each row execute function collaboration_private.maintain_place_version();

create function collaboration_private.maintain_time_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_role text;
  v_new_role text;
  v_old_wedding_id uuid;
  v_new_wedding_id uuid;
begin
  if tg_op='UPDATE' and row(old.wedding_id,old.stop_key,old.operational_time)
      is not distinct from row(new.wedding_id,new.stop_key,new.operational_time) then
    return new;
  end if;
  if tg_op='UPDATE' or tg_op='DELETE' then
    v_old_wedding_id := old.wedding_id;
    select p.role into v_old_role from public.wedding_places p
    where p.wedding_id=v_old_wedding_id and p.id::text=old.stop_key
      and p.role in ('bride_preparation','groom_preparation','ceremony','reception');
  end if;
  if tg_op='INSERT' or tg_op='UPDATE' then
    v_new_wedding_id := new.wedding_id;
    select p.role into v_new_role from public.wedding_places p
    where p.wedding_id=v_new_wedding_id and p.id::text=new.stop_key
      and p.role in ('bride_preparation','groom_preparation','ceremony','reception');
  end if;
  if v_old_role is not null and exists(select 1 from public.weddings w where w.id=v_old_wedding_id) then
    perform collaboration_private.advance_operational_version(v_old_wedding_id,'operational_time',v_old_role);
  end if;
  if v_new_role is not null and exists(select 1 from public.weddings w where w.id=v_new_wedding_id)
     and (v_old_role is distinct from v_new_role or v_old_wedding_id is distinct from v_new_wedding_id) then
    perform collaboration_private.advance_operational_version(v_new_wedding_id,'operational_time',v_new_role);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger wedding_operational_times_1cd_version_after
  after insert or update or delete on public.wedding_operational_times
  for each row execute function collaboration_private.maintain_time_version();

create function collaboration_private.validate_expected_version(p_value text)
returns bigint
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_value bigint;
begin
  if p_value is null then return null; end if;
  if p_value='' or pg_catalog.regexp_replace(p_value,'[0123456789]','','g')<>'' then
    raise exception using errcode='P0001', message='VALIDATION_ERROR';
  end if;
  begin
    v_value := p_value::bigint;
  exception when others then
    raise exception using errcode='P0001', message='VALIDATION_ERROR';
  end;
  if v_value<=0 then raise exception using errcode='P0001', message='VALIDATION_ERROR'; end if;
  return v_value;
end;
$$;

create function public.get_collaborative_wedding_operational_edit_state(p_wedding_id uuid)
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

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'role',r.role,
      'formatted_address',coalesce(p.formatted_address,''),
      'address_version',av.version::text,
      'operational_time_override',ot.operational_time,
      'effective_operational_time',case
        when ot.operational_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then ot.operational_time
        when r.role='ceremony' then v_ceremony_time
        else null end,
      'time_source',case
        when ot.operational_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then 'override'
        when r.role='ceremony' and v_ceremony_time is not null then 'ceremony_fallback'
        else 'none' end,
      'time_version',tv.version::text
    ) order by r.ordinality
  ) into v_places
  from pg_catalog.unnest(array['bride_preparation','groom_preparation','ceremony','reception']::text[])
       with ordinality as r(role,ordinality)
  left join public.wedding_places p on p.wedding_id=p_wedding_id and p.role=r.role
  left join public.wedding_operational_times ot on ot.wedding_id=p_wedding_id and ot.stop_key=p.id::text
  left join collaboration_private.wedding_operational_versions av
    on av.wedding_id=p_wedding_id and av.resource_type='place_address' and av.role=r.role
  left join collaboration_private.wedding_operational_versions tv
    on tv.wedding_id=p_wedding_id and tv.resource_type='operational_time' and tv.role=r.role;

  return pg_catalog.jsonb_build_object('wedding_id',p_wedding_id,'places',coalesce(v_places,'[]'::jsonb));
end;
$$;

create function public.update_collaborative_wedding_place(
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

create function public.update_collaborative_operational_time(
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

-- This narrow invoker-safe helper locks only the authenticated recovery actor.
-- The shared lifecycle helper is intentionally not executable by client roles.
create function public.lock_contract_recovery_actor(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    return false;
  end if;
  perform 1 from public.users u where u.id=p_user_id for update;
  return found;
end;
$$;
revoke all on function public.lock_contract_recovery_actor(uuid) from public, anon, authenticated, service_role;
grant execute on function public.lock_contract_recovery_actor(uuid) to authenticated;

-- Lock-order-only active replacements. Business bodies and ACLs are copied from
-- the currently active migrations; only the approved domain barriers move.
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
  v_form_fields jsonb := '{}'::jsonb;
  v_form_values jsonb := '{}'::jsonb;
  v_form_instance_id uuid;
  v_first_name text;
  v_last_name text;
begin
  if v_uid is null then raise exception 'CONTRACT_RECOVERY_UNAUTHORIZED'; end if;
  if jsonb_typeof(coalesce(p_decisions, '[]'::jsonb)) <> 'array' then
    raise exception 'CONTRACT_RECOVERY_INVALID_DECISIONS';
  end if;
  if (select count(*) from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb))) <>
     (select count(distinct value->>'fieldKey') from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb))) then
    raise exception 'CONTRACT_RECOVERY_INVALID_DECISIONS';
  end if;

  -- Read-only preflight preserves the existing not-found/authorization error
  -- contract. The row is revalidated under FOR UPDATE after the domain locks.
  select * into v_recovery
  from public.wedding_contract_recoveries
  where id = p_recovery_id;
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

  if not public.lock_contract_recovery_actor(v_uid) then
    raise exception 'CONTRACT_RECOVERY_UNAUTHORIZED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ourwed:wedding-extra-mutation',0));

  select * into v_wedding
  from public.weddings
  where id = p_wedding_id and user_id = v_uid
  for update;
  if not found then raise exception 'CONTRACT_RECOVERY_UNAUTHORIZED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1330918916, 1);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('source-contract:' || p_wedding_id::text, 0));

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

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) d
    where d->>'action' = 'use_extracted'
      and d->>'fieldKey' in ('partner1.fullName','partner2.fullName')
      and exists (
        select 1 from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) part
        where part->>'action' = 'use_extracted'
          and part->>'fieldKey' = case d->>'fieldKey'
            when 'partner1.fullName' then 'partner1.firstName'
            else 'partner2.firstName' end
      )
  ) or exists (
    select 1 from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) d
    where d->>'action' = 'use_extracted'
      and d->>'fieldKey' in ('partner1.fullName','partner2.fullName')
      and exists (
        select 1 from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) part
        where part->>'action' = 'use_extracted'
          and part->>'fieldKey' = case d->>'fieldKey'
            when 'partner1.fullName' then 'partner1.lastName'
            else 'partner2.lastName' end
      )
  ) then
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
        when 'partner1.fullName' then
          v_patch := v_patch || jsonb_build_object('bride_name', v_value);
          v_first_name := split_part(btrim(v_value #>> '{}'), ' ', 1);
          v_last_name := case when position(' ' in btrim(v_value #>> '{}')) > 0
            then btrim(substr(btrim(v_value #>> '{}'), position(' ' in btrim(v_value #>> '{}')) + 1)) else '' end;
          v_form_fields := v_form_fields || jsonb_build_object('partner1.firstName', v_first_name, 'partner1.lastName', v_last_name);
          v_form_values := v_form_values || jsonb_build_object('q-p1-first', v_first_name, 'q-p1-last', v_last_name, 'sys_p1_first', v_first_name, 'sys_p1_last', v_last_name);
        when 'partner2.fullName' then
          v_patch := v_patch || jsonb_build_object('groom_name', v_value);
          v_first_name := split_part(btrim(v_value #>> '{}'), ' ', 1);
          v_last_name := case when position(' ' in btrim(v_value #>> '{}')) > 0
            then btrim(substr(btrim(v_value #>> '{}'), position(' ' in btrim(v_value #>> '{}')) + 1)) else '' end;
          v_form_fields := v_form_fields || jsonb_build_object('partner2.firstName', v_first_name, 'partner2.lastName', v_last_name);
          v_form_values := v_form_values || jsonb_build_object('q-p2-first', v_first_name, 'q-p2-last', v_last_name, 'sys_p2_first', v_first_name, 'sys_p2_last', v_last_name);
        when 'partner1.firstName' then
          v_form_fields := v_form_fields || jsonb_build_object('partner1.firstName', v_value);
          v_form_values := v_form_values || jsonb_build_object('q-p1-first', v_value, 'sys_p1_first', v_value);
        when 'partner1.lastName' then
          v_form_fields := v_form_fields || jsonb_build_object('partner1.lastName', v_value);
          v_form_values := v_form_values || jsonb_build_object('q-p1-last', v_value, 'sys_p1_last', v_value);
        when 'partner2.firstName' then
          v_form_fields := v_form_fields || jsonb_build_object('partner2.firstName', v_value);
          v_form_values := v_form_values || jsonb_build_object('q-p2-first', v_value, 'sys_p2_first', v_value);
        when 'partner2.lastName' then
          v_form_fields := v_form_fields || jsonb_build_object('partner2.lastName', v_value);
          v_form_values := v_form_values || jsonb_build_object('q-p2-last', v_value, 'sys_p2_last', v_value);
        when 'partner1.email' then
          v_patch := v_patch || jsonb_build_object('email', v_value);
          v_form_fields := v_form_fields || jsonb_build_object('partner1.email', v_value);
          v_form_values := v_form_values || jsonb_build_object('q-p1-email', v_value, 'sys_p1_email', v_value);
        when 'partner2.email' then
          v_form_fields := v_form_fields || jsonb_build_object('partner2.email', v_value);
          v_form_values := v_form_values || jsonb_build_object('q-p2-email', v_value, 'sys_p2_email', v_value);
        when 'partner1.phone' then
          v_patch := v_patch || jsonb_build_object('phone', v_value);
          v_form_fields := v_form_fields || jsonb_build_object('partner1.phone', v_value);
          v_form_values := v_form_values || jsonb_build_object('q-p1-phone', v_value, 'sys_p1_phone', v_value);
        when 'partner2.phone' then
          v_patch := v_patch || jsonb_build_object('groom_phone', v_value);
          v_form_fields := v_form_fields || jsonb_build_object('partner2.phone', v_value);
          v_form_values := v_form_values || jsonb_build_object('q-p2-phone', v_value, 'sys_p2_phone', v_value);
        when 'partner1.addressLine' then
          v_patch := v_patch || jsonb_build_object('contract_address', v_value);
          v_form_fields := v_form_fields || jsonb_build_object('partner1.address', v_value);
          v_form_values := v_form_values || jsonb_build_object('q-p1-address', v_value, 'sys_p1_address', v_value);
        when 'partner1.postalCode' then
          v_patch := v_patch || jsonb_build_object('contract_postal_code', v_value);
          v_form_fields := v_form_fields || jsonb_build_object('partner1.postalCode', v_value);
          v_form_values := v_form_values || jsonb_build_object('q-p1-postal', v_value);
        when 'partner1.city' then
          v_patch := v_patch || jsonb_build_object('contract_city', v_value);
          v_form_fields := v_form_fields || jsonb_build_object('partner1.city', v_value);
          v_form_values := v_form_values || jsonb_build_object('q-p1-city', v_value);
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

  if (v_form_fields ? 'partner1.firstName' or v_form_fields ? 'partner1.lastName')
     and not (v_patch ? 'bride_name') then
    v_first_name := coalesce(v_form_fields->>'partner1.firstName', split_part(btrim(coalesce(v_wedding.bride_name,'')), ' ', 1));
    v_last_name := coalesce(v_form_fields->>'partner1.lastName', case
      when position(' ' in btrim(coalesce(v_wedding.bride_name,''))) > 0
        then btrim(substr(btrim(coalesce(v_wedding.bride_name,'')), position(' ' in btrim(coalesce(v_wedding.bride_name,''))) + 1))
      else '' end);
    v_patch := v_patch || jsonb_build_object('bride_name', btrim(concat_ws(' ', nullif(v_first_name,''), nullif(v_last_name,''))));
  end if;
  if (v_form_fields ? 'partner2.firstName' or v_form_fields ? 'partner2.lastName')
     and not (v_patch ? 'groom_name') then
    v_first_name := coalesce(v_form_fields->>'partner2.firstName', split_part(btrim(coalesce(v_wedding.groom_name,'')), ' ', 1));
    v_last_name := coalesce(v_form_fields->>'partner2.lastName', case
      when position(' ' in btrim(coalesce(v_wedding.groom_name,''))) > 0
        then btrim(substr(btrim(coalesce(v_wedding.groom_name,'')), position(' ' in btrim(coalesce(v_wedding.groom_name,''))) + 1))
      else '' end);
    v_patch := v_patch || jsonb_build_object('groom_name', btrim(concat_ws(' ', nullif(v_first_name,''), nullif(v_last_name,''))));
  end if;

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

  if v_form_fields <> '{}'::jsonb then
    select fi.id into v_form_instance_id
    from public.form_instances fi
    join public.forms f on f.id = fi.form_id
    where fi.wedding_id = p_wedding_id
      and fi.user_id = v_uid
      and fi.status in ('submitted', 'approved')
      and f.category = 'contract'
    order by fi.submitted_at desc nulls last
    limit 1
    for update of fi;

    if v_form_instance_id is not null then
      update public.form_answers fa set answer_json =
        (case when jsonb_typeof(fa.answer_json) = 'object' then fa.answer_json else '{}'::jsonb end) || jsonb_build_object(
          'fields', case when jsonb_typeof(fa.answer_json->'fields') = 'object' then fa.answer_json->'fields' else '{}'::jsonb end || v_form_fields,
          'values', case when jsonb_typeof(fa.answer_json->'values') = 'object' then fa.answer_json->'values' else '{}'::jsonb end || v_form_values
        )
      where fa.instance_id = v_form_instance_id;
    end if;
  end if;

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

create or replace function public.public_submit_form_by_token(
  p_token text,
  p_answer_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
  instance_public jsonb;
  v_hash text;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    raise exception 'INVALID_TOKEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ourwed:wedding-extra-mutation',0));
  v_hash := encode(digest(convert_to(trim(p_token), 'UTF8'), 'sha256'), 'hex');

  select * into inst
  from public.form_instances
  where token_hash = v_hash
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

  selected_packages := array[]::text[];
  selected_extras := array[]::text[];

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

  if jsonb_typeof(p_answer_json->'fields'->'selectedAdditionalServiceIds') = 'array' then
    select coalesce(array_agg(elem), array[]::text[])
    into selected_extras
    from (
      select jsonb_array_elements_text(p_answer_json->'fields'->'selectedAdditionalServiceIds') as elem
    ) t
    where length(trim(elem)) > 0;
  end if;

  if inst.wedding_id is not null
     and selected_extras is not null
     and cardinality(selected_extras) > 0
     and snapshot is null then
    raise exception 'MISSING_TRUSTED_PRICE';
  end if;

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

    foreach id_item in array selected_packages loop
      if not (id_item = any (allowed_packages)) then
        raise exception 'INVALID_PACKAGE_ID';
      end if;
    end loop;

    foreach id_item in array selected_extras loop
      if not (id_item = any (allowed_extras)) then
        raise exception 'INVALID_EXTRA_SERVICE_ID';
      end if;
    end loop;
  elsif cardinality(selected_packages) > 0 then
    raise exception 'INVALID_PACKAGE_ID';
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

        select (e->>'price')::numeric
        into price_snap
        from jsonb_array_elements(
          coalesce(snapshot->'additionalServiceOptions', '[]'::jsonb)
        ) e
        where e->>'id' = id_item
          and e ? 'price'
          and nullif(trim(coalesce(e->>'price', '')), '') is not null
        limit 1;

        if price_snap is null then
          raise exception 'MISSING_TRUSTED_PRICE';
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
          price_snap,
          1
        );
      end loop;
    end if;

    select coalesce(sum(wes.price_snapshot * wes.quantity), 0)
    into extras_after
    from public.wedding_extra_services wes
    where wes.wedding_id = inst.wedding_id;

    -- package_base MAY BE NEGATIVE to preserve agreed contract_value
    package_base :=
      coalesce(current_value, 0)
      - coalesce(extras_before, 0)
      - coalesce(travel_fee, 0);
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

  instance_public := jsonb_build_object(
    'id', inst.id,
    'form_id', inst.form_id,
    'status', inst.status,
    'expires_at', inst.expires_at,
    'opened_at', inst.opened_at,
    'submitted_at', inst.submitted_at,
    'approved_at', inst.approved_at,
    'rejected_at', inst.rejected_at,
    'created_at', inst.created_at,
    'options_snapshot', inst.options_snapshot
  );

  return jsonb_build_object(
    'answer', jsonb_build_object(
      'id', answer_row.id,
      'instance_id', answer_row.instance_id,
      'answer_json', answer_row.answer_json,
      'created_at', answer_row.created_at
    ),
    'instance', instance_public
  );
end;
$$;
revoke all on function public.public_submit_form_by_token(text,jsonb) from public;
grant execute on function public.public_submit_form_by_token(text,jsonb) to anon, authenticated;

create or replace function public.erase_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_enabled_admin_count integer;
  v_locked_user_id uuid;
begin
  if p_user_id is null then
    raise exception 'erase_account_data: user id required';
  end if;

  v_role := coalesce(auth.role(), pg_catalog.current_setting('request.jwt.claim.role', true));
  if v_role is distinct from 'service_role' then
    raise exception 'erase_account_data: forbidden';
  end if;

  if exists (
    select 1
    from public.admin_members am
    where am.user_id = p_user_id
      and am.enabled is true
      and am.role = 'owner'
  ) then
    select count(*)::integer into v_enabled_admin_count
    from public.admin_members am
    where am.enabled is true;

    if v_enabled_admin_count <= 1 then
      raise exception 'erase_account_data: sole_admin_blocked'
        using errcode = 'P0001';
    end if;
  end if;

  select u.id into v_locked_user_id
  from public.users u
  where u.id = p_user_id;
  if not found then
    return pg_catalog.jsonb_build_object('ok', true, 'already_erased', true);
  end if;
  -- Match the wedding DELETE statement trigger: lock the owner and every
  -- pending/active collaboration participant in stable UUID order before E.
  -- This keeps notification FK checks from creating a user↔E cycle while
  -- wedding lifecycle rows are cleaned up.
  perform 1
  from public.users u
  where u.id in (
    select p_user_id
    union
    select m.member_user_id
    from public.weddings w
    join public.wedding_collaboration_memberships m on m.wedding_id=w.id
    where w.user_id=p_user_id and m.status='active'
    union
    select i.invitee_user_id
    from public.weddings w
    join public.wedding_collaboration_invitations i on i.wedding_id=w.id
    where w.user_id=p_user_id and i.status='pending'
  )
  order by u.id
  for update;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ourwed:wedding-extra-mutation',0));

  perform pg_catalog.set_config('ourwed.account_erasure', 'on', true);

  delete from public.form_answers fa
  using public.form_instances fi
  where fa.instance_id = fi.id
    and fi.user_id = p_user_id;

  delete from public.form_instances
  where user_id = p_user_id;

  delete from public.wedding_questionnaire_responses wqr
  using public.wedding_questionnaires wq
  where wqr.questionnaire_id = wq.id
    and (
      wq.owner_id = p_user_id
      or wq.wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id)
    );

  delete from public.wedding_questionnaires
  where owner_id = p_user_id
     or wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  delete from public.wedding_document_drafts
  where wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  delete from public.wedding_contract_generation_runs
  where wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  delete from public.wedding_documents
  where wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  delete from public.wedding_extra_services
  where wedding_id in (select w.id from public.weddings w where w.user_id = p_user_id);

  delete from public.weddings
  where user_id = p_user_id;

  delete from public.document_template_component_links l
  using public.document_template_versions tv
  join public.document_templates t on t.id = tv.template_id
  where l.template_version_id = tv.id
    and t.user_id = p_user_id;

  delete from public.document_template_component_links l
  using public.document_component_versions cv
  join public.document_components c on c.id = cv.component_id
  where l.component_version_id = cv.id
    and c.user_id = p_user_id;

  delete from public.document_block_conditions bc
  using public.document_blocks b
  join public.document_component_versions cv on cv.id = b.component_version_id
  join public.document_components c on c.id = cv.component_id
  where bc.block_id = b.id
    and c.user_id = p_user_id;

  delete from public.document_blocks b
  using public.document_component_versions cv
  join public.document_components c on c.id = cv.component_id
  where b.component_version_id = cv.id
    and c.user_id = p_user_id;

  delete from public.document_component_versions cv
  using public.document_components c
  where cv.component_id = c.id
    and c.user_id = p_user_id;

  update public.document_components
  set current_version_id = null
  where user_id = p_user_id;

  delete from public.document_components
  where user_id = p_user_id;

  delete from public.wedding_document_generation_sequences s
  using public.document_templates t
  where s.template_id = t.id
    and t.user_id = p_user_id;

  update public.document_templates
  set current_version_id = null,
      questionnaire_form_id = null
  where user_id = p_user_id;

  delete from public.document_template_versions tv
  using public.document_templates t
  where tv.template_id = t.id
    and t.user_id = p_user_id;

  delete from public.document_templates
  where user_id = p_user_id;

  delete from public.document_clause_defs
  where user_id = p_user_id;

  delete from public.forms
  where user_id = p_user_id;

  delete from public.package_items pi
  using public.packages p
  where pi.package_id = p.id
    and p.user_id = p_user_id;

  delete from public.packages
  where user_id = p_user_id;

  delete from public.extra_services
  where user_id = p_user_id;

  delete from public.session_payments sp
  using public.sessions s
  where sp.session_id = s.id
    and s.user_id = p_user_id;

  delete from public.sessions
  where user_id = p_user_id;

  delete from public.tasks
  where user_id = p_user_id;

  delete from public.notifications
  where user_id = p_user_id;

  delete from public.studio_travel_settings
  where user_id = p_user_id;

  delete from public.wedding_source_contracts
  where user_id = p_user_id;

  delete from public.wedding_contract_recoveries
  where user_id = p_user_id;

  delete from public.questionnaire_templates
  where owner_id = p_user_id;

  delete from public.account_subscriptions sub
  using public.billing_accounts ba
  where sub.billing_account_id = ba.id
    and ba.owner_user_id = p_user_id;

  delete from public.billing_accounts
  where owner_user_id = p_user_id;

  delete from public.account_deletion_rate_limits
  where user_id = p_user_id;

  -- Legal acceptance evidence (V1: erase with account; no separate retention store)
  delete from public.user_legal_acceptances
  where user_id = p_user_id;

  delete from public.users
  where id = p_user_id;

  return pg_catalog.jsonb_build_object('ok', true, 'already_erased', false);
end;
$$;
comment on function public.erase_account_data(uuid) is
  'Service-role only. Ordered CRM erasure for one account including user_legal_acceptances. Hardened search_path=''''. Sets ourwed.account_erasure for locked document DELETE. Blocks sole enabled admin owner. Idempotent if public.users already absent. Does not delete auth.users or Storage. Does not delete admin_audit_log.';
revoke all on function public.erase_account_data(uuid) from public;
revoke all on function public.erase_account_data(uuid) from anon;
revoke all on function public.erase_account_data(uuid) from authenticated;
grant execute on function public.erase_account_data(uuid) to service_role;

revoke all on function collaboration_private.lock_operational_mutations() from public, anon, authenticated, service_role;
revoke all on function collaboration_private.lock_operational_wedding_delete() from public, anon, authenticated, service_role;
revoke all on function collaboration_private.lock_operational_wedding_delete_row() from public, anon, authenticated, service_role;
revoke all on function collaboration_private.set_operational_metadata() from public, anon, authenticated, service_role;
revoke all on function collaboration_private.advance_operational_version(uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function collaboration_private.maintain_place_version() from public, anon, authenticated, service_role;
revoke all on function collaboration_private.maintain_time_version() from public, anon, authenticated, service_role;
revoke all on function collaboration_private.validate_expected_version(text) from public, anon, authenticated, service_role;

revoke all on function public.get_collaborative_wedding_operational_edit_state(uuid) from public, anon, authenticated;
revoke all on function public.update_collaborative_wedding_place(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.update_collaborative_operational_time(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.get_collaborative_wedding_operational_edit_state(uuid) to authenticated;
grant execute on function public.update_collaborative_wedding_place(uuid,text,text,text) to authenticated;
grant execute on function public.update_collaborative_operational_time(uuid,text,text,text) to authenticated;

comment on table collaboration_private.wedding_operational_versions is
  'Private durable tombstone generations for Collaboration 1C-D logical resources.';

-- ---------------------------------------------------------------------------
-- Travel freshness V1. All live route writes are optimistic and topology-bound.
-- ---------------------------------------------------------------------------

-- No wedding FK: deleting/recreating a wedding UUID must not reset the counter.
create table collaboration_private.wedding_route_input_versions (
  wedding_id uuid primary key,
  version bigint not null default 1 check (version > 0)
);
insert into collaboration_private.wedding_route_input_versions(wedding_id,version)
select id,1 from public.weddings on conflict do nothing;
alter table collaboration_private.wedding_route_input_versions enable row level security;
alter table collaboration_private.wedding_route_input_versions force row level security;
revoke all on collaboration_private.wedding_route_input_versions from public,anon,authenticated,service_role;

create table collaboration_private.studio_route_input_versions (
  user_id uuid primary key references public.users(id) on delete cascade,
  version bigint not null default 1 check (version > 0)
);
insert into collaboration_private.studio_route_input_versions(user_id,version)
select id,1 from public.users on conflict do nothing;
alter table collaboration_private.studio_route_input_versions enable row level security;
alter table collaboration_private.studio_route_input_versions force row level security;
revoke all on collaboration_private.studio_route_input_versions from public,anon,authenticated,service_role;

create function collaboration_private.ensure_wedding_route_input_version()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into collaboration_private.wedding_route_input_versions(wedding_id,version)
  values(new.id,1) on conflict(wedding_id) do nothing;
  return new;
end;
$$;
create trigger weddings_1cd_route_version_seed after insert on public.weddings
for each row execute function collaboration_private.ensure_wedding_route_input_version();

create function collaboration_private.advance_wedding_route_input_version(p_wedding_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_version bigint;
begin
  insert into collaboration_private.wedding_route_input_versions(wedding_id,version)
  values(p_wedding_id,1) on conflict(wedding_id) do nothing;
  select version into v_version from collaboration_private.wedding_route_input_versions
  where wedding_id=p_wedding_id for update;
  if v_version=9223372036854775807 then
    raise exception using errcode='22003',message='ROUTE_INPUT_VERSION_EXHAUSTED';
  end if;
  update collaboration_private.wedding_route_input_versions set version=version+1 where wedding_id=p_wedding_id;
  delete from public.travel_segments where wedding_id=p_wedding_id;
end;
$$;

-- Transition-table triggers advance once per affected wedding/statement. The
-- existing 1C-D O statement lock is already held before any source-row access.
create function collaboration_private.wedding_places_route_inserted()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  for v_id in select distinct wedding_id from new_route_places order by wedding_id loop
    perform collaboration_private.advance_wedding_route_input_version(v_id);
  end loop;
  return null;
end;
$$;
create function collaboration_private.wedding_places_route_deleted()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  for v_id in select distinct wedding_id from old_route_places order by wedding_id loop
    perform collaboration_private.advance_wedding_route_input_version(v_id);
  end loop;
  return null;
end;
$$;
create function collaboration_private.wedding_places_route_updated()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  for v_id in
    select distinct q.wedding_id from (
      select o.wedding_id from old_route_places o join new_route_places n using(id)
      where o.wedding_id is distinct from n.wedding_id or o.role is distinct from n.role
         or o.place_id is distinct from n.place_id or o.formatted_address is distinct from n.formatted_address
         or o.latitude is distinct from n.latitude or o.longitude is distinct from n.longitude
         or o.sort_order is distinct from n.sort_order
      union
      select n.wedding_id from old_route_places o join new_route_places n using(id)
      where o.wedding_id is distinct from n.wedding_id or o.role is distinct from n.role
         or o.place_id is distinct from n.place_id or o.formatted_address is distinct from n.formatted_address
         or o.latitude is distinct from n.latitude or o.longitude is distinct from n.longitude
         or o.sort_order is distinct from n.sort_order
    ) q order by q.wedding_id
  loop
    perform collaboration_private.advance_wedding_route_input_version(v_id);
  end loop;
  return null;
end;
$$;
create trigger wedding_places_1cd_route_insert after insert on public.wedding_places
referencing new table as new_route_places for each statement
execute function collaboration_private.wedding_places_route_inserted();
create trigger wedding_places_1cd_route_delete after delete on public.wedding_places
referencing old table as old_route_places for each statement
execute function collaboration_private.wedding_places_route_deleted();
create trigger wedding_places_1cd_route_update after update on public.wedding_places
referencing old table as old_route_places new table as new_route_places for each statement
execute function collaboration_private.wedding_places_route_updated();

create function collaboration_private.route_number_text(p_value numeric)
returns text language sql immutable set search_path=''
as $$
  select case when p_value is null then '' when pg_catalog.strpos(p_value::text,'.')>0
    then pg_catalog.rtrim(pg_catalog.rtrim(p_value::text,'0'),'.') else p_value::text end
$$;

-- Exact server-side counterpart of orderWeddingDayPlaces plus route stop/hash
-- construction. The snapshot returns the same raw rows to the existing TS logic.
create function collaboration_private.current_route_topology(p_wedding_id uuid,p_owner_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_studio jsonb:='{}'::jsonb; v_places jsonb:='[]'::jsonb; v_stops jsonb:='[]'::jsonb; v_legs jsonb:='[]'::jsonb; v_hash text;
begin
  select pg_catalog.to_jsonb(s)
    into v_studio from public.studio_travel_settings s where s.user_id=p_owner_id;
  v_studio:=coalesce(v_studio,'{}'::jsonb);
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',p.id,'wedding_id',p.wedding_id,'role',p.role,'label',p.label,'place_id',p.place_id,
    'formatted_address',p.formatted_address,'latitude',p.latitude,'longitude',p.longitude,
    'sort_order',p.sort_order,'created_at',p.created_at,'updated_at',p.updated_at)
    order by p.sort_order,p.created_at,p.id),'[]'::jsonb)
    into v_places from public.wedding_places p where p.wedding_id=p_wedding_id;

  with source_places as (
    select p.*,case when p.role='preparation' then 'bride_preparation' else p.role end as route_role
    from public.wedding_places p where p.wedding_id=p_wedding_id
  ), stats as (
    select count(*)::integer n,coalesce(bool_or(sort_order>=1000),false) operational,
      count(distinct sort_order)=count(*) unique_order,
      coalesce(bool_and(sort_order=case role when 'groom_preparation' then 10 when 'bride_preparation' then 15 when 'preparation' then 15 when 'ceremony' then 20 when 'reception' then 30 when 'hotel' then 40 when 'airport' then 50 when 'other' then 100 else 100 end),true) catalog_current,
      coalesce(bool_and(sort_order=case role when 'groom_preparation' then 15 when 'bride_preparation' then 10 when 'preparation' then 10 when 'ceremony' then 20 when 'reception' then 30 when 'hotel' then 40 when 'airport' then 50 when 'other' then 100 else 100 end),true) catalog_legacy
    from source_places
  ), route_mode as (
    select n>=2 and (operational or (unique_order and not catalog_current and not catalog_legacy)) is_custom from stats
  ), ranked as (
    select p.*,m.is_custom,
      pg_catalog.row_number() over(partition by p.route_role order by
        case when m.is_custom then p.sort_order end,case when m.is_custom then p.id::text end,
        case when not m.is_custom then p.sort_order end,case when not m.is_custom then p.created_at end,p.id) role_pick,
      case p.route_role when 'groom_preparation' then 1 when 'bride_preparation' then 2 when 'ceremony' then 3
        when 'reception' then 4 when 'hotel' then 5 when 'airport' then 6 else 7 end role_order
    from source_places p cross join route_mode m
  ), chosen as (select * from ranked where role_pick=1), eligible as (
    select * from chosen where latitude between -90 and 90 and longitude between -180 and 180
  ), ordered as (
    select *,pg_catalog.row_number() over(order by case when is_custom then sort_order end,
      case when is_custom then id::text end,case when not is_custom then role_order end,
      case when not is_custom then sort_order end,created_at,id) ord from eligible
  ), stops as (
    select 0::bigint ord,'studio'::text id,'studio'::text kind,'studio'::text role,
      v_studio->>'place_id' place_id,(v_studio->>'latitude')::numeric latitude,(v_studio->>'longitude')::numeric longitude
    where nullif(v_studio->>'latitude','') is not null and nullif(v_studio->>'longitude','') is not null
      and (v_studio->>'latitude')::numeric between -90 and 90 and (v_studio->>'longitude')::numeric between -180 and 180
    union all
    select ord-1+case when nullif(v_studio->>'latitude','') is not null and nullif(v_studio->>'longitude','') is not null
        and (v_studio->>'latitude')::numeric between -90 and 90 and (v_studio->>'longitude')::numeric between -180 and 180 then 1 else 0 end,
      id::text,'wedding_place',route_role,place_id,latitude,longitude from ordered
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',id,'kind',kind,'role',role,'place_id',place_id,'latitude',latitude,'longitude',longitude,'order',ord)
    order by ord),'[]'::jsonb) into v_stops from stops;

  with stops as (
    select value,ordinality ord,
      case when value->>'kind'='studio' then 'studio:'||coalesce(value->>'place_id','')||':'||
        collaboration_private.route_number_text((value->>'latitude')::numeric)||':'||collaboration_private.route_number_text((value->>'longitude')::numeric)
      else 'place:'||coalesce(value->>'id','')||':'||coalesce(value->>'place_id','')||':'||
        collaboration_private.route_number_text((value->>'latitude')::numeric)||':'||collaboration_private.route_number_text((value->>'longitude')::numeric) end endpoint_hash
    from pg_catalog.jsonb_array_elements(v_stops) with ordinality
  ), pairs as (
    select ord-1 sequence,value origin,pg_catalog.lead(value) over(order by ord) destination,
      endpoint_hash origin_hash,pg_catalog.lead(endpoint_hash) over(order by ord) destination_hash from stops
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('sequence',sequence,
    'origin_kind',origin->>'kind','origin_wedding_place_id',case when origin->>'kind'='studio' then null else origin->>'id' end,
    'destination_kind',destination->>'kind','destination_wedding_place_id',case when destination->>'kind'='studio' then null else destination->>'id' end,
    'endpoints_hash',origin_hash||'>'||destination_hash) order by sequence) filter(where destination is not null),'[]'::jsonb)
    into v_legs from pairs;
  v_hash:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('route_contract_version',1,'provider','google','travel_mode','DRIVE','stops',v_stops)::text,'UTF8'),'sha256'),'hex');
  return pg_catalog.jsonb_build_object('studio',v_studio,'places',v_places,'route_stops',v_stops,
    'route_topology',v_legs,'route_topology_token',v_hash);
end;
$$;

create function public.get_wedding_travel_route_snapshot(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_owner uuid; v_wedding_version bigint; v_origin_version bigint; v_topology jsonb;
begin
  if v_uid is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select user_id into v_owner from public.weddings where id=p_wedding_id;
  if not found or v_owner is distinct from v_uid then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select version into v_wedding_version from collaboration_private.wedding_route_input_versions where wedding_id=p_wedding_id;
  select version into v_origin_version from collaboration_private.studio_route_input_versions where user_id=v_owner;
  v_topology:=collaboration_private.current_route_topology(p_wedding_id,v_owner);
  return pg_catalog.jsonb_build_object('route_contract_version',1,
    'wedding_route_input_version',coalesce(v_wedding_version,1)::text,'studio_origin_version',coalesce(v_origin_version,1)::text,
    'provider','google','travel_mode','DRIVE','topology_token',v_topology->>'route_topology_token',
    'route_stops',v_topology->'route_stops','route_topology',v_topology->'route_topology',
    'studio',v_topology->'studio','places',v_topology->'places');
end;
$$;

create function public.replace_wedding_travel_segments_if_current(
  p_wedding_id uuid,p_route_contract_version integer,p_expected_wedding_route_input_version text,
  p_expected_studio_origin_version text,p_provider text,p_travel_mode text,p_topology_token text,p_segments jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid(); v_owner uuid; v_current jsonb; v_expected_wedding bigint; v_expected_origin bigint;
  v_current_wedding bigint; v_current_origin bigint; v_expected_count integer; v_count integer; v_bad boolean;
begin
  if v_uid is null or p_wedding_id is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_route_contract_version is distinct from 1 or p_provider is distinct from 'google' or p_travel_mode is distinct from 'DRIVE'
    or p_expected_wedding_route_input_version is null or p_expected_wedding_route_input_version !~ '^[1-9][0-9]*$'
    or p_expected_studio_origin_version is null or p_expected_studio_origin_version !~ '^[1-9][0-9]*$'
    or p_topology_token is null or p_topology_token !~ '^[0-9a-f]{64}$'
    or p_segments is null or pg_catalog.jsonb_typeof(p_segments) is distinct from 'array' then
    raise exception using errcode='P0001',message='ROUTE_SEGMENT_INVALID'; end if;
  begin
    v_expected_wedding:=p_expected_wedding_route_input_version::bigint;
    v_expected_origin:=p_expected_studio_origin_version::bigint;
  exception when others then raise exception using errcode='P0001',message='ROUTE_SEGMENT_INVALID'; end;
  perform 1 from public.users u where u.id=v_uid for key share;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select user_id into v_owner from public.weddings where id=p_wedding_id for update;
  if not found or v_owner is distinct from v_uid then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1330918916,1);
  select version into v_current_wedding from collaboration_private.wedding_route_input_versions where wedding_id=p_wedding_id for share;
  select version into v_current_origin from collaboration_private.studio_route_input_versions where user_id=v_owner for share;
  v_current:=collaboration_private.current_route_topology(p_wedding_id,v_owner);
  if p_route_contract_version<>1 or p_provider<>'google' or p_travel_mode<>'DRIVE'
    or v_expected_wedding is distinct from coalesce(v_current_wedding,1)
    or v_expected_origin is distinct from coalesce(v_current_origin,1)
    or p_topology_token is distinct from v_current->>'route_topology_token' then
    raise exception using errcode='P0001',message='STALE_ROUTE_INPUT'; end if;

  v_expected_count:=pg_catalog.jsonb_array_length(v_current->'route_topology');
  v_count:=pg_catalog.jsonb_array_length(p_segments);
  if v_count<>v_expected_count or (select count(distinct (s->>'sequence')::integer) from pg_catalog.jsonb_array_elements(p_segments) s)<>v_count
     or (v_count>0 and ((select min((s->>'sequence')::integer) from pg_catalog.jsonb_array_elements(p_segments) s)<>0
       or (select max((s->>'sequence')::integer) from pg_catalog.jsonb_array_elements(p_segments) s)<>v_count-1)) then
    raise exception using errcode='P0001',message='ROUTE_SEGMENT_INVALID'; end if;
  select exists(
    select 1 from pg_catalog.jsonb_array_elements(p_segments) with ordinality s(value,ord)
    left join pg_catalog.jsonb_array_elements(v_current->'route_topology') with ordinality t(value,ord) using(ord)
    where t.value is null or pg_catalog.jsonb_typeof(s.value)<>'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(s.value))<>16
      or not(s.value ?& array['wedding_id','sequence','origin_kind','origin_wedding_place_id','destination_kind','destination_wedding_place_id','endpoints_hash','distance_meters','distance_text','duration_seconds','duration_text','travel_mode','provider','status','error_message','calculated_at'])
      or s.value->>'wedding_id' is null or s.value->>'sequence' is null
      or s.value->>'status' is null or s.value->>'provider' is null or s.value->>'travel_mode' is null
      or (s.value->>'sequence')::integer<0
      or (s.value->>'wedding_id')::uuid is distinct from p_wedding_id
      or (s.value->>'sequence')::integer is distinct from (t.value->>'sequence')::integer
      or s.value->>'origin_kind' is distinct from t.value->>'origin_kind'
      or s.value->>'origin_wedding_place_id' is distinct from t.value->>'origin_wedding_place_id'
      or s.value->>'destination_kind' is distinct from t.value->>'destination_kind'
      or s.value->>'destination_wedding_place_id' is distinct from t.value->>'destination_wedding_place_id'
      or s.value->>'endpoints_hash' is distinct from t.value->>'endpoints_hash'
      or s.value->>'provider' is distinct from 'google' or s.value->>'travel_mode' is distinct from 'DRIVE'
      or s.value->>'status' not in ('ok','error') or pg_catalog.jsonb_typeof(s.value->'calculated_at') is distinct from 'string'
      or (s.value->>'calculated_at')::timestamptz is null
      or (s.value->>'status'='ok' and (pg_catalog.jsonb_typeof(s.value->'distance_meters') is distinct from 'number'
        or pg_catalog.jsonb_typeof(s.value->'duration_seconds') is distinct from 'number'
        or (s.value->>'distance_meters')::numeric<0 or (s.value->>'distance_meters')::numeric>2147483647
        or (s.value->>'duration_seconds')::numeric<0 or (s.value->>'duration_seconds')::numeric>2147483647
        or trunc((s.value->>'distance_meters')::numeric)<>(s.value->>'distance_meters')::numeric
        or trunc((s.value->>'duration_seconds')::numeric)<>(s.value->>'duration_seconds')::numeric
        or pg_catalog.jsonb_typeof(s.value->'distance_text') is distinct from 'string' or pg_catalog.jsonb_typeof(s.value->'duration_text') is distinct from 'string'
        or s.value->'error_message'<>'null'::jsonb))
      or (s.value->>'status'='error' and (s.value->'distance_meters'<>'null'::jsonb
        or s.value->'duration_seconds'<>'null'::jsonb or s.value->'distance_text'<>'null'::jsonb
        or s.value->'duration_text'<>'null'::jsonb or pg_catalog.jsonb_typeof(s.value->'error_message') is distinct from 'string'))
  ) into v_bad;
  if v_bad then raise exception using errcode='P0001',message='ROUTE_SEGMENT_INVALID'; end if;

  insert into public.travel_segments(wedding_id,sequence,origin_kind,origin_wedding_place_id,destination_kind,
    destination_wedding_place_id,endpoints_hash,distance_meters,distance_text,duration_seconds,duration_text,
    travel_mode,provider,status,error_message,calculated_at)
  select p_wedding_id,(s->>'sequence')::integer,s->>'origin_kind',nullif(s->>'origin_wedding_place_id','')::uuid,
    s->>'destination_kind',nullif(s->>'destination_wedding_place_id','')::uuid,s->>'endpoints_hash',
    nullif(s->>'distance_meters','null')::integer,s->>'distance_text',nullif(s->>'duration_seconds','null')::integer,
    s->>'duration_text','DRIVE','google',s->>'status',nullif(s->>'error_message','null'),(s->>'calculated_at')::timestamptz
  from pg_catalog.jsonb_array_elements(p_segments) s
  on conflict(wedding_id,sequence) do update set origin_kind=excluded.origin_kind,
    origin_wedding_place_id=excluded.origin_wedding_place_id,destination_kind=excluded.destination_kind,
    destination_wedding_place_id=excluded.destination_wedding_place_id,endpoints_hash=excluded.endpoints_hash,
    distance_meters=excluded.distance_meters,distance_text=excluded.distance_text,duration_seconds=excluded.duration_seconds,
    duration_text=excluded.duration_text,travel_mode='DRIVE',provider='google',status=excluded.status,
    error_message=excluded.error_message,calculated_at=excluded.calculated_at;
  delete from public.travel_segments ts where ts.wedding_id=p_wedding_id
    and not exists(select 1 from pg_catalog.jsonb_array_elements(p_segments) s where (s->>'sequence')::integer=ts.sequence);
  return pg_catalog.jsonb_build_object('status','ok','segments',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ts) order by ts.sequence)
    from public.travel_segments ts where ts.wedding_id=p_wedding_id),'[]'::jsonb));
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
  raise exception using errcode='P0001',message='ROUTE_SEGMENT_INVALID';
end;
$$;

-- Explicit owner invalidation is also a generation barrier, so an older
-- in-flight provider response cannot repopulate a cache the UI invalidated.
create function public.invalidate_wedding_travel_segments(p_wedding_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_owner uuid;
begin
  if v_uid is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  perform 1 from public.users u where u.id=v_uid for key share;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select user_id into v_owner from public.weddings where id=p_wedding_id for update;
  if not found or v_owner is distinct from v_uid then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1330918916,1);
  perform collaboration_private.advance_wedding_route_input_version(p_wedding_id);
end;
$$;

-- The single owner place command preserves create/edit/delete/reorder behavior
-- while preventing direct PostgREST mutations from bypassing O and generations.
create function public.mutate_owner_wedding_places(p_wedding_id uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_owner uuid; v_role text; v_place public.wedding_places%rowtype;
  v_address text; v_sort integer; v_max integer; v_custom boolean; v_rows jsonb; v_item jsonb; v_count integer; v_distinct integer; v_result jsonb;
begin
  if v_uid is null or p_wedding_id is null or p_action not in ('upsert','delete_role','insert_initial','reorder')
     or pg_catalog.jsonb_typeof(p_payload)<>'object' then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  perform 1 from public.users u where u.id=v_uid for key share;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select user_id into v_owner from public.weddings where id=p_wedding_id for update;
  if not found or v_owner is distinct from v_uid then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1330918916,1);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('source-contract:'||p_wedding_id::text,0));
  if p_action='upsert' then
    v_role:=p_payload->>'role';
    if v_role not in ('bride_preparation','groom_preparation','ceremony','reception','hotel','airport','other','preparation')
      or not(p_payload ? 'formatted_address') then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    v_address:=pg_catalog.btrim(coalesce(p_payload->>'formatted_address',''));
    if pg_catalog.char_length(v_address)>500 then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    select * into v_place from public.wedding_places p where p.wedding_id=p_wedding_id and p.role=v_role for update;
    if not found and v_role='bride_preparation' then
      select * into v_place from public.wedding_places p where p.wedding_id=p_wedding_id and p.role='preparation' for update;
    end if;
    if p_payload->>'has_location'='true' and (pg_catalog.jsonb_typeof(p_payload->'latitude') not in ('number','null') or pg_catalog.jsonb_typeof(p_payload->'longitude') not in ('number','null')) then
      raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    if p_payload->>'has_location'='true' and (
      nullif(p_payload->>'latitude','null')::numeric not between -90 and 90
      or nullif(p_payload->>'longitude','null')::numeric not between -180 and 180) then
      raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    if v_place.id is null then
      select coalesce(max(sort_order),0) into v_max from public.wedding_places where wedding_id=p_wedding_id;
      select exists(select 1 from public.wedding_places where wedding_id=p_wedding_id and sort_order>=1000)
        or (count(*)>=2 and count(distinct sort_order)=count(*) and
          not bool_and(sort_order=case role when 'groom_preparation' then 10 when 'bride_preparation' then 15 when 'preparation' then 15 when 'ceremony' then 20 when 'reception' then 30 when 'hotel' then 40 when 'airport' then 50 when 'other' then 100 else 100 end) and
          not bool_and(sort_order=case role when 'groom_preparation' then 15 when 'bride_preparation' then 10 when 'preparation' then 10 when 'ceremony' then 20 when 'reception' then 30 when 'hotel' then 40 when 'airport' then 50 when 'other' then 100 else 100 end))
        into v_custom from public.wedding_places where wedding_id=p_wedding_id;
      v_sort:=case when v_custom then greatest(v_max,0)+1000 else case v_role when 'groom_preparation' then 10 when 'bride_preparation' then 15 when 'preparation' then 15 when 'ceremony' then 20 when 'reception' then 30 when 'hotel' then 40 when 'airport' then 50 else 100 end end;
    else v_sort:=v_place.sort_order; end if;
    if v_place.id is not null then
      update public.wedding_places set
        role=case when v_role='bride_preparation' and v_place.role='preparation' then 'bride_preparation' else v_role end,
        label=case when p_payload->>'label_supplied'='true' then nullif(pg_catalog.btrim(p_payload->>'label'),'') else v_place.label end,
        formatted_address=coalesce(nullif(v_address,''),v_place.formatted_address),
        place_id=case when p_payload->>'has_location'='true' then nullif(p_payload->>'place_id','') else v_place.place_id end,
        latitude=case when p_payload->>'has_location'='true' then nullif(p_payload->>'latitude','null')::numeric else v_place.latitude end,
        longitude=case when p_payload->>'has_location'='true' then nullif(p_payload->>'longitude','null')::numeric else v_place.longitude end
      where id=v_place.id returning * into v_place;
      v_result:=pg_catalog.to_jsonb(v_place);
    else
      if v_address='' and coalesce(nullif(pg_catalog.btrim(p_payload->>'label'),''),'')='' then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
      insert into public.wedding_places(wedding_id,role,label,place_id,formatted_address,latitude,longitude,sort_order)
      values(p_wedding_id,v_role,nullif(pg_catalog.btrim(p_payload->>'label'),''),
        case when p_payload->>'has_location'='true' then nullif(p_payload->>'place_id','') end,v_address,
        case when p_payload->>'has_location'='true' then nullif(p_payload->>'latitude','null')::numeric end,
        case when p_payload->>'has_location'='true' then nullif(p_payload->>'longitude','null')::numeric end,v_sort)
      returning * into v_place;
      v_result:=pg_catalog.to_jsonb(v_place);
    end if;
    return v_result;
  elsif p_action='delete_role' then
    v_role:=p_payload->>'role';
    if v_role not in ('bride_preparation','groom_preparation','ceremony','reception','hotel','airport','other','preparation') then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    delete from public.wedding_places where wedding_id=p_wedding_id and role in (v_role,case when v_role='bride_preparation' then 'preparation' else v_role end);
    return pg_catalog.jsonb_build_object('deleted',true);
  elsif p_action='insert_initial' then
    v_rows:=p_payload->'places';
    if pg_catalog.jsonb_typeof(v_rows)<>'array' then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    for v_item in select value from pg_catalog.jsonb_array_elements(v_rows) loop
      v_role:=v_item->>'role';
      if v_role not in ('bride_preparation','groom_preparation','ceremony','reception','hotel','airport','other','preparation') or not(v_item ? 'formatted_address') then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
      insert into public.wedding_places(wedding_id,role,label,place_id,formatted_address,latitude,longitude,sort_order)
      values(p_wedding_id,v_role,nullif(v_item->>'label',''),nullif(v_item->>'place_id',''),coalesce(v_item->>'formatted_address',''),
        nullif(v_item->>'latitude','null')::numeric,nullif(v_item->>'longitude','null')::numeric,
        case v_role when 'groom_preparation' then 10 when 'bride_preparation' then 15 when 'preparation' then 15 when 'ceremony' then 20 when 'reception' then 30 when 'hotel' then 40 when 'airport' then 50 else 100 end);
    end loop;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by p.sort_order,p.created_at,p.id),'[]'::jsonb) into v_result from public.wedding_places p where p.wedding_id=p_wedding_id;
    return v_result;
  else
    v_rows:=p_payload->'ordered_place_ids';
    if pg_catalog.jsonb_typeof(v_rows)<>'array' then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    select count(*),count(distinct value) into v_count,v_distinct from pg_catalog.jsonb_array_elements_text(v_rows);
    if v_count<>(select count(*) from public.wedding_places where wedding_id=p_wedding_id) or v_count<>v_distinct
       or exists(select 1 from pg_catalog.jsonb_array_elements_text(v_rows) x(value) where not exists(select 1 from public.wedding_places p where p.wedding_id=p_wedding_id and p.id::text=x.value)) then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    update public.wedding_places p set sort_order=1000+(x.ord-1)*1000
      from pg_catalog.jsonb_array_elements_text(v_rows) with ordinality x(value,ord)
      where p.wedding_id=p_wedding_id and p.id::text=x.value;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by p.sort_order,p.created_at,p.id),'[]'::jsonb) into v_result from public.wedding_places p where p.wedding_id=p_wedding_id;
    return v_result;
  end if;
end;
$$;

create function public.upsert_studio_travel_settings_guarded(p_settings jsonb,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_old public.studio_travel_settings%rowtype; v_new public.studio_travel_settings%rowtype;
  v_ids uuid[]:='{}'; v_id uuid; v_changed boolean:=false; v_version bigint; v_found boolean;
begin
  if v_uid is null or (not p_delete and pg_catalog.jsonb_typeof(p_settings)<>'object') then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  perform 1 from public.users u where u.id=v_uid for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  for v_id in select id from public.weddings where user_id=v_uid order by id for update loop v_ids:=pg_catalog.array_append(v_ids,v_id); end loop;
  if pg_catalog.cardinality(v_ids)>0 then perform pg_catalog.pg_advisory_xact_lock(1330918916,1); end if;
  select * into v_old from public.studio_travel_settings where user_id=v_uid for update;
  v_found:=found;
  if p_delete then
    if v_found then v_changed:=true; delete from public.studio_travel_settings where user_id=v_uid; end if;
  else
    if not(p_settings ?& array['studio_name','street','building_number','postal_code','city','country','formatted_address','latitude','longitude','place_id','free_distance_km']) then raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    if pg_catalog.jsonb_typeof(p_settings->'latitude') not in ('number','null')
      or pg_catalog.jsonb_typeof(p_settings->'longitude') not in ('number','null')
      or nullif(p_settings->>'latitude','null')::numeric not between -90 and 90
      or nullif(p_settings->>'longitude','null')::numeric not between -180 and 180 then
      raise exception using errcode='P0001',message='VALIDATION_ERROR'; end if;
    v_changed:=not v_found or v_old.place_id is distinct from nullif(p_settings->>'place_id','')
      or v_old.latitude is distinct from nullif(p_settings->>'latitude','null')::numeric
      or v_old.longitude is distinct from nullif(p_settings->>'longitude','null')::numeric;
    insert into public.studio_travel_settings(user_id,studio_name,street,building_number,postal_code,city,country,formatted_address,latitude,longitude,place_id,free_distance_km)
    values(v_uid,nullif(p_settings->>'studio_name',''),nullif(p_settings->>'street',''),nullif(p_settings->>'building_number',''),nullif(p_settings->>'postal_code',''),nullif(p_settings->>'city',''),coalesce(nullif(p_settings->>'country',''),'Polska'),nullif(p_settings->>'formatted_address',''),nullif(p_settings->>'latitude','null')::numeric,nullif(p_settings->>'longitude','null')::numeric,nullif(p_settings->>'place_id',''),nullif(p_settings->>'free_distance_km','null')::numeric)
    on conflict(user_id) do update set studio_name=excluded.studio_name,street=excluded.street,building_number=excluded.building_number,postal_code=excluded.postal_code,city=excluded.city,country=excluded.country,formatted_address=excluded.formatted_address,latitude=excluded.latitude,longitude=excluded.longitude,place_id=excluded.place_id,free_distance_km=excluded.free_distance_km returning * into v_new;
  end if;
  if v_changed then
    insert into collaboration_private.studio_route_input_versions(user_id,version) values(v_uid,1) on conflict(user_id) do nothing;
    select version into v_version from collaboration_private.studio_route_input_versions where user_id=v_uid for update;
    if v_version=9223372036854775807 then raise exception using errcode='22003',message='ROUTE_INPUT_VERSION_EXHAUSTED'; end if;
    update collaboration_private.studio_route_input_versions set version=version+1 where user_id=v_uid;
    if pg_catalog.cardinality(v_ids)>0 then delete from public.travel_segments where wedding_id=any(v_ids); end if;
  end if;
  return case when p_delete then pg_catalog.jsonb_build_object('deleted',true) else pg_catalog.to_jsonb(v_new) end;
end;
$$;

-- Revoke locks both participant users before the wedding. Its event insert
-- creates a notification for the collaborator, whose user FK otherwise
-- inverted operational commands' user -> wedding order.
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
      updated_at=pg_catalog.timezone('utc',pg_catalog.now())
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

-- Direct authenticated writes would bypass route generations and parent-first
-- serialization. Owner reads and all unrelated RLS remain unchanged.
revoke insert,update,delete on public.wedding_places from authenticated;
revoke insert,update,delete on public.studio_travel_settings from authenticated;
revoke insert,update,delete on public.travel_segments from authenticated;
drop policy if exists travel_segments_insert_own on public.travel_segments;
drop policy if exists travel_segments_update_own on public.travel_segments;
drop policy if exists travel_segments_delete_own on public.travel_segments;

revoke all on function collaboration_private.ensure_wedding_route_input_version() from public,anon,authenticated,service_role;
revoke all on function collaboration_private.advance_wedding_route_input_version(uuid) from public,anon,authenticated,service_role;
revoke all on function collaboration_private.wedding_places_route_inserted() from public,anon,authenticated,service_role;
revoke all on function collaboration_private.wedding_places_route_deleted() from public,anon,authenticated,service_role;
revoke all on function collaboration_private.wedding_places_route_updated() from public,anon,authenticated,service_role;
revoke all on function collaboration_private.route_number_text(numeric) from public,anon,authenticated,service_role;
revoke all on function collaboration_private.current_route_topology(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_wedding_travel_route_snapshot(uuid) from public,anon;
revoke all on function public.replace_wedding_travel_segments_if_current(uuid,integer,text,text,text,text,text,jsonb) from public,anon;
revoke all on function public.mutate_owner_wedding_places(uuid,text,jsonb) from public,anon;
revoke all on function public.upsert_studio_travel_settings_guarded(jsonb,boolean) from public,anon;
revoke all on function public.invalidate_wedding_travel_segments(uuid) from public,anon;
grant execute on function public.get_wedding_travel_route_snapshot(uuid) to authenticated;
grant execute on function public.replace_wedding_travel_segments_if_current(uuid,integer,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.mutate_owner_wedding_places(uuid,text,jsonb) to authenticated;
grant execute on function public.upsert_studio_travel_settings_guarded(jsonb,boolean) to authenticated;
grant execute on function public.invalidate_wedding_travel_segments(uuid) to authenticated;

commit;
