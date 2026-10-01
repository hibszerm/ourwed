-- Add the resumable Option B continuation contract to the existing generation
-- run boundary without changing payment-schedule status or payload semantics.

alter table public.wedding_contract_generation_runs
  add column owner_user_id uuid;

update public.wedding_contract_generation_runs run
set owner_user_id = wedding.user_id
from public.weddings wedding
where wedding.id = run.wedding_id
  and run.owner_user_id is null;

alter table public.wedding_contract_generation_runs
  alter column owner_user_id set default auth.uid(),
  alter column owner_user_id set not null;

alter table public.wedding_contract_generation_runs
  add column session_kind text,
  add column session_state text,
  add column missing_inputs_json jsonb not null default '[]'::jsonb,
  add column user_answers_json jsonb not null default '[]'::jsonb,
  add column source_sha256 text;

alter table public.wedding_contract_generation_runs
  add constraint wedding_contract_generation_runs_owner_user_id_fkey
    foreign key (owner_user_id) references auth.users (id) on delete cascade,
  add constraint wedding_contract_generation_runs_session_kind_check
    check (session_kind is null or session_kind = 'option_b'),
  add constraint wedding_contract_generation_runs_session_state_check
    check (session_state is null or session_state in (
      'processing', 'awaiting_input', 'completed', 'failed', 'abandoned'
    )),
  add constraint wedding_contract_generation_runs_source_sha256_check
    check (source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint wedding_contract_generation_runs_session_payload_check
    check (
      (session_kind is null
        and session_state is null
        and source_sha256 is null
        and missing_inputs_json = '[]'::jsonb
        and user_answers_json = '[]'::jsonb)
      or
      (session_kind = 'option_b'
        and session_state is not null
        and source_sha256 is not null
        and jsonb_typeof(missing_inputs_json) = 'array'
        and jsonb_typeof(user_answers_json) = 'array'
        and (session_state <> 'awaiting_input' or jsonb_array_length(missing_inputs_json) > 0))
    );

create index wedding_contract_generation_runs_option_b_scope_idx
  on public.wedding_contract_generation_runs (
    owner_user_id,
    wedding_id,
    template_id,
    template_version_id,
    created_at desc
  )
  where session_kind = 'option_b';

-- Existing policies remain owner-scoped through the wedding. Add the persisted
-- owner column to each policy so session ownership cannot be reassigned.
drop policy wedding_contract_generation_runs_select
  on public.wedding_contract_generation_runs;
create policy wedding_contract_generation_runs_select
  on public.wedding_contract_generation_runs
  for select
  using (
    public.is_wedding_owner(wedding_id)
    and owner_user_id = auth.uid()
    and (
      wedding_contract_generation_runs.session_kind is null
      or exists (
        select 1
        from public.document_templates template
        join public.document_template_versions version
          on version.template_id = template.id
         and version.id = wedding_contract_generation_runs.template_version_id
        where template.id = wedding_contract_generation_runs.template_id
          and template.user_id = auth.uid()
      )
    )
  );

drop policy wedding_contract_generation_runs_insert
  on public.wedding_contract_generation_runs;
create policy wedding_contract_generation_runs_insert
  on public.wedding_contract_generation_runs
  for insert
  with check (
    public.is_wedding_owner(wedding_id)
    and owner_user_id = auth.uid()
    and (
      wedding_contract_generation_runs.session_kind is null
      or exists (
        select 1
        from public.document_templates template
        join public.document_template_versions version
          on version.template_id = template.id
         and version.id = wedding_contract_generation_runs.template_version_id
        where template.id = wedding_contract_generation_runs.template_id
          and template.user_id = auth.uid()
      )
    )
  );

drop policy wedding_contract_generation_runs_update
  on public.wedding_contract_generation_runs;
create policy wedding_contract_generation_runs_update
  on public.wedding_contract_generation_runs
  for update
  using (
    public.is_wedding_owner(wedding_id)
    and owner_user_id = auth.uid()
    and (
      wedding_contract_generation_runs.session_kind is null
      or exists (
        select 1
        from public.document_templates template
        join public.document_template_versions version
          on version.template_id = template.id
         and version.id = wedding_contract_generation_runs.template_version_id
        where template.id = wedding_contract_generation_runs.template_id
          and template.user_id = auth.uid()
      )
    )
  )
  with check (
    public.is_wedding_owner(wedding_id)
    and owner_user_id = auth.uid()
    and (
      wedding_contract_generation_runs.session_kind is null
      or exists (
        select 1
        from public.document_templates template
        join public.document_template_versions version
          on version.template_id = template.id
         and version.id = wedding_contract_generation_runs.template_version_id
        where template.id = wedding_contract_generation_runs.template_id
          and template.user_id = auth.uid()
      )
    )
  );

drop policy wedding_contract_generation_runs_delete
  on public.wedding_contract_generation_runs;
create policy wedding_contract_generation_runs_delete
  on public.wedding_contract_generation_runs
  for delete
  using (
    public.is_wedding_owner(wedding_id)
    and owner_user_id = auth.uid()
    and (
      wedding_contract_generation_runs.session_kind is null
      or exists (
        select 1
        from public.document_templates template
        join public.document_template_versions version
          on version.template_id = template.id
         and version.id = wedding_contract_generation_runs.template_version_id
        where template.id = wedding_contract_generation_runs.template_id
          and template.user_id = auth.uid()
      )
    )
  );

comment on column public.wedding_contract_generation_runs.owner_user_id is
  'Studio owner for this generation run; paired with wedding ownership in RLS.';
comment on column public.wedding_contract_generation_runs.session_kind is
  'Null for legacy payment-schedule runs; option_b identifies generic continuation sessions.';
comment on column public.wedding_contract_generation_runs.missing_inputs_json is
  'Structured pending requirements for an Option B session; not canonical CRM data.';
comment on column public.wedding_contract_generation_runs.user_answers_json is
  'Accumulated user answers paired with opaque requirement IDs; not canonical CRM data.';
comment on column public.wedding_contract_generation_runs.source_sha256 is
  'SHA-256 of the source DOCX bytes pinned by template_id and template_version_id.';
