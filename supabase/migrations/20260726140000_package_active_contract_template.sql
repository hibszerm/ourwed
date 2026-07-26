-- Package-owned contract template (one active contract per package).
-- Mirrors questionnaire_form_id ownership pattern.

alter table public.packages
  add column if not exists active_contract_template_id uuid
    references public.document_templates (id) on delete set null;

alter table public.packages
  add column if not exists active_contract_template_version_id uuid
    references public.document_template_versions (id) on delete set null;

create index if not exists packages_active_contract_template_id_idx
  on public.packages (active_contract_template_id)
  where active_contract_template_id is not null;

comment on column public.packages.active_contract_template_id is
  'Active contract template used when generating umowa for weddings on this package.';

comment on column public.packages.active_contract_template_version_id is
  'Pinned analyzed template version for the package contract (optional; falls back to template current version).';
