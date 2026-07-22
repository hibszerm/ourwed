-- =============================================================================
-- Auth profiles + sync to public.users
-- =============================================================================
-- profiles: extended account data for Supabase Auth users
-- public.users: kept in sync (same UUID) so existing CRM FKs keep working
-- =============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  profession text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.profiles is
  'Studio account profile linked 1:1 to auth.users.id';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- On signup: create profile + public.users row (same id as auth.users)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fname text;
  lname text;
  full_name text;
  prof text;
begin
  fname := coalesce(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), '');
  lname := coalesce(nullif(trim(new.raw_user_meta_data->>'last_name'), ''), '');
  prof := coalesce(nullif(trim(new.raw_user_meta_data->>'profession'), ''), '');
  full_name := trim(both ' ' from fname || ' ' || lname);
  if full_name = '' then
    full_name := split_part(coalesce(new.email, 'user'), '@', 1);
  end if;

  insert into public.profiles (id, first_name, last_name, profession)
  values (new.id, fname, lname, prof)
  on conflict (id) do update
    set
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      profession = excluded.profession,
      updated_at = timezone('utc', now());

  insert into public.users (id, email, name)
  values (new.id, coalesce(new.email, ''), full_name)
  on conflict (id) do update
    set
      email = excluded.email,
      name = excluded.name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
