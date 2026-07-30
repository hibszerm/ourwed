# Auth email templates (OurWed)

Branded Polish authentication emails for Supabase Auth + Resend SMTP.

**Do not change auth logic, tokens, users, or redirect URLs.** Templates only replace default Supabase copy/HTML.

## Templates

| Flow | Dashboard name | Subject | Files |
|------|----------------|---------|-------|
| Password reset | Reset password | `Zmień hasło do konta OurWed` | `recovery.html` / `.txt` |
| Confirm signup | Confirm signup | `Potwierdź adres e-mail` | `confirmation.html` / `.txt` |
| Magic link | Magic link | `Zaloguj się do OurWed` | `magic_link.html` / `.txt` |
| Change email | Change email address | `Potwierdź zmianę adresu e-mail` | `email_change.html` / `.txt` |
| Invite | Invite user | `Zaproszenie do OurWed` | `invite.html` / `.txt` |

Source directory: `supabase/templates/auth/`

Browser previews (sample URLs substituted): `supabase/templates/auth/previews/index.html`

## Placeholders

**Recovery (password reset)** uses TokenHash (cross-device; see `docs/auth-callback.md`):

```html
https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=recovery
```

Do **not** use `{{ .ConfirmationURL }}` for the recovery CTA. Visible fallback in the body is `https://ourwed.pl/forgot-password` (never print the token_hash URL).

**Other flows** keep:

```html
{{ .ConfirmationURL }}
```

Change-email also includes:

```html
{{ .NewEmail }}
```

Never hardcode live verify tokens in production `.html` files (TokenHash Go placeholder is required for recovery).

## Rebuild from shared shell

```bash
npm run emails:auth:build
```

Generator: `scripts/buildAuthEmails.ts`

## Auth callback

Password recovery emails use the TokenHash CTA above. Other flows may still use ConfirmationURL → PKCE `?code=`.

1. Supabase Dashboard → **Authentication → URL Configuration**
2. **Site URL**: `https://ourwed.pl`
3. **Redirect URLs** must include:
   - `https://ourwed.pl/auth/callback`
   - `https://ourwed.pl/**`
   - `http://localhost:5173/auth/callback` (local)

App `redirectTo` for `resetPasswordForEmail` remains `/auth/callback?next=recovery` (legacy / SiteURL); the **email CTA** is what users click and must be the TokenHash URL.

Confirm Resend **click tracking is disabled** for auth SMTP so CTA hrefs are not rewritten.

See `docs/auth-callback.md`.

## Deploy to hosted Supabase (production)

SMTP (Resend) is already configured in the project. Templates are **not** auto-pushed from git.

1. Open [Authentication → Email Templates](https://supabase.com/dashboard/project/xyycwllsovpxlcustpcv/auth/templates).
2. For each template above:
   - Set the **Subject** from the table.
   - Paste the matching `*.html` body (entire file).
3. Send a test email from the dashboard where available.
4. For recovery: confirm the button href is the TokenHash callback URL (not ConfirmationURL). Visible fallback should be forgot-password.

Local CLI (optional): merge `supabase/templates/auth/config.snippet.toml` into a full `supabase/config.toml`, then `supabase stop && supabase start`.

## Design notes

- Max width ~560px, white card, soft gray border, large heading typography
- Black primary CTA (Classic OurWed accent)
- Fallback raw URL under the button
- Shared footer: OurWed / CRM copy / https://ourwed.pl
- Dark-mode friendly `@media (prefers-color-scheme: dark)` for Apple Mail
- Mobile padding adjustments under 620px

## Verification

```bash
npm run test:auth-emails
npm run build
```

Open `supabase/templates/auth/previews/index.html` in a browser; check desktop (~1280) and mobile (~390).
