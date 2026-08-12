-- PRO mutation gate: ownership RLS remains; write policies also require active PRO.
-- SELECT/view paths unchanged. Account profile updates stay ungated.

create or replace function public.account_has_pro_access()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _ent jsonb;
begin
  if _uid is null then
    return false;
  end if;
  _ent := public.resolve_user_entitlement(_uid, timezone('utc', now()));
  return coalesce((_ent->>'canUseProFeatures')::boolean, false);
end;
$$;

comment on function public.account_has_pro_access() is
  'True when the authenticated billing account currently has PRO (trial/paid/manual).';

revoke all on function public.account_has_pro_access() from public, anon;
grant execute on function public.account_has_pro_access() to authenticated;

create or replace function public.assert_account_can_mutate_pro_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.account_has_pro_access() then
    raise exception 'pro_required'
      using errcode = '42501',
            hint = 'Active PRO entitlement required for this mutation';
  end if;
end;
$$;

revoke all on function public.assert_account_can_mutate_pro_data() from public, anon;
grant execute on function public.assert_account_can_mutate_pro_data() to authenticated;

-- Helper: rewrite a simple ownership write policy to also require PRO.
-- Applied table-by-table for core CRM mutations.

-- weddings
drop policy if exists weddings_insert_own on public.weddings;
create policy weddings_insert_own
  on public.weddings for insert to authenticated
  with check (user_id = auth.uid() and public.account_has_pro_access());

drop policy if exists weddings_update_own on public.weddings;
create policy weddings_update_own
  on public.weddings for update to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access())
  with check (user_id = auth.uid() and public.account_has_pro_access());

drop policy if exists weddings_delete_own on public.weddings;
create policy weddings_delete_own
  on public.weddings for delete to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access());

-- sessions
drop policy if exists sessions_insert_own on public.sessions;
create policy sessions_insert_own
  on public.sessions for insert to authenticated
  with check (user_id = auth.uid() and public.account_has_pro_access());

drop policy if exists sessions_update_own on public.sessions;
create policy sessions_update_own
  on public.sessions for update to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access())
  with check (user_id = auth.uid() and public.account_has_pro_access());

drop policy if exists sessions_delete_own on public.sessions;
create policy sessions_delete_own
  on public.sessions for delete to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access());

-- wedding-owned children
drop policy if exists contacts_insert_own on public.contacts;
create policy contacts_insert_own on public.contacts for insert to authenticated
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists contacts_update_own on public.contacts;
create policy contacts_update_own on public.contacts for update to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access())
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists contacts_delete_own on public.contacts;
create policy contacts_delete_own on public.contacts for delete to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());

drop policy if exists payments_insert_own on public.payments;
create policy payments_insert_own on public.payments for insert to authenticated
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists payments_update_own on public.payments;
create policy payments_update_own on public.payments for update to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access())
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists payments_delete_own on public.payments;
create policy payments_delete_own on public.payments for delete to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());

drop policy if exists notes_insert_own on public.notes;
create policy notes_insert_own on public.notes for insert to authenticated
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists notes_update_own on public.notes;
create policy notes_update_own on public.notes for update to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access())
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists notes_delete_own on public.notes;
create policy notes_delete_own on public.notes for delete to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());

drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own on public.tasks for insert to authenticated
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own on public.tasks for update to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access())
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own on public.tasks for delete to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());

drop policy if exists timeline_events_insert_own on public.timeline_events;
create policy timeline_events_insert_own on public.timeline_events for insert to authenticated
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists timeline_events_update_own on public.timeline_events;
create policy timeline_events_update_own on public.timeline_events for update to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access())
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists timeline_events_delete_own on public.timeline_events;
create policy timeline_events_delete_own on public.timeline_events for delete to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());

drop policy if exists calendar_events_insert_own on public.calendar_events;
create policy calendar_events_insert_own on public.calendar_events for insert to authenticated
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists calendar_events_update_own on public.calendar_events;
create policy calendar_events_update_own on public.calendar_events for update to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access())
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists calendar_events_delete_own on public.calendar_events;
create policy calendar_events_delete_own on public.calendar_events for delete to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());

drop policy if exists packages_insert_own on public.packages;
create policy packages_insert_own on public.packages for insert to authenticated
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists packages_update_own on public.packages;
create policy packages_update_own on public.packages for update to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access())
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists packages_delete_own on public.packages;
create policy packages_delete_own on public.packages for delete to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access());

drop policy if exists extra_services_insert_own on public.extra_services;
create policy extra_services_insert_own on public.extra_services for insert to authenticated
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists extra_services_update_own on public.extra_services;
create policy extra_services_update_own on public.extra_services for update to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access())
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists extra_services_delete_own on public.extra_services;
create policy extra_services_delete_own on public.extra_services for delete to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access());

drop policy if exists form_instances_insert_own on public.form_instances;
create policy form_instances_insert_own on public.form_instances for insert to authenticated
  with check (user_id = auth.uid() and public.account_has_pro_access());

drop policy if exists forms_insert_own on public.forms;
create policy forms_insert_own on public.forms for insert to authenticated
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists forms_update_own on public.forms;
create policy forms_update_own on public.forms for update to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access())
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists forms_delete_own on public.forms;
create policy forms_delete_own on public.forms for delete to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access());

-- profiles remain account-management (no PRO gate on update)
-- notifications remain ungated (in-app notices)

notify pgrst, 'reload schema';
