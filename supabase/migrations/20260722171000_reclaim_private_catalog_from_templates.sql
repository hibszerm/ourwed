-- =============================================================================
-- Follow-up: reclaim pre-migration catalog from system templates
-- =============================================================================
-- 20260722170000 marked existing ownerless packages/extras (e.g. pakiet-mini)
-- as system templates. Those rows were often a studio's private pre-Auth
-- catalog, so new signups still inherited another studio's package content.
--
-- This migration:
--   1) Moves those rows to the legacy admin studio as private catalog
--   2) Inserts fresh global starters (is_system_template = true)
--   3) Replaces other studios' copies of the old leaked content with copies
--      of the new global starters only
-- =============================================================================

do $$
declare
  admin_id uuid;
  old_pkg record;
  old_extra record;
  new_template_id uuid;
  studio record;
  new_pkg_id uuid;
begin
  -- Prefer the remapped admin auth user; fall back to busiest studio
  select u.id into admin_id
  from public.users u
  where lower(u.email) = 'admin@ourwed.pl'
  limit 1;

  if admin_id is null then
    select u.id into admin_id
    from public.users u
    left join public.weddings w on w.user_id = u.id
    group by u.id
    order by count(w.id) desc, u.created_at asc nulls last
    limit 1;
  end if;

  if admin_id is null then
    raise exception 'No studio user available to reclaim private catalog';
  end if;

  -- -----------------------------------------------------------------------
  -- Packages: demote current "system templates" that came from live data,
  -- reclaim to admin, then insert clean platform starters.
  -- -----------------------------------------------------------------------
  for old_pkg in
    select * from public.packages where is_system_template = true
  loop
    -- Free template slug: make this row private under admin
    if exists (
      select 1 from public.packages p
      where p.user_id = admin_id and p.slug = old_pkg.slug
    ) then
      update public.packages
      set
        is_system_template = false,
        user_id = admin_id,
        slug = old_pkg.slug || '-private-' || substr(replace(old_pkg.id::text, '-', ''), 1, 8)
      where id = old_pkg.id;
    else
      update public.packages
      set is_system_template = false, user_id = admin_id
      where id = old_pkg.id;
    end if;

    -- Fresh global starter (generic content; not another studio's private row)
    insert into public.packages (
      name, slug, description, price, deposit_amount, currency, color,
      is_active, sort_order, user_id, is_system_template
    )
    values (
      case old_pkg.slug
        when 'pakiet-mini' then 'Pakiet Mini'
        else old_pkg.name
      end,
      old_pkg.slug,
      'Pakiet startowy platformy OurWed.',
      3500,
      1000,
      'PLN',
      coalesce(old_pkg.color, '#7A8F7A'),
      true,
      0,
      null,
      true
    )
    returning id into new_template_id;

    -- Minimal starter items
    insert into public.package_items (package_id, title, description, sort_order)
    values
      (new_template_id, 'Reportaż ślubny', 'Pokrycie ceremonii i wesela', 0),
      (new_template_id, 'Galeria online', 'Oddanie zdjęć w galerii', 1);

    -- Other studios: drop leaked copies of this slug, re-copy from new template
    for studio in
      select id from public.users where id is distinct from admin_id
    loop
      delete from public.package_items pi
      using public.packages p
      where pi.package_id = p.id
        and p.user_id = studio.id
        and p.slug = old_pkg.slug;

      delete from public.packages p
      where p.user_id = studio.id
        and p.slug = old_pkg.slug;

      insert into public.packages (
        name, slug, description, price, deposit_amount, currency, color,
        is_active, sort_order, user_id, is_system_template
      )
      select
        t.name, t.slug, t.description, t.price, t.deposit_amount, t.currency,
        t.color, t.is_active, t.sort_order, studio.id, false
      from public.packages t
      where t.id = new_template_id
      returning id into new_pkg_id;

      insert into public.package_items (package_id, title, description, sort_order)
      select new_pkg_id, pi.title, pi.description, pi.sort_order
      from public.package_items pi
      where pi.package_id = new_template_id;
    end loop;
  end loop;

  -- -----------------------------------------------------------------------
  -- Extra services: same reclaim + fresh starters
  -- -----------------------------------------------------------------------
  for old_extra in
    select * from public.extra_services where is_system_template = true
  loop
    if exists (
      select 1 from public.extra_services e
      where e.user_id = admin_id and e.slug = old_extra.slug
    ) then
      update public.extra_services
      set
        is_system_template = false,
        user_id = admin_id,
        slug = old_extra.slug || '-private-' || substr(replace(old_extra.id::text, '-', ''), 1, 8)
      where id = old_extra.id;
    else
      update public.extra_services
      set is_system_template = false, user_id = admin_id
      where id = old_extra.id;
    end if;

    insert into public.extra_services (
      name, slug, description, price, currency, is_active, sort_order,
      user_id, is_system_template
    )
    values (
      old_extra.name,
      old_extra.slug,
      coalesce(old_extra.description, 'Usługa startowa platformy OurWed.'),
      case old_extra.slug
        when 'ujecia-z-drona' then 800
        when 'ujecia-vhs' then 600
        else greatest(old_extra.price, 0)
      end,
      'PLN',
      true,
      coalesce(old_extra.sort_order, 0),
      null,
      true
    );

    for studio in
      select id from public.users where id is distinct from admin_id
    loop
      delete from public.extra_services e
      where e.user_id = studio.id
        and e.slug = old_extra.slug;

      insert into public.extra_services (
        name, slug, description, price, currency, is_active, sort_order,
        user_id, is_system_template
      )
      select
        t.name, t.slug, t.description, t.price, t.currency,
        t.is_active, t.sort_order, studio.id, false
      from public.extra_services t
      where t.is_system_template = true
        and t.slug = old_extra.slug;
    end loop;
  end loop;

  -- Forms keep contract-questionnaire as the real platform seed (seeds/forms.sql).
  -- No reclaim — that row is intentionally global.
end $$;
