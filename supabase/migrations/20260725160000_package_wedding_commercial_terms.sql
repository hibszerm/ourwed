-- Package commercial terms + wedding snapshot terms + richer package items.
-- Does NOT backfill existing weddings (new columns stay NULL / defaults).

-- =============================================================================
-- packages — catalog defaults for coverage / overtime / delivery
-- =============================================================================

alter table public.packages
  add column if not exists coverage_hours numeric(6, 2);

alter table public.packages
  add column if not exists coverage_end_time text;

alter table public.packages
  add column if not exists overtime_rate numeric(12, 2);

alter table public.packages
  add column if not exists delivery_months integer;

alter table public.packages
  add column if not exists delivery_days integer;

comment on column public.packages.coverage_hours is
  'Default reportage coverage length in hours.';
comment on column public.packages.coverage_end_time is
  'Default coverage end clock time, e.g. 00:30.';
comment on column public.packages.overtime_rate is
  'Default overtime hourly rate (PLN).';
comment on column public.packages.delivery_months is
  'Default delivery term in months (preferred when set).';
comment on column public.packages.delivery_days is
  'Default delivery term in days (used when months is null).';

-- =============================================================================
-- package_items — optional quantity / unit / category / enabled
-- =============================================================================

alter table public.package_items
  add column if not exists is_enabled boolean not null default true;

alter table public.package_items
  add column if not exists quantity numeric(10, 2);

alter table public.package_items
  add column if not exists unit text;

alter table public.package_items
  add column if not exists item_category text;

comment on column public.package_items.is_enabled is
  'When false, item stays in catalog but is not frozen into new wedding snapshots.';
comment on column public.package_items.item_category is
  'Optional free-text category/type for catalog organization.';

-- =============================================================================
-- weddings — frozen commercial / delivery terms (never silent catalog re-read)
-- =============================================================================

alter table public.weddings
  add column if not exists coverage_hours numeric(6, 2);

alter table public.weddings
  add column if not exists coverage_end_time text;

alter table public.weddings
  add column if not exists overtime_rate numeric(12, 2);

alter table public.weddings
  add column if not exists delivery_months integer;

alter table public.weddings
  add column if not exists delivery_days integer;

alter table public.weddings
  add column if not exists final_payment_due_date date;

comment on column public.weddings.coverage_hours is
  'Wedding snapshot — coverage hours agreed for this wedding.';
comment on column public.weddings.coverage_end_time is
  'Wedding snapshot — coverage end time (e.g. 00:30).';
comment on column public.weddings.overtime_rate is
  'Wedding snapshot — overtime hourly rate.';
comment on column public.weddings.delivery_months is
  'Wedding snapshot — delivery term in months.';
comment on column public.weddings.delivery_days is
  'Wedding snapshot — delivery term in days.';
comment on column public.weddings.final_payment_due_date is
  'Wedding-specific final payment due date (product rule, not template copy).';
