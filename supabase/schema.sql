-- =============================================================================
-- OurWed — Production Supabase schema
-- =============================================================================
-- Wedding photographer CRM. Wedding is the root domain object.
--
-- Conventions:
--   - UUID primary keys (gen_random_uuid)
--   - timestamptz for all timestamps
--   - Foreign keys with intentional ON DELETE behavior
--   - RLS enabled on every table
--   - Temporary "allow all" policies for local / early development ONLY
--
-- Form Engine:
--   forms           → reusable form definitions (JSON schema)
--   form_instances  → one issued link / submission cycle per wedding
--   form_answers    → one JSON document per submitted instance
--
-- Do not seed fake data in this file.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- =============================================================================
-- 1. users — photographer accounts
-- =============================================================================
-- FUTURE AUTH (not implemented yet):
--   - Prefer public.users.id = auth.users.id (1:1 profile row).
--   - On signup, insert into public.users from auth.users via trigger or app code:
--       id         ← auth.users.id
--       email      ← auth.users.email
--       name       ← auth.users.raw_user_meta_data->>'name' (or similar)
--       avatar_url ← auth.users.raw_user_meta_data->>'avatar_url'
--   - Then scope RLS with: user_id = auth.uid() / id = auth.uid().
--   - Do not store passwords here; Supabase Auth owns credentials.
-- =============================================================================

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.users is
  'Photographer / studio profile accounts. Future: id mirrors auth.users.id (Supabase Auth).';

comment on column public.users.id is
  'Future auth: set equal to auth.users.id so auth.uid() matches this row.';

comment on column public.users.email is
  'Future auth: keep in sync with auth.users.email.';

-- =============================================================================
-- 2. weddings — one wedding = one project
-- =============================================================================

create table public.weddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  bride_name text not null,
  groom_name text not null,
  email text,
  phone text,
  wedding_date date,
  ceremony_time time,
  venue text,
  status text not null default 'active'
    check (status in ('active', 'archived', 'cancelled')),
  -- Supports existing app workflow stages (UI labels in docs/database.md):
  -- reservation, contract, deposit, preparation (Formalności zakończone),
  -- pre_wedding_questionnaire (Ankieta przedślubna), wedding_day (Wedding),
  -- post_production (Postproduction), completed (Delivered)
  workflow_stage text not null default 'reservation'
    check (workflow_stage in (
      'reservation',
      'contract',
      'deposit',
      'preparation',
      'pre_wedding_questionnaire',
      'wedding_day',
      'post_production',
      'completed'
    )),
  package_name text,
  contract_value numeric(12, 2) check (contract_value is null or contract_value >= 0),
  deposit_amount numeric(12, 2) check (deposit_amount is null or deposit_amount >= 0),
  currency text not null default 'PLN',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.weddings is
  'Core project entity. All wedding-scoped records reference this table.';

comment on column public.weddings.workflow_stage is
  'Pipeline stage only — workflow engine rules live in application code.';

comment on column public.weddings.contract_value is
  'Agreed package / contract total for the wedding.';

comment on column public.weddings.deposit_amount is
  'Expected or agreed deposit amount (actual receipts live in payments).';

create index weddings_user_id_idx on public.weddings (user_id);
create index weddings_wedding_date_idx on public.weddings (wedding_date);
create index weddings_workflow_stage_idx on public.weddings (workflow_stage);
create index weddings_status_idx on public.weddings (status);

create trigger weddings_set_updated_at
  before update on public.weddings
  for each row
  execute function public.set_updated_at();

-- =============================================================================
-- 3. contacts — additional people on a wedding
-- =============================================================================

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.contacts is
  'Extra contacts beyond bride/groom (planner, parents, venue coordinator, etc.).';

create index contacts_wedding_id_idx on public.contacts (wedding_id);

-- =============================================================================
-- 4. payments
-- =============================================================================

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  type text not null
    check (type in ('deposit', 'installment', 'final', 'other')),
  amount numeric(12, 2) not null check (amount >= 0),
  payment_date date,
  method text
    check (method is null or method in ('transfer', 'cash', 'blik', 'other')),
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.payments is
  'Client payments toward the wedding contract value (deposit, installments, final).';

create index payments_wedding_id_idx on public.payments (wedding_id);
create index payments_payment_date_idx on public.payments (payment_date);
create index payments_type_idx on public.payments (type);

-- =============================================================================
-- 5. notes
-- =============================================================================

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  author text not null,
  content text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.notes is
  'Manual and system-origin notes attached to a wedding.';

create index notes_wedding_id_idx on public.notes (wedding_id);
create index notes_pinned_idx on public.notes (wedding_id, pinned)
  where pinned = true;

-- =============================================================================
-- 6. timeline_events — wedding history
-- =============================================================================

create table public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  created_by uuid references public.users (id) on delete set null,
  system_generated boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.timeline_events is
  'Append-only style history of meaningful wedding events.';

comment on column public.timeline_events.created_by is
  'Photographer who caused the event; null when system_generated or unknown.';

comment on column public.timeline_events.system_generated is
  'True when written by automation (form submit, payment sync, workflow, etc.).';

create index timeline_events_wedding_id_idx on public.timeline_events (wedding_id);
create index timeline_events_created_at_idx
  on public.timeline_events (wedding_id, created_at desc);
create index timeline_events_type_idx on public.timeline_events (type);
create index timeline_events_created_by_idx on public.timeline_events (created_by);

-- =============================================================================
-- 7. tasks
-- =============================================================================

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.tasks is
  'Operational to-dos scoped to a single wedding.';

create index tasks_wedding_id_idx on public.tasks (wedding_id);
create index tasks_status_idx on public.tasks (status);
create index tasks_due_date_idx on public.tasks (due_date);

-- =============================================================================
-- 8. forms — Form Engine definitions (reusable)
-- =============================================================================
-- A form is a versioned definition. The complete UI/validation structure lives
-- in schema (jsonb). No separate question / option tables.
-- Examples: contract questionnaire, pre-wedding questionnaire, family shot list,
-- opinion form, session planning.
-- =============================================================================

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  category text not null default 'other'
    check (category in (
      'contract',
      'pre_wedding',
      'wedding_day',
      'feedback',
      'planning',
      'other'
    )),
  schema jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (slug, version)
);

comment on table public.forms is
  'Form Engine definitions. schema jsonb holds the full form structure.';

comment on column public.forms.schema is
  'Complete form definition (sections, fields, validation, conditionals).';

comment on column public.forms.slug is
  'Stable machine key within a version line, e.g. contract-questionnaire.';

create index forms_slug_idx on public.forms (slug);
create index forms_category_idx on public.forms (category);
create index forms_active_idx on public.forms (is_active)
  where is_active = true;

-- =============================================================================
-- 9. form_instances — one issued form for one wedding
-- =============================================================================
-- Unlimited instances can be generated from one form definition.
-- Public URL uses token (e.g. /form/{token}).
-- =============================================================================

create table public.form_instances (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete restrict,
  wedding_id uuid references public.weddings (id) on delete cascade,
  token text not null unique,
  status text not null default 'pending'
    check (status in (
      'pending',
      'opened',
      'submitted',
      'expired',
      'revoked',
      'approved',
      'rejected',
      'archived'
    )),
  expires_at timestamptz,
  opened_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.form_instances is
  'Issued Form Engine instances: one tokenized link for one wedding.';

create index form_instances_form_id_idx on public.form_instances (form_id);
create index form_instances_wedding_id_idx on public.form_instances (wedding_id);
create index form_instances_status_idx on public.form_instances (status);
create unique index form_instances_token_uidx on public.form_instances (token);

-- =============================================================================
-- 10. form_answers — one JSON document per submitted instance
-- =============================================================================
-- Store the full payload once. Supports checkboxes, nested groups, repeaters,
-- multi-select, and future AI processing without schema migrations per field.
-- =============================================================================

create table public.form_answers (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null unique references public.form_instances (id) on delete cascade,
  answer_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.form_answers is
  'Submitted Form Engine payload: one JSON document per form_instance.';

comment on column public.form_answers.answer_json is
  'Full answers document for the instance (not row-per-question).';

create index form_answers_instance_id_idx on public.form_answers (instance_id);

-- =============================================================================
-- 11. contracts
-- =============================================================================

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  status text not null default 'none'
    check (status in ('none', 'generated', 'sent', 'signed')),
  version integer not null default 1 check (version >= 1),
  generated_by uuid references public.users (id) on delete set null,
  generated_at timestamptz,
  signed_at timestamptz,
  file_url text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (wedding_id)
);

comment on table public.contracts is
  'Contract lifecycle for a wedding. One active contract row per wedding.';

comment on column public.contracts.version is
  'Contract document revision number for regenerations.';

comment on column public.contracts.generated_by is
  'User who generated the current contract file; null if unknown/system.';

create index contracts_wedding_id_idx on public.contracts (wedding_id);
create index contracts_status_idx on public.contracts (status);
create index contracts_generated_by_idx on public.contracts (generated_by);

-- =============================================================================
-- 12. calendar_events
-- =============================================================================

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  title text not null,
  start_date timestamptz not null,
  end_date timestamptz,
  type text not null default 'other'
    check (type in ('wedding', 'meeting', 'delivery', 'shoot', 'other')),
  location text,
  notes text,
  color text,
  all_day boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  check (end_date is null or end_date >= start_date)
);

comment on table public.calendar_events is
  'Calendar entries linked to a wedding (ceremony day, meetings, delivery dates).';

create index calendar_events_wedding_id_idx on public.calendar_events (wedding_id);
create index calendar_events_start_date_idx on public.calendar_events (start_date);
create index calendar_events_type_idx on public.calendar_events (type);

-- =============================================================================
-- 13. galleries
-- =============================================================================
-- gallery_images is intentionally not created yet.
-- provider + provider_gallery_id prepare external gallery integrations.
-- =============================================================================

create table public.galleries (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  status text not null default 'not_ready'
    check (status in ('not_ready', 'processing', 'ready', 'expired')),
  gallery_url text,
  provider text,
  provider_gallery_id text,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (wedding_id)
);

comment on table public.galleries is
  'Delivered gallery metadata. Future: gallery_images table can hang off this row.';

comment on column public.galleries.provider is
  'External host key, e.g. pixieset, shootproof, custom.';

comment on column public.galleries.provider_gallery_id is
  'Remote gallery identifier at the provider.';

create index galleries_wedding_id_idx on public.galleries (wedding_id);
create index galleries_status_idx on public.galleries (status);
create index galleries_provider_idx on public.galleries (provider, provider_gallery_id);

-- =============================================================================
-- 14. notifications
-- =============================================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null default 'info'
    check (type in ('info', 'warning', 'success', 'error')),
  title text not null,
  content text not null,
  entity_type text,
  entity_id uuid,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.notifications is
  'In-app notifications for a photographer account (not wedding-scoped).';

comment on column public.notifications.entity_type is
  'Optional polymorphic target type, e.g. wedding, form_instance, payment.';

comment on column public.notifications.entity_id is
  'Optional polymorphic target id matching entity_type.';

comment on column public.notifications.link is
  'Optional deep link path/URL for opening the right studio page.';

create index notifications_user_id_idx on public.notifications (user_id);
create index notifications_unread_idx
  on public.notifications (user_id, created_at desc)
  where read = false;
create index notifications_created_at_idx
  on public.notifications (user_id, created_at desc);
create index notifications_entity_idx
  on public.notifications (entity_type, entity_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Temporary development policies: allow all roles full access.
-- Replace with auth.uid()-scoped policies before production.
-- =============================================================================

alter table public.users enable row level security;
alter table public.weddings enable row level security;
alter table public.contacts enable row level security;
alter table public.payments enable row level security;
alter table public.notes enable row level security;
alter table public.timeline_events enable row level security;
alter table public.tasks enable row level security;
alter table public.forms enable row level security;
alter table public.form_instances enable row level security;
alter table public.form_answers enable row level security;
alter table public.contracts enable row level security;
alter table public.calendar_events enable row level security;
alter table public.galleries enable row level security;
alter table public.notifications enable row level security;

create policy "dev_allow_all_users"
  on public.users for all
  using (true) with check (true);

create policy "dev_allow_all_weddings"
  on public.weddings for all
  using (true) with check (true);

create policy "dev_allow_all_contacts"
  on public.contacts for all
  using (true) with check (true);

create policy "dev_allow_all_payments"
  on public.payments for all
  using (true) with check (true);

create policy "dev_allow_all_notes"
  on public.notes for all
  using (true) with check (true);

create policy "dev_allow_all_timeline_events"
  on public.timeline_events for all
  using (true) with check (true);

create policy "dev_allow_all_tasks"
  on public.tasks for all
  using (true) with check (true);

create policy "dev_allow_all_forms"
  on public.forms for all
  using (true) with check (true);

create policy "dev_allow_all_form_instances"
  on public.form_instances for all
  using (true) with check (true);

create policy "dev_allow_all_form_answers"
  on public.form_answers for all
  using (true) with check (true);

create policy "dev_allow_all_contracts"
  on public.contracts for all
  using (true) with check (true);

create policy "dev_allow_all_calendar_events"
  on public.calendar_events for all
  using (true) with check (true);

create policy "dev_allow_all_galleries"
  on public.galleries for all
  using (true) with check (true);

create policy "dev_allow_all_notifications"
  on public.notifications for all
  using (true) with check (true);
