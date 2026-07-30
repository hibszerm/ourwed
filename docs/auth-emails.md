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

## Placeholders (do not alter)

Every action template uses Supabase Go templates:

```html
{{ .ConfirmationURL }}
```

Change-email also includes:

```html
{{ .NewEmail }}
```

Never hardcode verify URLs in production `.html` files.

## Rebuild from shared shell

```bash
npm run emails:auth:build
```

Generator: `scripts/buildAuthEmails.ts`

## Auth callback (PKCE)

Email links must land on the app callback, not the marketing homepage alone:

1. Supabase Dashboard → **Authentication → URL Configuration**
2. **Site URL**: `https://ourwed.pl` (or your app origin)
3. **Redirect URLs** must include:
   - `https://ourwed.pl/auth/callback`
   - `https://ourwed.pl/**`
   - `http://localhost:5173/auth/callback` (local)

App redirects:

| Flow | `redirectTo` / `emailRedirectTo` |
|------|----------------------------------|
| Password reset | `/auth/callback?next=recovery` |
| Confirm signup | `/auth/callback?next=confirm` |

Legacy links that open `/?code=…` are intercepted by `AuthCallbackGate` and forwarded to `/auth/callback` without painting the homepage.

See `src/features/auth/callback/` and `docs/auth-callback.md`.

## Deploy to hosted Supabase (production)

SMTP (Resend) is already configured in the project. Templates are **not** auto-pushed from git.

1. Open [Authentication → Email Templates](https://supabase.com/dashboard/project/xyycwllsovpxlcustpcv/auth/templates).
2. For each template above:
   - Set the **Subject** from the table.
   - Paste the matching `*.html` body (entire file).
3. Send a test email from the dashboard where available.
4. Confirm the CTA opens the same verify URL as the fallback link.

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
