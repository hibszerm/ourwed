-- Clear stale packageId references in contract form answers.
-- Does not touch weddings.package_id or commercial snapshots.
-- Preserves the FK on weddings.package_id (no constraint changes).

do $$
declare
  stale_field_count integer := 0;
  stale_selected_count integer := 0;
begin
  select count(*)::integer
  into stale_field_count
  from public.form_answers fa
  where (fa.answer_json #>> '{fields,packageId}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not exists (
      select 1
      from public.packages p
      where p.id::text = fa.answer_json #>> '{fields,packageId}'
    );

  raise notice 'wedding_package_id_fk_safety: stale fields.packageId rows=%', stale_field_count;

  if stale_field_count > 0 then
    update public.form_answers fa
    set answer_json = jsonb_set(fa.answer_json, '{fields,packageId}', '""'::jsonb, true)
    where (fa.answer_json #>> '{fields,packageId}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not exists (
        select 1
        from public.packages p
        where p.id::text = fa.answer_json #>> '{fields,packageId}'
      );
  end if;

  select count(*)::integer
  into stale_selected_count
  from public.form_answers fa
  where jsonb_typeof(fa.answer_json #> '{fields,selectedPackageIds}') = 'array'
    and exists (
      select 1
      from jsonb_array_elements_text(fa.answer_json #> '{fields,selectedPackageIds}') sid(id)
      where sid.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and not exists (select 1 from public.packages p where p.id::text = sid.id)
    );

  raise notice 'wedding_package_id_fk_safety: answers with stale selectedPackageIds=%', stale_selected_count;

  if stale_selected_count > 0 then
    update public.form_answers fa
    set answer_json = jsonb_set(
      fa.answer_json,
      '{fields,selectedPackageIds}',
      coalesce(
        (
          select jsonb_agg(to_jsonb(sid.id))
          from jsonb_array_elements_text(fa.answer_json #> '{fields,selectedPackageIds}') sid(id)
          where sid.id = ''
             or exists (select 1 from public.packages p where p.id::text = sid.id)
        ),
        '[]'::jsonb
      ),
      true
    )
    where jsonb_typeof(fa.answer_json #> '{fields,selectedPackageIds}') = 'array'
      and exists (
        select 1
        from jsonb_array_elements_text(fa.answer_json #> '{fields,selectedPackageIds}') sid(id)
        where sid.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and not exists (select 1 from public.packages p where p.id::text = sid.id)
      );
  end if;
end $$;
