-- Optional UI-only wedding title. Never used by contracts / questionnaires / merge fields.
alter table public.weddings
  add column if not exists display_name text;

comment on column public.weddings.display_name is
  'Presentation-only wedding title for app UI. Not client/legal identity; ignored by contracts and questionnaires.';
