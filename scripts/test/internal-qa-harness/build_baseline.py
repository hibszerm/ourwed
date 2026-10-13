#!/usr/bin/env python3
"""Build a disposable baseline from the canonical migrations verified against live."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS = ROOT / "supabase" / "migrations"


def function(source: str, name: str) -> str:
    text = (MIGRATIONS / source).read_text()
    match = re.search(
        rf"(?im)^create (?:or replace )?function public\.{re.escape(name)}\b",
        text,
    )
    if not match:
        raise RuntimeError(f"Could not find public.{name} in {source}")
    end = text.find("$$;", match.start())
    if end < 0:
        raise RuntimeError(f"Could not find end of public.{name} in {source}")
    return text[match.start() : end + 3]


def table(source: str, name: str) -> str:
    text = (MIGRATIONS / source).read_text()
    match = re.search(rf"(?im)^create table public\.{re.escape(name)}\s*\(", text)
    if not match:
        raise RuntimeError(f"Could not find public.{name} in {source}")
    end = text.find("\n);", match.start())
    if end < 0:
        raise RuntimeError(f"Could not find end of public.{name} in {source}")
    return text[match.start() : end + 3]


ddl = r"""
-- TEST-ONLY: minimum current-production account schema; no production data.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '', last_name text not null default '',
  profession text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  theme_id text not null default 'classic',
  interface_style text not null default 'modern',
  appearance text not null default 'light',
  check (theme_id in ('classic', 'graphite', 'sage_garden', 'burgundy_estate', 'mocha_editorial')),
  check (interface_style in ('classic', 'modern')),
  check (appearance in ('light', 'dark'))
);
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null, name text not null, avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  unique(email)
);
create table public.forms (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null, slug text not null, description text,
  category text not null default 'other', schema jsonb not null default '{}'::jsonb,
  version integer not null default 1, is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  user_id uuid references public.users(id) on delete cascade,
  is_system_template boolean not null default false,
  check (category in ('contract', 'pre_wedding', 'wedding_day', 'feedback', 'planning', 'other')),
  check (version >= 1),
  check ((is_system_template and user_id is null) or (not is_system_template and user_id is not null))
);
create table public.packages (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null, slug text not null, description text,
  price numeric not null, deposit_amount numeric not null default 0,
  currency text not null default 'PLN', color text,
  is_active boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  user_id uuid references public.users(id) on delete cascade,
  is_system_template boolean not null default false,
  questionnaire_form_id uuid,
  coverage_hours numeric,
  coverage_end_time text,
  overtime_rate numeric,
  delivery_months integer,
  delivery_days integer,
  active_contract_template_id uuid,
  active_contract_template_version_id uuid,
  final_payment_terms jsonb,
  check (price >= 0),
  check (deposit_amount >= 0),
  check ((is_system_template and user_id is null) or (not is_system_template and user_id is not null))
);
create table public.package_items (
  id uuid primary key default extensions.gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  title text not null, description text, sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  is_enabled boolean not null default true, quantity numeric, unit text, item_category text
);
create table public.extra_services (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null, slug text not null, description text, price numeric not null,
  currency text not null default 'PLN', is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  user_id uuid references public.users(id) on delete cascade,
  is_system_template boolean not null default false,
  check (price >= 0),
  check ((is_system_template and user_id is null) or (not is_system_template and user_id is not null))
);
create table public.questionnaire_templates (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null, source_key text, title text not null default '',
  introduction text not null default '', schema_json jsonb not null default '{"sections":[]}'::jsonb,
  version integer not null default 1, is_default boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  type text not null default 'pre_wedding',
  check (type in ('contract', 'pre_wedding')),
  unique(owner_id, source_key)
);
create table public.user_legal_acceptances (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null, privacy_version text not null,
  accepted_at timestamptz not null default timezone('utc', now()),
  source text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_legal_acceptances_source_check check (source = 'registration'),
  constraint user_legal_acceptances_terms_version_check check (char_length(trim(terms_version)) > 0),
  constraint user_legal_acceptances_privacy_version_check check (char_length(trim(privacy_version)) > 0)
);
alter table public.user_legal_acceptances enable row level security;
alter table public.user_legal_acceptances force row level security;
grant select on public.user_legal_acceptances to authenticated;
create policy user_legal_acceptances_owner_select on public.user_legal_acceptances
  for select to authenticated using (user_id = (select auth.uid()));

create table public.billing_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null unique references public.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create table public.account_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  billing_account_id uuid not null unique references public.billing_accounts(id) on delete cascade,
  plan text not null default 'pro' check (plan in ('pro')),
  billing_interval text check (billing_interval is null or billing_interval in ('month','year')),
  status text not null check (status in ('trialing','active','expired','past_due','canceled','manual')),
  trial_started_at timestamptz, trial_ends_at timestamptz, trial_initialized_at timestamptz,
  current_period_started_at timestamptz, current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  provider text check (provider is null or provider in ('stripe','paddle','other')),
  provider_customer_id text, provider_subscription_id text, provider_status text,
  manual_access_until timestamptz, manual_access_indefinite boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create table public.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  last_access_at timestamptz,
  check (role = 'owner')
);
create table public.weddings (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  bride_name text not null,
  groom_name text not null,
  ceremony_time time,
  email text,
  phone text,
  wedding_date date,
  status text not null default 'active' check (status in ('active','archived','cancelled')),
  package_id uuid,
  package_name text,
  contract_value numeric(12,2),
  deposit_amount numeric(12,2),
  currency text not null default 'PLN',
  package_items_snapshot jsonb not null default '[]'::jsonb,
  selected_package_ids text[],
  final_payment_terms jsonb,
  final_payment_due_date date,
  coverage_hours numeric(6,2),
  coverage_end_time text,
  overtime_rate numeric(12,2),
  delivery_months integer,
  delivery_days integer,
  delivery_due_date date,
  delivery_due_source text,
  delivery_completed_at timestamptz,
  travel_fee_status text not null default 'unresolved',
  travel_fee_amount numeric(12,2) not null default 0,
  travel_fee_free_km_snapshot numeric(10,2),
  travel_fee_route_distance_m_snapshot integer,
  venue text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create table public.wedding_extra_services (
  id uuid primary key default extensions.gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  extra_service_id uuid not null references public.extra_services(id) on delete restrict,
  price_snapshot numeric(12,2) not null check (price_snapshot >= 0),
  name_snapshot text not null default 'Service',
  quantity integer not null default 1 check (quantity >= 1),
  created_at timestamptz not null default timezone('utc', now())
);
create table public.payments (
  id uuid primary key default extensions.gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  type text not null default 'other',
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);
create table public.wedding_questionnaires (
  id uuid primary key default extensions.gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default ''
);
create table public.wedding_questionnaire_responses (
  id uuid primary key default extensions.gen_random_uuid(),
  questionnaire_id uuid not null unique references public.wedding_questionnaires(id) on delete cascade,
  answers_json jsonb not null default '{}'::jsonb
);
create table public.sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  linked_wedding_id uuid references public.weddings(id) on delete set null
);
create table public.session_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  amount numeric(12,2) not null default 0
);
create table public.collaboration_child_isolation_fixture (
  id uuid primary key default extensions.gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  resource_kind text not null
);
create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  content text not null,
  entity_type text,
  entity_id uuid,
  link text,
  event_key text unique,
  read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.payments enable row level security;
alter table public.payments force row level security;
grant select on public.payments to authenticated;
create policy payments_select_own_wedding on public.payments for select to authenticated
  using (exists(select 1 from public.weddings w where w.id=payments.wedding_id and w.user_id=auth.uid()));
alter table public.weddings enable row level security;
alter table public.weddings force row level security;
grant select, insert, update, delete on public.weddings to authenticated;
create function public.is_wedding_owner(p_wedding_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.weddings w where w.id=p_wedding_id and w.user_id=auth.uid())
$$;
revoke all on function public.is_wedding_owner(uuid) from public, anon;
grant execute on function public.is_wedding_owner(uuid) to authenticated, service_role;
"""

wedding_child_fixture_tables = (
    "contacts", "notes", "tasks", "timeline_events", "calendar_events",
    "travel_segments",
    "wedding_briefs", "wedding_documents", "wedding_document_drafts",
    "wedding_source_contracts", "wedding_contract_recoveries",
    "wedding_contract_package_snapshots", "wedding_contract_recovery_decisions",
    "wedding_contract_generation_runs", "wedding_document_generation_sequences",
    "contracts",
)
child_fixture_ddl = "\n".join(
    f"""create table public.{name} (
  id uuid primary key default extensions.gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  fixture_value text not null default 'synthetic'
);
alter table public.{name} enable row level security;
alter table public.{name} force row level security;
grant select on public.{name} to authenticated;
create policy {name}_select_owner_fixture on public.{name} for select to authenticated
  using (public.is_wedding_owner(wedding_id));"""
    for name in wedding_child_fixture_tables
)
child_fixture_ddl += r"""
alter table public.wedding_questionnaires enable row level security;
alter table public.wedding_questionnaires force row level security;
grant select on public.wedding_questionnaires to authenticated;
create policy wedding_questionnaires_select_owner_fixture on public.wedding_questionnaires
  for select to authenticated using (owner_id=auth.uid());
alter table public.wedding_questionnaire_responses enable row level security;
alter table public.wedding_questionnaire_responses force row level security;
grant select on public.wedding_questionnaire_responses to authenticated;
create policy wedding_questionnaire_responses_select_owner_fixture on public.wedding_questionnaire_responses
  for select to authenticated using (exists(select 1 from public.wedding_questionnaires q
    where q.id=questionnaire_id and q.owner_id=auth.uid()));
create table public.wedding_operational_completions (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  stop_key text not null,
  completed_at timestamptz not null default timezone('utc',now()),
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  primary key (wedding_id,stop_key)
);
alter table public.wedding_operational_completions enable row level security;
alter table public.wedding_operational_completions force row level security;
grant select on public.wedding_operational_completions to authenticated;
create policy wedding_operational_completions_select_owner_fixture on public.wedding_operational_completions
  for select to authenticated using (public.is_wedding_owner(wedding_id));
alter table public.sessions enable row level security;
alter table public.sessions force row level security;
grant select on public.sessions to authenticated;
create policy sessions_select_owner_fixture on public.sessions for select to authenticated
  using (user_id=auth.uid());
alter table public.session_payments enable row level security;
alter table public.session_payments force row level security;
grant select on public.session_payments to authenticated;
create policy session_payments_select_owner_fixture on public.session_payments for select to authenticated
  using (exists(select 1 from public.sessions s where s.id=session_id and s.user_id=auth.uid()));
alter table public.collaboration_child_isolation_fixture enable row level security;
alter table public.collaboration_child_isolation_fixture force row level security;
grant select on public.collaboration_child_isolation_fixture to authenticated;
create policy collaboration_child_fixture_select_owner on public.collaboration_child_isolation_fixture
  for select to authenticated using (public.is_wedding_owner(wedding_id));
alter table public.wedding_extra_services enable row level security;
alter table public.wedding_extra_services force row level security;
grant select on public.wedding_extra_services to authenticated;
create policy wedding_extra_services_select_owner_fixture on public.wedding_extra_services
  for select to authenticated using (public.is_wedding_owner(wedding_id));
"""

ddl += child_fixture_ddl

ddl += r"""
create table public.wedding_places (
  id uuid primary key default extensions.gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  role text not null check (role in ('bride_preparation','groom_preparation','ceremony','reception','hotel','airport','other')),
  label text, place_id text, formatted_address text not null,
  latitude numeric(10,7), longitude numeric(10,7), sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);
create index wedding_places_fixture_wedding_id_idx on public.wedding_places(wedding_id);
alter table public.wedding_places enable row level security;
alter table public.wedding_places force row level security;
grant select on public.wedding_places to authenticated;
create policy wedding_places_select_owner_fixture on public.wedding_places
  for select to authenticated using (public.is_wedding_owner(wedding_id));
create table public.wedding_operational_times (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  stop_key text not null,
  operational_time text not null,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  primary key (wedding_id,stop_key)
);
alter table public.wedding_operational_times enable row level security;
alter table public.wedding_operational_times force row level security;
grant select on public.wedding_operational_times to authenticated;
create policy wedding_operational_times_select_owner_fixture on public.wedding_operational_times
  for select to authenticated using (public.is_wedding_owner(wedding_id));
"""

ddl += r"""
alter table public.questionnaire_templates enable row level security;
alter table public.questionnaire_templates force row level security;
grant select, insert, update, delete on public.questionnaire_templates to authenticated;

"""

functions = [
    ("20260811230000_pro_mutation_gate.sql", "account_has_pro_access"),
    ("20261012133531_collaboration_v1_global_connections.sql", "create_collaboration_invite"),
    ("20261012133531_collaboration_v1_global_connections.sql", "accept_collaboration_invite"),
    ("20261012133531_collaboration_v1_global_connections.sql", "decline_collaboration_invite"),
    ("20261012133531_collaboration_v1_global_connections.sql", "cancel_collaboration_invite"),
    ("20261012133531_collaboration_v1_global_connections.sql", "end_collaboration"),
    ("20261012133531_collaboration_v1_global_connections.sql", "get_collaboration_state"),
    ("20260907200000_user_legal_acceptances.sql", "current_production_legal_version"),
    ("20260811200000_subscription_foundation.sql", "billing_plan_catalog"),
    ("20260811200000_subscription_foundation.sql", "ensure_billing_account_for_user"),
    ("20260811200000_subscription_foundation.sql", "initialize_trial_subscription"),
    ("20260811200000_subscription_foundation.sql", "resolve_account_entitlement"),
    ("20260811200000_subscription_foundation.sql", "resolve_user_entitlement"),
    ("20260811200000_subscription_foundation.sql", "get_my_subscription_summary"),
    ("20260811200000_subscription_foundation.sql", "admin_get_subscription_metrics"),
    ("20260811200000_subscription_foundation.sql", "admin_list_subscriptions"),
    ("20260806180000_admin_phase2_rpc_signature_fix.sql", "assert_admin_owner_aal2"),
    ("20260824220000_official_pre_wedding_presets_v1.sql", "provision_official_pre_wedding_presets"),
    ("20260907200000_user_legal_acceptances.sql", "handle_new_user"),
    ("20260811200000_subscription_foundation.sql", "on_public_user_created_init_billing"),
    ("20261012133531_collaboration_v1_global_connections.sql", "collaboration_events_allow_fk_nulling"),
    ("20261012133531_collaboration_v1_global_connections.sql", "collaboration_before_user_delete"),
]

# Ensure the fixture uses the released Collaboration 1B table definitions.
collaboration_tables = "\n\n".join(
    table("20261012133531_collaboration_v1_global_connections.sql", name)
    for name in ("collaboration_invitations", "collaboration_connections", "collaboration_events")
)
collaboration_tables += """
create unique index collaboration_invitations_pending_pair_unique
  on public.collaboration_invitations(least(inviter_user_id,invitee_user_id),greatest(inviter_user_id,invitee_user_id))
  where status='pending';
create unique index collaboration_connections_active_pair_unique
  on public.collaboration_connections(participant_low_id,participant_high_id)
  where status='active';
create unique index collaboration_events_actor_idempotency_unique
  on public.collaboration_events(actor_user_id,idempotency_key) where idempotency_key is not null;
"""

out = [ddl, collaboration_tables, "\n"]
out.extend(function(source, name) + "\n" for source, name in functions)
out.append(r"""
-- Test-only notification sink. Collaboration RPCs retain their released code;
-- this disposable harness does not create or deliver notification records.
create function public.enqueue_notification_event(
  uuid, text, text, uuid, text, jsonb, text, text, text
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.notifications(user_id,title,content,entity_type,entity_id,link,event_key)
  values($1,$7,$8,$3,$4,$9,$5) on conflict(event_key) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.notifications where event_key=$5; end if;
  return v_id;
end; $$;

revoke all on function public.account_has_pro_access() from public, anon;
grant execute on function public.account_has_pro_access() to authenticated, service_role;
revoke all on function public.create_collaboration_invite(text, uuid) from public, anon;
revoke all on function public.accept_collaboration_invite(uuid, uuid) from public, anon;
revoke all on function public.end_collaboration(uuid, uuid) from public, anon;
grant execute on function public.create_collaboration_invite(text, uuid) to authenticated;
grant execute on function public.accept_collaboration_invite(uuid, uuid) to authenticated;
grant execute on function public.end_collaboration(uuid, uuid) to authenticated;
revoke all on function public.decline_collaboration_invite(uuid, uuid) from public, anon;
revoke all on function public.cancel_collaboration_invite(uuid, uuid) from public, anon;
revoke all on function public.get_collaboration_state() from public, anon;
grant execute on function public.decline_collaboration_invite(uuid, uuid) to authenticated;
grant execute on function public.cancel_collaboration_invite(uuid, uuid) to authenticated;
grant execute on function public.get_collaboration_state() to authenticated;
revoke all on function public.collaboration_events_allow_fk_nulling() from public, anon, authenticated;
revoke all on function public.collaboration_before_user_delete() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
create trigger on_public_users_created_billing after insert on public.users
  for each row execute function public.on_public_user_created_init_billing();
create trigger collaboration_events_append_only before update or delete on public.collaboration_events
  for each row execute function public.collaboration_events_allow_fk_nulling();
create trigger collaboration_before_user_delete before delete on public.users
  for each row execute function public.collaboration_before_user_delete();

alter table public.collaboration_invitations enable row level security;
alter table public.collaboration_invitations force row level security;
alter table public.collaboration_connections enable row level security;
alter table public.collaboration_connections force row level security;
alter table public.collaboration_events enable row level security;
alter table public.collaboration_events force row level security;
revoke all on public.collaboration_invitations, public.collaboration_connections, public.collaboration_events
  from public, anon, authenticated;
grant select on public.collaboration_invitations, public.collaboration_connections, public.collaboration_events to authenticated;
grant all on public.collaboration_invitations, public.collaboration_connections, public.collaboration_events to service_role;
create policy collaboration_invitations_participants_select on public.collaboration_invitations
  for select to authenticated using (auth.uid() in (inviter_user_id,invitee_user_id));
create policy collaboration_connections_participants_select on public.collaboration_connections
  for select to authenticated using (auth.uid() in (participant_low_id,participant_high_id));
create policy collaboration_events_participants_select on public.collaboration_events for select to authenticated
  using (actor_user_id=auth.uid() or exists(select 1 from public.collaboration_invitations i
    where i.id=collaboration_events.invitation_id and auth.uid() in (i.inviter_user_id,i.invitee_user_id))
    or exists(select 1 from public.collaboration_connections c where c.id=collaboration_events.connection_id
    and auth.uid() in (c.participant_low_id,c.participant_high_id)));

insert into public.forms (name, slug, category, schema, version, is_active, is_system_template)
values ('Harness form', 'harness-form', 'other', '{"questions":[]}', 1, true, true);
insert into public.packages (name, slug, price, deposit_amount, is_active, sort_order, is_system_template)
values ('Harness package', 'harness-package', 100, 0, true, 1, true);
insert into public.package_items (package_id, title, description, sort_order)
select id, 'Harness item', null, 1 from public.packages where slug='harness-package';
insert into public.extra_services (name, slug, price, is_active, is_system_template)
values ('Harness service', 'harness-service', 10, true, true);

grant select, update on public.profiles to authenticated;
grant select, update on public.users to authenticated;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.users enable row level security;
alter table public.users force row level security;
create policy profiles_owner_select on public.profiles for select to authenticated using (id=auth.uid());
create policy profiles_owner_update on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy users_owner_select on public.users for select to authenticated using (id=auth.uid());
create policy users_owner_update on public.users for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy weddings_select_own on public.weddings for select to authenticated using (user_id=auth.uid());
create policy weddings_insert_own on public.weddings for insert to authenticated with check (user_id=auth.uid() and public.account_has_pro_access());
create policy weddings_update_own on public.weddings for update to authenticated using (user_id=auth.uid() and public.account_has_pro_access()) with check (user_id=auth.uid() and public.account_has_pro_access());
create policy weddings_delete_own on public.weddings for delete to authenticated using (user_id=auth.uid() and public.account_has_pro_access());
create policy qt_select_own on public.questionnaire_templates for select to authenticated using (owner_id=auth.uid());
create policy qt_insert_own on public.questionnaire_templates for insert to authenticated
  with check (owner_id = auth.uid() and public.account_has_pro_access());
create policy qt_update_own on public.questionnaire_templates for update to authenticated
  using (owner_id = auth.uid() and public.account_has_pro_access())
  with check (owner_id = auth.uid() and public.account_has_pro_access());
create policy qt_delete_own on public.questionnaire_templates for delete to authenticated
  using (owner_id = auth.uid() and public.account_has_pro_access());

grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on function public.admin_get_subscription_metrics() to authenticated;
grant execute on function public.admin_list_subscriptions(integer, integer, text) to authenticated;
""")
sys.stdout.write("\n".join(out))
