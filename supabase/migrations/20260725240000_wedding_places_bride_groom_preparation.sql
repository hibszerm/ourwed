/**
 * Migrate wedding_places: split generic preparation → bride_preparation + groom_preparation.
 *
 * Historical product semantics: the single `preparation` travel stop was bride-primary
 * (questionnaire sync wrote bride prep into role=preparation; groom was scalar-only).
 * Therefore legacy rows are renamed to bride_preparation — never copied to both.
 */

-- Drop existing role check (name varies by how table was created)
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'wedding_places'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%preparation%';
  if cname is not null then
    execute format('alter table public.wedding_places drop constraint %I', cname);
  end if;
end $$;

-- Prefer an existing bride_preparation row over legacy preparation
delete from public.wedding_places wp
where wp.role = 'preparation'
  and exists (
    select 1
    from public.wedding_places x
    where x.wedding_id = wp.wedding_id
      and x.role = 'bride_preparation'
  );

update public.wedding_places
set
  role = 'bride_preparation',
  sort_order = case when sort_order = 10 then 10 else sort_order end,
  updated_at = timezone('utc', now())
where role = 'preparation';

alter table public.wedding_places
  add constraint wedding_places_role_check
  check (
    role in (
      'bride_preparation',
      'groom_preparation',
      'ceremony',
      'reception',
      'hotel',
      'airport',
      'other'
    )
  );

drop index if exists public.wedding_places_wedding_core_role_uidx;

create unique index wedding_places_wedding_core_role_uidx
  on public.wedding_places (wedding_id, role)
  where role in (
    'bride_preparation',
    'groom_preparation',
    'ceremony',
    'reception'
  );

comment on column public.wedding_places.role is
  'Travel/day location role. Core: bride_preparation, groom_preparation, ceremony, reception. Legacy preparation rows are migrated to bride_preparation.';
