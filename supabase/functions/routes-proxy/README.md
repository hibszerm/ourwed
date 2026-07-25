# routes-proxy

Server-side proxy for Google Routes API (`computeRoutes`).

## Operation

Only `computeRoute` is accepted.

## Secret

```bash
supabase secrets set GOOGLE_MAPS_API_KEY=your-server-key
supabase functions deploy routes-proxy
```

Same secret as `places-proxy`. Restrict the key to Places API (New) + Routes API.
