-- Grants + authenticated-scoped RLS for calendar integration tables.
-- Fixes client reads after 20260730160000 (PostgREST + default privileges).

grant select, insert, update, delete on public.calendar_integrations to authenticated;
grant select, insert, update, delete on public.external_calendar_events to authenticated;
grant select, insert on public.calendar_sync_jobs to authenticated;

-- Secrets and OAuth states remain service-role only (no grants to authenticated/anon).

drop policy if exists calendar_integrations_select_own on public.calendar_integrations;
create policy calendar_integrations_select_own
  on public.calendar_integrations for select to authenticated
  using (user_id = auth.uid());

drop policy if exists calendar_integrations_insert_own on public.calendar_integrations;
create policy calendar_integrations_insert_own
  on public.calendar_integrations for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists calendar_integrations_update_own on public.calendar_integrations;
create policy calendar_integrations_update_own
  on public.calendar_integrations for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists calendar_integrations_delete_own on public.calendar_integrations;
create policy calendar_integrations_delete_own
  on public.calendar_integrations for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists external_calendar_events_select_own on public.external_calendar_events;
create policy external_calendar_events_select_own
  on public.external_calendar_events for select to authenticated
  using (user_id = auth.uid());

drop policy if exists external_calendar_events_insert_own on public.external_calendar_events;
create policy external_calendar_events_insert_own
  on public.external_calendar_events for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists external_calendar_events_update_own on public.external_calendar_events;
create policy external_calendar_events_update_own
  on public.external_calendar_events for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists external_calendar_events_delete_own on public.external_calendar_events;
create policy external_calendar_events_delete_own
  on public.external_calendar_events for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists calendar_sync_jobs_select_own on public.calendar_sync_jobs;
create policy calendar_sync_jobs_select_own
  on public.calendar_sync_jobs for select to authenticated
  using (user_id = auth.uid());

drop policy if exists calendar_sync_jobs_insert_own on public.calendar_sync_jobs;
create policy calendar_sync_jobs_insert_own
  on public.calendar_sync_jobs for insert to authenticated
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
