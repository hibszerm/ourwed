# Google Maps Platform — OurWed setup

All active location features use Google Maps Platform.

## Two-key model

| Key | Where | APIs | Visibility |
|---|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Supabase Edge secret | Places API (New), Routes API | Server only |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | Vite env | **Maps JavaScript API only** | Browser (referrer-restricted) |

Never put the server Places/Routes secret in `VITE_*`.

A Maps JavaScript browser key is necessarily visible in network requests. Protect it with:

- HTTP referrer / website restrictions
- API restriction: Maps JavaScript API only

Do not put Places or Routes on the browser key.

## Architecture

```
AddressField / LocationSearchField
  → places-proxy → Places API (New)

travelProvider.getRoute
  → routes-proxy → Routes API

TravelMap
  → googleMapsBrowserLoader → Maps JavaScript API (lazy)
  → optional encoded polyline from RouteResult (no browser Directions)

External “Otwórz w mapach”
  → googleMapsLinks (public URLs, no API key)
```

## Deploy

```bash
supabase secrets set GOOGLE_MAPS_API_KEY=YOUR_SERVER_KEY
supabase functions deploy places-proxy
supabase functions deploy routes-proxy
```

Client `.env`:

```bash
VITE_GOOGLE_MAPS_BROWSER_KEY=
# optional:
# VITE_GOOGLE_MAPS_MAP_ID=
```

## Browser key referrers (example)

Development:

- `http://localhost:5173/*`
- `http://127.0.0.1:5173/*`

Production / staging: your real domains only.

## Future per-studio keys

- **Server key** (Places/Routes): Vault / `studio_integrations.secret_reference` — never to browser.
- **Browser map key**: must be referrer-restricted; typically app/domain-level, not casually per studio in the browser.

## Attribution

Places predictions show “Powered by Google”.  
Embedded Maps keep Google copyright/attribution visible — do not cover it.
