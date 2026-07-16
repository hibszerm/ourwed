-- Studio Catalog: packages, package items, extra services, wedding extras.
-- Snapshots on weddings remain the historical source of truth for price/deposit.

-- =============================================================================
-- packages
-- =============================================================================

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  deposit_amount numeric(12, 2) not null default 0 check (deposit_amount >= 0),
  currency text not null default 'PLN',
  color text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists packages_active_sort_idx
  on public.packages (is_active, sort_order);

drop trigger if exists packages_set_updated_at on public.packages;
create trigger packages_set_updated_at
  before update on public.packages
  for each row
  execute function public.set_updated_at();

comment on table public.packages is
  'Studio Catalog wedding packages — live pricing for future weddings only.';

-- =============================================================================
-- package_items
-- =============================================================================

create table if not exists public.package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete cascade,
  title text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists package_items_package_sort_idx
  on public.package_items (package_id, sort_order);

comment on table public.package_items is
  'Ordered contents of a studio package.';

-- =============================================================================
-- extra_services
-- =============================================================================

create table if not exists public.extra_services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'PLN',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists extra_services_active_sort_idx
  on public.extra_services (is_active, sort_order);

drop trigger if exists extra_services_set_updated_at on public.extra_services;
create trigger extra_services_set_updated_at
  before update on public.extra_services
  for each row
  execute function public.set_updated_at();

comment on table public.extra_services is
  'Studio Catalog add-on services — live pricing for future selections only.';

-- =============================================================================
-- wedding_extra_services (junction + price snapshot)
-- =============================================================================

create table if not exists public.wedding_extra_services (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  extra_service_id uuid not null references public.extra_services (id) on delete restrict,
  price_snapshot numeric(12, 2) not null check (price_snapshot >= 0),
  quantity integer not null default 1 check (quantity >= 1),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists wedding_extra_services_wedding_id_idx
  on public.wedding_extra_services (wedding_id);

create index if not exists wedding_extra_services_extra_service_id_idx
  on public.wedding_extra_services (extra_service_id);

comment on table public.wedding_extra_services is
  'Selected extras for a wedding. price_snapshot is immutable historical pricing.';

comment on column public.wedding_extra_services.price_snapshot is
  'Frozen unit price at selection time. Catalog price changes never rewrite this.';

-- =============================================================================
-- weddings: link to catalog + accent color snapshot (additive, non-breaking)
-- =============================================================================

alter table public.weddings
  add column if not exists package_id uuid references public.packages (id) on delete set null;

alter table public.weddings
  add column if not exists accent_color text;

create index if not exists weddings_package_id_idx
  on public.weddings (package_id);

comment on column public.weddings.package_id is
  'Optional FK to catalog package for contents/color. Prices live in snapshot columns.';

comment on column public.weddings.accent_color is
  'Package color snapshot for calendar/UI. Independent of live catalog color.';

-- Existing snapshot columns (already present):
--   package_name, contract_value, deposit_amount, currency

-- =============================================================================
-- RLS (dev allow-all, consistent with schema.sql)
-- =============================================================================

alter table public.packages enable row level security;
alter table public.package_items enable row level security;
alter table public.extra_services enable row level security;
alter table public.wedding_extra_services enable row level security;

drop policy if exists "dev_allow_all_packages" on public.packages;
create policy "dev_allow_all_packages"
  on public.packages for all
  using (true) with check (true);

drop policy if exists "dev_allow_all_package_items" on public.package_items;
create policy "dev_allow_all_package_items"
  on public.package_items for all
  using (true) with check (true);

drop policy if exists "dev_allow_all_extra_services" on public.extra_services;
create policy "dev_allow_all_extra_services"
  on public.extra_services for all
  using (true) with check (true);

drop policy if exists "dev_allow_all_wedding_extra_services" on public.wedding_extra_services;
create policy "dev_allow_all_wedding_extra_services"
  on public.wedding_extra_services for all
  using (true) with check (true);
