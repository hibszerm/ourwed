-- =============================================================================
-- Cleanup: restore admin private catalog slugs after reclaim
-- =============================================================================
-- 20260722171000 renamed reclaimed originals to slug-private-<id> when the
-- studio already had a backfill copy. Wedding FKs still point at the original
-- ids. Restore the original slug on referenced rows and drop unused duplicates.
-- =============================================================================

do $$
declare
  admin_id uuid;
  r record;
  base_slug text;
begin
  select id into admin_id from public.users where lower(email) = 'admin@ourwed.pl' limit 1;
  if admin_id is null then
    return;
  end if;

  -- Packages: prefer the row still referenced by weddings
  for r in
    select p.*
    from public.packages p
    where p.user_id = admin_id
      and p.slug like '%-private-%'
      and p.is_system_template = false
  loop
    base_slug := regexp_replace(r.slug, '-private-[0-9a-f]+$', '');

    -- Drop unused backfill duplicate with the base slug
    delete from public.package_items pi
    using public.packages p
    where pi.package_id = p.id
      and p.user_id = admin_id
      and p.slug = base_slug
      and p.id is distinct from r.id
      and not exists (select 1 from public.weddings w where w.package_id = p.id);

    delete from public.packages p
    where p.user_id = admin_id
      and p.slug = base_slug
      and p.id is distinct from r.id
      and not exists (select 1 from public.weddings w where w.package_id = p.id);

    -- Restore original slug if free
    if not exists (
      select 1 from public.packages p
      where p.user_id = admin_id and p.slug = base_slug and p.id is distinct from r.id
    ) then
      update public.packages set slug = base_slug where id = r.id;
    end if;
  end loop;

  -- Extra services: same pattern (no wedding package_id, but wedding_extra_services may ref)
  for r in
    select e.*
    from public.extra_services e
    where e.user_id = admin_id
      and e.slug like '%-private-%'
      and e.is_system_template = false
  loop
    base_slug := regexp_replace(r.slug, '-private-[0-9a-f]+$', '');

    delete from public.extra_services e
    where e.user_id = admin_id
      and e.slug = base_slug
      and e.id is distinct from r.id
      and not exists (
        select 1 from public.wedding_extra_services wes where wes.extra_service_id = e.id
      );

    if not exists (
      select 1 from public.extra_services e
      where e.user_id = admin_id and e.slug = base_slug and e.id is distinct from r.id
    ) then
      update public.extra_services set slug = base_slug where id = r.id;
    end if;
  end loop;
end $$;
