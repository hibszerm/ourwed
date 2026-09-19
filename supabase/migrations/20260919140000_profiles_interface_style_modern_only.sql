-- =============================================================================
-- M2.3 — Modern-only interface_style persistence
-- Runtime already forces Modern (M2.1). This aligns stored defaults/values.
-- Column retained for compatibility; Classic presentation source remains until M2.4.
-- ThemeId classic / appearance are untouched.
-- =============================================================================

-- Existing Classic preferences → Modern (idempotent).
update public.profiles
set interface_style = 'modern'
where interface_style is distinct from 'modern';

-- Future inserts default to Modern.
alter table public.profiles
  alter column interface_style set default 'modern';

comment on column public.profiles.interface_style is
  'Private CRM interface style. Product presentation is Modern-only (M2.3). Column retained for compatibility; value should be modern. Independent from theme_id.';

-- Keep check allowing classic|modern so emergency rollback of FORCE flag remains possible
-- without a second schema migration. Application writes coerce to modern.
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
