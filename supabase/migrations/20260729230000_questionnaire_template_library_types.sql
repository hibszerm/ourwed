-- =============================================================================
-- Questionnaire Template Library — type discrimination + default-per-type
-- =============================================================================
-- Extends questionnaire_templates for contract | pre_wedding.
-- Existing rows are backfilled as pre_wedding.
-- One active default per (owner_id, type).
-- Must run AFTER 20260729200000_prewedding_questionnaire.sql
-- =============================================================================

alter table public.questionnaire_templates
  add column if not exists type text not null default 'pre_wedding';

alter table public.questionnaire_templates
  drop constraint if exists questionnaire_templates_type_check;

alter table public.questionnaire_templates
  add constraint questionnaire_templates_type_check
  check (type in ('contract', 'pre_wedding'));

comment on column public.questionnaire_templates.type is
  'Questionnaire kind: contract (Do umowy) or pre_wedding (Przedślubna).';

update public.questionnaire_templates
set type = 'pre_wedding'
where type is null or type = '' or type not in ('contract', 'pre_wedding');

-- Replace owner-only default uniqueness with owner+type uniqueness.
drop index if exists public.questionnaire_templates_default_per_owner;

create unique index if not exists questionnaire_templates_default_per_owner_type
  on public.questionnaire_templates (owner_id, type)
  where is_default = true and is_archived = false;

create index if not exists questionnaire_templates_owner_type_archived
  on public.questionnaire_templates (owner_id, type, is_archived);

-- Seed source_key uniqueness per owner (avoid duplicate built-in copies).
create unique index if not exists questionnaire_templates_owner_source_key
  on public.questionnaire_templates (owner_id, source_key)
  where source_key is not null;
