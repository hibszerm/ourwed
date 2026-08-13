-- Wedding-day stop completion (Cockpit field execution state).
-- stop_key = 'studio' or wedding_places.id (same convention as operational times).
-- Presence of a row means completed; delete to restore.

create table if not exists public.wedding_operational_completions (
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  stop_key text not null,
  completed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (wedding_id, stop_key)
);

create index if not exists wedding_operational_completions_wedding_id_idx
  on public.wedding_operational_completions (wedding_id);

create trigger wedding_operational_completions_set_updated_at
  before update on public.wedding_operational_completions
  for each row
  execute function public.set_updated_at();

alter table public.wedding_operational_completions enable row level security;
alter table public.wedding_operational_completions force row level security;

drop policy if exists wedding_operational_completions_select_own
  on public.wedding_operational_completions;
create policy wedding_operational_completions_select_own
  on public.wedding_operational_completions for select to authenticated
  using (public.is_wedding_owner(wedding_id));

drop policy if exists wedding_operational_completions_insert_own
  on public.wedding_operational_completions;
create policy wedding_operational_completions_insert_own
  on public.wedding_operational_completions for insert to authenticated
  with check (public.is_wedding_owner(wedding_id));

drop policy if exists wedding_operational_completions_update_own
  on public.wedding_operational_completions;
create policy wedding_operational_completions_update_own
  on public.wedding_operational_completions for update to authenticated
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));

drop policy if exists wedding_operational_completions_delete_own
  on public.wedding_operational_completions;
create policy wedding_operational_completions_delete_own
  on public.wedding_operational_completions for delete to authenticated
  using (public.is_wedding_owner(wedding_id));

revoke all on public.wedding_operational_completions from public, anon;
grant select, insert, update, delete on public.wedding_operational_completions
  to authenticated;
