-- Collaboration 1C-C: bounded, read-only operational projections.
-- Membership grants neither direct wedding access nor child-table access.
begin;

create function public.list_my_collaborative_weddings(
  p_after_wedding_date date default null,
  p_after_wedding_id uuid default null,
  p_limit integer default 50
)
returns table (
  wedding_id uuid,
  couple_first_name text,
  couple_second_name text,
  wedding_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1
    from auth.users au
    join public.users u on u.id = au.id
    where au.id = v_actor
      and au.email_confirmed_at is not null
      and au.deleted_at is null
      and not au.is_anonymous
      and (au.banned_until is null or au.banned_until <= pg_catalog.now())
  ) then
    return;
  end if;

  if p_after_wedding_date is not null and p_after_wedding_id is null then
    raise exception using errcode = '22023', message = 'invalid_cursor';
  end if;

  return query
  select w.id, w.bride_name, w.groom_name, w.wedding_date
  from public.wedding_collaboration_memberships m
  join public.weddings w
    on w.id = m.wedding_id
   and w.user_id = m.owner_user_id
  where m.member_user_id = v_actor
    and m.status = 'active'
    and m.wedding_id is not null
    and w.status = 'active'
    and (
      p_after_wedding_id is null
      or (
        p_after_wedding_date is not null
        and (
          w.wedding_date > p_after_wedding_date
          or (w.wedding_date = p_after_wedding_date and w.id > p_after_wedding_id)
          or w.wedding_date is null
        )
      )
      or (
        p_after_wedding_date is null
        and p_after_wedding_id is not null
        and w.wedding_date is null
        and w.id > p_after_wedding_id
      )
    )
  order by w.wedding_date asc nulls last, w.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 50);
end;
$$;

create function public.get_collaborative_wedding_detail(p_wedding_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_first_name text;
  v_second_name text;
  v_wedding_date date;
  v_ceremony_time time without time zone;
  v_places jsonb;
begin
  if v_actor is null or p_wedding_id is null or not exists (
    select 1
    from auth.users au
    join public.users u on u.id = au.id
    where au.id = v_actor
      and au.email_confirmed_at is not null
      and au.deleted_at is null
      and not au.is_anonymous
      and (au.banned_until is null or au.banned_until <= pg_catalog.now())
  ) then
    return null;
  end if;

  select w.bride_name, w.groom_name, w.wedding_date, w.ceremony_time
    into v_first_name, v_second_name, v_wedding_date, v_ceremony_time
  from public.wedding_collaboration_memberships m
  join public.weddings w
    on w.id = m.wedding_id
   and w.user_id = m.owner_user_id
  where m.member_user_id = v_actor
    and m.wedding_id = p_wedding_id
    and m.status = 'active'
    and w.status = 'active';

  if not found then
    return null;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'role', p.role,
        'formatted_address', p.formatted_address,
        'operational_time',
          case
            when ot.operational_time is not null then
              case
                when ot.operational_time ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'
                  then ot.operational_time
                else null
              end
            when p.role = 'ceremony' and v_ceremony_time is not null
              then pg_catalog.to_char(v_ceremony_time, 'HH24:MI')
            else null
          end
      ) order by p.sort_order, p.id
    ),
    '[]'::jsonb
  )
  into v_places
  from public.wedding_places p
  left join public.wedding_operational_times ot
    on ot.wedding_id = p.wedding_id
   and ot.stop_key = p.id::text
  where p.wedding_id = p_wedding_id
    and p.role in ('bride_preparation', 'groom_preparation', 'ceremony', 'reception');

  return pg_catalog.jsonb_build_object(
    'wedding_id', p_wedding_id,
    'couple_first_name', v_first_name,
    'couple_second_name', v_second_name,
    'wedding_date', v_wedding_date,
    'places', v_places
  );
end;
$$;

revoke all on function public.list_my_collaborative_weddings(date, uuid, integer) from public, anon;
revoke all on function public.get_collaborative_wedding_detail(uuid) from public, anon;
grant execute on function public.list_my_collaborative_weddings(date, uuid, integer) to authenticated;
grant execute on function public.get_collaborative_wedding_detail(uuid) to authenticated;

commit;
