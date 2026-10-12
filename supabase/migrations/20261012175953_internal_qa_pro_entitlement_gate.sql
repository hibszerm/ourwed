-- Internal QA accounts receive ordinary product Pro access without billing
-- state. Keep the registry check actor-bound to auth.uid(); callers cannot
-- supply another user's UUID. This fast path is deliberately side-effect free.
create or replace function public.account_has_pro_access()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  _uid uuid := auth.uid();
  _ent jsonb;
begin
  if _uid is null then
    return false;
  end if;

  if exists (
    select 1
    from public.internal_qa_accounts qa
    where qa.user_id = _uid
  ) then
    return true;
  end if;

  -- Use the entitlement resolver's own current-time default to preserve its
  -- production signature and avoid timezone-overload ambiguity.
  _ent := public.resolve_user_entitlement(_uid);
  return coalesce((_ent->>'canUseProFeatures')::boolean, false);
end;
$function$;

comment on function public.account_has_pro_access() is
  'True for the current actor when registered for internal QA Pro access or when existing commercial entitlement grants Pro.';
