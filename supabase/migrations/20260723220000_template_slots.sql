-- Template-first contracts: fillable DOCX + slot map on versions.
-- Questionnaires are independent; generation uses slot_map + VariableResolver.

alter table public.document_template_versions
  add column if not exists template_docx_path text,
  add column if not exists slot_map jsonb not null default '{"version":1,"slots":[],"unmappedDynamics":[]}'::jsonb;

comment on column public.document_template_versions.template_docx_path is
  'Fillable DOCX with {{registry_id}} placeholders. Null until AI import builds it.';

comment on column public.document_template_versions.slot_map is
  'Confirmed variable slots for this template version (registry bindings, no business values).';
