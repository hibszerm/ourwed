-- Google calendar sync hardening: job coalescing + mapping reservation

-- Normalize: never store null calendar id in uniqueness key
update public.external_calendar_events
set external_calendar_id = 'primary'
where external_calendar_id is null;

alter table public.external_calendar_events
  alter column external_calendar_id set default 'primary';

alter table public.external_calendar_events
  alter column external_calendar_id set not null;

-- Coalesce key for pending/running integration-level sync jobs
alter table public.calendar_sync_jobs
  add column if not exists coalesce_key text;

update public.calendar_sync_jobs
set coalesce_key = concat_ws(
  ':',
  user_id::text,
  provider,
  entity_type,
  coalesce(entity_id::text, 'none'),
  operation
)
where coalesce_key is null;

create unique index if not exists calendar_sync_jobs_coalesce_pending_uidx
  on public.calendar_sync_jobs (coalesce_key)
  where status in ('pending', 'running')
    and coalesce_key is not null;

-- Exclusive create reservation: pending/syncing rows block concurrent inserts
-- (unique constraint already exists; ensure sync_status 'reserving' is allowed)
alter table public.external_calendar_events
  drop constraint if exists external_calendar_events_sync_status_check;

alter table public.external_calendar_events
  add constraint external_calendar_events_sync_status_check
  check (sync_status in (
    'pending', 'reserving', 'syncing', 'synced', 'error', 'omitted', 'deleted'
  ));

comment on column public.calendar_sync_jobs.coalesce_key is
  'Deduplication key for pending/running jobs. Prevents double backfill/sync_now.';
