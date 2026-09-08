-- Isolated local harness for form_instances security migration.
-- Does NOT use production data. Run against ephemeral Postgres.

begin;

create extension if not exists pgcrypto;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

do $$ begin
  create role authenticated;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role anon;
exception when duplicate_object then null;
end $$;
grant usage on schema public to authenticated, anon;

create table if not exists public.weddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  contract_value numeric(12,2) default 0,
  travel_fee_status text,
  travel_fee_amount numeric(12,2)
);

create or replace function public.is_wedding_owner(p_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.weddings w
    where w.id = p_wedding_id and w.user_id = auth.uid()
  );
$$;

create or replace function public.account_has_pro_access()
returns boolean
language sql
stable
as $$
  select true;
$$;

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text,
  slug text,
  description text,
  category text,
  schema jsonb default '{}'::jsonb,
  version int default 1,
  is_active boolean default true,
  created_at timestamptz default timezone('utc', now())
);

create table if not exists public.form_instances (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id),
  wedding_id uuid references public.weddings(id),
  user_id uuid not null,
  token text not null unique,
  status text not null default 'pending',
  expires_at timestamptz,
  opened_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz default timezone('utc', now()),
  options_snapshot jsonb
);

create table if not exists public.form_answers (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null unique references public.form_instances(id),
  answer_json jsonb not null,
  created_at timestamptz default timezone('utc', now())
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text,
  description text,
  price numeric,
  currency text default 'PLN',
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default timezone('utc', now())
);

create table if not exists public.extra_services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text,
  description text,
  price numeric,
  currency text default 'PLN',
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default timezone('utc', now())
);

create table if not exists public.wedding_extra_services (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id),
  extra_service_id uuid not null,
  price_snapshot numeric(12,2) not null,
  quantity int not null default 1,
  name_snapshot text
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  content text,
  author text
);

create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  type text,
  title text,
  description text,
  system_generated boolean default false
);

create or replace function public.resolve_public_controller_identity(p_owner uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object('studioName', 'Test Studio', 'ownerId', p_owner);
$$;

create or replace function public.notify_contract_questionnaire_completed(p_instance uuid, p_answer uuid)
returns void language plpgsql as $$ begin null; end; $$;

alter table public.form_instances enable row level security;
-- SELECT needed so INSERT/UPDATE ... RETURNING works under FORCE RLS.
drop policy if exists form_instances_select_own on public.form_instances;
create policy form_instances_select_own on public.form_instances
  for select to authenticated
  using (user_id = auth.uid() and public.account_has_pro_access());
grant select, insert, update on public.form_instances to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Seed users / weddings
-- owner A: 11111111-1111-1111-1111-111111111111
-- owner B: 22222222-2222-2222-2222-222222222222
insert into public.weddings (id, user_id, contract_value)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 5000),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 7000);

insert into public.forms (id, user_id, name, slug, schema)
values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', 'Q', 'q', '{"sections":[]}'::jsonb);

commit;
