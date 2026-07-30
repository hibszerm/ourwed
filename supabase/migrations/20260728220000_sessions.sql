-- Sessions: lightweight standalone photography assignments (not weddings).
-- No workflow/status. Location fields live on the row (single place).

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,

  custom_name text,

  primary_first_name text,
  primary_last_name text,
  secondary_first_name text,
  secondary_last_name text,

  session_type text not null
    check (session_type in (
      'engagement',
      'postWedding',
      'family',
      'business',
      'other'
    )),
  custom_session_type text,

  session_date date not null,
  start_time time,
  end_time time,

  location_name text,
  location_address text,
  formatted_address text,
  place_id text,
  latitude double precision,
  longitude double precision,
  location_source text,

  total_price numeric(12, 2) not null default 0
    check (total_price >= 0),
  deposit_amount numeric(12, 2) not null default 0
    check (deposit_amount >= 0),

  notes text,

  linked_wedding_id uuid references public.weddings (id) on delete set null,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  check (deposit_amount <= total_price),
  check (
    end_time is null
    or start_time is null
    or end_time >= start_time
  ),
  check (
    (session_type = 'other' and custom_session_type is not null and length(trim(custom_session_type)) > 0)
    or (session_type <> 'other' and custom_session_type is null)
  )
);

comment on table public.sessions is
  'Standalone photo sessions (engagement, family, business, …). Not wedding workflow.';

create index if not exists sessions_user_id_idx on public.sessions (user_id);
create index if not exists sessions_session_date_idx on public.sessions (session_date);
create index if not exists sessions_linked_wedding_id_idx on public.sessions (linked_wedding_id);

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
  before update on public.sessions
  for each row
  execute function public.set_updated_at();

alter table public.sessions enable row level security;

drop policy if exists sessions_select_own on public.sessions;
create policy sessions_select_own
  on public.sessions for select
  using (user_id = auth.uid());

drop policy if exists sessions_insert_own on public.sessions;
create policy sessions_insert_own
  on public.sessions for insert
  with check (user_id = auth.uid());

drop policy if exists sessions_update_own on public.sessions;
create policy sessions_update_own
  on public.sessions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists sessions_delete_own on public.sessions;
create policy sessions_delete_own
  on public.sessions for delete
  using (user_id = auth.uid());
