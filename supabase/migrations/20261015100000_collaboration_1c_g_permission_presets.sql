-- Collaboration 1C-G: reusable, non-authoritative permission snapshots.
begin;

create table collaboration_private.permission_presets (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('system','user')),
  owner_user_id uuid references public.users(id) on delete cascade,
  system_key text,
  name text not null check (name=pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 1 and 80 and name !~ '[[:cntrl:]]'),
  description text check (description is null or
    (description=pg_catalog.btrim(description) and pg_catalog.char_length(description)<=240
      and description !~ '[[:cntrl:]]')),
  version bigint not null default 1 check (version>0),
  archived_at timestamptz,
  created_at timestamptz not null default pg_catalog.timezone('utc',pg_catalog.now()),
  updated_at timestamptz not null default pg_catalog.timezone('utc',pg_catalog.now()),
  constraint permission_presets_scope_owner_key_check check (
    (scope='system' and owner_user_id is null and system_key is not null
      and system_key ~ '^[a-z][a-z0-9_]*$' and archived_at is null)
    or (scope='user' and owner_user_id is not null and system_key is null)
  )
);

create unique index permission_presets_system_key_uidx
  on collaboration_private.permission_presets(system_key) where scope='system';
create index permission_presets_user_active_updated_idx
  on collaboration_private.permission_presets(owner_user_id,updated_at desc,id)
  where scope='user' and archived_at is null;
create unique index permission_presets_user_active_name_uidx
  on collaboration_private.permission_presets(owner_user_id,pg_catalog.lower(name))
  where scope='user' and archived_at is null;

create table collaboration_private.permission_preset_grants (
  preset_id uuid not null references collaboration_private.permission_presets(id) on delete cascade,
  capability_key text not null references collaboration_private.capability_registry(capability_key) on delete restrict,
  level smallint not null check (level in (1,2)),
  primary key (preset_id,capability_key)
);

create function collaboration_private.keep_permission_preset_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.scope is distinct from old.scope
    or new.owner_user_id is distinct from old.owner_user_id
    or new.system_key is distinct from old.system_key
    or new.created_at is distinct from old.created_at then
    raise exception using errcode='P0001',message='preset_identity_immutable';
  end if;
  return new;
end; $$;
revoke all on function collaboration_private.keep_permission_preset_identity()
  from public,anon,authenticated,service_role;
create trigger permission_presets_identity_immutable
  before update on collaboration_private.permission_presets
  for each row execute function collaboration_private.keep_permission_preset_identity();

alter table collaboration_private.permission_presets enable row level security;
alter table collaboration_private.permission_presets force row level security;
alter table collaboration_private.permission_preset_grants enable row level security;
alter table collaboration_private.permission_preset_grants force row level security;

revoke all on collaboration_private.permission_presets,
  collaboration_private.permission_preset_grants from public,anon,authenticated,service_role;

-- SECURITY DEFINER RPCs execute as the table owner under FORCE RLS. These
-- policies scope those queries to the authenticated actor without granting
-- direct table privileges to application roles.
create policy permission_presets_visible on collaboration_private.permission_presets
  for select using (scope='system' or (scope='user' and owner_user_id=auth.uid()));
create policy permission_presets_insert_owner on collaboration_private.permission_presets
  for insert with check (scope='user' and owner_user_id=auth.uid() and system_key is null);
create policy permission_presets_update_owner on collaboration_private.permission_presets
  for update using (scope='user' and owner_user_id=auth.uid() and system_key is null)
  with check (scope='user' and owner_user_id=auth.uid() and system_key is null);

create policy permission_preset_grants_visible on collaboration_private.permission_preset_grants
  for select using (exists (
    select 1 from collaboration_private.permission_presets p
    where p.id=preset_id and (p.scope='system' or p.owner_user_id=auth.uid())
  ));
create policy permission_preset_grants_insert_owner on collaboration_private.permission_preset_grants
  for insert with check (exists (
    select 1 from collaboration_private.permission_presets p
    where p.id=preset_id and p.scope='user' and p.owner_user_id=auth.uid()
      and p.system_key is null and p.archived_at is null
  ));
create policy permission_preset_grants_update_owner on collaboration_private.permission_preset_grants
  for update using (exists (
    select 1 from collaboration_private.permission_presets p
    where p.id=preset_id and p.scope='user' and p.owner_user_id=auth.uid()
  )) with check (exists (
    select 1 from collaboration_private.permission_presets p
    where p.id=preset_id and p.scope='user' and p.owner_user_id=auth.uid()
  ));
create policy permission_preset_grants_delete_owner on collaboration_private.permission_preset_grants
  for delete using (exists (
    select 1 from collaboration_private.permission_presets p
    where p.id=preset_id and p.scope='user' and p.owner_user_id=auth.uid()
  ));

comment on table collaboration_private.permission_presets is
  'Reusable exact Custom grant snapshots. Presets are not an authorization source.';
comment on table collaboration_private.permission_preset_grants is
  'Normalized immutable-per-save grant snapshot rows belonging to a permission preset.';

insert into collaboration_private.permission_presets(scope,system_key,name,description,version)
values
  ('system','read_only','Podgląd podstawowy','Podgląd podstawowych informacji, miejsc i godzin.',1),
  ('system','operational_full','Pełny dostęp operacyjny','Podgląd podstawowych informacji oraz edycja miejsc i godzin.',1);

insert into collaboration_private.permission_preset_grants(preset_id,capability_key,level)
select p.id,g.capability_key,g.level
from collaboration_private.permission_presets p
join (values
  ('read_only'::text,'wedding.identity'::text,1::smallint),
  ('read_only','places.address',1),
  ('read_only','schedule.operational_time',1),
  ('operational_full','wedding.identity',1),
  ('operational_full','places.address',2),
  ('operational_full','schedule.operational_time',2)
) g(system_key,capability_key,level) using(system_key)
order by p.system_key,g.capability_key;

create function collaboration_private.permission_preset_detail(p_preset_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'preset_id',p.id,'scope',p.scope,'name',p.name,'description',p.description,
    'version',p.version::text,'permission_group_mapping_version','1',
    'grants',coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('capability_key',g.capability_key,'level',g.level)
      order by g.capability_key)
      from collaboration_private.permission_preset_grants g where g.preset_id=p.id),'[]'::jsonb),
    'created_at',p.created_at,'updated_at',p.updated_at)
  from collaboration_private.permission_presets p where p.id=p_preset_id;
$$;
revoke all on function collaboration_private.permission_preset_detail(uuid)
  from public,anon,authenticated,service_role;

create function public.list_collaboration_permission_presets()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if v_actor is null then raise exception using errcode='42501',message='UNAVAILABLE'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'preset_id',p.id,'scope',p.scope,'name',p.name,'description',p.description,
    'version',p.version::text,'updated_at',p.updated_at)
    order by case when p.scope='system' then 0 else 1 end,
      case when p.scope='user' then p.updated_at end desc,p.id), '[]'::jsonb)
    into v_result
    from collaboration_private.permission_presets p
    where p.archived_at is null and (p.scope='system' or p.owner_user_id=v_actor);
  return v_result;
end; $$;

create function public.get_collaboration_permission_preset(p_preset_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if v_actor is null or p_preset_id is null then
    raise exception using errcode='P0001',message='UNAVAILABLE';
  end if;
  select collaboration_private.permission_preset_detail(p.id) into v_result
  from collaboration_private.permission_presets p
  where p.id=p_preset_id and p.archived_at is null
    and (p.scope='system' or p.owner_user_id=v_actor);
  if v_result is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  return v_result;
end; $$;

create function public.create_collaboration_permission_preset(
  p_name text,p_description text,p_grants jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_name text; v_description text; v_grants jsonb;
  v_preset_id uuid; v_result jsonb;
begin
  if v_actor is null then raise exception using errcode='42501',message='UNAVAILABLE'; end if;
  if p_name is null or p_name ~ '[[:cntrl:]]' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  v_name:=pg_catalog.regexp_replace(p_name,'^[[:space:]]+|[[:space:]]+$','','g');
  if v_name='' or pg_catalog.char_length(v_name)>80 then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  if p_description is not null and p_description ~ '[[:cntrl:]]' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  v_description:=case when p_description is null then null else nullif(
    pg_catalog.regexp_replace(p_description,'^[[:space:]]+|[[:space:]]+$','','g'),'') end;
  if v_description is not null and pg_catalog.char_length(v_description)>240 then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  v_grants:=collaboration_private.validate_owner_access_configuration('unspecified',null,'custom',p_grants);
  insert into collaboration_private.permission_presets(scope,owner_user_id,name,description,version)
    values('user',v_actor,v_name,v_description,1) returning id into v_preset_id;
  insert into collaboration_private.permission_preset_grants(preset_id,capability_key,level)
    select v_preset_id,x.value->>'capability_key',(x.value->>'level')::smallint
      from pg_catalog.jsonb_array_elements(v_grants) x(value) order by x.value->>'capability_key';
  v_result:=collaboration_private.permission_preset_detail(v_preset_id);
  return v_result;
exception when unique_violation then
  raise exception using errcode='P0001',message='CONFLICT';
end; $$;

create function public.update_collaboration_permission_preset(
  p_preset_id uuid,p_expected_version text,p_name text,p_description text,p_grants jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_p collaboration_private.permission_presets%rowtype;
  v_name text; v_description text; v_grants jsonb; v_before jsonb; v_changed boolean;
  v_result jsonb; v_now timestamptz:=pg_catalog.timezone('utc',pg_catalog.now());
begin
  if v_actor is null or p_preset_id is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select * into v_p from collaboration_private.permission_presets p
    where p.id=p_preset_id and (p.scope='system' or p.owner_user_id=v_actor) for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_p.scope='system' then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  if v_p.archived_at is not null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_expected_version is null or pg_catalog.char_length(p_expected_version)>19
    or p_expected_version !~ '^[1-9][0-9]*$'
    or p_expected_version::numeric>9223372036854775807::numeric then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  if p_expected_version::numeric<>v_p.version::numeric then
    raise exception using errcode='P0001',message='CONFLICT';
  end if;
  if p_name is null or p_name ~ '[[:cntrl:]]' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  v_name:=pg_catalog.regexp_replace(p_name,'^[[:space:]]+|[[:space:]]+$','','g');
  if v_name='' or pg_catalog.char_length(v_name)>80 then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  if p_description is not null and p_description ~ '[[:cntrl:]]' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  v_description:=case when p_description is null then null else nullif(
    pg_catalog.regexp_replace(p_description,'^[[:space:]]+|[[:space:]]+$','','g'),'') end;
  if v_description is not null and pg_catalog.char_length(v_description)>240 then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  v_grants:=collaboration_private.validate_owner_access_configuration('unspecified',null,'custom',p_grants);
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'capability_key',g.capability_key,'level',g.level) order by g.capability_key),'[]'::jsonb)
    into v_before from collaboration_private.permission_preset_grants g where g.preset_id=v_p.id;
  v_changed:=v_name is distinct from v_p.name or v_description is distinct from v_p.description
    or v_grants is distinct from v_before;
  if not v_changed then
    return pg_catalog.jsonb_build_object('changed',false,'version',v_p.version::text,
      'preset',collaboration_private.permission_preset_detail(v_p.id));
  end if;
  update collaboration_private.permission_presets set name=v_name,description=v_description,
    version=version+1,updated_at=v_now where id=v_p.id;
  if v_grants is distinct from v_before then
    delete from collaboration_private.permission_preset_grants where preset_id=v_p.id;
    insert into collaboration_private.permission_preset_grants(preset_id,capability_key,level)
      select v_p.id,x.value->>'capability_key',(x.value->>'level')::smallint
      from pg_catalog.jsonb_array_elements(v_grants) x(value) order by x.value->>'capability_key';
  end if;
  select * into v_p from collaboration_private.permission_presets p where p.id=v_p.id;
  return pg_catalog.jsonb_build_object('changed',true,'version',v_p.version::text,
    'preset',collaboration_private.permission_preset_detail(v_p.id));
exception when unique_violation then
  raise exception using errcode='P0001',message='CONFLICT';
end; $$;

create function public.archive_collaboration_permission_preset(
  p_preset_id uuid,p_expected_version text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_p collaboration_private.permission_presets%rowtype; v_new_version bigint;
begin
  if v_actor is null or p_preset_id is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select * into v_p from collaboration_private.permission_presets p
    where p.id=p_preset_id and (p.scope='system' or p.owner_user_id=v_actor) for update;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if v_p.scope='system' then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  if v_p.archived_at is not null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_expected_version is null or pg_catalog.char_length(p_expected_version)>19
    or p_expected_version !~ '^[1-9][0-9]*$'
    or p_expected_version::numeric>9223372036854775807::numeric then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  if p_expected_version::numeric<>v_p.version::numeric then raise exception using errcode='P0001',message='CONFLICT'; end if;
  update collaboration_private.permission_presets set archived_at=pg_catalog.timezone('utc',pg_catalog.now()),
    version=version+1,updated_at=pg_catalog.timezone('utc',pg_catalog.now())
    where id=v_p.id returning version into v_new_version;
  return pg_catalog.jsonb_build_object('archived',true,'version',v_new_version::text);
end; $$;

create function public.duplicate_collaboration_permission_preset(
  p_source_preset_id uuid,p_name text,p_description text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_source collaboration_private.permission_presets%rowtype;
  v_name text; v_description text; v_grants jsonb; v_normalized jsonb; v_new_id uuid;
begin
  if v_actor is null or p_source_preset_id is null then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  select * into v_source from collaboration_private.permission_presets p
    where p.id=p_source_preset_id and (p.scope='system' or p.owner_user_id=v_actor)
      and p.archived_at is null for share;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_name is null or p_name ~ '[[:cntrl:]]' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  v_name:=pg_catalog.regexp_replace(p_name,'^[[:space:]]+|[[:space:]]+$','','g');
  if v_name='' or pg_catalog.char_length(v_name)>80 then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  if p_description is not null and p_description ~ '[[:cntrl:]]' then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  v_description:=case when p_description is null then null else nullif(
    pg_catalog.regexp_replace(p_description,'^[[:space:]]+|[[:space:]]+$','','g'),'') end;
  if v_description is not null and pg_catalog.char_length(v_description)>240 then
    raise exception using errcode='P0001',message='VALIDATION_ERROR';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'capability_key',g.capability_key,'level',g.level) order by g.capability_key),'[]'::jsonb)
    into v_grants from collaboration_private.permission_preset_grants g where g.preset_id=v_source.id;
  v_normalized:=collaboration_private.validate_owner_access_configuration('unspecified',null,'custom',v_grants);
  insert into collaboration_private.permission_presets(scope,owner_user_id,name,description,version)
    values('user',v_actor,v_name,v_description,1) returning id into v_new_id;
  insert into collaboration_private.permission_preset_grants(preset_id,capability_key,level)
    select v_new_id,x.value->>'capability_key',(x.value->>'level')::smallint
      from pg_catalog.jsonb_array_elements(v_normalized) x(value) order by x.value->>'capability_key';
  return collaboration_private.permission_preset_detail(v_new_id);
exception when unique_violation then
  raise exception using errcode='P0001',message='CONFLICT';
end; $$;

revoke all on function public.list_collaboration_permission_presets() from public,anon,service_role;
revoke all on function public.get_collaboration_permission_preset(uuid) from public,anon,service_role;
revoke all on function public.create_collaboration_permission_preset(text,text,jsonb) from public,anon,service_role;
revoke all on function public.update_collaboration_permission_preset(uuid,text,text,text,jsonb) from public,anon,service_role;
revoke all on function public.archive_collaboration_permission_preset(uuid,text) from public,anon,service_role;
revoke all on function public.duplicate_collaboration_permission_preset(uuid,text,text) from public,anon,service_role;
grant execute on function public.list_collaboration_permission_presets() to authenticated;
grant execute on function public.get_collaboration_permission_preset(uuid) to authenticated;
grant execute on function public.create_collaboration_permission_preset(text,text,jsonb) to authenticated;
grant execute on function public.update_collaboration_permission_preset(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.archive_collaboration_permission_preset(uuid,text) to authenticated;
grant execute on function public.duplicate_collaboration_permission_preset(uuid,text,text) to authenticated;

do $assert_1cg_seed$
begin
  if (select count(*) from collaboration_private.permission_presets where scope='system' and archived_at is null)<>2
    or (select count(*) from collaboration_private.permission_preset_grants g
        join collaboration_private.permission_presets p on p.id=g.preset_id where p.scope='system')<>6
    or exists(select 1 from (values ('read_only'::text),('operational_full'::text)) expected(system_key)
        where not exists(select 1 from collaboration_private.permission_presets p
          where p.scope='system' and p.system_key=expected.system_key and p.version=1 and p.archived_at is null))
    or exists(select 1 from collaboration_private.permission_presets p where p.scope='system' and
      ((p.system_key='read_only' and (p.name<>'Podgląd podstawowy'
          or p.description<>'Podgląd podstawowych informacji, miejsc i godzin.'))
       or (p.system_key='operational_full' and (p.name<>'Pełny dostęp operacyjny'
          or p.description<>'Podgląd podstawowych informacji oraz edycja miejsc i godzin.'))))
    or exists(select 1 from collaboration_private.permission_preset_grants g
      join collaboration_private.permission_presets p on p.id=g.preset_id
      left join (values
        ('read_only'::text,'wedding.identity'::text,1::smallint),
        ('read_only','places.address',1),('read_only','schedule.operational_time',1),
        ('operational_full','wedding.identity',1),('operational_full','places.address',2),
        ('operational_full','schedule.operational_time',2)
      ) expected(system_key,capability_key,level) on expected.system_key=p.system_key
        and expected.capability_key=g.capability_key and expected.level=g.level
      where p.scope='system' and expected.system_key is null)
    or exists(select 1 from (values
        ('read_only'::text,'wedding.identity'::text,1::smallint),
        ('read_only','places.address',1),('read_only','schedule.operational_time',1),
        ('operational_full','wedding.identity',1),('operational_full','places.address',2),
        ('operational_full','schedule.operational_time',2)
      ) expected(system_key,capability_key,level)
      where not exists(select 1 from collaboration_private.permission_presets p
        join collaboration_private.permission_preset_grants g on g.preset_id=p.id
        where p.scope='system' and p.system_key=expected.system_key
          and g.capability_key=expected.capability_key and g.level=expected.level))
    or exists(select 1 from collaboration_private.permission_preset_grants g
      join collaboration_private.permission_presets p on p.id=g.preset_id
      join collaboration_private.capability_registry c using(capability_key)
      where p.scope='system' and (not c.active or not c.grantable or c.owner_only or g.level>c.max_custom_level)) then
    raise exception 'COLLABORATION_1C_G_SYSTEM_SEED_ASSERTION_FAILED';
  end if;
  if not exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='collaboration_private' and c.relname='permission_presets'
        and c.relrowsecurity and c.relforcerowsecurity)
    or not exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='collaboration_private' and c.relname='permission_preset_grants'
        and c.relrowsecurity and c.relforcerowsecurity)
    or has_table_privilege('anon','collaboration_private.permission_presets','select')
    or has_table_privilege('anon','collaboration_private.permission_presets','insert')
    or has_table_privilege('anon','collaboration_private.permission_presets','update')
    or has_table_privilege('anon','collaboration_private.permission_presets','delete')
    or has_table_privilege('anon','collaboration_private.permission_preset_grants','select')
    or has_table_privilege('anon','collaboration_private.permission_preset_grants','insert')
    or has_table_privilege('anon','collaboration_private.permission_preset_grants','update')
    or has_table_privilege('anon','collaboration_private.permission_preset_grants','delete')
    or has_table_privilege('authenticated','collaboration_private.permission_presets','select')
    or has_table_privilege('authenticated','collaboration_private.permission_presets','insert')
    or has_table_privilege('authenticated','collaboration_private.permission_presets','update')
    or has_table_privilege('authenticated','collaboration_private.permission_presets','delete')
    or has_table_privilege('authenticated','collaboration_private.permission_preset_grants','select')
    or has_table_privilege('authenticated','collaboration_private.permission_preset_grants','insert')
    or has_table_privilege('authenticated','collaboration_private.permission_preset_grants','update')
    or has_table_privilege('authenticated','collaboration_private.permission_preset_grants','delete')
    or has_table_privilege('service_role','collaboration_private.permission_presets','select')
    or has_table_privilege('service_role','collaboration_private.permission_presets','insert')
    or has_table_privilege('service_role','collaboration_private.permission_presets','update')
    or has_table_privilege('service_role','collaboration_private.permission_presets','delete')
    or has_table_privilege('service_role','collaboration_private.permission_preset_grants','select')
    or has_table_privilege('service_role','collaboration_private.permission_preset_grants','insert')
    or has_table_privilege('service_role','collaboration_private.permission_preset_grants','update')
    or has_table_privilege('service_role','collaboration_private.permission_preset_grants','delete')
    or has_function_privilege('authenticated','collaboration_private.permission_preset_detail(uuid)','execute')
    or not has_function_privilege('authenticated','public.list_collaboration_permission_presets()','execute')
    or has_function_privilege('anon','public.list_collaboration_permission_presets()','execute')
    or has_function_privilege('service_role','public.list_collaboration_permission_presets()','execute') then
    raise exception 'COLLABORATION_1C_G_ACL_ASSERTION_FAILED';
  end if;
end;
$assert_1cg_seed$;

commit;
