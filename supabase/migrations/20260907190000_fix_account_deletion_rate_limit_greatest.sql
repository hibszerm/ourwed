-- =============================================================================
-- Fix account_deletion_rate_limit_consume under search_path=''
-- =============================================================================
-- REMOTE TARGET: xyycwllsovpxlcustpcv (production-like)
--
-- Phase 2A.5 QA found:
--   pg_catalog.greatest(integer, integer) does not exist
-- GREATEST is SQL-keyword syntax and must not be schema-qualified when
-- search_path is empty. Without this fix, delete-account always 503s at
-- rate-limit consume (blocks all deletions).
-- =============================================================================

create or replace function public.account_deletion_rate_limit_consume(
  p_user_id uuid,
  p_window_seconds integer default 900,
  p_max_attempts integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_now timestamptz := pg_catalog.timezone('utc', pg_catalog.now());
  v_row public.account_deletion_rate_limits%rowtype;
  v_window_seconds integer := GREATEST(coalesce(p_window_seconds, 900), 60);
  v_max_attempts integer := GREATEST(coalesce(p_max_attempts, 5), 1);
  v_retry_after integer;
begin
  if p_user_id is null then
    raise exception 'account_deletion_rate_limit_consume: user id required';
  end if;

  v_role := coalesce(auth.role(), pg_catalog.current_setting('request.jwt.claim.role', true));
  if v_role is distinct from 'service_role' then
    raise exception 'account_deletion_rate_limit_consume: forbidden';
  end if;

  select * into v_row
  from public.account_deletion_rate_limits
  where user_id = p_user_id
  for update;

  if not found then
    insert into public.account_deletion_rate_limits (
      user_id, window_started_at, attempt_count, updated_at
    ) values (
      p_user_id, v_now, 1, v_now
    );
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'allowed', true,
      'attempt_count', 1,
      'max_attempts', v_max_attempts
    );
  end if;

  if v_row.window_started_at + (v_window_seconds * interval '1 second') <= v_now then
    update public.account_deletion_rate_limits
    set window_started_at = v_now,
        attempt_count = 1,
        updated_at = v_now
    where user_id = p_user_id;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'allowed', true,
      'attempt_count', 1,
      'max_attempts', v_max_attempts
    );
  end if;

  if v_row.attempt_count >= v_max_attempts then
    -- EXTRACT is SQL-keyword syntax (cannot be schema-qualified as pg_catalog.extract).
    v_retry_after := GREATEST(
      1,
      pg_catalog.ceil(
        EXTRACT(
          EPOCH FROM (
            (v_row.window_started_at + (v_window_seconds * interval '1 second')) - v_now
          )
        )
      )::integer
    );
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'allowed', false,
      'attempt_count', v_row.attempt_count,
      'max_attempts', v_max_attempts,
      'retry_after_seconds', v_retry_after
    );
  end if;

  update public.account_deletion_rate_limits
  set attempt_count = v_row.attempt_count + 1,
      updated_at = v_now
  where user_id = p_user_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'allowed', true,
    'attempt_count', v_row.attempt_count + 1,
    'max_attempts', v_max_attempts
  );
end;
$$;

revoke all on function public.account_deletion_rate_limit_consume(uuid, integer, integer) from public;
revoke all on function public.account_deletion_rate_limit_consume(uuid, integer, integer) from anon;
revoke all on function public.account_deletion_rate_limit_consume(uuid, integer, integer) from authenticated;
grant execute on function public.account_deletion_rate_limit_consume(uuid, integer, integer) to service_role;
