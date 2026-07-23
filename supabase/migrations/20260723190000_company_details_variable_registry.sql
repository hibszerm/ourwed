-- Keep document_variable_registry in sync with Company Details fields.
insert into public.document_variable_registry
  (key, section, label_pl, value_type, data_source, sort_order)
values
  ('studio.iban', 'studio', 'IBAN', 'string', 'studio', 652),
  ('studio.swift', 'studio', 'SWIFT', 'string', 'studio', 654),
  ('studio.instagram', 'studio', 'Instagram', 'string', 'studio', 682),
  ('studio.facebook', 'studio', 'Facebook', 'string', 'studio', 684),
  ('studio.stamp', 'studio', 'Pieczęć', 'string', 'studio', 698)
on conflict (key) do update
set
  section = excluded.section,
  label_pl = excluded.label_pl,
  value_type = excluded.value_type,
  data_source = excluded.data_source,
  sort_order = excluded.sort_order;

update public.document_variable_registry
set label_pl = 'Nazwa firmy'
where key = 'studio.name';

update public.document_variable_registry
set label_pl = 'Imię i nazwisko reprezentanta'
where key = 'studio.photographerName';

update public.document_variable_registry
set label_pl = 'VAT ID'
where key = 'studio.vat';

update public.document_variable_registry
set label_pl = 'E-mail firmy'
where key = 'studio.email';

update public.document_variable_registry
set label_pl = 'Telefon firmy'
where key = 'studio.phone';
