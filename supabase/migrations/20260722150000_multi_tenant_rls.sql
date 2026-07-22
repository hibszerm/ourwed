-- =============================================================================
-- Multi-tenant RLS — isolate every studio's data by auth.uid()
-- =============================================================================
-- 1) Add owner columns where the chain was missing  ← MUST run before helpers
-- 2) Helper functions that reference those columns
-- 3) Replace every dev_allow_all_* policy
-- 4) Public form access via SECURITY DEFINER RPCs (token), not open table policies
--
-- NOTE: An earlier draft of this file created is_form_instance_owner() before
-- adding form_instances.user_id, which aborted the transaction (42703).
-- Column ALTERs are therefore intentionally first.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Schema: ownership columns (FIRST — required by helpers below)
-- ---------------------------------------------------------------------------

alter table public.forms
  add column if not exists user_id uuid references public.users (id) on delete cascade;

alter table public.packages
  add column if not exists user_id uuid references public.users (id) on delete cascade;

alter table public.extra_services
  add column if not exists user_id uuid references public.users (id) on delete cascade;

alter table public.form_instances
  add column if not exists user_id uuid references public.users (id) on delete cascade;

-- Backfill instance owners from weddings where possible
update public.form_instances fi
set user_id = w.user_id
from public.weddings w
where fi.wedding_id = w.id
  and fi.user_id is null;

-- Unique constraints: catalog is per-studio (templates keep user_id null)
alter table public.forms drop constraint if exists forms_slug_version_key;
alter table public.forms drop constraint if exists forms_slug_version_user_uidx;

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

-- ---------------------------------------------------------------------------
-- Helpers (AFTER ownership columns exist)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Seed per-user catalog copies on signup (extend handle_new_user)
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

  -- Copy platform form templates (user_id is null) into this studio
  for template_form in
    select *
    from public.forms
    where user_id is null
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
        name, slug, description, category, schema, version, is_active, user_id
      )
      values (
        template_form.name,
        template_form.slug,
        template_form.description,
        template_form.category,
        template_form.schema,
        template_form.version,
        template_form.is_active,
        new.id
      );
    end if;
  end loop;

  -- Copy platform packages + items
  for template_package in
    select *
    from public.packages
    where user_id is null
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
      new.id
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

  -- Copy platform extra services
  insert into public.extra_services (
    name, slug, description, price, currency, is_active, sort_order, user_id
  )
  select
    es.name,
    es.slug,
    es.description,
    es.price,
    es.currency,
    es.is_active,
    es.sort_order,
    new.id
  from public.extra_services es
  where es.user_id is null
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
-- Drop ALL open development policies
-- ---------------------------------------------------------------------------

drop policy if exists "dev_allow_all_users" on public.users;
drop policy if exists "dev_allow_all_weddings" on public.weddings;
drop policy if exists "dev_allow_all_contacts" on public.contacts;
drop policy if exists "dev_allow_all_payments" on public.payments;
drop policy if exists "dev_allow_all_notes" on public.notes;
drop policy if exists "dev_allow_all_timeline_events" on public.timeline_events;
drop policy if exists "dev_allow_all_tasks" on public.tasks;
drop policy if exists "dev_allow_all_forms" on public.forms;
drop policy if exists "dev_allow_all_form_instances" on public.form_instances;
drop policy if exists "dev_allow_all_form_answers" on public.form_answers;
drop policy if exists "dev_allow_all_contracts" on public.contracts;
drop policy if exists "dev_allow_all_calendar_events" on public.calendar_events;
drop policy if exists "dev_allow_all_galleries" on public.galleries;
drop policy if exists "dev_allow_all_notifications" on public.notifications;
drop policy if exists "dev_allow_all_packages" on public.packages;
drop policy if exists "dev_allow_all_package_items" on public.package_items;
drop policy if exists "dev_allow_all_extra_services" on public.extra_services;
drop policy if exists "dev_allow_all_wedding_extra_services" on public.wedding_extra_services;
drop policy if exists "dev_allow_all_studio_travel_settings" on public.studio_travel_settings;
drop policy if exists "dev_allow_all_wedding_places" on public.wedding_places;
drop policy if exists "dev_allow_all_travel_segments" on public.travel_segments;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

drop policy if exists users_select_own on public.users;
create policy users_select_own
  on public.users for select to authenticated
  using (id = auth.uid());

drop policy if exists users_update_own on public.users;
create policy users_update_own
  on public.users for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Inserts happen via security definer trigger only

-- ---------------------------------------------------------------------------
-- weddings
-- ---------------------------------------------------------------------------

drop policy if exists weddings_select_own on public.weddings;
create policy weddings_select_own
  on public.weddings for select to authenticated
  using (user_id = auth.uid());

drop policy if exists weddings_insert_own on public.weddings;
create policy weddings_insert_own
  on public.weddings for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists weddings_update_own on public.weddings;
create policy weddings_update_own
  on public.weddings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists weddings_delete_own on public.weddings;
create policy weddings_delete_own
  on public.weddings for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Wedding-scoped children (same pattern)
-- ---------------------------------------------------------------------------

-- contacts
drop policy if exists contacts_select_own on public.contacts;
create policy contacts_select_own on public.contacts for select to authenticated
  using (public.is_wedding_owner(wedding_id));
drop policy if exists contacts_insert_own on public.contacts;
create policy contacts_insert_own on public.contacts for insert to authenticated
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists contacts_update_own on public.contacts;
create policy contacts_update_own on public.contacts for update to authenticated
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists contacts_delete_own on public.contacts;
create policy contacts_delete_own on public.contacts for delete to authenticated
  using (public.is_wedding_owner(wedding_id));

-- payments
drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments for select to authenticated
  using (public.is_wedding_owner(wedding_id));
drop policy if exists payments_insert_own on public.payments;
create policy payments_insert_own on public.payments for insert to authenticated
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists payments_update_own on public.payments;
create policy payments_update_own on public.payments for update to authenticated
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists payments_delete_own on public.payments;
create policy payments_delete_own on public.payments for delete to authenticated
  using (public.is_wedding_owner(wedding_id));

-- notes
drop policy if exists notes_select_own on public.notes;
create policy notes_select_own on public.notes for select to authenticated
  using (public.is_wedding_owner(wedding_id));
drop policy if exists notes_insert_own on public.notes;
create policy notes_insert_own on public.notes for insert to authenticated
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists notes_update_own on public.notes;
create policy notes_update_own on public.notes for update to authenticated
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists notes_delete_own on public.notes;
create policy notes_delete_own on public.notes for delete to authenticated
  using (public.is_wedding_owner(wedding_id));

-- timeline_events
drop policy if exists timeline_events_select_own on public.timeline_events;
create policy timeline_events_select_own on public.timeline_events for select to authenticated
  using (public.is_wedding_owner(wedding_id));
drop policy if exists timeline_events_insert_own on public.timeline_events;
create policy timeline_events_insert_own on public.timeline_events for insert to authenticated
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists timeline_events_update_own on public.timeline_events;
create policy timeline_events_update_own on public.timeline_events for update to authenticated
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists timeline_events_delete_own on public.timeline_events;
create policy timeline_events_delete_own on public.timeline_events for delete to authenticated
  using (public.is_wedding_owner(wedding_id));

-- tasks
drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own on public.tasks for select to authenticated
  using (public.is_wedding_owner(wedding_id));
drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own on public.tasks for insert to authenticated
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own on public.tasks for update to authenticated
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own on public.tasks for delete to authenticated
  using (public.is_wedding_owner(wedding_id));

-- contracts
drop policy if exists contracts_select_own on public.contracts;
create policy contracts_select_own on public.contracts for select to authenticated
  using (public.is_wedding_owner(wedding_id));
drop policy if exists contracts_insert_own on public.contracts;
create policy contracts_insert_own on public.contracts for insert to authenticated
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists contracts_update_own on public.contracts;
create policy contracts_update_own on public.contracts for update to authenticated
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists contracts_delete_own on public.contracts;
create policy contracts_delete_own on public.contracts for delete to authenticated
  using (public.is_wedding_owner(wedding_id));

-- calendar_events
drop policy if exists calendar_events_select_own on public.calendar_events;
create policy calendar_events_select_own on public.calendar_events for select to authenticated
  using (public.is_wedding_owner(wedding_id));
drop policy if exists calendar_events_insert_own on public.calendar_events;
create policy calendar_events_insert_own on public.calendar_events for insert to authenticated
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists calendar_events_update_own on public.calendar_events;
create policy calendar_events_update_own on public.calendar_events for update to authenticated
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists calendar_events_delete_own on public.calendar_events;
create policy calendar_events_delete_own on public.calendar_events for delete to authenticated
  using (public.is_wedding_owner(wedding_id));

-- galleries
drop policy if exists galleries_select_own on public.galleries;
create policy galleries_select_own on public.galleries for select to authenticated
  using (public.is_wedding_owner(wedding_id));
drop policy if exists galleries_insert_own on public.galleries;
create policy galleries_insert_own on public.galleries for insert to authenticated
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists galleries_update_own on public.galleries;
create policy galleries_update_own on public.galleries for update to authenticated
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists galleries_delete_own on public.galleries;
create policy galleries_delete_own on public.galleries for delete to authenticated
  using (public.is_wedding_owner(wedding_id));

-- wedding_extra_services
drop policy if exists wedding_extra_services_select_own on public.wedding_extra_services;
create policy wedding_extra_services_select_own on public.wedding_extra_services for select to authenticated
  using (public.is_wedding_owner(wedding_id));
drop policy if exists wedding_extra_services_insert_own on public.wedding_extra_services;
create policy wedding_extra_services_insert_own on public.wedding_extra_services for insert to authenticated
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists wedding_extra_services_update_own on public.wedding_extra_services;
create policy wedding_extra_services_update_own on public.wedding_extra_services for update to authenticated
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists wedding_extra_services_delete_own on public.wedding_extra_services;
create policy wedding_extra_services_delete_own on public.wedding_extra_services for delete to authenticated
  using (public.is_wedding_owner(wedding_id));

-- wedding_places
drop policy if exists wedding_places_select_own on public.wedding_places;
create policy wedding_places_select_own on public.wedding_places for select to authenticated
  using (public.is_wedding_owner(wedding_id));
drop policy if exists wedding_places_insert_own on public.wedding_places;
create policy wedding_places_insert_own on public.wedding_places for insert to authenticated
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists wedding_places_update_own on public.wedding_places;
create policy wedding_places_update_own on public.wedding_places for update to authenticated
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists wedding_places_delete_own on public.wedding_places;
create policy wedding_places_delete_own on public.wedding_places for delete to authenticated
  using (public.is_wedding_owner(wedding_id));

-- travel_segments
drop policy if exists travel_segments_select_own on public.travel_segments;
create policy travel_segments_select_own on public.travel_segments for select to authenticated
  using (public.is_wedding_owner(wedding_id));
drop policy if exists travel_segments_insert_own on public.travel_segments;
create policy travel_segments_insert_own on public.travel_segments for insert to authenticated
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists travel_segments_update_own on public.travel_segments;
create policy travel_segments_update_own on public.travel_segments for update to authenticated
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));
drop policy if exists travel_segments_delete_own on public.travel_segments;
create policy travel_segments_delete_own on public.travel_segments for delete to authenticated
  using (public.is_wedding_owner(wedding_id));

-- ---------------------------------------------------------------------------
-- Direct user ownership
-- ---------------------------------------------------------------------------

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
drop policy if exists notifications_insert_own on public.notifications;
create policy notifications_insert_own on public.notifications for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists studio_travel_settings_select_own on public.studio_travel_settings;
create policy studio_travel_settings_select_own on public.studio_travel_settings for select to authenticated
  using (user_id = auth.uid());
drop policy if exists studio_travel_settings_insert_own on public.studio_travel_settings;
create policy studio_travel_settings_insert_own on public.studio_travel_settings for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists studio_travel_settings_update_own on public.studio_travel_settings;
create policy studio_travel_settings_update_own on public.studio_travel_settings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists studio_travel_settings_delete_own on public.studio_travel_settings;
create policy studio_travel_settings_delete_own on public.studio_travel_settings for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Catalog: own rows + read-only platform templates (user_id is null)
-- ---------------------------------------------------------------------------

drop policy if exists forms_select_own_or_template on public.forms;
create policy forms_select_own_or_template on public.forms for select to authenticated
  using (user_id = auth.uid() or user_id is null);
drop policy if exists forms_insert_own on public.forms;
create policy forms_insert_own on public.forms for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists forms_update_own on public.forms;
create policy forms_update_own on public.forms for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists forms_delete_own on public.forms;
create policy forms_delete_own on public.forms for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists packages_select_own_or_template on public.packages;
create policy packages_select_own_or_template on public.packages for select to authenticated
  using (user_id = auth.uid() or user_id is null);
drop policy if exists packages_insert_own on public.packages;
create policy packages_insert_own on public.packages for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists packages_update_own on public.packages;
create policy packages_update_own on public.packages for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists packages_delete_own on public.packages;
create policy packages_delete_own on public.packages for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists package_items_select_own on public.package_items;
create policy package_items_select_own on public.package_items for select to authenticated
  using (
    exists (
      select 1 from public.packages p
      where p.id = package_items.package_id
        and (p.user_id = auth.uid() or p.user_id is null)
    )
  );
drop policy if exists package_items_insert_own on public.package_items;
create policy package_items_insert_own on public.package_items for insert to authenticated
  with check (
    exists (
      select 1 from public.packages p
      where p.id = package_items.package_id
        and p.user_id = auth.uid()
    )
  );
drop policy if exists package_items_update_own on public.package_items;
create policy package_items_update_own on public.package_items for update to authenticated
  using (
    exists (
      select 1 from public.packages p
      where p.id = package_items.package_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.packages p
      where p.id = package_items.package_id
        and p.user_id = auth.uid()
    )
  );
drop policy if exists package_items_delete_own on public.package_items;
create policy package_items_delete_own on public.package_items for delete to authenticated
  using (
    exists (
      select 1 from public.packages p
      where p.id = package_items.package_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists extra_services_select_own_or_template on public.extra_services;
create policy extra_services_select_own_or_template on public.extra_services for select to authenticated
  using (user_id = auth.uid() or user_id is null);
drop policy if exists extra_services_insert_own on public.extra_services;
create policy extra_services_insert_own on public.extra_services for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists extra_services_update_own on public.extra_services;
create policy extra_services_update_own on public.extra_services for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists extra_services_delete_own on public.extra_services;
create policy extra_services_delete_own on public.extra_services for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- form_instances + form_answers (studio only via RLS; public via RPC)
-- ---------------------------------------------------------------------------

drop policy if exists form_instances_select_own on public.form_instances;
create policy form_instances_select_own on public.form_instances for select to authenticated
  using (user_id = auth.uid());
drop policy if exists form_instances_insert_own on public.form_instances;
create policy form_instances_insert_own on public.form_instances for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists form_instances_update_own on public.form_instances;
create policy form_instances_update_own on public.form_instances for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists form_instances_delete_own on public.form_instances;
create policy form_instances_delete_own on public.form_instances for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists form_answers_select_own on public.form_answers;
create policy form_answers_select_own on public.form_answers for select to authenticated
  using (public.is_form_instance_owner(instance_id));
drop policy if exists form_answers_insert_own on public.form_answers;
create policy form_answers_insert_own on public.form_answers for insert to authenticated
  with check (public.is_form_instance_owner(instance_id));
drop policy if exists form_answers_update_own on public.form_answers;
create policy form_answers_update_own on public.form_answers for update to authenticated
  using (public.is_form_instance_owner(instance_id))
  with check (public.is_form_instance_owner(instance_id));
drop policy if exists form_answers_delete_own on public.form_answers;
create policy form_answers_delete_own on public.form_answers for delete to authenticated
  using (public.is_form_instance_owner(instance_id));

-- ---------------------------------------------------------------------------
-- Public form RPCs (token-based, SECURITY DEFINER)
-- ---------------------------------------------------------------------------

create or replace function public.public_get_form_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inst public.form_instances%rowtype;
  form_row public.forms%rowtype;
  packages_json jsonb := '[]'::jsonb;
  result jsonb;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    return null;
  end if;

  select * into inst
  from public.form_instances
  where token = trim(p_token)
  limit 1;

  if not found then
    return null;
  end if;

  -- Auto-expire
  if inst.expires_at is not null
     and inst.expires_at <= timezone('utc', now())
     and inst.status not in ('submitted', 'approved', 'expired') then
    update public.form_instances
    set status = 'expired'
    where id = inst.id
      and status not in ('submitted', 'approved', 'expired')
    returning * into inst;
  end if;

  -- First open
  if inst.status = 'pending' then
    update public.form_instances
    set status = 'opened',
        opened_at = timezone('utc', now())
    where id = inst.id
      and status = 'pending'
    returning * into inst;
  end if;

  select * into form_row from public.forms where id = inst.form_id;

  if inst.user_id is not null then
    select coalesce(jsonb_agg(
      jsonb_build_object('id', p.id, 'name', p.name)
      order by p.sort_order, p.created_at
    ), '[]'::jsonb)
    into packages_json
    from public.packages p
    where p.user_id = inst.user_id
      and p.is_active = true;
  end if;

  result := jsonb_build_object(
    'instance', to_jsonb(inst),
    'form', to_jsonb(form_row),
    'packages', packages_json
  );
  return result;
end;
$$;

create or replace function public.public_submit_form_by_token(
  p_token text,
  p_answer_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inst public.form_instances%rowtype;
  answer_row public.form_answers%rowtype;
  submitted_ts timestamptz := timezone('utc', now());
  note_text text;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    raise exception 'INVALID_TOKEN';
  end if;

  select * into inst
  from public.form_instances
  where token = trim(p_token)
  for update;

  if not found then
    raise exception 'INVALID_TOKEN';
  end if;

  if inst.status in ('submitted', 'approved') then
    raise exception 'ALREADY_SUBMITTED';
  end if;
  if inst.status in ('revoked', 'rejected', 'archived') then
    raise exception 'LINK_REVOKED';
  end if;
  if inst.status = 'expired'
     or (inst.expires_at is not null and inst.expires_at <= submitted_ts) then
    update public.form_instances set status = 'expired' where id = inst.id;
    raise exception 'LINK_EXPIRED';
  end if;

  insert into public.form_answers (instance_id, answer_json)
  values (inst.id, coalesce(p_answer_json, '{}'::jsonb))
  returning * into answer_row;

  update public.form_instances
  set
    status = 'submitted',
    submitted_at = submitted_ts,
    opened_at = coalesce(inst.opened_at, submitted_ts)
  where id = inst.id
  returning * into inst;

  -- Optional couple note on wedding-scoped questionnaires
  note_text := nullif(trim(coalesce(p_answer_json->'fields'->>'additionalNotes', '')), '');
  if inst.wedding_id is not null and note_text is not null then
    insert into public.notes (wedding_id, content, author)
    values (inst.wedding_id, note_text, 'Para');
  end if;

  if inst.wedding_id is not null then
    insert into public.timeline_events (
      wedding_id, type, title, description, system_generated
    )
    values (
      inst.wedding_id,
      'questionnaire_completed',
      'Wypełniono ankietę.',
      'Formularz został przesłany przez parę.',
      true
    );
  elsif inst.user_id is not null then
    insert into public.notifications (
      user_id, title, content, type, entity_type, entity_id, link, read
    )
    values (
      inst.user_id,
      'Nowa ankieta złożona',
      'Para wypełniła ankietę. Sprawdź oczekujące zgłoszenia.',
      'success',
      'form_instance',
      inst.id,
      '/ankiety/' || inst.id::text,
      false
    );
  end if;

  return jsonb_build_object(
    'answer', to_jsonb(answer_row),
    'instance', to_jsonb(inst)
  );
end;
$$;

revoke all on function public.public_get_form_by_token(text) from public;
grant execute on function public.public_get_form_by_token(text) to anon, authenticated;

revoke all on function public.public_submit_form_by_token(text, jsonb) from public;
grant execute on function public.public_submit_form_by_token(text, jsonb) to anon, authenticated;

-- Prefer studio-owned catalog rows in app queries; templates remain readable.
-- Existing authenticated users: copy templates once if they have no owned forms yet.
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
          select 1
          from public.forms own
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
          select 1
          from public.extra_services own
          where own.user_id = u.id
            and own.slug = es.slug
        );
    end if;
  end loop;
end $$;
