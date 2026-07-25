-- Fix extras snapshot fallback for public_get_form_by_token.
--
-- IMPORTANT: form definitions live in public.forms (never public.form_definitions).
-- This migration failed on first apply because it referenced the nonexistent
-- form_definitions relation. It was not successfully applied — safe to correct
-- in place (supersedes the broken draft of the same filename).
--
-- Behavior (aligned with 20260725180000 + extras non-empty gate):
-- - Prefer non-empty options_snapshot.packageOptions, else live packages by owner
-- - Prefer non-empty options_snapshot.additionalServiceOptions, else live extras
-- - Owner = coalesce(form_instances.user_id, forms.user_id)
-- - expires_at IS NULL = indefinite
-- - Preserve pending→opened, auto-expire status update, and JSON payload keys

create or replace function public.public_get_form_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inst public.form_instances%rowtype;
  form_row public.forms%rowtype;
  packages_json jsonb := '[]'::jsonb;
  extras_json jsonb := '[]'::jsonb;
  owner_id uuid;
  snapshot jsonb;
  result jsonb;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    return null;
  end if;

  select * into inst
  from public.form_instances
  where token = trim(p_token)
  limit 1;

  if not found then
    return null;
  end if;

  -- Auto-expire when expires_at is set; null = indefinite (contract questionnaires)
  if inst.expires_at is not null
     and inst.expires_at <= timezone('utc', now())
     and inst.status not in ('submitted', 'approved', 'expired') then
    update public.form_instances
    set status = 'expired'
    where id = inst.id
      and status not in ('submitted', 'approved', 'expired')
    returning * into inst;
  end if;

  -- First open
  if inst.status = 'pending' then
    update public.form_instances
    set status = 'opened',
        opened_at = timezone('utc', now())
    where id = inst.id
      and status = 'pending'
    returning * into inst;
  end if;

  select * into form_row
  from public.forms
  where id = inst.form_id;

  if not found then
    return null;
  end if;

  snapshot := inst.options_snapshot;
  owner_id := coalesce(inst.user_id, form_row.user_id);

  if snapshot is not null
     and jsonb_typeof(snapshot->'packageOptions') = 'array'
     and jsonb_array_length(snapshot->'packageOptions') > 0 then
    packages_json := snapshot->'packageOptions';
  elsif owner_id is not null then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', p.id::text,
        'name', p.name,
        'description', p.description,
        'price', p.price,
        'currency', coalesce(p.currency, 'PLN')
      )
      order by p.sort_order, p.created_at
    ), '[]'::jsonb)
    into packages_json
    from public.packages p
    where p.user_id = owner_id
      and p.is_active = true;
  end if;

  -- Match packages: empty [] must not lock out live extras fallback
  if snapshot is not null
     and jsonb_typeof(snapshot->'additionalServiceOptions') = 'array'
     and jsonb_array_length(snapshot->'additionalServiceOptions') > 0 then
    extras_json := snapshot->'additionalServiceOptions';
  elsif owner_id is not null then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', e.id::text,
        'name', e.name,
        'description', e.description,
        'price', e.price,
        'currency', coalesce(e.currency, 'PLN')
      )
      order by e.sort_order, e.created_at
    ), '[]'::jsonb)
    into extras_json
    from public.extra_services e
    where e.user_id = owner_id
      and e.is_active = true;
  end if;

  result := jsonb_build_object(
    'instance', to_jsonb(inst),
    'form', to_jsonb(form_row),
    'packages', packages_json,
    'additionalServices', extras_json,
    'optionsSnapshot', snapshot
  );
  return result;
end;
$$;

revoke all on function public.public_get_form_by_token(text) from public;
grant execute on function public.public_get_form_by_token(text) to anon, authenticated;
