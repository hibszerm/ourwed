# Google Calendar + Apple Calendar (Phase 1)

OurWed remains the **source of truth**. Synchronization is outbound only:

- OurWed → Google Calendar (OAuth, managed events)
- OurWed → Apple Calendar (private read-only ICS subscription)

Changes made directly in Google Calendar do **not** update OurWed.

## Eligibility

Synchronize only after a real OurWed Wedding or Session exists:

1. **Contract Questionnaire** — after photographer approval creates/confirms the Wedding via `weddingService.create` (not while the questionnaire is unfinished or pending).
2. **Manual order** — after `Dodaj zlecenie` / Session create persists successfully.

Policy:

- **Archived** Weddings remain in external calendars.
- **Cancelled** Weddings are removed from Google and omitted from Apple.
- **Hard-deleted** entities are removed from Google and disappear from Apple.
- Local save never rolls back if Google is unavailable (outbox + retry).

## Environment variables (server / Edge secrets)

Never put these in `VITE_*`.

| Variable | Purpose |
|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` | OAuth Web client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | OAuth client secret (**exact spelling**; not `GOOGLE_CALENDR_…`) |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Must match Google Cloud authorized redirect |
| `APP_PUBLIC_URL` | Frontend origin for post-OAuth redirect (e.g. `http://localhost:5173`) |

> **Known pitfall:** A mistyped Edge secret `GOOGLE_CALENDR_CLIENT_SECRET` (missing `A` in `CALENDAR`) causes the OAuth **callback** to redirect with `?google=not_configured` after a successful Google consent, because the start endpoint only requires `GOOGLE_CALENDAR_CLIENT_ID`. The Edge Function now accepts the typo as a temporary alias, but you should rename the secret to the correct name.
| `APP_PUBLIC_URL` | Frontend origin for post-OAuth redirect (e.g. `http://localhost:5173`) |
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | Optional 32-byte key (base64url) for encrypting Google tokens at rest |

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` automatically to Edge Functions.

## Google Cloud setup

1. Create or select a Google Cloud project.
2. Enable **Google Calendar API**.
3. Configure the **OAuth consent screen** (External or Internal).
4. Add scopes:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
   - `openid`
   - `email`
5. Create **OAuth 2.0 Client ID** → Application type **Web application**.
6. Authorized JavaScript origins (if prompted):
   - `http://localhost:5173`
   - production app origin
7. Authorized redirect URIs — **exact** values:

### Local (hosted Supabase project)

```
https://<PROJECT_REF>.supabase.co/functions/v1/google-calendar-oauth/callback
```

Example for this repo’s cloud project:

```
https://xyycwllsovpxlcustpcv.supabase.co/functions/v1/google-calendar-oauth/callback
```

### Local Supabase (if using `supabase start`)

```
http://127.0.0.1:54321/functions/v1/google-calendar-oauth/callback
```

### Production

```
https://<PRODUCTION_PROJECT_REF>.supabase.co/functions/v1/google-calendar-oauth/callback
```

8. Set Edge secrets:

```bash
supabase secrets set \
  GOOGLE_CALENDAR_CLIENT_ID=... \
  GOOGLE_CALENDAR_CLIENT_SECRET=... \
  GOOGLE_CALENDAR_REDIRECT_URI=https://<PROJECT_REF>.supabase.co/functions/v1/google-calendar-oauth/callback \
  APP_PUBLIC_URL=http://localhost:5173
```

9. Deploy functions:

```bash
supabase functions deploy google-calendar-oauth
supabase functions deploy google-calendar-sync
supabase functions deploy apple-calendar-feed
```

10. While the OAuth app is in **Testing**, add Google accounts as test users.
11. Production / verification: Google may require app verification for Calendar scopes when publishing to external users.

## Apple ICS

- Endpoint shape:  
  `GET {SUPABASE_URL}/functions/v1/apple-calendar-feed/{privateToken}/ourwed.ics`
- `webcal://` URL is offered in the UI for “Otwórz w Apple Calendar”.
- Token is random, stored as SHA-256 hash only; rotation/disable invalidates the old URL with a generic 404.
- No Apple ID / password / CalDAV.

## UI

**Ustawienia → Integracje** → `/ustawienia/integracje`

## Migrations

`supabase/migrations/20260730160000_calendar_integrations.sql`

Tables: `calendar_integrations`, `calendar_integration_secrets` (service-role only), `external_calendar_events`, `calendar_sync_jobs`, `calendar_oauth_states`.
