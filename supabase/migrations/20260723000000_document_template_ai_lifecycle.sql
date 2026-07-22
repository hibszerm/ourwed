-- AI contract import lifecycle flags on document templates.
-- Used by the simple Document Templates flow (no mapping wizard).

alter table public.document_templates
  add column if not exists ai_analyzed_at timestamptz,
  add column if not exists questionnaire_form_id uuid;

comment on column public.document_templates.ai_analyzed_at is
  'When AI analysis finished for this contract template (simple import flow).';

comment on column public.document_templates.questionnaire_form_id is
  'Form definition (questionnaire template) created from this contract via AI.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_templates_questionnaire_form_id_fkey'
  ) then
    alter table public.document_templates
      add constraint document_templates_questionnaire_form_id_fkey
      foreign key (questionnaire_form_id)
      references public.forms (id)
      on delete set null;
  end if;
end $$;
