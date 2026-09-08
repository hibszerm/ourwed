-- Questionnaires CRM: allow form instances without a wedding (Scenario B),
-- and CRM lifecycle statuses after submission.
-- Additive / non-destructive to existing wedding-linked questionnaires.

alter table public.form_instances
  alter column wedding_id drop not null;

alter table public.form_instances
  drop constraint if exists form_instances_status_check;

alter table public.form_instances
  add constraint form_instances_status_check
  check (status in (
    'pending',
    'opened',
    'submitted',
    'expired',
    'revoked',
    'approved',
    'rejected',
    'archived'
  ));

alter table public.form_instances
  add column if not exists approved_at timestamptz;

alter table public.form_instances
  add column if not exists rejected_at timestamptz;

comment on column public.form_instances.wedding_id is
  'Nullable for lead questionnaires generated before a wedding exists; set on approval.';

comment on column public.form_instances.approved_at is
  'Set when a submitted lead questionnaire is approved into a wedding.';

comment on column public.form_instances.rejected_at is
  'Set when a submitted lead questionnaire is rejected.';
