/**
 * Ensure travel_segments supports idempotent upsert on (wedding_id, sequence).
 *
 * Production error 42P10: "there is no unique or exclusion constraint matching
 * the ON CONFLICT specification" — app upserts with onConflict: 'wedding_id,sequence'
 * but the unique index was only declared in unversioned travel_planning.sql
 * (Supabase CLI skips non-timestamped migration filenames).
 *
 * This migration:
 * 1. Deduplicates any (wedding_id, sequence) collisions safely
 * 2. Creates the matching unique index used by syncSegments()
 */

-- ---------------------------------------------------------------------------
-- 1. Deduplicate (wedding_id, sequence)
-- Keep the best row: distance+duration present, google provider preferred,
-- then latest updated_at / created_at, then stable id.
-- ---------------------------------------------------------------------------

with ranked as (
  select
    id,
    row_number() over (
      partition by wedding_id, sequence
      order by
        case
          when distance_meters is not null and duration_seconds is not null then 0
          else 1
        end,
        case
          when lower(coalesce(provider, '')) = 'google' then 0
          else 1
        end,
        updated_at desc nulls last,
        created_at desc nulls last,
        id asc
    ) as rn
  from public.travel_segments
)
delete from public.travel_segments ts
using ranked r
where ts.id = r.id
  and r.rn > 1;

-- ---------------------------------------------------------------------------
-- 2. Unique identity matching onConflict: 'wedding_id,sequence'
-- ---------------------------------------------------------------------------

create unique index if not exists travel_segments_wedding_sequence_uidx
  on public.travel_segments (wedding_id, sequence);

comment on index public.travel_segments_wedding_sequence_uidx is
  'Idempotent upsert target for travelService.syncSegments (onConflict wedding_id,sequence).';
