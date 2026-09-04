-- One current Wedding Brief PDF per wedding.
-- Historical versions are not retained; the application replaces the pointer
-- then deletes the previous Storage object.

create table if not exists public.wedding_briefs (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null unique references public.weddings (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  source_hash text not null,
  generator_version integer not null,
  generated_at timestamptz not null default timezone('utc', now()),
  byte_size bigint,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists wedding_briefs_wedding_id_idx
  on public.wedding_briefs (wedding_id);

comment on table public.wedding_briefs is
  'One current Wedding Brief PDF per wedding. Replace in place; do not accumulate versions.';

drop trigger if exists wedding_briefs_set_updated_at on public.wedding_briefs;
create trigger wedding_briefs_set_updated_at
  before update on public.wedding_briefs
  for each row
  execute function public.set_updated_at();

alter table public.wedding_briefs enable row level security;
alter table public.wedding_briefs force row level security;

drop policy if exists wedding_briefs_select_own on public.wedding_briefs;
create policy wedding_briefs_select_own
  on public.wedding_briefs for select to authenticated
  using (public.is_wedding_owner(wedding_id));

drop policy if exists wedding_briefs_insert_own on public.wedding_briefs;
create policy wedding_briefs_insert_own
  on public.wedding_briefs for insert to authenticated
  with check (
    public.is_wedding_owner(wedding_id)
    and public.account_has_pro_access()
  );

drop policy if exists wedding_briefs_update_own on public.wedding_briefs;
create policy wedding_briefs_update_own
  on public.wedding_briefs for update to authenticated
  using (
    public.is_wedding_owner(wedding_id)
    and public.account_has_pro_access()
  )
  with check (
    public.is_wedding_owner(wedding_id)
    and public.account_has_pro_access()
  );

drop policy if exists wedding_briefs_delete_own on public.wedding_briefs;
create policy wedding_briefs_delete_own
  on public.wedding_briefs for delete to authenticated
  using (
    public.is_wedding_owner(wedding_id)
    and public.account_has_pro_access()
  );

revoke all on public.wedding_briefs from public, anon;
grant select, insert, update, delete on public.wedding_briefs
  to authenticated;
