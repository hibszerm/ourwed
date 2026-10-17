-- Disposable-only bridge from the closed harness's generic child table to the
-- canonical public.notes shape. The frozen harness itself is never modified.
begin;
alter table public.weddings add column if not exists price numeric not null default 0;
-- The synthetic Contacts baseline predates the row fields that the frozen
-- Contacts migration expects to exist in the production schema.
alter table public.weddings add column if not exists correspondence jsonb not null default '[]'::jsonb;
alter table public.weddings add column if not exists correspondence_channel text;
alter table public.weddings add column if not exists correspondence_value text;
alter table public.notes rename to notes_child_isolation_fixture;
create table public.notes (
  id uuid primary key default extensions.gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  author text not null,
  content text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default timezone('utc',now())
);
create index notes_wedding_id_idx on public.notes(wedding_id);
create index notes_pinned_idx on public.notes(wedding_id,pinned) where pinned=true;
alter table public.notes enable row level security;
alter table public.notes force row level security;
grant select,insert,update,delete on public.notes to authenticated;
create policy notes_select_own on public.notes for select to authenticated
  using(public.is_wedding_owner(wedding_id));
create policy notes_insert_own on public.notes for insert to authenticated
  with check(public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
create policy notes_update_own on public.notes for update to authenticated
  using(public.is_wedding_owner(wedding_id) and public.account_has_pro_access())
  with check(public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
create policy notes_delete_own on public.notes for delete to authenticated
  using(public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
commit;
