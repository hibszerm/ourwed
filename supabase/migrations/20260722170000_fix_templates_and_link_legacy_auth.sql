-- =============================================================================
-- Fix: system templates + link legacy auth studios
-- =============================================================================
-- ISSUE 1 — Private catalog leaked into signup copies
--   Multi-tenant migration added user_id as NULL for every existing package /
--   extra_service / form. Signup + backfill treated "user_id IS NULL" as a
--   global template, so private pre-auth catalog was copied to every new studio.
--
--   Fix: explicit is_system_template flag. Only flagged rows are global.
--   Signup copies ONLY is_system_template = true. RLS reads the same flag.
--
-- ISSUE 2 — Legacy admin studio unreachable after real Auth
--   public.users.id (pre-Auth) != auth.users.id (same email). App resolves
--   studio by auth.uid() → public.users.id, so questionnaires fail with
--   "Brak konta studia…".
--
--   Fix: remap legacy public.users PK (+ all FKs) to auth.users.id by email.
--   Create missing profiles. No re-registration. No duplicate studios.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Explicit system-template flag
-- ---------------------------------------------------------------------------

alter table public.forms
  add column if not exists is_system_template boolean not null default false;

alter table public.packages
  add column if not exists is_system_template boolean not null default false;

alter table public.extra_services
  add column if not exists is_system_template boolean not null default false;

comment on column public.forms.is_system_template is
  'Global platform template. Only these rows may be copied on signup. Requires user_id IS NULL.';
comment on column public.packages.is_system_template is
  'Global platform template. Only these rows may be copied on signup. Requires user_id IS NULL.';
comment on column public.extra_services.is_system_template is
  'Global platform template. Only these rows may be copied on signup. Requires user_id IS NULL.';

-- ---------------------------------------------------------------------------
-- 2) Classify existing rows
--    Known platform starter slugs → system templates (stay ownerless).
--    Every other user_id IS NULL row → private orphan → assign to legacy studio.
-- ---------------------------------------------------------------------------

-- Official form seed (supabase/seeds/forms.sql)
update public.forms
set is_system_template = true
where user_id is null
  and slug = 'contract-questionnaire';

-- Canonical starter catalog slugs (shared platform starters, not private studios)
update public.packages
set is_system_template = true
where user_id is null
  and slug in ('pakiet-mini');

update public.extra_services
set is_system_template = true
where user_id is null
  and slug in ('ujecia-z-drona', 'ujecia-vhs');

-- Reclaim every non-template ownerless row to the studio that owns the most
-- weddings for that environment (legacy single-tenant admin in practice).
do $$
declare
  legacy_owner uuid;
begin
  select u.id
  into legacy_owner
  from public.users u
  left join public.weddings w on w.user_id = u.id
  group by u.id
  order by count(w.id) desc, u.created_at asc nulls last
  limit 1;

  if legacy_owner is null then
    return;
  end if;

  -- Avoid (user_id, slug) unique collisions when reclaiming
  update public.packages p
  set slug = p.slug || '-reclaimed-' || substr(replace(p.id::text, '-', ''), 1, 8)
  where p.user_id is null
    and p.is_system_template = false
    and exists (
      select 1
      from public.packages o
      where o.user_id = legacy_owner
        and o.slug = p.slug
    );

  update public.extra_services es
  set slug = es.slug || '-reclaimed-' || substr(replace(es.id::text, '-', ''), 1, 8)
  where es.user_id is null
    and es.is_system_template = false
    and exists (
      select 1
      from public.extra_services o
      where o.user_id = legacy_owner
        and o.slug = es.slug
    );

  update public.forms f
  set slug = f.slug || '-reclaimed-' || substr(replace(f.id::text, '-', ''), 1, 8)
  where f.user_id is null
    and f.is_system_template = false
    and exists (
      select 1
      from public.forms o
      where o.user_id = legacy_owner
        and o.slug = f.slug
        and o.version = f.version
    );

  update public.packages
  set user_id = legacy_owner,
      is_system_template = false
  where user_id is null
    and is_system_template = false;

  update public.extra_services
  set user_id = legacy_owner,
      is_system_template = false
  where user_id is null
    and is_system_template = false;

  update public.forms
  set user_id = legacy_owner,
      is_system_template = false
  where user_id is null
    and is_system_template = false;
end $$;

-- Enforce template shape: template ↔ ownerless, private ↔ owned
alter table public.forms drop constraint if exists forms_template_owner_chk;
alter table public.forms
  add constraint forms_template_owner_chk check (
    (is_system_template = true and user_id is null)
    or (is_system_template = false and user_id is not null)
  );

alter table public.packages drop constraint if exists packages_template_owner_chk;
alter table public.packages
  add constraint packages_template_owner_chk check (
    (is_system_template = true and user_id is null)
    or (is_system_template = false and user_id is not null)
  );

alter table public.extra_services drop constraint if exists extra_services_template_owner_chk;
alter table public.extra_services
  add constraint extra_services_template_owner_chk check (
    (is_system_template = true and user_id is null)
    or (is_system_template = false and user_id is not null)
  );

-- Partial unique indexes: templates keyed by flag, not merely null owner
drop index if exists forms_template_slug_version_uidx;
create unique index if not exists forms_system_template_slug_version_uidx
  on public.forms (slug, version)
  where is_system_template = true;

drop index if exists packages_template_slug_uidx;
create unique index if not exists packages_system_template_slug_uidx
  on public.packages (slug)
  where is_system_template = true;

drop index if exists extra_services_template_slug_uidx;
create unique index if not exists extra_services_system_template_slug_uidx
  on public.extra_services (slug)
  where is_system_template = true;

-- ---------------------------------------------------------------------------
-- 3) Remove leaked private copies from other studios
--    If a non-template slug is owned by studio A and also appears on studio B,
--    keep A (earliest created_at among owners of that slug) and delete B's copy
--    only when that slug is NOT a system-template slug (starters may be copied).
-- ---------------------------------------------------------------------------

delete from public.package_items pi
using public.packages p
where pi.package_id = p.id
  and p.is_system_template = false
  and p.slug not in (select slug from public.packages where is_system_template = true)
  and exists (
    select 1
    from public.packages keeper
    where keeper.is_system_template = false
      and keeper.slug = p.slug
      and keeper.user_id is distinct from p.user_id
      and keeper.created_at < p.created_at
  );

delete from public.packages p
where p.is_system_template = false
  and p.slug not in (select slug from public.packages where is_system_template = true)
  and exists (
    select 1
    from public.packages keeper
    where keeper.is_system_template = false
      and keeper.slug = p.slug
      and keeper.user_id is distinct from p.user_id
      and keeper.created_at < p.created_at
  );

delete from public.extra_services es
where es.is_system_template = false
  and es.slug not in (select slug from public.extra_services where is_system_template = true)
  and exists (
    select 1
    from public.extra_services keeper
    where keeper.is_system_template = false
      and keeper.slug = es.slug
      and keeper.user_id is distinct from es.user_id
      and keeper.created_at < es.created_at
  );

-- ---------------------------------------------------------------------------
-- 4) Signup copies ONLY system templates
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fname text;
  lname text;
  full_name text;
  prof text;
  template_package record;
  new_package_id uuid;
  template_form record;
begin
  fname := coalesce(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), '');
  lname := coalesce(nullif(trim(new.raw_user_meta_data->>'last_name'), ''), '');
  prof := coalesce(nullif(trim(new.raw_user_meta_data->>'profession'), ''), '');
  full_name := trim(both ' ' from fname || ' ' || lname);
  if full_name = '' then
    full_name := split_part(coalesce(new.email, 'user'), '@', 1);
  end if;

  insert into public.profiles (id, first_name, last_name, profession)
  values (new.id, fname, lname, prof)
  on conflict (id) do update
    set
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      profession = excluded.profession,
      updated_at = timezone('utc', now());

  insert into public.users (id, email, name)
  values (new.id, coalesce(new.email, ''), full_name)
  on conflict (id) do update
    set
      email = excluded.email,
      name = excluded.name;

  -- ONLY explicit system templates (never another studio's private rows)
  for template_form in
    select *
    from public.forms
    where is_system_template = true
      and is_active = true
  loop
    if not exists (
      select 1
      from public.forms f
      where f.user_id = new.id
        and f.slug = template_form.slug
        and f.version = template_form.version
    ) then
      insert into public.forms (
        name, slug, description, category, schema, version, is_active,
        user_id, is_system_template
      )
      values (
        template_form.name,
        template_form.slug,
        template_form.description,
        template_form.category,
        template_form.schema,
        template_form.version,
        template_form.is_active,
        new.id,
        false
      );
    end if;
  end loop;

  for template_package in
    select *
    from public.packages
    where is_system_template = true
      and is_active = true
  loop
    if exists (
      select 1
      from public.packages p
      where p.user_id = new.id
        and p.slug = template_package.slug
    ) then
      continue;
    end if;

    insert into public.packages (
      name, slug, description, price, deposit_amount, currency, color,
      is_active, sort_order, user_id, is_system_template
    )
    values (
      template_package.name,
      template_package.slug,
      template_package.description,
      template_package.price,
      template_package.deposit_amount,
      template_package.currency,
      template_package.color,
      template_package.is_active,
      template_package.sort_order,
      new.id,
      false
    )
    returning id into new_package_id;

    insert into public.package_items (
      package_id, title, description, sort_order
    )
    select
      new_package_id,
      pi.title,
      pi.description,
      pi.sort_order
    from public.package_items pi
    where pi.package_id = template_package.id;
  end loop;

  insert into public.extra_services (
    name, slug, description, price, currency, is_active, sort_order,
    user_id, is_system_template
  )
  select
    es.name,
    es.slug,
    es.description,
    es.price,
    es.currency,
    es.is_active,
    es.sort_order,
    new.id,
    false
  from public.extra_services es
  where es.is_system_template = true
    and es.is_active = true
    and not exists (
      select 1
      from public.extra_services own
      where own.user_id = new.id
        and own.slug = es.slug
    );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) RLS: readable templates are flagged system templates only
-- ---------------------------------------------------------------------------

drop policy if exists forms_select_own_or_template on public.forms;
create policy forms_select_own_or_template on public.forms for select to authenticated
  using (user_id = auth.uid() or is_system_template = true);

drop policy if exists packages_select_own_or_template on public.packages;
create policy packages_select_own_or_template on public.packages for select to authenticated
  using (user_id = auth.uid() or is_system_template = true);

drop policy if exists package_items_select_own on public.package_items;
create policy package_items_select_own on public.package_items for select to authenticated
  using (
    exists (
      select 1 from public.packages p
      where p.id = package_items.package_id
        and (p.user_id = auth.uid() or p.is_system_template = true)
    )
  );

drop policy if exists extra_services_select_own_or_template on public.extra_services;
create policy extra_services_select_own_or_template on public.extra_services for select to authenticated
  using (user_id = auth.uid() or is_system_template = true);

-- ---------------------------------------------------------------------------
-- 6) Link legacy public.users rows to auth.users by email (no duplicates)
-- ---------------------------------------------------------------------------

create or replace function public.remap_legacy_studio_user(
  p_legacy_id uuid,
  p_auth_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  legacy_email text;
  legacy_name text;
  legacy_avatar text;
  auth_email text;
  tmp_email text;
begin
  if p_legacy_id is null or p_auth_id is null or p_legacy_id = p_auth_id then
    return;
  end if;

  -- Already linked
  if exists (select 1 from public.users u where u.id = p_auth_id) then
    return;
  end if;

  if not exists (select 1 from public.users u where u.id = p_legacy_id) then
    return;
  end if;

  if not exists (select 1 from auth.users au where au.id = p_auth_id) then
    raise exception 'auth user % missing', p_auth_id;
  end if;

  select u.email, u.name, u.avatar_url
  into legacy_email, legacy_name, legacy_avatar
  from public.users u
  where u.id = p_legacy_id;

  select au.email into auth_email from auth.users au where au.id = p_auth_id;
  tmp_email := 'remap+' || replace(p_auth_id::text, '-', '') || '@ourwed.invalid';

  insert into public.users (id, email, name, avatar_url)
  values (
    p_auth_id,
    tmp_email,
    coalesce(nullif(trim(legacy_name), ''), split_part(coalesce(auth_email, legacy_email, 'studio'), '@', 1)),
    legacy_avatar
  );

  update public.weddings set user_id = p_auth_id where user_id = p_legacy_id;
  update public.notifications set user_id = p_auth_id where user_id = p_legacy_id;
  update public.studio_travel_settings set user_id = p_auth_id where user_id = p_legacy_id;
  update public.forms set user_id = p_auth_id where user_id = p_legacy_id;
  update public.packages set user_id = p_auth_id where user_id = p_legacy_id;
  update public.extra_services set user_id = p_auth_id where user_id = p_legacy_id;
  update public.form_instances set user_id = p_auth_id where user_id = p_legacy_id;
  update public.contracts set generated_by = p_auth_id where generated_by = p_legacy_id;
  update public.timeline_events set created_by = p_auth_id where created_by = p_legacy_id;

  delete from public.users where id = p_legacy_id;

  update public.users
  set email = coalesce(auth_email, legacy_email),
      name = coalesce(nullif(trim(legacy_name), ''), name)
  where id = p_auth_id;

  insert into public.profiles (id, first_name, last_name, profession)
  values (
    p_auth_id,
    coalesce(nullif(trim(split_part(coalesce(legacy_name, ''), ' ', 1)), ''), ''),
    coalesce(
      nullif(
        trim(substring(coalesce(legacy_name, '') from length(split_part(coalesce(legacy_name, ''), ' ', 1)) + 1)),
        ''
      ),
      ''
    ),
    ''
  )
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.remap_legacy_studio_user(uuid, uuid) from public;

do $$
declare
  r record;
begin
  for r in
    select
      u.id as legacy_id,
      a.id as auth_id,
      u.email
    from public.users u
    join auth.users a
      on lower(a.email) = lower(u.email)
    where u.id is distinct from a.id
      and not exists (
        select 1 from public.users existing where existing.id = a.id
      )
  loop
    perform public.remap_legacy_studio_user(r.legacy_id, r.auth_id);
  end loop;

  -- Auth users with no public.users row at all (trigger missed) → create studio shell
  for r in
    select a.id as auth_id, a.email, a.raw_user_meta_data
    from auth.users a
    where not exists (select 1 from public.users u where u.id = a.id)
      and not exists (
        select 1 from public.users u where lower(u.email) = lower(a.email)
      )
  loop
    insert into public.users (id, email, name)
    values (
      r.auth_id,
      coalesce(r.email, ''),
      coalesce(
        nullif(trim(
          coalesce(r.raw_user_meta_data->>'first_name', '') || ' ' ||
          coalesce(r.raw_user_meta_data->>'last_name', '')
        ), ''),
        split_part(coalesce(r.email, 'studio'), '@', 1)
      )
    )
    on conflict (id) do nothing;

    insert into public.profiles (id, first_name, last_name, profession)
    values (
      r.auth_id,
      coalesce(r.raw_user_meta_data->>'first_name', ''),
      coalesce(r.raw_user_meta_data->>'last_name', ''),
      coalesce(r.raw_user_meta_data->>'profession', '')
    )
    on conflict (id) do nothing;
  end loop;
end $$;

-- Ensure every auth user with a matching public.users id also has a profile
insert into public.profiles (id, first_name, last_name, profession)
select
  u.id,
  coalesce(nullif(trim(split_part(u.name, ' ', 1)), ''), ''),
  coalesce(
    nullif(trim(substring(u.name from length(split_part(u.name, ' ', 1)) + 1)), ''),
    ''
  ),
  ''
from public.users u
join auth.users a on a.id = u.id
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Re-seed system template copies for studios that lost leaked private-only catalog
do $$
declare
  u record;
  template_package record;
  new_package_id uuid;
begin
  for u in
    select id from public.users
  loop
    if not exists (
      select 1 from public.forms f where f.user_id = u.id
    ) then
      insert into public.forms (
        name, slug, description, category, schema, version, is_active,
        user_id, is_system_template
      )
      select
        f.name, f.slug, f.description, f.category, f.schema, f.version, f.is_active,
        u.id, false
      from public.forms f
      where f.is_system_template = true
        and f.is_active = true
        and not exists (
          select 1 from public.forms own
          where own.user_id = u.id
            and own.slug = f.slug
            and own.version = f.version
        );
    end if;

    for template_package in
      select * from public.packages
      where is_system_template = true and is_active = true
    loop
      if exists (
        select 1 from public.packages p
        where p.user_id = u.id and p.slug = template_package.slug
      ) then
        continue;
      end if;

      insert into public.packages (
        name, slug, description, price, deposit_amount, currency, color,
        is_active, sort_order, user_id, is_system_template
      )
      values (
        template_package.name,
        template_package.slug,
        template_package.description,
        template_package.price,
        template_package.deposit_amount,
        template_package.currency,
        template_package.color,
        template_package.is_active,
        template_package.sort_order,
        u.id,
        false
      )
      returning id into new_package_id;

      insert into public.package_items (package_id, title, description, sort_order)
      select new_package_id, pi.title, pi.description, pi.sort_order
      from public.package_items pi
      where pi.package_id = template_package.id;
    end loop;

    insert into public.extra_services (
      name, slug, description, price, currency, is_active, sort_order,
      user_id, is_system_template
    )
    select
      es.name, es.slug, es.description, es.price, es.currency,
      es.is_active, es.sort_order, u.id, false
    from public.extra_services es
    where es.is_system_template = true
      and es.is_active = true
      and not exists (
        select 1 from public.extra_services own
        where own.user_id = u.id and own.slug = es.slug
      );
  end loop;
end $$;
