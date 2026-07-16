-- Scrub legacy mock package option values (p1, p2, …) from form schemas.
-- Public Form Engine injects live Studio Catalog UUIDs at render time.

do $$
declare
  r record;
  q jsonb;
  updated_questions jsonb;
  elem jsonb;
  opts jsonb;
  cleaned_opts jsonb;
  changed boolean;
begin
  for r in
    select id, schema
    from public.forms
    where schema ? 'questions'
  loop
    updated_questions := '[]'::jsonb;
    changed := false;

    for elem in
      select value from jsonb_array_elements(r.schema->'questions')
    loop
      if elem->>'fieldKey' = 'packageId' and elem ? 'options' then
        opts := elem->'options';
        cleaned_opts := (
          select coalesce(jsonb_agg(o), '[]'::jsonb)
          from jsonb_array_elements(opts) o
          where (o->>'value') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        );
        if cleaned_opts is distinct from opts then
          elem := jsonb_set(elem, '{options}', cleaned_opts);
          changed := true;
        end if;
      end if;
      updated_questions := updated_questions || jsonb_build_array(elem);
    end loop;

    if changed then
      update public.forms
      set schema = jsonb_set(r.schema, '{questions}', updated_questions)
      where id = r.id;
    end if;
  end loop;
end $$;
