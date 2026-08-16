-- =============================================================================
-- profiles.theme_id — private application theme preference (user-level)
-- =============================================================================

alter table public.profiles
  add column if not exists theme_id text not null default 'classic';

comment on column public.profiles.theme_id is
  'Private CRM UI theme id (classic|graphite|sage_garden|burgundy_estate|mocha_editorial). Not studio public branding.';

alter table public.profiles
  drop constraint if exists profiles_theme_id_check;

alter table public.profiles
  add constraint profiles_theme_id_check
  check (
    theme_id in (
      'classic',
      'graphite',
      'sage_garden',
      'burgundy_estate',
      'mocha_editorial'
    )
  );

-- Existing rows already get classic via column default when added as NOT NULL DEFAULT.
update public.profiles
set theme_id = 'classic'
where theme_id is null
   or theme_id not in (
     'classic',
     'graphite',
     'sage_garden',
     'burgundy_estate',
     'mocha_editorial'
   );
