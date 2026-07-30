# Auth callback

OurWed uses Supabase Auth with `flowType: 'pkce'` globally (`persistSession`, `autoRefreshToken`, `detectSessionInUrl: false`).

Password **recovery** does **not** rely on PKCE `?code=` + `exchangeCodeForSession`. That path stores a code verifier in the browser that requested the reset, so opening the email on another browser or device fails with `pkce_code_verifier_not_found` / `AuthPKCECodeVerifierMissingError`.

## Password recovery (TokenHash + verifyOtp)

```
Email CTA (custom)
  → https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=recovery
  → confirm-click landing („Kontynuuj reset hasła”)
  → verifyOtp({ token_hash, type: 'recovery' })  // exactly once
  → armPasswordRecovery + strip sensitive params (replaceState)
  → /reset-password (navigate replace)
  → updateUser({ password }) → /login
```

Supabase Reset Password template CTA must use:

```html
<a href="https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=recovery">
  Zmień hasło
</a>
```

Do **not** use `{{ .ConfirmationURL }}` for recovery. Keep branded Polish HTML; only change the CTA (and do not print the token_hash URL as visible fallback text — use `https://ourwed.pl/forgot-password`).

Local template testing equivalent (not for production template):

```text
http://localhost:5173/auth/callback?token_hash={{ .TokenHash }}&type=recovery
```

## Prefetch / email security

Official Supabase guidance: email security scanners may prefetch links and consume one-time tokens.

Decision for OurWed:

1. Recovery link lands on `/auth/callback` with `token_hash` in the query.
2. **`verifyOtp` is not called on mount** — the user must click „Kontynuuj reset hasła”.
3. Prefetch GETs therefore do not consume the token.
4. Auth emails via Resend should keep **click tracking disabled** (open/click wrappers must not rewrite auth CTAs). Confirm in the Resend dashboard for the OurWed domain/API key used by Supabase SMTP.

## Legacy PKCE callback (still supported)

Older emails and non-recovery flows may still arrive as:

```
?code=…&next=recovery|confirm|…
  → exchangeCodeForSession(code)  // exactly once
  → route by next / PASSWORD_RECOVERY
```

| Priority | Condition | Action |
|----------|-----------|--------|
| 1 | `token_hash` + `type=recovery` | confirm → `verifyOtp` → `/reset-password` |
| 2 | `token_hash` + other/missing type | friendly error |
| 3 | `type=recovery` without `token_hash` | friendly error |
| 4 | `?code=` / provider `error` | legacy exchange / error UI |

`AuthCallbackGate` still intercepts `?code=`, `?token_hash=`, or `?error=` on non-callback routes so the homepage never paints during processing.

## Other email flows

Signup confirm / magic / invite may keep `{{ .ConfirmationURL }}` + PKCE `?code=` (same browser is acceptable for those). Global PKCE is unchanged.

| `next` | Destination |
|--------|-------------|
| `recovery` | `/reset-password` |
| `confirm` | `/dashboard` if session, else `/login` |
| `magic` / `invite` | `/dashboard` if session |
| `email_change` | `/login` (message) |
| `auto` (legacy) | infer from recovery / session |

## Key files

| File | Role |
|------|------|
| `src/features/auth/callback/authCallback.ts` | Parse, verifyOtp / exchange-once, destinations |
| `src/features/auth/callback/AuthCallbackGate.tsx` | Intercept before homepage |
| `src/pages/AuthCallbackPage.tsx` | Confirm landing / loading / errors |
| `src/lib/supabase.ts` | PKCE + `detectSessionInUrl: false` |
| `supabase/templates/auth/recovery.html` | TokenHash CTA source |

## Dashboard checklist

Authentication → URL Configuration:

- Site URL = `https://ourwed.pl`
- Redirect URLs include `/auth/callback` (and local Vite origin)

Authentication → Email Templates → **Reset password**:

- Paste generated `supabase/templates/auth/recovery.html` (TokenHash CTA). Templates are **not** auto-deployed from git.

## Production verification

After deploy + template paste:

1. Same browser: request reset → open email → confirm → set password → login.
2. Cross-browser: request in Chrome → open in Safari → set password.
3. Cross-device: desktop request → mobile email → set password.
4. Reused link → „Link wygasł lub został już użyty.” + „Wyślij nowy link”.

## Verify

```bash
npm run test:auth-callback
npm run emails:auth:build && npm run test:auth-emails
```
