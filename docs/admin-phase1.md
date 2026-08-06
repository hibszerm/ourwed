# OurWed Admin — Phase 1

Single-owner administration foundation for `admin.ourwed.pl`.

This is **not** the full admin platform. Phase 1 covers authentication, MFA (AAL2), and a secure empty shell only.

## Application boundary

| Environment | URL |
|-------------|-----|
| Production | `https://admin.ourwed.pl` |
| Local | `http://localhost:5173/admin` |

The admin UI lives under `src/admin/` and mounts **instead of** the customer app when:

- hostname is `admin.ourwed.pl`, or
- local path is `/admin/*` on localhost.

Customer auth, routes, AppLayout, and landing remain unchanged on `ourwed.pl`.

## Required environment variables

### Browser (Vite) — shared with customer app

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### Server-only (never `VITE_`, never browser)

```
SUPABASE_URL=                 # optional locally if VITE_SUPABASE_URL is set
SUPABASE_SERVICE_ROLE_KEY=    # required for owner creation script
ADMIN_PUBLIC_URL=http://localhost:5173/admin   # optional; printed after create-owner
```

Place secrets in `.env.local`, Vercel project env (admin project or host-scoped), or CI secrets.

**Never** prefix the service role with `VITE_`.
**Never** import `scripts/lib/supabaseAdminClient.ts` from client code.

## Database

Migration: `supabase/migrations/20260805160000_admin_single_owner_foundation.sql`

- `admin_members` — single enabled owner invariant (trigger)
- `admin_audit_log` — append-only via security-definer RPC
- `get_admin_session_status()` — returns `{ isAdmin, enabled, role }` for `auth.uid()` only
- `append_admin_audit_event(...)` — enabled owner only

Apply:

```bash
supabase db push
# or
supabase migration up
```

## Create the owner (one-time)

```bash
SUPABASE_SERVICE_ROLE_KEY=... npm run admin:create-owner
```

The script:

- refuses if an enabled owner already exists,
- refuses to promote an existing Auth user,
- requires password ≥ 16 characters,
- never prints the password,
- rolls back Auth user if membership insert fails.

Then open the printed login URL and complete MFA setup.

## Auth model

Access requires **all** of:

1. authenticated Supabase session
2. row in `admin_members`
3. `enabled = true`
4. `role = 'owner'`
5. MFA assurance `aal2`

Frontend guard: `AdminAuthGuard`  
Database: RPC + RLS  
Do **not** trust `user_metadata.is_admin`.

## Routes

| Path | Purpose |
|------|---------|
| `/login` | Email/password |
| `/mfa/setup` | First TOTP enrollment |
| `/mfa/verify` | Subsequent TOTP challenge |
| `/overview` | Protected shell (AAL2) |
| `/unauthorized` | Non-admin after password |

No `/register`, `/invite`, or `/admins/new`.

## Password reset

Customer password-reset callbacks remain on `https://ourwed.pl/auth/callback`.

Admin password reset is **deferred** to a later phase so we do not create an insecure shared recovery shortcut. Use the recovery procedure below for Phase 1 emergencies.

## MFA backup guidance

Supabase does not issue classic recovery codes. After primary enrollment, add a second TOTP factor in another secure vault (1Password / Authy / Apple Passwords). Document the enrollment of a second factor via Supabase MFA enroll when needed; no public bypass exists.

## Recovery procedure (manual)

| Case | Action |
|------|--------|
| A. Forgotten password | Server: `auth.admin.updateUserById` with new password (service role). Then login + MFA. |
| B. Lost TOTP device | Server: unlist/delete MFA factors for the owner via Auth Admin API, then force re-enrollment at `/mfa/setup`. |
| C. Lost email | Domain/email provider recovery first; Auth email change only via service role with audit. |
| D. Disabled membership | Server update `admin_members.enabled = true` after explicit confirmation. |
| E. Deleted Auth user | Recreate with `admin:create-owner` only if no enabled owner exists; never promote a customer silently. |

Suggested future scripts (not Phase 1): `admin:status`, `admin:reset-mfa`, `admin:disable-owner`.

Any destructive recovery must require service credentials, exact owner email, explicit confirmation, and an audit row where possible.

## Subdomain deployment (recommended: separate Vercel project)

Safer than host rewrites in the customer project:

1. Create Vercel project `ourwed-admin` from the same repo.
2. Build: `npm run build` (same artifact; host detection selects AdminApp).
3. Assign domain `admin.ourwed.pl`.
4. DNS: CNAME `admin` → Vercel.
5. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (no service role).
6. Supabase Auth → Redirect URLs: add `https://admin.ourwed.pl/**` and `http://localhost:5173/admin/**` if using PKCE redirects later.
7. Keep Site URL and customer email templates on `https://ourwed.pl`.
8. CSP: default deny framing; allow only required Supabase origins.
9. CORS: Edge Functions should allow `https://admin.ourwed.pl` only for admin endpoints (future).

Alternative (single Vercel project): add `admin.ourwed.pl` as a domain alias; SPA rewrite already serves `index.html`. Host detection still selects AdminApp. Prefer a separate project for clearer env isolation.

**Do not** change DNS automatically from this repository.

## Customer data

Phase 1 must not query weddings, questionnaires, contracts, contacts, payments, or calendar content. Overview shows only non-sensitive session meta.

## Tests

```bash
npm run test:admin-phase1
```
