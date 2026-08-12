-- Extend PRO write gate to catalog children, integrations, documents, travel.
-- SELECT policies unchanged. Ownership checks preserved.

-- package_items
drop policy if exists package_items_insert_own on public.package_items;
create policy package_items_insert_own on public.package_items for insert to authenticated
  with check (
    public.account_has_pro_access()
    and exists (
      select 1 from public.packages p
      where p.id = package_items.package_id
        and p.user_id = auth.uid()
    )
  );
drop policy if exists package_items_update_own on public.package_items;
create policy package_items_update_own on public.package_items for update to authenticated
  using (
    public.account_has_pro_access()
    and exists (
      select 1 from public.packages p
      where p.id = package_items.package_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    public.account_has_pro_access()
    and exists (
      select 1 from public.packages p
      where p.id = package_items.package_id
        and p.user_id = auth.uid()
    )
  );
drop policy if exists package_items_delete_own on public.package_items;
create policy package_items_delete_own on public.package_items for delete to authenticated
  using (
    public.account_has_pro_access()
    and exists (
      select 1 from public.packages p
      where p.id = package_items.package_id
        and p.user_id = auth.uid()
    )
  );

-- studio travel settings
drop policy if exists studio_travel_settings_insert_own on public.studio_travel_settings;
create policy studio_travel_settings_insert_own on public.studio_travel_settings for insert to authenticated
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists studio_travel_settings_update_own on public.studio_travel_settings;
create policy studio_travel_settings_update_own on public.studio_travel_settings for update to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access())
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists studio_travel_settings_delete_own on public.studio_travel_settings;
create policy studio_travel_settings_delete_own on public.studio_travel_settings for delete to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access());

-- calendar integrations
drop policy if exists calendar_integrations_insert_own on public.calendar_integrations;
create policy calendar_integrations_insert_own
  on public.calendar_integrations for insert to authenticated
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists calendar_integrations_update_own on public.calendar_integrations;
create policy calendar_integrations_update_own
  on public.calendar_integrations for update to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access())
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists calendar_integrations_delete_own on public.calendar_integrations;
create policy calendar_integrations_delete_own
  on public.calendar_integrations for delete to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access());

drop policy if exists external_calendar_events_insert_own on public.external_calendar_events;
create policy external_calendar_events_insert_own
  on public.external_calendar_events for insert to authenticated
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists external_calendar_events_update_own on public.external_calendar_events;
create policy external_calendar_events_update_own
  on public.external_calendar_events for update to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access())
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists external_calendar_events_delete_own on public.external_calendar_events;
create policy external_calendar_events_delete_own
  on public.external_calendar_events for delete to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access());

-- document templates (core write)
drop policy if exists document_templates_insert on public.document_templates;
create policy document_templates_insert on public.document_templates
  for insert to authenticated
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists document_templates_update on public.document_templates;
create policy document_templates_update on public.document_templates
  for update to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access())
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists document_templates_delete on public.document_templates;
create policy document_templates_delete on public.document_templates
  for delete to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access());

-- wedding document drafts / documents (ownership via wedding)
drop policy if exists wedding_document_drafts_insert on public.wedding_document_drafts;
create policy wedding_document_drafts_insert on public.wedding_document_drafts
  for insert to authenticated
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists wedding_document_drafts_update on public.wedding_document_drafts;
create policy wedding_document_drafts_update on public.wedding_document_drafts
  for update to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access())
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists wedding_document_drafts_delete on public.wedding_document_drafts;
create policy wedding_document_drafts_delete on public.wedding_document_drafts
  for delete to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());

drop policy if exists wedding_documents_insert on public.wedding_documents;
create policy wedding_documents_insert on public.wedding_documents
  for insert to authenticated
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists wedding_documents_update on public.wedding_documents;
create policy wedding_documents_update on public.wedding_documents
  for update to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access())
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists wedding_documents_delete on public.wedding_documents;
create policy wedding_documents_delete on public.wedding_documents
  for delete to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());

-- form_instances update/delete (send/apply paths)
drop policy if exists form_instances_update_own on public.form_instances;
create policy form_instances_update_own on public.form_instances for update to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access())
  with check (user_id = auth.uid() and public.account_has_pro_access());
drop policy if exists form_instances_delete_own on public.form_instances;
create policy form_instances_delete_own on public.form_instances for delete to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access());

-- company / studio identity (product config, not account profile)
drop policy if exists studio_details_insert_own on public.studio_details;
create policy studio_details_insert_own on public.studio_details
  for insert to authenticated
  with check (auth.uid() = user_id and public.account_has_pro_access());
drop policy if exists studio_details_update_own on public.studio_details;
create policy studio_details_update_own on public.studio_details
  for update to authenticated
  using (auth.uid() = user_id and public.account_has_pro_access())
  with check (auth.uid() = user_id and public.account_has_pro_access());
drop policy if exists studio_details_delete_own on public.studio_details;
create policy studio_details_delete_own on public.studio_details
  for delete to authenticated
  using (auth.uid() = user_id and public.account_has_pro_access());

notify pgrst, 'reload schema';
