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
  email text,
  phone text,
  wedding_date date,
  venue text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.weddings enable row level security;
alter table public.weddings force row level security;
grant select, insert, update, delete on public.weddings to authenticated;
alter table public.questionnaire_templates enable row level security;
alter table public.questionnaire_templates force row level security;
grant select, insert, update, delete on public.questionnaire_templates to authenticated;

"""

functions = [
    ("20260811230000_pro_mutation_gate.sql", "account_has_pro_access"),
    ("20261012133531_collaboration_v1_global_connections.sql", "create_collaboration_invite"),
    ("20261012133531_collaboration_v1_global_connections.sql", "accept_collaboration_invite"),
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

out = [ddl, collaboration_tables, "\n"]
out.extend(function(source, name) + "\n" for source, name in functions)
out.append(r"""
-- Test-only notification sink. Collaboration RPCs retain their released code;
-- this disposable harness does not create or deliver notification records.
create function public.enqueue_notification_event(
  uuid, text, text, uuid, text, jsonb, text, text, text
) returns uuid language sql volatile security definer set search_path = ''
as $$ select null::uuid $$;

revoke all on function public.account_has_pro_access() from public, anon;
grant execute on function public.account_has_pro_access() to authenticated, service_role;
revoke all on function public.create_collaboration_invite(text, uuid) from public, anon;
revoke all on function public.accept_collaboration_invite(uuid, uuid) from public, anon;
grant execute on function public.create_collaboration_invite(text, uuid) to authenticated;
grant execute on function public.accept_collaboration_invite(uuid, uuid) to authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
create trigger on_public_users_created_billing after insert on public.users
  for each row execute function public.on_public_user_created_init_billing();
create trigger collaboration_events_append_only before update or delete on public.collaboration_events
  for each row execute function public.collaboration_events_allow_fk_nulling();
create trigger collaboration_before_user_delete before delete on public.users
  for each row execute function public.collaboration_before_user_delete();

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
