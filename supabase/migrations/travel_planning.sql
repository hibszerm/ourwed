-- Travel Planning infrastructure
-- Studio origin, wedding places, cached travel segments.

-- =============================================================================
-- studio_travel_settings — one active studio origin per studio user
-- =============================================================================

create table if not exists public.studio_travel_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  studio_name text,
  street text,
  building_number text,
  postal_code text,
  city text,
  country text not null default 'Polska',
  formatted_address text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  place_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint studio_travel_settings_user_id_unique unique (user_id)
);

create index if not exists studio_travel_settings_user_id_idx
  on public.studio_travel_settings (user_id);

drop trigger if exists studio_travel_settings_set_updated_at on public.studio_travel_settings;
create trigger studio_travel_settings_set_updated_at
  before update on public.studio_travel_settings
  for each row
  execute function public.set_updated_at();

comment on table public.studio_travel_settings is
  'Single active studio travel origin (default route start).';

-- =============================================================================
-- wedding_places — geocoded locations per wedding role
-- =============================================================================

create table if not exists public.wedding_places (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  role text not null
    check (role in (
      'preparation',
      'ceremony',
      'reception',
      'hotel',
      'airport',
      'other'
    )),
  label text,
  place_id text,
  formatted_address text not null,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- One row per core role; hotel/airport/other may repeat via sort_order later.
create unique index if not exists wedding_places_wedding_core_role_uidx
  on public.wedding_places (wedding_id, role)
  where role in ('preparation', 'ceremony', 'reception');

create index if not exists wedding_places_wedding_id_idx
  on public.wedding_places (wedding_id);

create index if not exists wedding_places_wedding_sort_idx
  on public.wedding_places (wedding_id, sort_order);

drop trigger if exists wedding_places_set_updated_at on public.wedding_places;
create trigger wedding_places_set_updated_at
  before update on public.wedding_places
  for each row
  execute function public.set_updated_at();

comment on table public.wedding_places is
  'Normalized wedding locations with coordinates. Text labels stay on formatted_address.';

-- =============================================================================
-- travel_segments — cached Routes API results (future-ready legs)
-- =============================================================================

create table if not exists public.travel_segments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  sequence integer not null default 0,
  -- Origin: either studio settings or a wedding place
  origin_kind text not null
    check (origin_kind in ('studio', 'wedding_place')),
  origin_wedding_place_id uuid references public.wedding_places (id) on delete cascade,
  -- Destination
  destination_kind text not null
    check (destination_kind in ('studio', 'wedding_place')),
  destination_wedding_place_id uuid references public.wedding_places (id) on delete cascade,
  -- Stable cache fingerprint of endpoints (place_ids / lat,lng)
  endpoints_hash text not null,
  distance_meters integer,
  distance_text text,
  duration_seconds integer,
  duration_text text,
  travel_mode text not null default 'DRIVE',
  provider text not null default 'geoapify',
  status text not null default 'ok'
    check (status in ('ok', 'error', 'stale')),
  error_message text,
  calculated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint travel_segments_origin_check check (
    (origin_kind = 'studio' and origin_wedding_place_id is null)
    or (origin_kind = 'wedding_place' and origin_wedding_place_id is not null)
  ),
  constraint travel_segments_destination_check check (
    (destination_kind = 'studio' and destination_wedding_place_id is null)
    or (destination_kind = 'wedding_place' and destination_wedding_place_id is not null)
  )
);

create unique index if not exists travel_segments_wedding_sequence_uidx
  on public.travel_segments (wedding_id, sequence);

create index if not exists travel_segments_wedding_id_idx
  on public.travel_segments (wedding_id);

create index if not exists travel_segments_endpoints_hash_idx
  on public.travel_segments (wedding_id, endpoints_hash);

drop trigger if exists travel_segments_set_updated_at on public.travel_segments;
create trigger travel_segments_set_updated_at
  before update on public.travel_segments
  for each row
  execute function public.set_updated_at();

comment on table public.travel_segments is
  'Cached routing legs (Geoapify). Recalculate only when endpoints_hash changes.';

-- =============================================================================
-- RLS (dev allow-all, consistent with schema.sql)
-- =============================================================================

alter table public.studio_travel_settings enable row level security;
alter table public.wedding_places enable row level security;
alter table public.travel_segments enable row level security;

drop policy if exists "dev_allow_all_studio_travel_settings" on public.studio_travel_settings;
create policy "dev_allow_all_studio_travel_settings"
  on public.studio_travel_settings for all
  using (true) with check (true);

drop policy if exists "dev_allow_all_wedding_places" on public.wedding_places;
create policy "dev_allow_all_wedding_places"
  on public.wedding_places for all
  using (true) with check (true);

drop policy if exists "dev_allow_all_travel_segments" on public.travel_segments;
create policy "dev_allow_all_travel_segments"
  on public.travel_segments for all
  using (true) with check (true);
