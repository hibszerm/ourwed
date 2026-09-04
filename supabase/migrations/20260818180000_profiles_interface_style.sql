-- =============================================================================
-- profiles.interface_style — private application interface style (user-level)
-- Independent from profiles.theme_id (color theme).
-- =============================================================================

alter table public.profiles
  add column if not exists interface_style text not null default 'classic';

comment on column public.profiles.interface_style is
  'Private CRM interface style (classic|modern). Independent from theme_id. Existing accounts default to classic.';

alter table public.profiles
  drop constraint if exists profiles_interface_style_check;

alter table public.profiles
  add constraint profiles_interface_style_check
  check (
    interface_style in (
      'classic',
      'modern'
    )
  );

update public.profiles
set interface_style = 'classic'
where interface_style is null
   or interface_style not in (
     'classic',
     'modern'
   );
