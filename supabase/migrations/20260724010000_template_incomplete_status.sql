-- Allow incomplete template status when slot bindings are missing.
alter table public.document_templates
  drop constraint if exists document_templates_status_check;

alter table public.document_templates
  add constraint document_templates_status_check
  check (status in ('draft', 'ready', 'incomplete', 'archived'));
