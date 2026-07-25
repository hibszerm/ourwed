/**
 * Optional metadata table for future studio Google Maps integrations.
 * NEVER store plaintext API keys here — only Vault secret references + masked suffix.
 *
 * Studio identity today is the owning auth user (same as studio_details.user_id).
 * Future settings: Ustawienia → Integracje → Google Maps (not Company Data).
 */

create table if not exists public.studio_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google_maps')),
  enabled boolean not null default false,
  -- Opaque reference to Supabase Vault / encrypted secret store
  secret_reference text,
  masked_key_suffix text,
  last_tested_at timestamptz,
  last_test_status text check (
    last_test_status is null
    or last_test_status in ('ok', 'failed', 'never')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, provider)
);

create index if not exists studio_integrations_user_id_idx
  on public.studio_integrations (user_id);

comment on table public.studio_integrations is
  'Studio third-party integrations metadata. API keys live in Vault via secret_reference — never plaintext.';

comment on column public.studio_integrations.secret_reference is
  'Vault / secret-store reference. Browser must never receive the decrypted key.';

alter table public.studio_integrations enable row level security;
