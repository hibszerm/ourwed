-- Keep legacy array rows valid while allowing the versioned v1 envelope used
-- by the Option B boundary. Detailed payload semantics remain application-owned.
alter table public.wedding_contract_generation_runs
  drop constraint wedding_contract_generation_runs_session_payload_check;

alter table public.wedding_contract_generation_runs
  add constraint wedding_contract_generation_runs_session_payload_check
  check (
    (
      session_kind is null
      and session_state is null
      and source_sha256 is null
      and missing_inputs_json = '[]'::jsonb
      and user_answers_json = '[]'::jsonb
    )
    or
    (
      session_kind = 'option_b'
      and session_state is not null
      and source_sha256 is not null
      and (
        jsonb_typeof(missing_inputs_json) = 'array'
        or (
          jsonb_typeof(missing_inputs_json) = 'object'
          and coalesce(missing_inputs_json -> 'version' = '1'::jsonb, false)
          and coalesce(jsonb_typeof(missing_inputs_json -> 'pending') = 'array', false)
          and coalesce(jsonb_typeof(missing_inputs_json -> 'history') = 'array', false)
        )
      )
      and jsonb_typeof(user_answers_json) = 'array'
      and (
        session_state <> 'awaiting_input'
        or case jsonb_typeof(missing_inputs_json)
          when 'array' then jsonb_array_length(missing_inputs_json) > 0
          when 'object' then coalesce(jsonb_array_length(missing_inputs_json -> 'pending') > 0, false)
          else false
        end
      )
    )
  );
