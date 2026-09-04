-- Canonical photographer-entered contract-party fields on weddings.
-- These are wedding-domain data, independent of questionnaire submission.
--
-- Mapping:
--   groom_phone            → wedding.couple.partner2Phone
--   contract_address       → wedding.couple.partner1Address
--   contract_postal_code   → wedding.couple.partner1PostalCode
--   contract_city          → wedding.couple.partner1City
--
-- Additive nullable columns only. No backfill. Do NOT UPDATE public.weddings:
-- weddings_enforce_owner requires auth.uid() (see 20260722180000_enforce_wedding_owner.sql).

alter table public.weddings
  add column if not exists groom_phone text;

alter table public.weddings
  add column if not exists contract_address text;

alter table public.weddings
  add column if not exists contract_postal_code text;

alter table public.weddings
  add column if not exists contract_city text;

comment on column public.weddings.groom_phone is
  'Groom phone. Canonical studio-entered party data; independent of questionnaire submission.';
comment on column public.weddings.contract_address is
  'Contract correspondence street address. Canonical studio-entered party data; independent of questionnaire submission.';
comment on column public.weddings.contract_postal_code is
  'Contract correspondence postal code. Canonical studio-entered party data; independent of questionnaire submission.';
comment on column public.weddings.contract_city is
  'Contract correspondence city. Canonical studio-entered party data; independent of questionnaire submission.';
