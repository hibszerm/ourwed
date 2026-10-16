-- Collaboration 1C-H3 Phase 1: minimal shared canonical Wedding Detail identity.
-- This separate projection deliberately excludes Places and all other domains.
begin;

create function public.get_my_collaborative_wedding_identity(p_wedding_id uuid)
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
  v_context jsonb;
begin
  if v_actor is null or p_wedding_id is null then
    return;
  end if;

  v_context := collaboration_private.resolve_wedding_actor_access(p_wedding_id);
  if v_context is null or v_context->>'relationship' <> 'collaborator' then
    return;
  end if;

  if collaboration_private.effective_wedding_capability_level(
    p_wedding_id, 'wedding.identity'
  ) < 1 then
    return;
  end if;

  return query
  select w.id, w.bride_name, w.groom_name, w.wedding_date
  from public.weddings w
  where w.id = p_wedding_id
    and w.status = 'active';
end;
$$;

revoke all on function public.get_my_collaborative_wedding_identity(uuid)
  from public, anon, service_role;
grant execute on function public.get_my_collaborative_wedding_identity(uuid)
  to authenticated;

comment on function public.get_my_collaborative_wedding_identity(uuid) is
  'Identity/date-only actor-bound projection for canonical shared Wedding Detail Phase 1.';

commit;
