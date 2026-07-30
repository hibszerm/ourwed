# Auth callback (PKCE)

OurWed uses Supabase Auth with `flowType: 'pkce'`.

Email links must complete through a **single callback pipeline** — never land on the homepage as the final destination.

## Flow

```
Email link
  → Supabase /auth/v1/verify
  → https://ourwed.pl/auth/callback?code=…&next=…
     (legacy: https://ourwed.pl/?code=… is gated → /auth/callback)
  → exchangeCodeForSession(code)  // exactly once
  → route by next / recovery event
```

| `next` | Destination |
|--------|-------------|
| `recovery` | `/reset-password` |
| `confirm` | `/dashboard` if session, else `/login` |
| `magic` / `invite` | `/dashboard` if session |
| `email_change` | `/login` (message) |
| `auto` (legacy) | infer from `PASSWORD_RECOVERY` / session |

## Key files

| File | Role |
|------|------|
| `src/features/auth/callback/authCallback.ts` | Parse, exchange-once, destinations |
| `src/features/auth/callback/AuthCallbackGate.tsx` | Intercept `?code=` before homepage |
| `src/pages/AuthCallbackPage.tsx` | UI: „Trwa weryfikacja…” / errors |
| `src/lib/supabase.ts` | `detectSessionInUrl: false` |

## Dashboard checklist

Authentication → URL Configuration:

- Site URL = app origin (`https://ourwed.pl`)
- Redirect URLs include `/auth/callback` (and local Vite origin)

Without `/auth/callback` in the allow-list, Supabase falls back to Site URL (`/?code=…`). The gate still recovers that case, but configure the allow-list for clean links.

## Verify

```bash
npm run test:auth-callback
```
