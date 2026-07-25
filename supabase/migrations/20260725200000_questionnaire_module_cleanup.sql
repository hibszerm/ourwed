-- Cleanup: contract questionnaire only.
-- Soft-archive non-contract form definitions in public.forms.
-- Coerce contract address questions to type location for AddressField autocomplete.
-- opened_at column retained (shared engine); product UI no longer displays open history.
--
-- Schema notes (verified):
-- - Form definitions table is public.forms (not form_definitions)
-- - public.forms has created_at but no updated_at column
-- - Ownership uses user_id on forms / form_instances / packages / extra_services

do $$
begin
  if to_regclass('public.forms') is null then
    raise exception 'required table public.forms is missing';
  end if;
end $$;

-- Soft-archive obsolete non-contract form definitions (templates / AI leftovers).
update public.forms
set is_active = false
where category is distinct from 'contract'
  and is_active = true;

-- Replace partner1.address text questions with location type in contract schemas.
do $$
declare
  r record;
  q jsonb;
  next_qs jsonb;
begin
  for r in
    select id, schema
    from public.forms
    where category = 'contract'
      and jsonb_typeof(schema->'questions') = 'array'
  loop
    next_qs := '[]'::jsonb;
    for q in select * from jsonb_array_elements(r.schema->'questions')
    loop
      if q->>'fieldKey' in ('partner1.postalCode', 'partner1.city', 'partner2.address')
         or q->>'id' in (
           'q-p1-postal', 'q-p1-city', 'sys_p1_postal', 'sys_p1_city',
           'q-p2-address', 'sys_p2_address'
         )
      then
        continue;
      elsif q->>'fieldKey' = 'partner1.address'
         or q->>'id' in ('q-p1-address', 'sys_p1_address')
      then
        q := q || jsonb_build_object(
          'type', 'location',
          'label', 'Adres do umowy',
          'placeholder', 'Wpisz adres…'
        );
      end if;
      next_qs := next_qs || jsonb_build_array(q);
    end loop;

    update public.forms
    set schema = jsonb_set(r.schema, '{questions}', next_qs)
    where id = r.id;
  end loop;
end $$;
