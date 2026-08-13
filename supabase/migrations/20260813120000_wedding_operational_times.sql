-- Studio operational day-plan times (independent of questionnaire answers).
-- Order remains on wedding_places.sort_order.
-- stop_key = 'studio' or wedding_places.id.
-- Presence of a row is a studio override; missing row seeds from questionnaire.

create table if not exists public.wedding_operational_times (
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  stop_key text not null,
  operational_time text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (wedding_id, stop_key),
  constraint wedding_operational_times_time_check
    check (operational_time ~ '^[0-2][0-9]:[0-5][0-9]$')
);

create index if not exists wedding_operational_times_wedding_id_idx
  on public.wedding_operational_times (wedding_id);

create trigger wedding_operational_times_set_updated_at
  before update on public.wedding_operational_times
  for each row
  execute function public.set_updated_at();

alter table public.wedding_operational_times enable row level security;
alter table public.wedding_operational_times force row level security;

drop policy if exists wedding_operational_times_select_own
  on public.wedding_operational_times;
create policy wedding_operational_times_select_own
  on public.wedding_operational_times for select to authenticated
  using (public.is_wedding_owner(wedding_id));

drop policy if exists wedding_operational_times_insert_own
  on public.wedding_operational_times;
create policy wedding_operational_times_insert_own
  on public.wedding_operational_times for insert to authenticated
  with check (public.is_wedding_owner(wedding_id));

drop policy if exists wedding_operational_times_update_own
  on public.wedding_operational_times;
create policy wedding_operational_times_update_own
  on public.wedding_operational_times for update to authenticated
  using (public.is_wedding_owner(wedding_id))
  with check (public.is_wedding_owner(wedding_id));

drop policy if exists wedding_operational_times_delete_own
  on public.wedding_operational_times;
create policy wedding_operational_times_delete_own
  on public.wedding_operational_times for delete to authenticated
  using (public.is_wedding_owner(wedding_id));

revoke all on public.wedding_operational_times from public, anon;
grant select, insert, update, delete on public.wedding_operational_times
  to authenticated;
