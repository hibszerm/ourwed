-- Add small server-side guards for Option B sessions. Legacy payment schedule
-- runs remain unaffected because every index is scoped to session_kind.
alter table public.wedding_contract_generation_runs
  add column authority_fingerprint text,
  add column execution_id uuid,
  add column idempotency_key uuid;

alter table public.wedding_contract_generation_runs
  add constraint wedding_contract_generation_runs_authority_fingerprint_check
    check (authority_fingerprint is null or authority_fingerprint ~ '^[a-f0-9]{64}$');

create unique index wedding_contract_generation_runs_one_active_option_b_per_wedding
  on public.wedding_contract_generation_runs (owner_user_id, wedding_id)
  where session_kind = 'option_b' and session_state in ('processing', 'awaiting_input');

create unique index wedding_contract_generation_runs_option_b_execution_id
  on public.wedding_contract_generation_runs (execution_id)
  where session_kind = 'option_b' and execution_id is not null;

create unique index wedding_contract_generation_runs_option_b_idempotency_key
  on public.wedding_contract_generation_runs (owner_user_id, idempotency_key)
  where session_kind = 'option_b' and idempotency_key is not null;

comment on column public.wedding_contract_generation_runs.authority_fingerprint is
  'SHA-256 of deterministic authoritative inputs used for the latest Option B provider execution.';
comment on column public.wedding_contract_generation_runs.execution_id is
  'CAS execution token for one active Option B server invocation.';
