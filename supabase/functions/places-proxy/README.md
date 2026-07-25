# places-proxy

Server-side proxy for Google Places API (New).

## Operations

Only two operations are accepted:

- `autocomplete` — Places Autocomplete (New)
- `resolve` — Place Details (New)

The client cannot pass an arbitrary Google URL, method, or field mask.

## Secret

```bash
supabase secrets set GOOGLE_MAPS_API_KEY=your-server-key
```

Never put this key in Vite env vars or browser source.

## Deploy

```bash
supabase functions deploy places-proxy
```

## Request shape

```json
{
  "operation": "autocomplete",
  "query": "Kraków Rynek",
  "sessionToken": "uuid-v4",
  "languageCode": "pl",
  "regionCode": "PL",
  "limit": 8
}
```

```json
{
  "operation": "resolve",
  "placeId": "ChIJ...",
  "sessionToken": "same-uuid-v4"
}
```
