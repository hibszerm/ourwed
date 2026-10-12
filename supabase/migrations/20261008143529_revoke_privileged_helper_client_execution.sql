-- Privileged helpers are called only from trusted database paths:
-- remap_legacy_studio_user from its historical migration, and
-- provision_official_pre_wedding_presets from handle_new_user.
-- Do not expose either SECURITY DEFINER helper through the client API.
revoke execute on function public.remap_legacy_studio_user(uuid, uuid)
  from public, anon, authenticated, service_role;

revoke execute on function public.provision_official_pre_wedding_presets(uuid)
  from public, anon, authenticated, service_role;
