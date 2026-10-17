-- Actor-specific display names for shared weddings.
-- Owner wedding identity remains canonical; collaborator preferences are private.
begin;

create table collaboration_private.wedding_display_name_overrides (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  display_name text not null check (display_name = pg_catalog.btrim(display_name)
    and display_name ~ '[^[:space:]]'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (actor_user_id, wedding_id)
);
alter table collaboration_private.wedding_display_name_overrides enable row level security;
alter table collaboration_private.wedding_display_name_overrides force row level security;
revoke all on collaboration_private.wedding_display_name_overrides
  from public, anon, authenticated, service_role;

create function collaboration_private.owner_wedding_fallback_display_name(p_bride_name text, p_groom_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(case
    when nullif(pg_catalog.btrim(p_bride_name), '') is not null
      and nullif(pg_catalog.btrim(p_groom_name), '') is not null
      and pg_catalog.lower(pg_catalog.btrim(p_groom_name)) not in ('—', '–', '-', 'n/a', 'na', 'brak')
      then pg_catalog.btrim(p_bride_name) || ' i ' || pg_catalog.btrim(p_groom_name)
    when nullif(pg_catalog.btrim(p_bride_name), '') is not null
      then pg_catalog.btrim(p_bride_name)
    when nullif(pg_catalog.btrim(p_groom_name), '') is not null
      and pg_catalog.lower(pg_catalog.btrim(p_groom_name)) not in ('—', '–', '-', 'n/a', 'na', 'brak')
      then pg_catalog.btrim(p_groom_name)
    else null
  end, ''), 'Bez tytułu');
$$;
revoke all on function collaboration_private.owner_wedding_fallback_display_name(text, text)
  from public, anon, authenticated, service_role;

create function collaboration_private.owner_wedding_display_name(
  p_display_name text, p_bride_name text, p_groom_name text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(pg_catalog.btrim(p_display_name), ''),
    collaboration_private.owner_wedding_fallback_display_name(p_bride_name, p_groom_name));
$$;
revoke all on function collaboration_private.owner_wedding_display_name(text, text, text)
  from public, anon, authenticated, service_role;

create function public.get_my_workspace_wedding_display_names(p_wedding_ids uuid[])
returns table (
  wedding_id uuid,
  owner_canonical_display_name text,
  effective_display_name text,
  has_personal_override boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or p_wedding_ids is null
    or not public.wedding_collaboration_actor_is_eligible(v_actor) then
    return;
  end if;

  return query
  select w.id,
    canonical.display_name,
    case when resolved.context->>'relationship' = 'collaborator'
      then coalesce(o.display_name, canonical.display_name)
      else canonical.display_name end,
    case when resolved.context->>'relationship' = 'collaborator'
      then o.display_name is not null else false end
  from (
    select distinct requested.id as wedding_id
    from pg_catalog.unnest(p_wedding_ids) as requested(id)
    where requested.id is not null
  ) requested
  join public.weddings w on w.id = requested.wedding_id and w.status = 'active'
  cross join lateral (
    select collaboration_private.resolve_wedding_actor_access(w.id) as context
  ) resolved
  cross join lateral (
    select collaboration_private.owner_wedding_display_name(
      w.display_name, w.bride_name, w.groom_name
    ) as display_name
  ) canonical
  left join collaboration_private.wedding_display_name_overrides o
    on o.actor_user_id = v_actor
    and o.wedding_id = w.id
    and resolved.context->>'relationship' = 'collaborator'
  where resolved.context is not null
    and resolved.context->>'relationship' in ('owner', 'collaborator')
    and (resolved.context->>'relationship' = 'owner'
      or collaboration_private.effective_wedding_capability_level(w.id, 'wedding.identity') >= 1);
end;
$$;
revoke all on function public.get_my_workspace_wedding_display_names(uuid[])
  from public, anon, service_role;
grant execute on function public.get_my_workspace_wedding_display_names(uuid[])
  to authenticated;

create function public.set_my_wedding_display_name_override(p_wedding_id uuid, p_display_name text)
returns table (
  wedding_id uuid,
  owner_canonical_display_name text,
  effective_display_name text,
  has_personal_override boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_context jsonb;
  v_owner_name text;
  v_fallback_name text;
  v_display_name text := nullif(pg_catalog.btrim(p_display_name), '');
begin
  if v_actor is null or p_wedding_id is null then
    raise exception using errcode = 'P0001', message = 'UNAVAILABLE';
  end if;
  v_context := collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null or coalesce(v_context->>'relationship', '') <> 'collaborator' then
    raise exception using errcode = 'P0001', message = 'UNAVAILABLE';
  end if;
  if collaboration_private.effective_wedding_capability_level(p_wedding_id, 'wedding.identity') < 1 then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select collaboration_private.owner_wedding_display_name(w.display_name, w.bride_name, w.groom_name),
    collaboration_private.owner_wedding_fallback_display_name(w.bride_name, w.groom_name)
    into v_owner_name, v_fallback_name
  from public.weddings w
  where w.id = p_wedding_id and w.status = 'active';
  if v_owner_name is null then
    raise exception using errcode = 'P0001', message = 'UNAVAILABLE';
  end if;

  insert into collaboration_private.wedding_display_name_overrides(actor_user_id, wedding_id, display_name)
  values (v_actor, p_wedding_id, coalesce(v_display_name, v_fallback_name))
  on conflict on constraint wedding_display_name_overrides_pkey do update
    set display_name = excluded.display_name, updated_at = pg_catalog.now();

  return query select p_wedding_id, v_owner_name,
    coalesce(v_display_name, v_fallback_name), true;
end;
$$;
revoke all on function public.set_my_wedding_display_name_override(uuid, text)
  from public, anon, service_role;
grant execute on function public.set_my_wedding_display_name_override(uuid, text)
  to authenticated;

create function public.clear_my_wedding_display_name_override(p_wedding_id uuid)
returns table (
  wedding_id uuid,
  owner_canonical_display_name text,
  effective_display_name text,
  has_personal_override boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_context jsonb;
  v_owner_name text;
begin
  if v_actor is null or p_wedding_id is null then
    raise exception using errcode = 'P0001', message = 'UNAVAILABLE';
  end if;
  v_context := collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null or coalesce(v_context->>'relationship', '') <> 'collaborator' then
    raise exception using errcode = 'P0001', message = 'UNAVAILABLE';
  end if;
  if collaboration_private.effective_wedding_capability_level(p_wedding_id, 'wedding.identity') < 1 then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select collaboration_private.owner_wedding_display_name(w.display_name, w.bride_name, w.groom_name)
    into v_owner_name
  from public.weddings w
  where w.id = p_wedding_id and w.status = 'active';
  if v_owner_name is null then
    raise exception using errcode = 'P0001', message = 'UNAVAILABLE';
  end if;
  delete from collaboration_private.wedding_display_name_overrides o
  where o.actor_user_id = v_actor and o.wedding_id = p_wedding_id;

  return query select p_wedding_id, v_owner_name, v_owner_name, false;
end;
$$;
revoke all on function public.clear_my_wedding_display_name_override(uuid)
  from public, anon, service_role;
grant execute on function public.clear_my_wedding_display_name_override(uuid)
  to authenticated;

comment on table collaboration_private.wedding_display_name_overrides is
  'Private actor-specific display-name preference. It never grants wedding access.';
comment on function public.get_my_workspace_wedding_display_names(uuid[]) is
  'Batch actor-bound effective wedding titles for currently authorized workspace weddings.';
comment on function public.set_my_wedding_display_name_override(uuid, text) is
  'Sets only the authenticated collaborator’s private wedding-title preference.';
comment on function public.clear_my_wedding_display_name_override(uuid) is
  'Removes only the authenticated collaborator’s private wedding-title preference.';

commit;
