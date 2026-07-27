/**
 * Intermediate generation state for payment-schedule completion.
 */

create table if not exists public.wedding_contract_generation_runs (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  draft_id uuid references public.wedding_document_drafts (id) on delete set null,
  template_id uuid not null references public.document_templates (id) on delete restrict,
  template_version_id uuid not null
    references public.document_template_versions (id) on delete restrict,
  generation_status text not null default 'processing'
    check (
      generation_status in (
        'processing',
        'manual_input_required',
        'ready',
        'failed'
      )
    ),
  detected_payment_schedule_json jsonb,
  manual_payment_schedule_json jsonb,
  intermediate_docx_path text,
  final_docx_storage_path text,
  final_pdf_storage_path text,
  quality_summary_json jsonb,
  resolved_values_json jsonb not null default '{}'::jsonb,
  total_contract_amount integer,
  preview_generated_at timestamptz,
  expires_at timestamptz not null
    default (timezone('utc', now()) + interval '7 days'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists wedding_contract_generation_runs_wedding_idx
  on public.wedding_contract_generation_runs (wedding_id, created_at desc);

create index if not exists wedding_contract_generation_runs_status_idx
  on public.wedding_contract_generation_runs (generation_status)
  where generation_status in ('processing', 'manual_input_required');

create index if not exists wedding_contract_generation_runs_expires_idx
  on public.wedding_contract_generation_runs (expires_at);

create trigger wedding_contract_generation_runs_set_updated_at
  before update on public.wedding_contract_generation_runs
  for each row
  execute function public.set_updated_at();

comment on table public.wedding_contract_generation_runs is
  'In-flight contract generation: intermediate DOCX + payment schedule before final export.';

alter table public.wedding_contract_generation_runs enable row level security;
alter table public.wedding_contract_generation_runs force row level security;

create policy wedding_contract_generation_runs_select
  on public.wedding_contract_generation_runs
  for select
  using (public.is_wedding_owner(wedding_id));

create policy wedding_contract_generation_runs_insert
  on public.wedding_contract_generation_runs
  for insert
  with check (public.is_wedding_owner(wedding_id));

create policy wedding_contract_generation_runs_update
  on public.wedding_contract_generation_runs
  for update
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));

create policy wedding_contract_generation_runs_delete
  on public.wedding_contract_generation_runs
  for delete
  using (public.is_wedding_owner(wedding_id));

-- Extend draft status for generation pipeline (additive)
alter table public.wedding_document_drafts
  drop constraint if exists wedding_document_drafts_status_check;

alter table public.wedding_document_drafts
  add constraint wedding_document_drafts_status_check
  check (
    status in (
      'editing',
      'ready_to_export',
      'processing',
      'manual_input_required',
      'ready',
      'failed'
    )
  );

alter table public.wedding_document_drafts
  add column if not exists generation_run_id uuid
    references public.wedding_contract_generation_runs (id) on delete set null;
