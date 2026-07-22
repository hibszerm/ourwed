-- =============================================================================
-- Documents Phase 1 — template management extras
-- =============================================================================

alter table public.document_templates
  add column if not exists is_default boolean not null default false;

create unique index if not exists document_templates_one_default_per_type_uidx
  on public.document_templates (user_id, doc_type)
  where is_default = true;

comment on column public.document_templates.is_default is
  'At most one default template per studio per doc_type. Changing default never deletes versions.';

alter table public.document_template_versions
  add column if not exists source_file_name text;

comment on column public.document_template_versions.source_file_name is
  'Original uploaded DOCX filename for display (path stays internal).';
