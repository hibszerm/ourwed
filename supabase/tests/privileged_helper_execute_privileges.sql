-- Run only against an isolated/local database after applying migrations.
-- This checks effective privileges without invoking either helper.
do $$
declare
  remap regprocedure := to_regprocedure('public.remap_legacy_studio_user(uuid,uuid)');
  presets regprocedure := to_regprocedure('public.provision_official_pre_wedding_presets(uuid)');
  new_user_trigger regprocedure;
  new_user_def text;
begin
  if remap is null then
    raise exception 'missing public.remap_legacy_studio_user(uuid,uuid)';
  end if;
  if presets is null then
    raise exception 'missing public.provision_official_pre_wedding_presets(uuid)';
  end if;

  if has_function_privilege('anon', remap, 'EXECUTE') then
    raise exception 'anon can execute remap_legacy_studio_user';
  end if;
  if has_function_privilege('authenticated', remap, 'EXECUTE') then
    raise exception 'authenticated can execute remap_legacy_studio_user';
  end if;
  if has_function_privilege('service_role', remap, 'EXECUTE') then
    raise exception 'service_role can execute remap_legacy_studio_user';
  end if;
  if has_function_privilege('anon', presets, 'EXECUTE') then
    raise exception 'anon can execute provision_official_pre_wedding_presets';
  end if;
  if has_function_privilege('authenticated', presets, 'EXECUTE') then
    raise exception 'authenticated can execute provision_official_pre_wedding_presets';
  end if;
  if has_function_privilege('service_role', presets, 'EXECUTE') then
    raise exception 'service_role can execute provision_official_pre_wedding_presets';
  end if;

  select t.tgfoid::regprocedure
    into new_user_trigger
  from pg_trigger t
  where t.tgrelid = 'auth.users'::regclass
    and t.tgname = 'on_auth_user_created'
    and not t.tgisinternal;

  if new_user_trigger is null then
    raise exception 'missing auth.users on_auth_user_created trigger';
  end if;

  select pg_get_functiondef(new_user_trigger::oid)
    into new_user_def;

  if position('provision_official_pre_wedding_presets(new.id)' in new_user_def) = 0 then
    raise exception 'trusted new-user preset call is missing';
  end if;
  if not (select prosecdef from pg_proc where oid = new_user_trigger::oid) then
    raise exception 'new-user trigger function is no longer SECURITY DEFINER';
  end if;
  if (select proowner from pg_proc where oid = presets)
       is distinct from
     (select proowner from pg_proc where oid = new_user_trigger::oid) then
    raise exception 'new-user trigger and preset helper do not share the trusted owner';
  end if;
end;
$$;
