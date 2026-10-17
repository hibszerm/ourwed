-- TEST-ONLY / NOT PRODUCTION DEPENDENCY.
-- The isolated frozen Notes database predates the canonical payment columns
-- present in supabase/schema.sql. Bridge only those known omissions using the
-- exact canonical column types/checks; do not use this fixture in migrations.
begin;
alter table public.payments
  add column if not exists payment_date date,
  add column if not exists method text,
  add column if not exists note text;
-- wedding display_name was introduced by the frozen 20260728140000 migration.
alter table public.weddings add column if not exists display_name text;
-- The isolated source ACL is intentionally not restored (some Supabase-owned
-- extension grants are not restorable by postgres). Preserve its client
-- extension-schema usage contract for the runtime assertions.
grant usage on schema extensions to anon, authenticated, service_role;
grant select, insert, update, delete on public.payments to authenticated;
-- Restore the frozen payment write policies omitted by the old Notes test
-- database; these definitions match 20260811230000_pro_mutation_gate.sql.
drop policy if exists payments_insert_own on public.payments;
create policy payments_insert_own on public.payments for insert to authenticated
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists payments_update_own on public.payments;
create policy payments_update_own on public.payments for update to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access())
  with check (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
drop policy if exists payments_delete_own on public.payments;
create policy payments_delete_own on public.payments for delete to authenticated
  using (public.is_wedding_owner(wedding_id) and public.account_has_pro_access());
-- Seed unrelated, synthetic pre-migration payment rows to exercise the
-- deterministic historical owner-receiver backfill (paid vs scheduled).
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','ef080000-0000-4000-8000-000000000001',
  'authenticated','authenticated','comp-backfill-owner@example.test','x',now(),'{}',
  '{"legal_registration_accepted":true,"terms_version":"1.1","privacy_version":"1.1"}',now(),now());
insert into public.users(id,email,name) values
  ('ef080000-0000-4000-8000-000000000001','comp-backfill-owner@example.test','Comp Backfill Owner')
on conflict(id) do update set name=excluded.name;
insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status,contract_value)
values ('ef090000-0000-4000-8000-000000000001','ef080000-0000-4000-8000-000000000001',
  'Comp Backfill','Owner','2027-06-10','active',10000);
insert into public.payments(id,wedding_id,type,amount,payment_date) values
 ('ef0a0000-0000-4000-8000-000000000001','ef090000-0000-4000-8000-000000000001','installment',3000,'2027-01-01'),
 ('ef0a0000-0000-4000-8000-000000000002','ef090000-0000-4000-8000-000000000001','final',7000,null);
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid='public.payments'::regclass and conname='payments_method_check'
  ) then
    alter table public.payments add constraint payments_method_check
      check (method is null or method in ('transfer','cash','blik','other'));
  end if;
end;
$$;
commit;
