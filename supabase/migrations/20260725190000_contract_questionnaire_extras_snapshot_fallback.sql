-- Mirror package snapshot behavior for additional services:
-- only trust a non-empty snapshot array; otherwise fall back to live catalog.
-- Also ensure expires_at = null means "no expiration" (already true in prior RPCs).

create or replace function public.public_get_form_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inst public.form_instances%rowtype;
  form_row public.form_definitions%rowtype;
  packages_json jsonb := '[]'::jsonb;
  extras_json jsonb := '[]'::jsonb;
  snapshot jsonb;
  owner_id uuid;
  result jsonb;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;

  select *
  into inst
  from public.form_instances
  where token = p_token
  limit 1;

  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if inst.status = 'revoked' then
    raise exception 'revoked' using errcode = 'P0001';
  end if;

  -- null expires_at = indefinite (contract questionnaires)
  if inst.expires_at is not null
     and inst.expires_at <= timezone('utc', now())
  then
    raise exception 'expired' using errcode = 'P0001';
  end if;

  select *
  into form_row
  from public.form_definitions
  where id = inst.form_id
  limit 1;

  if not found then
    raise exception 'form_missing' using errcode = 'P0001';
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
