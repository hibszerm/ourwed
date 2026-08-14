-- Session payment ledger (Option B).
-- Does NOT modify public.payments or wedding payment semantics.
-- sessions.deposit_amount remains agreed zaliczka; actual money lives here.

-- =============================================================================
-- 1. Table
-- =============================================================================

create table if not exists public.session_payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  type text not null
    check (type in ('deposit', 'installment', 'final', 'other')),
  amount numeric(12, 2) not null check (amount >= 0),
  payment_date date,
  method text
    check (method is null or method in ('transfer', 'cash', 'blik', 'other')),
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.session_payments is
  'Client payments toward a session total_price (deposit/zaliczka, installments, final).';

-- =============================================================================
-- 2. Indexes
-- =============================================================================

create index if not exists session_payments_session_id_idx
  on public.session_payments (session_id);

create index if not exists session_payments_session_id_payment_date_idx
  on public.session_payments (session_id, payment_date);

-- =============================================================================
-- 3. Ownership helper + RLS
-- =============================================================================

create or replace function public.is_session_owner(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and s.user_id = auth.uid()
  );
$$;

comment on function public.is_session_owner(uuid) is
  'True when auth.uid() owns the session row.';

revoke all on function public.is_session_owner(uuid) from public, anon;
grant execute on function public.is_session_owner(uuid) to authenticated;

alter table public.session_payments enable row level security;
alter table public.session_payments force row level security;

drop policy if exists session_payments_select_own on public.session_payments;
create policy session_payments_select_own
  on public.session_payments for select
  using (public.is_session_owner(session_id));

drop policy if exists session_payments_insert_own on public.session_payments;
create policy session_payments_insert_own
  on public.session_payments for insert
  with check (
    public.is_session_owner(session_id)
    and public.account_has_pro_access()
  );

drop policy if exists session_payments_update_own on public.session_payments;
create policy session_payments_update_own
  on public.session_payments for update
  using (
    public.is_session_owner(session_id)
    and public.account_has_pro_access()
  )
  with check (
    public.is_session_owner(session_id)
    and public.account_has_pro_access()
  );

drop policy if exists session_payments_delete_own on public.session_payments;
create policy session_payments_delete_own
  on public.session_payments for delete
  using (
    public.is_session_owner(session_id)
    and public.account_has_pro_access()
  );

-- =============================================================================
-- 4. Historical backfill (idempotent)
-- =============================================================================
-- Product decision: existing sessions.deposit_amount was treated as received money.
-- Keep deposit_amount unchanged (now = agreed zaliczka). Insert one paid deposit row.

do $$
declare
  migration_note constant text :=
    'Migracja: zaliczka z wcześniejszego modelu sesji';
begin
  insert into public.session_payments (
    session_id,
    type,
    amount,
    payment_date,
    method,
    note
  )
  select
    s.id,
    'deposit',
    s.deposit_amount,
    coalesce(
      (s.updated_at at time zone 'utc')::date,
      (s.created_at at time zone 'utc')::date
    ),
    null,
    migration_note
  from public.sessions s
  where s.deposit_amount > 0
    and not exists (
      select 1
      from public.session_payments sp
      where sp.session_id = s.id
        and sp.type = 'deposit'
        and sp.note = migration_note
    );
end $$;

-- =============================================================================
-- 5. Document session commercial columns
-- =============================================================================

comment on column public.sessions.total_price is
  'Contractual session price (SoT). Remaining uses session_payments ledger, not deposit_amount.';

comment on column public.sessions.deposit_amount is
  'Agreed zaliczka / agreed deposit (contractual). Not payment truth — paid amounts live in session_payments.';
