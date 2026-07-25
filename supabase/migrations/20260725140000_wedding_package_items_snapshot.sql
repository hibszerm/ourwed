-- Commercial Truth Model: freeze package line items on the wedding.
-- Catalog package_items remain live for future weddings only.

alter table public.weddings
  add column if not exists package_items_snapshot jsonb not null default '[]'::jsonb;

comment on column public.weddings.package_items_snapshot is
  'Frozen package line items at assignment time (title, description, sortOrder, sourceItemId). Never rewritten by catalog edits.';

comment on column public.weddings.contract_value is
  'Commercial snapshot: contractValue — total agreed contract value.';

comment on column public.weddings.deposit_amount is
  'Commercial snapshot: agreedDeposit — deposit agreed in the contract (not totalPaid).';

comment on column public.weddings.package_name is
  'Commercial snapshot: packageName at assignment time.';
