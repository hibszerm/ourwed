-- Add document_templates.meta for AI review output
-- (coupleVariables, studioVariables, packageVariables).
-- Idempotent: safe if the column already exists.

alter table public.document_templates
  add column if not exists meta jsonb not null default '{}'::jsonb;

comment on column public.document_templates.meta is
  'AI review output: coupleVariables, studioVariables, packageVariables (presence only; no business values).';
