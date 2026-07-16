# Travel Planning

## Architecture

```
UI (Travel Settings, Wedding Detail Travel, PlacePicker)
  → travelService / weddingPlaceService / studioTravelSettingsService
    → travelProvider
      → geoapifyService (Geoapify REST: geocode, autocomplete, routing)
    → Postgres: studio_travel_settings, wedding_places, travel_segments
```

Wedding scalars / form answers keep human-readable location text for compatibility.
Operational coordinates live in `studio_travel_settings` and `wedding_places`.

## Configuration

```bash
VITE_GEOAPIFY_API_KEY=your_geoapify_key
```

## Migration

Apply `supabase/migrations/travel_planning.sql`.

## Route cache

Legs are Studio → Preparation → Ceremony → Reception.
`travel_segments.endpoints_hash` avoids recalculating unchanged legs.
