-- =============================================================================
-- profiles.appearance — private application appearance (user-level)
-- Independent from profiles.theme_id and profiles.interface_style.
-- Exactly light | dark — no system/auto mode.
-- =============================================================================

alter table public.profiles
  add column if not exists appearance text not null default 'light';

comment on column public.profiles.appearance is
  'Private CRM appearance (light|dark). Independent from theme_id and interface_style. Existing accounts default to light.';

alter table public.profiles
  drop constraint if exists profiles_appearance_check;

alter table public.profiles
  add constraint profiles_appearance_check
  check (
    appearance in (
      'light',
      'dark'
    )
  );

update public.profiles
set appearance = 'light'
where appearance is null
   or appearance not in (
     'light',
     'dark'
   );
