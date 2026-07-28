-- Wedding contract recovery: source contracts, analysis records, package snapshots, audit decisions.

-- ---------------------------------------------------------------------------
-- wedding_source_contracts
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_source_contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  file_path text not null,
  original_file_name text not null,
  stored_file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  content_hash text,
  page_count integer,
  extraction_method text,
  text_availability text
    check (
      text_availability is null
      or text_availability in (
        'text_available',
        'no_text_detected',
        'password_protected',
        'parse_failed'
      )
    ),
  status text not null default 'uploaded'
    check (
      status in (
        'uploaded',
        'extracting',
        'analyzing',
        'ready_for_review',
        'applied',
        'failed'
      )
    ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists wedding_source_contracts_wedding_id_idx
  on public.wedding_source_contracts (wedding_id, created_at desc);

create index if not exists wedding_source_contracts_user_id_idx
  on public.wedding_source_contracts (user_id);

create trigger wedding_source_contracts_set_updated_at
  before update on public.wedding_source_contracts
  for each row
  execute function public.set_updated_at();

comment on table public.wedding_source_contracts is
  'Uploaded historical wedding contracts (PDF/DOCX). Not OurWed-generated documents.';

-- ---------------------------------------------------------------------------
-- wedding_contract_recoveries
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_contract_recoveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  source_contract_id uuid not null
    references public.wedding_source_contracts (id) on delete cascade,
  status text not null default 'uploaded'
    check (
      status in (
        'uploaded',
        'extracting_text',
        'analyzing',
        'ready_for_review',
        'applying',
        'applied',
        'failed'
      )
    ),
  extraction_version text not null,
  prompt_version text not null,
  response_version text,
  ai_provider text,
  ai_model text,
  validated_extraction jsonb,
  normalized_extraction jsonb,
  comparison_proposal jsonb,
  warnings jsonb not null default '[]'::jsonb,
  failure_code text,
  failure_message text,
  wedding_updated_at_snapshot timestamptz,
  superseded_by_id uuid references public.wedding_contract_recoveries (id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists wedding_contract_recoveries_wedding_id_idx
  on public.wedding_contract_recoveries (wedding_id, created_at desc);

create index if not exists wedding_contract_recoveries_source_contract_id_idx
  on public.wedding_contract_recoveries (source_contract_id, created_at desc);

create index if not exists wedding_contract_recoveries_status_idx
  on public.wedding_contract_recoveries (status);

create trigger wedding_contract_recoveries_set_updated_at
  before update on public.wedding_contract_recoveries
  for each row
  execute function public.set_updated_at();

comment on table public.wedding_contract_recoveries is
  'AI-assisted contract data recovery proposals. Never auto-applied.';

-- ---------------------------------------------------------------------------
-- wedding_contract_package_snapshots (Pakiet z umowy)
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_contract_package_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  source_contract_id uuid not null
    references public.wedding_source_contracts (id) on delete cascade,
  recovery_id uuid not null
    references public.wedding_contract_recoveries (id) on delete cascade,
  name text,
  original_description text,
  included_items jsonb not null default '[]'::jsonb,
  coverage_hours numeric(8, 2),
  delivery_deadline_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists wedding_contract_package_snapshots_wedding_id_idx
  on public.wedding_contract_package_snapshots (wedding_id, created_at desc);

create trigger wedding_contract_package_snapshots_set_updated_at
  before update on public.wedding_contract_package_snapshots
  for each row
  execute function public.set_updated_at();

comment on table public.wedding_contract_package_snapshots is
  'Contract-bound package snapshot (Pakiet z umowy). Independent of catalog.';

-- ---------------------------------------------------------------------------
-- wedding_contract_recovery_decisions (audit)
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_contract_recovery_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  recovery_id uuid not null
    references public.wedding_contract_recoveries (id) on delete cascade,
  field_key text not null,
  action text not null
    check (action in ('keep_current', 'use_extracted', 'skip')),
  previous_value jsonb,
  approved_value jsonb,
  decided_at timestamptz not null default timezone('utc', now())
);

create index if not exists wedding_contract_recovery_decisions_recovery_id_idx
  on public.wedding_contract_recovery_decisions (recovery_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.wedding_source_contracts enable row level security;
alter table public.wedding_contract_recoveries enable row level security;
alter table public.wedding_contract_package_snapshots enable row level security;
alter table public.wedding_contract_recovery_decisions enable row level security;

create policy wedding_source_contracts_select_own
  on public.wedding_source_contracts for select to authenticated
  using (user_id = auth.uid());

create policy wedding_source_contracts_insert_own
  on public.wedding_source_contracts for insert to authenticated
  with check (user_id = auth.uid() and public.is_wedding_owner(wedding_id));

create policy wedding_source_contracts_update_own
  on public.wedding_source_contracts for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy wedding_source_contracts_delete_own
  on public.wedding_source_contracts for delete to authenticated
  using (user_id = auth.uid());

create policy wedding_contract_recoveries_select_own
  on public.wedding_contract_recoveries for select to authenticated
  using (user_id = auth.uid());

create policy wedding_contract_recoveries_insert_own
  on public.wedding_contract_recoveries for insert to authenticated
  with check (user_id = auth.uid() and public.is_wedding_owner(wedding_id));

create policy wedding_contract_recoveries_update_own
  on public.wedding_contract_recoveries for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy wedding_contract_recoveries_delete_own
  on public.wedding_contract_recoveries for delete to authenticated
  using (user_id = auth.uid());

create policy wedding_contract_package_snapshots_select_own
  on public.wedding_contract_package_snapshots for select to authenticated
  using (user_id = auth.uid());

create policy wedding_contract_package_snapshots_insert_own
  on public.wedding_contract_package_snapshots for insert to authenticated
  with check (user_id = auth.uid() and public.is_wedding_owner(wedding_id));

create policy wedding_contract_package_snapshots_update_own
  on public.wedding_contract_package_snapshots for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy wedding_contract_package_snapshots_delete_own
  on public.wedding_contract_package_snapshots for delete to authenticated
  using (user_id = auth.uid());

create policy wedding_contract_recovery_decisions_select_own
  on public.wedding_contract_recovery_decisions for select to authenticated
  using (user_id = auth.uid());

create policy wedding_contract_recovery_decisions_insert_own
  on public.wedding_contract_recovery_decisions for insert to authenticated
  with check (user_id = auth.uid());

create policy wedding_contract_recovery_decisions_delete_own
  on public.wedding_contract_recovery_decisions for delete to authenticated
  using (user_id = auth.uid());
