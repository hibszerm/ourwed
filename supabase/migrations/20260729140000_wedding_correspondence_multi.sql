-- Multi-entry couple correspondence (jsonb array).
-- Keeps legacy correspondence_channel / correspondence_value for transition.

alter table public.weddings
  add column if not exists correspondence jsonb not null default '[]'::jsonb;

comment on column public.weddings.correspondence is
  'Array of { id, channel: email|instagram|facebook, value }. Empty array when unset.';

-- Backfill must bypass enforce_wedding_owner() (requires authenticated owner context).
set local session_replication_role = replica;

update public.weddings
set correspondence = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'channel', correspondence_channel,
    'value', btrim(correspondence_value)
  )
)
where correspondence_channel in ('email', 'instagram', 'facebook')
  and correspondence_value is not null
  and length(btrim(correspondence_value)) > 0
  and correspondence = '[]'::jsonb;

set local session_replication_role = origin;

comment on column public.weddings.correspondence_channel is
  'DEPRECATED — use correspondence jsonb. Kept for transition / fallback reads.';

comment on column public.weddings.correspondence_value is
  'DEPRECATED — use correspondence jsonb. Kept for transition / fallback reads.';
