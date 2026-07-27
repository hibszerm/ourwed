-- OURWED — wipe development contract / wedding / package content.
-- Preserves: schema, auth, profiles, studio_details, forms (questionnaire templates),
-- document_variable_registry, document_clause_defs, AI engine code.
-- Safe only while there is no production customer data.

begin;

-- Allow deleting locked exports created during AI testing.
drop trigger if exists wedding_documents_prevent_locked_mutation
  on public.wedding_documents;

-- Break package → template FKs before deleting templates.
update public.packages
set
  active_contract_template_id = null,
  active_contract_template_version_id = null
where
  active_contract_template_id is not null
  or active_contract_template_version_id is not null;

-- Optional tables (may not exist on every environment).
do $$
begin
  if to_regclass('public.wedding_contract_generation_runs') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'wedding_document_drafts'
        and column_name = 'generation_run_id'
    ) then
      execute 'update public.wedding_document_drafts set generation_run_id = null where generation_run_id is not null';
    end if;
    execute 'delete from public.wedding_contract_generation_runs';
  end if;

  if to_regclass('public.wedding_document_generation_sequences') is not null then
    execute 'delete from public.wedding_document_generation_sequences';
  end if;

  if to_regclass('public.travel_segments') is not null then
    execute 'delete from public.travel_segments';
  end if;
end $$;

delete from public.wedding_documents;
delete from public.wedding_document_drafts;

delete from public.document_template_component_links;
delete from public.document_block_conditions;
delete from public.document_blocks;
delete from public.document_templates;
delete from public.document_components;

delete from public.contracts;

delete from public.wedding_extra_services;
delete from public.wedding_places;
delete from public.calendar_events;
delete from public.tasks;
delete from public.timeline_events;
delete from public.notes;
delete from public.payments;
delete from public.contacts;
delete from public.form_answers;
delete from public.form_instances;
delete from public.galleries;
delete from public.notifications;
delete from public.weddings;
delete from public.package_items;
delete from public.packages;
delete from public.extra_services;

-- Restore immutability guard for future real exports.
create trigger wedding_documents_prevent_locked_mutation
  before update or delete on public.wedding_documents
  for each row
  execute function public.prevent_locked_wedding_document_mutation();

commit;
