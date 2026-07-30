-- Calendar integrations: Google OAuth + Apple ICS (Phase 1)
-- OurWed is source of truth; external calendars are outbound only.

-- ---------------------------------------------------------------------------
-- 1. Integration settings (non-secret)
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'apple')),
  enabled boolean not null default false,
  sync_weddings boolean not null default true,
  sync_sessions boolean not null default true,
  backfill_mode text not null default 'future'
    check (backfill_mode in ('future', 'all_active')),
  -- Google non-secret
  google_account_email text,
  google_account_id text,
  google_calendar_id text,
  google_calendar_name text,
  google_connected_at timestamptz,
  google_revoked_at timestamptz,
  google_scopes text[],
  google_token_expires_at timestamptz,
  -- Apple non-secret
  apple_token_hash text unique,
  apple_token_created_at timestamptz,
  apple_token_rotated_at timestamptz,
  apple_feed_etag text,
  -- Sync health
  last_sync_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  last_error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, provider)
);

create index if not exists calendar_integrations_user_id_idx
  on public.calendar_integrations (user_id);

create index if not exists calendar_integrations_apple_token_hash_idx
  on public.calendar_integrations (apple_token_hash)
  where apple_token_hash is not null;

create trigger calendar_integrations_set_updated_at
  before update on public.calendar_integrations
  for each row execute function public.set_updated_at();

alter table public.calendar_integrations enable row level security;

create policy calendar_integrations_select_own
  on public.calendar_integrations for select to authenticated
  using (user_id = auth.uid());

create policy calendar_integrations_insert_own
  on public.calendar_integrations for insert to authenticated
  with check (user_id = auth.uid());

create policy calendar_integrations_update_own
  on public.calendar_integrations for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy calendar_integrations_delete_own
  on public.calendar_integrations for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.calendar_integrations to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Google OAuth secrets (service-role only — no client policies)
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_integration_secrets (
  integration_id uuid primary key
    references public.calendar_integrations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider = 'google'),
  access_token_enc text,
  refresh_token_enc text,
  token_type text,
  raw_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger calendar_integration_secrets_set_updated_at
  before update on public.calendar_integration_secrets
  for each row execute function public.set_updated_at();

alter table public.calendar_integration_secrets enable row level security;
-- Intentionally no policies for authenticated/anon — Edge Functions use service role.

-- ---------------------------------------------------------------------------
-- 3. External event mappings
-- ---------------------------------------------------------------------------

create table if not exists public.external_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'apple')),
  entity_type text not null check (entity_type in ('wedding', 'session')),
  entity_id uuid not null,
  external_calendar_id text,
  external_event_id text,
  external_event_url text,
  source_fingerprint text not null default '',
  sync_status text not null default 'pending'
    check (sync_status in (
      'pending', 'syncing', 'synced', 'error', 'omitted', 'deleted'
    )),
  last_synced_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, provider, entity_type, entity_id, external_calendar_id)
);

create index if not exists external_calendar_events_entity_idx
  on public.external_calendar_events (user_id, entity_type, entity_id);

create index if not exists external_calendar_events_external_idx
  on public.external_calendar_events (provider, external_event_id)
  where external_event_id is not null;

create trigger external_calendar_events_set_updated_at
  before update on public.external_calendar_events
  for each row execute function public.set_updated_at();

alter table public.external_calendar_events enable row level security;

create policy external_calendar_events_select_own
  on public.external_calendar_events for select to authenticated
  using (user_id = auth.uid());

create policy external_calendar_events_insert_own
  on public.external_calendar_events for insert to authenticated
  with check (user_id = auth.uid());

create policy external_calendar_events_update_own
  on public.external_calendar_events for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy external_calendar_events_delete_own
  on public.external_calendar_events for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.external_calendar_events to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Sync outbox / jobs
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null check (entity_type in ('wedding', 'session', 'integration')),
  entity_id uuid,
  provider text not null check (provider in ('google', 'apple')),
  operation text not null check (operation in (
    'upsert', 'delete', 'backfill', 'sync_now', 'disconnect_cleanup'
  )),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  payload_json jsonb not null default '{}'::jsonb,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists calendar_sync_jobs_pending_idx
  on public.calendar_sync_jobs (status, next_attempt_at)
  where status in ('pending', 'failed');

create index if not exists calendar_sync_jobs_user_entity_idx
  on public.calendar_sync_jobs (user_id, provider, entity_type, entity_id);

create trigger calendar_sync_jobs_set_updated_at
  before update on public.calendar_sync_jobs
  for each row execute function public.set_updated_at();

alter table public.calendar_sync_jobs enable row level security;

create policy calendar_sync_jobs_select_own
  on public.calendar_sync_jobs for select to authenticated
  using (user_id = auth.uid());

create policy calendar_sync_jobs_insert_own
  on public.calendar_sync_jobs for insert to authenticated
  with check (user_id = auth.uid());

grant select, insert on public.calendar_sync_jobs to authenticated;

-- Updates/deletes of jobs are performed by service role in Edge Functions.

-- ---------------------------------------------------------------------------
-- 5. OAuth state (short-lived, service-role)
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  code_verifier text not null,
  redirect_path text,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '15 minutes'
);

alter table public.calendar_oauth_states enable row level security;
-- No client policies — Edge Function service role only.

comment on table public.calendar_integrations is
  'Per-user Google/Apple calendar integration settings. Secrets live in calendar_integration_secrets.';
comment on table public.external_calendar_events is
  'Idempotent mapping OurWed entity → external calendar event. Identity is not title-based.';
comment on table public.calendar_sync_jobs is
  'Minimal outbox for Google Calendar sync. Local entity commits never roll back on job failure.';
