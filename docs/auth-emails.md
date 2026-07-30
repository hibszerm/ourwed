# Auth email templates (OurWed)

Branded Polish authentication emails for Supabase Auth + Resend SMTP.

**All actionable templates** use TokenHash → OurWed `/auth/callback` (never `{{ .ConfirmationURL }}`). See `docs/auth-callback.md`.

## Templates

| Flow | Dashboard name | Subject | Files | Intent | verifyOtp `type` |
|------|----------------|---------|-------|--------|------------------|
| Password reset | Reset password | `Zmień hasło do konta OurWed` | `recovery.html` / `.txt` | `recovery` | `recovery` |
| Confirm signup | Confirm signup | `Potwierdź adres e-mail` | `confirmation.html` / `.txt` | `signup` | `email` |
| Magic link | Magic link | `Zaloguj się do OurWed` | `magic_link.html` / `.txt` | `magic-link` | `email` |
| Change email | Change email address | `Potwierdź zmianę adresu e-mail` | `email_change.html` / `.txt` | `email-change` | `email_change` |
| Invite | Invite user | `Zaproszenie do OurWed` | `invite.html` / `.txt` | `invite` | `invite` |

Source directory: `supabase/templates/auth/`

Browser previews: `supabase/templates/auth/previews/index.html`

**Reauthentication:** not generated. Supabase default uses `{{ .Token }}` (OTP code), not a clickable link.

**Security notification emails** (password changed, etc.): informational only — no TokenHash migration.

## CTA pattern

```html
https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=<TYPE>&intent=<INTENT>
```

| Template | CTA |
|----------|-----|
| confirmation | `…&type=email&intent=signup` |
| recovery | `…&type=recovery&intent=recovery` |
| magic_link | `…&type=email&intent=magic-link` |
| invite | `…&type=invite&intent=invite` |
| email_change | `…&type=email_change&intent=email-change` |

Visible fallbacks point only at safe pages (`/forgot-password`, `/register`, `/login`) — never print the token_hash URL.

Local testing pattern (not for production HTML):

```text
http://localhost:5173/auth/callback?token_hash={{ .TokenHash }}&type=…&intent=…
```

Change-email also includes `{{ .NewEmail }}`.

## Rebuild

```bash
npm run emails:auth:build
```

Generator: `scripts/buildAuthEmails.ts` — fails if any actionable production template contains `ConfirmationURL` or `localhost`.

## App call sites

| API | In OurWed today | `redirectTo` / `emailRedirectTo` |
|-----|-----------------|----------------------------------|
| `signUp` | yes (`authService.register`) | `/auth/callback?next=confirm` (allow-list; CTA is template-owned) |
| `resetPasswordForEmail` | yes | `/auth/callback?next=recovery` |
| `signInWithOtp` | no | — |
| `inviteUserByEmail` | no (admin/Dashboard) | — |
| `updateUser({ email })` | no | — |
| `resend` | no dedicated UI | — |
| `generateLink` | no | — |

## Manual migration table

| Supabase template | Project file | Intent | verifyOtp type | Success destination | Dashboard action |
|-------------------|--------------|--------|----------------|---------------------|------------------|
| Confirm signup | `confirmation.html` | signup | email | `/dashboard` or `/login` | Replace entire HTML + subject |
| Reset password | `recovery.html` | recovery | recovery | `/reset-password` | Replace entire HTML + subject |
| Magic link | `magic_link.html` | magic-link | email | `/dashboard` | Replace entire HTML + subject |
| Invite user | `invite.html` | invite | invite | `/dashboard` | Replace entire HTML + subject |
| Change email address | `email_change.html` | email-change | email_change | `/login` | Replace entire HTML + subject |
| Reauthentication | — | — | OTP `{{ .Token }}` | — | Leave default / OTP-only |

## Deploy to hosted Supabase

Templates are **not** auto-pushed from git.

1. Deploy the app so `/auth/callback` understands all intents.
2. Open Authentication → Email Templates.
3. For each row above: set Subject, paste the matching `*.html` body (entire file).
4. Confirm CTA href matches the TokenHash pattern (no ConfirmationURL).
5. Confirm Resend click tracking is disabled for auth SMTP.
6. Send only fresh test emails.

Local CLI (optional): merge `supabase/templates/auth/config.snippet.toml` into `supabase/config.toml`.

## Design notes

Shared shell: brand first, single CTA, dark-mode-safe inline styles, max-width 560px, Polish copy.
