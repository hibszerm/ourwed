-- Document template meta (couple/studio slots + template defaults)
-- + couple/studio registry additions. Additive only.

alter table public.document_templates
  add column if not exists meta jsonb not null default '{}'::jsonb;

comment on column public.document_templates.meta is
  'AI review output: coupleVariables, studioVariables, defaults (template-owned values).';

insert into public.document_variable_registry
  (key, section, label_pl, value_type, data_source, sort_order)
values
  ('bride.pesel', 'bride', 'PESEL Panny Młodej', 'string', 'wedding', 55),
  ('groom.pesel', 'groom', 'PESEL Pana Młodego', 'string', 'wedding', 155),
  ('wedding.schedule', 'wedding', 'Harmonogram', 'string', 'wedding', 240),
  ('studio.owner', 'studio', 'Właściciel', 'string', 'studio', 612),
  ('studio.vat', 'studio', 'VAT', 'string', 'studio', 635),
  ('studio.signature', 'studio', 'Podpis', 'string', 'studio', 695),
  ('additional.notes', 'additional', 'Uwagi', 'string', 'wedding', 730)
on conflict (key) do update
  set label_pl = excluded.label_pl,
      section = excluded.section,
      value_type = excluded.value_type,
      data_source = excluded.data_source,
      sort_order = excluded.sort_order;
