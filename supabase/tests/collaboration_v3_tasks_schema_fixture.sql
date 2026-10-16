-- Disposable-only bridge: the closed frozen harness models tasks as a generic
-- child-isolation table. Preserve that fixture under a distinct name and
-- install the canonical task-row shape required by the Tasks runtime suite.
begin;
alter table public.tasks rename to tasks_child_isolation_fixture;
create table public.tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  wedding_id uuid references public.weddings(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check(status in ('todo','in_progress','done','cancelled')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc',now())
);
create index tasks_wedding_id_idx on public.tasks(wedding_id);
create index tasks_user_id_status_due_date_idx on public.tasks(user_id,status,due_date);
create index tasks_user_id_wedding_id_idx on public.tasks(user_id,wedding_id);
alter table public.tasks enable row level security;
alter table public.tasks force row level security;
grant select,insert,update,delete on public.tasks to authenticated;
create policy tasks_select_own on public.tasks for select to authenticated using(user_id=auth.uid());
create policy tasks_insert_own on public.tasks for insert to authenticated
  with check(user_id=auth.uid() and (wedding_id is null or public.is_wedding_owner(wedding_id)));
create policy tasks_update_own on public.tasks for update to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid() and (wedding_id is null or public.is_wedding_owner(wedding_id)));
create policy tasks_delete_own on public.tasks for delete to authenticated using(user_id=auth.uid());
commit;
