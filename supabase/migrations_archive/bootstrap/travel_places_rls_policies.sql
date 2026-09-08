-- Missing RLS policies for travel tables.
--
-- Live DB has public.wedding_places and public.travel_segments with RLS enabled,
-- but no rows in pg_policies for those tables. INSERT then fails with 42501.
--
-- Policies were already defined in travel_planning.sql but were never applied
-- (tables + ENABLE ROW LEVEL SECURITY landed; CREATE POLICY did not).
-- This migration is idempotent and brings policies in line with schema.sql /
-- the other dev_allow_all_* policies.

drop policy if exists "dev_allow_all_wedding_places" on public.wedding_places;
create policy "dev_allow_all_wedding_places"
  on public.wedding_places for all
  to public
  using (true)
  with check (true);

drop policy if exists "dev_allow_all_travel_segments" on public.travel_segments;
create policy "dev_allow_all_travel_segments"
  on public.travel_segments for all
  to public
  using (true)
  with check (true);
