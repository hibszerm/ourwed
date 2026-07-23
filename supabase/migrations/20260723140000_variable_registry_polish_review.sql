-- Polish labels + studio variables for AI contract review (app registry mirror).
-- Additive data only — no structural schema change.

update public.document_variable_registry set label_pl = 'Imię Panny Młodej' where key = 'bride.firstName';
update public.document_variable_registry set label_pl = 'Nazwisko Panny Młodej' where key = 'bride.lastName';
update public.document_variable_registry set label_pl = 'Telefon Panny Młodej' where key = 'bride.phone';
update public.document_variable_registry set label_pl = 'E-mail Panny Młodej' where key = 'bride.email';
update public.document_variable_registry set label_pl = 'Adres Panny Młodej' where key = 'bride.address';

update public.document_variable_registry set label_pl = 'Imię Pana Młodego' where key = 'groom.firstName';
update public.document_variable_registry set label_pl = 'Nazwisko Pana Młodego' where key = 'groom.lastName';
update public.document_variable_registry set label_pl = 'Telefon Pana Młodego' where key = 'groom.phone';
update public.document_variable_registry set label_pl = 'E-mail Pana Młodego' where key = 'groom.email';
update public.document_variable_registry set label_pl = 'Adres Pana Młodego' where key = 'groom.address';

update public.document_variable_registry set label_pl = 'Pakiet' where key = 'package.name';
update public.document_variable_registry set label_pl = 'Pozostała płatność' where key = 'package.remaining';
update public.document_variable_registry set label_pl = 'Miejsce przygotowań' where key = 'location.preparation';
update public.document_variable_registry set label_pl = 'Miejsce ceremonii' where key = 'location.ceremony';
update public.document_variable_registry set label_pl = 'Miejsce wesela' where key = 'location.reception';

insert into public.document_variable_registry
  (key, section, label_pl, value_type, data_source, sort_order)
values
  ('studio.photographerName', 'studio', 'Imię fotografa', 'string', 'studio', 615),
  ('studio.address', 'studio', 'Adres firmy', 'string', 'studio', 620),
  ('studio.regon', 'studio', 'REGON', 'string', 'studio', 640),
  ('studio.bankAccount', 'studio', 'Numer konta', 'string', 'studio', 650),
  ('studio.email', 'studio', 'E-mail studia', 'string', 'studio', 660),
  ('studio.phone', 'studio', 'Telefon studia', 'string', 'studio', 670),
  ('studio.website', 'studio', 'Strona WWW', 'string', 'studio', 680),
  ('studio.logo', 'studio', 'Logo', 'string', 'studio', 690),
  ('additional.notes', 'additional', 'Uwagi', 'string', 'wedding', 730)
on conflict (key) do update
  set label_pl = excluded.label_pl,
      section = excluded.section,
      value_type = excluded.value_type,
      data_source = excluded.data_source,
      sort_order = excluded.sort_order;

-- Keep NIP sort order after address
update public.document_variable_registry
  set sort_order = 630, label_pl = 'NIP'
  where key = 'studio.nip';
