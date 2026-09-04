-- Wedding concrete delivery deadline (D2).
-- Relative contractual snapshot (delivery_months / delivery_days) is unchanged.
-- Concrete due date is derived from WEDDING snapshot columns only — never live packages.
--
-- enforce_wedding_owner() requires auth.uid(); backfill uses replica role
-- (same pattern as 20260729140000_wedding_correspondence_multi.sql).

alter table public.weddings
  add column if not exists delivery_due_date date;

alter table public.weddings
  add column if not exists delivery_due_source text;

alter table public.weddings
  add column if not exists delivery_completed_at timestamptz;

alter table public.weddings
  drop constraint if exists weddings_delivery_due_source_check;

alter table public.weddings
  add constraint weddings_delivery_due_source_check
  check (
    delivery_due_source is null
    or delivery_due_source in ('package', 'manual')
  );

comment on column public.weddings.delivery_due_date is
  'Concrete delivery due date (YYYY-MM-DD). Snapshot of wedding date + delivery_months/days, or a manual override.';
comment on column public.weddings.delivery_due_source is
  'package = derived from wedding delivery rule; manual = studio override. Null when no due date.';
comment on column public.weddings.delivery_completed_at is
  'When the studio marked materials as delivered. Null = not completed. Not workflow_stage.';

-- Active deadlines for Dashboard / Deadline Center (D3/D4).
create index if not exists weddings_active_delivery_due_idx
  on public.weddings (delivery_due_date)
  where delivery_due_date is not null
    and delivery_completed_at is null;

-- Backfill: months preferred, days fallback, PostgreSQL month-add clamps month-end
-- (2026-01-31 + 1 month → 2026-02-28; 2028-01-31 + 1 month → 2028-02-29).
set local session_replication_role = replica;

update public.weddings w
set
  delivery_due_date = c.due,
  delivery_due_source = case when c.due is not null then 'package' else null end
from (
  select
    id,
    case
      when wedding_date is null then null::date
      when delivery_months is not null and delivery_months > 0 then
        (wedding_date + make_interval(months => delivery_months))::date
      when delivery_days is not null and delivery_days > 0 then
        (wedding_date + delivery_days)::date
      else null::date
    end as due
  from public.weddings
) c
where w.id = c.id
  and w.delivery_due_date is null
  and w.delivery_completed_at is null;

set local session_replication_role = origin;
