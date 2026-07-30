# Auth callback

OurWed uses Supabase Auth with `flowType: 'pkce'` globally (`persistSession`, `autoRefreshToken`, `detectSessionInUrl: false`).

**All actionable auth emails** use a unified TokenHash architecture. They do **not** use `{{ .ConfirmationURL }}` + `exchangeCodeForSession`.

That old path stores a PKCE code verifier in the browser that requested the email, so opening the link on another browser or device fails (`pkce_code_verifier_not_found`). Email security prefetch can also consume one-time ConfirmationURL links.

## Unified flow

```
Email CTA (custom)
  → https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=<EmailOtpType>&intent=<OurWedIntent>
  → intent-specific confirm screen (no verifyOtp on mount)
  → verifyOtp({ token_hash, type })  // exactly once
  → strip sensitive params (replaceState)
  → allow-listed destination
```

## Intent ↔ verifyOtp type ↔ destination

| Intent | Email template | `type` (verifyOtp) | Success destination |
|--------|----------------|--------------------|---------------------|
| `recovery` | Reset password | `recovery` | `/reset-password` |
| `signup` | Confirm signup | `email` | `/dashboard` if session, else `/login` (+ confirmed message) |
| `magic-link` | Magic link | `email` | `/dashboard` if session |
| `invite` | Invite user | `invite` | `/dashboard` if session |
| `email-change` | Change email | `email_change` | `/login` (+ changed message) |

Installed SDK `EmailOtpType` includes `signup` | `invite` | `magiclink` | `recovery` | `email_change` | `email`. Current Supabase docs use `type=email` for token-hash signup and magic-link verification; OurWed follows that for those intents (and still accepts legacy `signup` / `magiclink` query values if present).

`intent` is required when `type=email` (ambiguous otherwise). For `recovery` / `invite` / `email_change`, intent may be inferred from `type` (supports older recovery links without `intent=`).

Arbitrary redirects from the query string are **never** trusted. Destinations come only from `AUTH_TOKEN_HASH_FLOWS`.

## Confirm-click (prefetch protection)

`verifyOtp` is **not** called on page load. The user must click an intent-specific button (e.g. „Potwierdź konto”, „Kontynuuj reset hasła”). Prefetch GETs therefore do not consume the one-time token.

Keep Resend **click tracking disabled** for auth SMTP.

## Legacy PKCE (`?code=`)

Emails already sent with ConfirmationURL may still arrive as `?code=…&next=…`.

```
?code=… → exchangeCodeForSession(code)  // exact-once
       → route by next / PASSWORD_RECOVERY
```

| Priority | Condition | Action |
|----------|-----------|--------|
| 1 | `token_hash` present | validate intent/type → confirm → `verifyOtp` |
| 2 | provider `error` / `?code=` | legacy exchange / error UI |

Remove legacy exchange after the configured email-link TTL has elapsed for all pre-migration messages (typically days; confirm in Dashboard Auth settings).

`AuthCallbackGate` intercepts `?code=`, `?token_hash=`, or `?error=` on non-callback routes so the homepage never paints during processing.

## Key files

| File | Role |
|------|------|
| `src/features/auth/callback/authCallback.ts` | Parse, allow-list, verify/exchange once, destinations |
| `src/features/auth/callback/AuthCallbackGate.tsx` | Intercept before homepage |
| `src/pages/AuthCallbackPage.tsx` | Confirm UI / loading / errors |
| `src/lib/supabase.ts` | PKCE + `detectSessionInUrl: false` |
| `supabase/templates/auth/*.html` | TokenHash CTAs |

## Reauthentication

Supabase reauthentication emails use a **6-digit `{{ .Token }}` OTP**, not a clickable ConfirmationURL. OurWed has no branded `reauthentication.html` and no in-app reauth OTP UI yet. Do not force reauth into the TokenHash click flow.

## Dashboard

Authentication → URL Configuration:

- Site URL = `https://ourwed.pl`
- Redirect URLs include `/auth/callback`

Authentication → Email Templates: paste **every** generated production HTML file (see `docs/auth-emails.md`). Templates are **not** auto-deployed from git.

## Deployment order

1. Ship app with `/auth/callback` TokenHash handling.
2. Paste all five actionable templates in Supabase.
3. Confirm no template uses ConfirmationURL.
4. Confirm Resend click tracking off.
5. Send only **fresh** emails; run acceptance matrix.

## Verify

```bash
npm run test:auth-callback
npm run emails:auth:build && npm run test:auth-emails
```
