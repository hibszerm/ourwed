-- =============================================================================
-- Founder brand purge (idempotent)
-- Renames legacy theme/source_key identifiers and neutralizes founder-branded
-- questionnaire template / snapshot copy for pre-launch environments.
-- Does not delete weddings, answers, packages, or unrelated business rows.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Theme id: gentlemen → graphite
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_theme_id_check;

update public.profiles
set theme_id = 'graphite'
where theme_id = 'gentlemen';

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

comment on column public.profiles.theme_id is
  'Private CRM UI theme id (classic|graphite|sage_garden|burgundy_estate|mocha_editorial). Not studio public branding.';

-- ---------------------------------------------------------------------------
-- 2) Built-in questionnaire source_key rename
-- Prefer keeping already-neutral keys; drop legacy duplicates, then rename.
-- ---------------------------------------------------------------------------
delete from public.questionnaire_templates t
where t.source_key = 'pre_wedding_gentlemen_v1'
  and exists (
    select 1
    from public.questionnaire_templates x
    where x.owner_id = t.owner_id
      and x.source_key = 'pre_wedding_default_v1'
  );

delete from public.questionnaire_templates t
where t.source_key = 'pre_wedding_gentlemen_v2'
  and exists (
    select 1
    from public.questionnaire_templates x
    where x.owner_id = t.owner_id
      and x.source_key = 'pre_wedding_default_v2'
  );

update public.questionnaire_templates
set source_key = 'pre_wedding_default_v1'
where source_key = 'pre_wedding_gentlemen_v1';

update public.questionnaire_templates
set source_key = 'pre_wedding_default_v2'
where source_key = 'pre_wedding_gentlemen_v2';

-- ---------------------------------------------------------------------------
-- 3) Neutralize branded template chrome (title / introduction)
-- ---------------------------------------------------------------------------
update public.questionnaire_templates
set title = 'Ankieta przedślubna'
where title ilike '%Gentlemen%';

update public.questionnaire_templates
set introduction =
  'Cześć! Wasze odpowiedzi pomogą nam lepiej przygotować się do dnia ślubu.'
  || E'\n'
  || 'Potrzebujemy od Was kilku informacji, które pozwolą nam lepiej zaplanować cały dzień.'
where introduction ilike '%Gentlemen%'
   or introduction ilike '%gentlemenproductions%';

update public.wedding_questionnaires
set title = 'Ankieta przedślubna'
where title ilike '%Gentlemen%';

update public.wedding_questionnaires
set introduction =
  'Cześć! Wasze odpowiedzi pomogą nam lepiej przygotować się do dnia ślubu.'
  || E'\n'
  || 'Potrzebujemy od Was kilku informacji, które pozwolą nam lepiej zaplanować cały dzień.'
where introduction ilike '%Gentlemen%'
   or introduction ilike '%gentlemenproductions%';

-- ---------------------------------------------------------------------------
-- 4) Neutralize founder contact label inside schema JSON (templates + snapshots)
-- ---------------------------------------------------------------------------
update public.questionnaire_templates
set schema_json = replace(
  replace(
    schema_json::text,
    'Jeśli macie harmonogram Wesela podeślijcie go proszę na maila: kontakt.gentlemenproductions@gmail.com lub na IG',
    'Jeśli macie harmonogram wesela, podeślijcie go proszę fotografowi albo napiszcie poniżej, gdzie można go znaleźć.'
  ),
  'Gentlemen Productions',
  'studia'
)::jsonb
where schema_json::text ilike '%gentlemen%';

update public.wedding_questionnaires
set schema_snapshot_json = replace(
  replace(
    schema_snapshot_json::text,
    'Jeśli macie harmonogram Wesela podeślijcie go proszę na maila: kontakt.gentlemenproductions@gmail.com lub na IG',
    'Jeśli macie harmonogram wesela, podeślijcie go proszę fotografowi albo napiszcie poniżej, gdzie można go znaleźć.'
  ),
  'Gentlemen Productions',
  'studia'
)::jsonb
where schema_snapshot_json::text ilike '%gentlemen%';

-- Residual email / brand fragments (any remaining casing)
update public.questionnaire_templates
set schema_json = replace(
  replace(
    schema_json::text,
    'kontakt.gentlemenproductions@gmail.com',
    'fotografowi'
  ),
  'Gentlemen Productions',
  'studia'
)::jsonb
where schema_json::text ilike '%gentlemen%';

update public.wedding_questionnaires
set schema_snapshot_json = replace(
  replace(
    schema_snapshot_json::text,
    'kontakt.gentlemenproductions@gmail.com',
    'fotografowi'
  ),
  'Gentlemen Productions',
  'studia'
)::jsonb
where schema_snapshot_json::text ilike '%gentlemen%';

-- ---------------------------------------------------------------------------
-- 5) Studio/company settings — clear founder-branded identity fields only
-- ---------------------------------------------------------------------------
update public.studio_details
set company_name = null
where company_name ilike '%Gentlemen%';

update public.studio_details
set owner_name = null
where owner_name ilike '%Hibszer%';

update public.studio_details
set email = null
where email ilike '%gentlemenproductions%';

update public.studio_details
set phone = null
where phone like '%668%698%'
   or phone like '%697%172%437%';

update public.studio_details
set address = null
where address ilike '%Słowackiego 6/17%'
   or address ilike '%41-800 Zabrze%';

update public.studio_details
set nip = null
where nip in ('6482810484', '648-281-04-84', '648 281 04 84');

-- ---------------------------------------------------------------------------
-- 6) Profile display names containing founder identity
-- ---------------------------------------------------------------------------
update public.profiles
set first_name = '',
    last_name = ''
where last_name ilike '%Hibszer%'
   or (
     first_name ilike 'Marcin'
     and last_name ilike '%Hib%'
   );
