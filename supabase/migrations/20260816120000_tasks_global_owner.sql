-- =============================================================================
-- Phase 1D.1 — Global tasks foundation: direct owner + optional wedding
-- =============================================================================
-- Supports:
--   LINKED:   user_id = owner, wedding_id = owned wedding
--   UNLINKED: user_id = owner, wedding_id = NULL
--
-- Safety:
--   - Does NOT UPDATE public.weddings (avoids enforce_wedding_owner / null auth.uid)
--   - Backfill SELECTs weddings only
--   - Fails if any task remains ownerless before NOT NULL
-- =============================================================================

-- 1) Add owner column (nullable until backfill)
alter table public.tasks
  add column if not exists user_id uuid references public.users (id) on delete cascade;

comment on column public.tasks.user_id is
  'Studio owner (public.users.id = auth.uid()). Required for linked and unlinked tasks.';

-- 2) Backfill from linked weddings (SELECT weddings only — no wedding UPDATE)
update public.tasks t
set user_id = w.user_id
from public.weddings w
where t.wedding_id = w.id
  and t.user_id is null;

-- 3) Orphan guard — fail migration rather than leave ownerless rows
do $$
declare
  orphan_count integer;
begin
  select count(*)::integer into orphan_count
  from public.tasks
  where user_id is null;

  if orphan_count > 0 then
    raise exception
      'tasks.user_id backfill failed: % task(s) have no resolvable wedding owner',
      orphan_count;
  end if;
end $$;

-- 4) Enforce NOT NULL after successful backfill
alter table public.tasks
  alter column user_id set not null;

-- 5) Optional wedding association
alter table public.tasks
  alter column wedding_id drop not null;

comment on column public.tasks.wedding_id is
  'Optional wedding association. NULL = studio-wide unlinked task.';

comment on table public.tasks is
  'Manual studio to-dos. Owned by user_id; optionally linked to a wedding.';

-- 6) Indexes for owner-scoped reads (avoid duplicating existing wedding/due indexes)
create index if not exists tasks_user_id_status_due_date_idx
  on public.tasks (user_id, status, due_date);

create index if not exists tasks_user_id_wedding_id_idx
  on public.tasks (user_id, wedding_id);

-- 7) RLS — owner-scoped; Pro write gate preserved; optional wedding ownership check
alter table public.tasks enable row level security;
alter table public.tasks force row level security;

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own on public.tasks
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own on public.tasks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.account_has_pro_access()
    and (
      wedding_id is null
      or public.is_wedding_owner(wedding_id)
    )
  );

drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own on public.tasks
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.account_has_pro_access()
  )
  with check (
    user_id = auth.uid()
    and public.account_has_pro_access()
    and (
      wedding_id is null
      or public.is_wedding_owner(wedding_id)
    )
  );

drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own on public.tasks
  for delete to authenticated
  using (
    user_id = auth.uid()
    and public.account_has_pro_access()
  );
