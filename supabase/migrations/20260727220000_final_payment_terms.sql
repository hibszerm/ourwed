-- Final payment terms: structured rule on Package (catalog) and Wedding (snapshot).
-- Concrete final_payment_due_date remains the derived calendar date when resolvable.

alter table public.packages
  add column if not exists final_payment_terms jsonb;

comment on column public.packages.final_payment_terms is
  'Structured final payment rule: {mode, value?}. Modes: wedding_day | days_after_wedding | months_after_wedding | after_delivery.';

alter table public.weddings
  add column if not exists final_payment_terms jsonb;

comment on column public.weddings.final_payment_terms is
  'Wedding snapshot of package final payment rule. Independent of later catalog edits.';
