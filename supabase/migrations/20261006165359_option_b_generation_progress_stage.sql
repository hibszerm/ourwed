alter table public.wedding_contract_generation_runs
  add column progress_stage text,
  add constraint wedding_contract_generation_runs_progress_stage_check
    check (progress_stage is null or progress_stage in (
      'preparing', 'analyzing', 'building_document', 'verifying', 'preparing_preview'
    ));

comment on column public.wedding_contract_generation_runs.progress_stage is
  'Ephemeral Option B progress stage; operational metadata only.';
