-- Company Details (studio_details) — single source of truth for company identity.
-- Used by: documents, contracts, questionnaires, CRM, invoices (future), automations.

create table if not exists public.studio_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_name text,
  owner_name text,
  nip text,
  regon text,
  vat_id text,
  address text,
  postal_code text,
  city text,
  country text not null default 'Polska',
  phone text,
  email text,
  website text,
  instagram text,
  facebook text,
  bank_account text,
  iban text,
  swift text,
  logo_path text,
  signature_path text,
  stamp_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint studio_details_user_id_unique unique (user_id)
);

comment on table public.studio_details is
  'Canonical company profile (Dane firmy). All modules must read company identity from here only.';

create index if not exists studio_details_user_id_idx
  on public.studio_details (user_id);

drop trigger if exists studio_details_set_updated_at on public.studio_details;
create trigger studio_details_set_updated_at
  before update on public.studio_details
  for each row
  execute function public.set_updated_at();

alter table public.studio_details enable row level security;

drop policy if exists studio_details_select_own on public.studio_details;
create policy studio_details_select_own on public.studio_details
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists studio_details_insert_own on public.studio_details;
create policy studio_details_insert_own on public.studio_details
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists studio_details_update_own on public.studio_details;
create policy studio_details_update_own on public.studio_details
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists studio_details_delete_own on public.studio_details;
create policy studio_details_delete_own on public.studio_details
  for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.studio_details to authenticated;

-- Ensure PostgREST reloads schema cache after this DDL.
notify pgrst, 'reload schema';
