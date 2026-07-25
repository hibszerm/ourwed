# Travel Planning

## Architecture

```
UI (Travel Settings, Wedding Detail Travel, PlacePicker, LocationSearchField, TravelMap)
  → travelService / weddingPlaceService / studioTravelSettingsService
    → travelProvider
      → places-proxy (Google Places)
      → routes-proxy (Google Routes)
    → TravelMap → Maps JavaScript API (VITE_GOOGLE_MAPS_BROWSER_KEY)
    → Postgres: studio_travel_settings, wedding_places, travel_segments
```

Wedding scalars / form answers keep human-readable location text for compatibility.
Operational coordinates live in `studio_travel_settings` and `wedding_places`.

## Configuration

```bash
supabase secrets set GOOGLE_MAPS_API_KEY=YOUR_SERVER_KEY
supabase functions deploy places-proxy
supabase functions deploy routes-proxy
```

Client (Maps JavaScript API only):

```bash
VITE_GOOGLE_MAPS_BROWSER_KEY=
```

See `docs/google-places-setup.md` for the two-key model.
## Migration

Apply `supabase/migrations/travel_planning.sql`.

## Route cache

Legs are Studio → Preparation → Ceremony → Reception.
`travel_segments.endpoints_hash` avoids recalculating unchanged legs.
New segments store `provider: 'google'`. Historical `geoapify` provider strings remain readable.
