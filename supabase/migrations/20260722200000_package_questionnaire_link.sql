-- Link studio packages to an AI-generated (or any) questionnaire form definition.
-- Used when contract import detects a package-specific questionnaire.

alter table public.packages
  add column if not exists questionnaire_form_id uuid
    references public.forms (id) on delete set null;

create index if not exists packages_questionnaire_form_id_idx
  on public.packages (questionnaire_form_id)
  where questionnaire_form_id is not null;

comment on column public.packages.questionnaire_form_id is
  'Optional default questionnaire form for this package (e.g. AI Contract Questionnaire).';
