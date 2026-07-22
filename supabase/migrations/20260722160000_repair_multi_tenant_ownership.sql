-- =============================================================================
-- Repair: multi-tenant ownership columns + helper order
-- =============================================================================
-- Context:
--   20260722150000_multi_tenant_rls.sql initially FAILED on remote because it
--   created public.is_form_instance_owner() referencing form_instances.user_id
--   BEFORE that column existed (SQLSTATE 42703). The transaction rolled back,
--   so NO ownership columns were added.
--
--   20260722150000 was corrected (columns first). This repair is an idempotent
--   safety net for any environment where columns/helpers may still be missing.
-- =============================================================================

-- 1) Ensure ownership columns exist (no data loss)
alter table public.forms
  add column if not exists user_id uuid references public.users (id) on delete cascade;

alter table public.packages
  add column if not exists user_id uuid references public.users (id) on delete cascade;

alter table public.extra_services
  add column if not exists user_id uuid references public.users (id) on delete cascade;

alter table public.form_instances
  add column if not exists user_id uuid references public.users (id) on delete cascade;

-- 2) Backfill instance owners from wedding chain (templates stay null)
update public.form_instances fi
set user_id = w.user_id
from public.weddings w
where fi.wedding_id = w.id
  and fi.user_id is null;

-- 3) Per-studio unique indexes (templates remain ownerless / user_id null)
alter table public.forms drop constraint if exists forms_slug_version_key;
create unique index if not exists forms_user_slug_version_uidx
  on public.forms (user_id, slug, version)
  where user_id is not null;
create unique index if not exists forms_template_slug_version_uidx
  on public.forms (slug, version)
  where user_id is null;

alter table public.packages drop constraint if exists packages_slug_key;
drop index if exists packages_slug_key;
create unique index if not exists packages_user_slug_uidx
  on public.packages (user_id, slug)
  where user_id is not null;
create unique index if not exists packages_template_slug_uidx
  on public.packages (slug)
  where user_id is null;

alter table public.extra_services drop constraint if exists extra_services_slug_key;
drop index if exists extra_services_slug_key;
create unique index if not exists extra_services_user_slug_uidx
  on public.extra_services (user_id, slug)
  where user_id is not null;
create unique index if not exists extra_services_template_slug_uidx
  on public.extra_services (slug)
  where user_id is null;

create index if not exists forms_user_id_idx on public.forms (user_id);
create index if not exists packages_user_id_idx on public.packages (user_id);
create index if not exists extra_services_user_id_idx on public.extra_services (user_id);
create index if not exists form_instances_user_id_idx on public.form_instances (user_id);

-- 4) Recreate helpers AFTER columns exist
create or replace function public.is_wedding_owner(p_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.weddings w
    where w.id = p_wedding_id
      and w.user_id = auth.uid()
  );
$$;

create or replace function public.is_form_instance_owner(p_instance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.form_instances fi
    where fi.id = p_instance_id
      and fi.user_id = auth.uid()
  );
$$;

revoke all on function public.is_wedding_owner(uuid) from public;
grant execute on function public.is_wedding_owner(uuid) to authenticated;
revoke all on function public.is_form_instance_owner(uuid) from public;
grant execute on function public.is_form_instance_owner(uuid) to authenticated;

-- 5) Seed studio catalog copies for existing users that still only see templates
do $$
declare
  u record;
  template_package record;
  new_package_id uuid;
begin
  for u in select id from public.users loop
    if not exists (select 1 from public.forms where user_id = u.id) then
      insert into public.forms (
        name, slug, description, category, schema, version, is_active, user_id
      )
      select
        f.name, f.slug, f.description, f.category, f.schema, f.version, f.is_active, u.id
      from public.forms f
      where f.user_id is null
        and f.is_active = true
        and not exists (
          select 1 from public.forms own
          where own.user_id = u.id
            and own.slug = f.slug
            and own.version = f.version
        );
    end if;

    if not exists (select 1 from public.packages where user_id = u.id) then
      for template_package in
        select * from public.packages where user_id is null and is_active = true
      loop
        if exists (
          select 1 from public.packages p
          where p.user_id = u.id and p.slug = template_package.slug
        ) then
          continue;
        end if;

        insert into public.packages (
          name, slug, description, price, deposit_amount, currency, color,
          is_active, sort_order, user_id
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
          u.id
        )
        returning id into new_package_id;

        insert into public.package_items (
          package_id, title, description, sort_order
        )
        select
          new_package_id, pi.title, pi.description, pi.sort_order
        from public.package_items pi
        where pi.package_id = template_package.id;
      end loop;
    end if;

    if not exists (select 1 from public.extra_services where user_id = u.id) then
      insert into public.extra_services (
        name, slug, description, price, currency, is_active, sort_order, user_id
      )
      select
        es.name, es.slug, es.description, es.price, es.currency,
        es.is_active, es.sort_order, u.id
      from public.extra_services es
      where es.user_id is null
        and es.is_active = true
        and not exists (
          select 1 from public.extra_services own
          where own.user_id = u.id and own.slug = es.slug
        );
    end if;
  end loop;
end $$;
