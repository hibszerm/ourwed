-- Performance indexes for OurWed CRM query patterns.
-- Does NOT alter tables or existing indexes — additive only.
-- Apply after schema.sql (or via Supabase migrations).

-- Weddings: list by owner ordered by date
create index if not exists weddings_user_id_wedding_date_idx
  on public.weddings (user_id, wedding_date);

-- Tasks: wedding detail + due-today dashboard
create index if not exists tasks_wedding_id_due_date_idx
  on public.tasks (wedding_id, due_date);

create index if not exists tasks_due_date_status_idx
  on public.tasks (due_date, status);

-- Notes: list pinned-first then newest
create index if not exists notes_wedding_id_pinned_created_at_idx
  on public.notes (wedding_id, pinned desc, created_at desc);

-- Payments: list by wedding ordered by payment date
create index if not exists payments_wedding_id_payment_date_idx
  on public.payments (wedding_id, payment_date);

-- Calendar: events for a wedding ordered by start
create index if not exists calendar_events_wedding_id_start_date_idx
  on public.calendar_events (wedding_id, start_date);

-- Forms: active form by category (highest version)
create index if not exists forms_category_active_version_idx
  on public.forms (category, is_active, version desc);

-- Form instances: latest submitted answers for a wedding
create index if not exists form_instances_wedding_status_submitted_at_idx
  on public.form_instances (wedding_id, status, submitted_at desc);
