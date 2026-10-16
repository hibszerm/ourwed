-- Collaboration 1C-H3 Phase 1: actor-bound authority for direct Wedding Detail URLs.
-- This projection does not grant access to weddings or child tables.
begin;

create function public.resolve_my_wedding_detail_authority(p_wedding_id uuid)
returns table (
  kind text,
  wedding_id uuid,
  membership_id uuid,
  access_version text,
  mapping_version text,
  effective_capabilities jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_capabilities jsonb;
begin
  if auth.uid() is null or p_wedding_id is null then
    return query select 'unavailable'::text, null::uuid, null::uuid, null::text, null::text, null::jsonb;
    return;
  end if;

  v_context := collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null then
    return query select 'unavailable'::text, null::uuid, null::uuid, null::text, null::text, null::jsonb;
    return;
  end if;

  if v_context->>'relationship' = 'owner' then
    return query select 'owned'::text, p_wedding_id, null::uuid, null::text, null::text, '{}'::jsonb;
    return;
  end if;

  if collaboration_private.effective_wedding_capability_level(
    p_wedding_id, 'wedding.identity'
  ) < 1 then
    return query select 'unavailable'::text, null::uuid, null::uuid, null::text, null::text, null::jsonb;
    return;
  end if;

  select coalesce(
    pg_catalog.jsonb_object_agg(c.capability_key, l.level order by c.capability_key),
    '{}'::jsonb
  )
  into v_capabilities
  from collaboration_private.capability_registry c
  cross join lateral (
    select collaboration_private.effective_wedding_capability_level(
      p_wedding_id, c.capability_key
    )::integer as level
  ) l
  where c.active and c.grantable and not c.owner_only;

  return query select 'shared'::text, p_wedding_id,
    (v_context->>'membership_id')::uuid,
    v_context->>'access_version',
    v_context->>'permission_group_mapping_version',
    v_capabilities;
end;
$$;

revoke all on function public.resolve_my_wedding_detail_authority(uuid)
  from public, anon, service_role;
grant execute on function public.resolve_my_wedding_detail_authority(uuid)
  to authenticated;

comment on function public.resolve_my_wedding_detail_authority(uuid) is
  'Actor-bound route authority for canonical Wedding Detail; returns no wedding or child rows.';

commit;
