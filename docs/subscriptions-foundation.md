# Subscription foundation — Phase 1

Date: 2026-08-11  
Status: entitlement + trial + admin control (no payment provider)

## Audit summary

| Area | Finding |
|------|---------|
| Ownership | 1:1 `auth.users.id` = `public.users.id` = `public.profiles.id` |
| Studio | Conceptual only — CRM rows keyed by `user_id`; no `studios` / orgs / workspaces table |
| Signup | `auth.signUp` → trigger `handle_new_user()` creates profile + users + catalog seeds |
| Billing tables | None before this phase |
| Access gates | Session + confirmed email only |
| Pricing | `src/features/landing-v3/data/pricingData.ts` (marketing demo; now aligned to canonical plan config) |
| Admin | Phase 2 RPCs + AAL2; subscriptions nav was disabled |

## Billable-owner model

**Current:** `public.billing_accounts` — one row per commercial account.

- `owner_user_id` → `public.users(id)` (unique) — today’s sole member
- Future Studio path: add `billing_account_members(user_id, billing_account_id, role)` without moving subscription rows

**Migration path to multi-member Studio:**

1. Keep `billing_accounts` as commercial root  
2. Introduce membership table  
3. Entitlement resolution stays on `billing_account_id`  
4. Auth users gain access via membership, not via personal subscription rows  

## Source of truth

| Concern | Source |
|---------|--------|
| Offer / prices | `src/lib/billing/planCatalog.ts` (+ SQL constants mirror for display RPCs) |
| What customer owns | `public.account_subscriptions` |
| Effective access | `public.resolve_account_entitlement(billing_account_id, now)` |
| Admin mutations | SECURITY DEFINER RPCs + `admin_audit_log` |
| Provider payment truth | Future adapter only (`provider_*` columns nullable) |

Frontend never mutates access to `active` / paid. Checkout is unavailable until a provider adapter is connected.

## Entitlement precedence

1. Valid admin manual override (`manual_access_indefinite` OR `manual_access_until > now`)  
2. Active paid subscription (`status = 'active'` and period not ended)  
3. Active trial (`status = 'trialing'` and `trial_ends_at > now`)  
4. Otherwise expired / no access  

Manual override does **not** rewrite provider IDs or provider status.

## Trial lifecycle

- Starts exactly once per billing account  
- `trial_started_at` / `trial_ends_at` = start + 30 days (timestamptz)  
- Initialized on `public.users` insert (trigger) and idempotent backfill  
- Existing eligible accounts: **fresh 30-day trial from migration deploy time** (documented policy)  
- Never restarts on logout, email change, profile edit, or device change  

## Days remaining display

Helper: `getTrialTimeRemaining(endsAt, now)`  

| Remaining | Label |
|-----------|-------|
| > 1 full day | „Jeszcze N dni” |
| 1 full day | „Jeszcze 1 dzień” |
| < 24h and not ended | „Kończy się dzisiaj” |
| ended | „Trial zakończony” |

## Feature-access matrix (after expiry)

Full inventory: `docs/pro-access-matrix.md`.

| Allowed | Blocked (PRO) |
|---------|----------------|
| Sign in | Create / update / delete product data |
| Settings account + Subskrypcja | Send questionnaire / generate contract |
| View existing weddings/sessions/docs | Calendar create / package mutations |
| Export/download if already supported | Integrations connect/disconnect |

UI gate: `ProAccessGateProvider` + `requirePro` / `ProGateAction` / `UpgradeRequiredDialog`  
Server: `account_has_pro_access()` + `assert_account_can_mutate_pro_data()` on write RLS  

Expired login shows upgrade dialog **once per auth session**; then a calm read-only banner (session-hideable).  
Entitlement refreshes on focus + every 60s so admin grant/extend unlocks without logout.

Banner copy: „Tryb tylko do odczytu” + plans CTA + „Ukryj”.  
Upgrade dialog includes automatic unlock reassurance after PRO activation.

Public couple forms already issued remain functional.

Signed contract upload/replace is PRO_REQUIRED; viewing existing documents remains allowed.

Questionnaire link generation / token rotation is PRO_REQUIRED (including `generate_prewedding_token` server assert).

## Provider boundary

```ts
BillingProviderAdapter {
  createCheckout()
  createPortal()
  cancelSubscription()
  resumeSubscription()
  mapWebhookEvent()
}
```

Current implementation: `UnavailableBillingProvider` — CTAs show „Płatności online będą dostępne wkrótce.”

## Admin operations

| Action | RPC |
|--------|-----|
| Extend trial +7/+14/+30/custom | `admin_extend_trial` |
| Grant PRO until date / indefinite | `admin_grant_manual_pro` |
| Revoke manual | `admin_revoke_manual_access` |

All require `assert_admin_owner_aal2()`. Audit actions:

- `subscription.trial_extended`
- `subscription.manual_access_granted`
- `subscription.manual_access_revoked`

Metadata: target account/user id, old/new category, old/new end, optional reason. No email/name/secrets.

## Customer query

`get_my_subscription_summary()` — no arguments; resolves `auth.uid()` → billing account → entitlement. No admin metadata.

## RLS

- Customer: `SELECT` own `billing_accounts` / `account_subscriptions` via owner_user_id = auth.uid()  
- No customer `UPDATE`/`INSERT`/`DELETE` on subscription state  
- Mutations only via SECURITY DEFINER RPCs  
- `ensure_*` / `resolve_*` / `initialize_trial_*` are **not** granted to `authenticated` (only internal + customer/admin entrypoints)

## Migrations

- `20260811200000_subscription_foundation.sql`
- `20260811210000_admin_users_subscription_filter.sql`
- `20260811220000_subscription_rpc_grants_harden.sql`

## UI routes

| Surface | Path |
|---------|------|
| Customer subscription | `/ustawienia/subskrypcja` |
| Admin subscriptions | `/subscriptions` (OurWed Platform) |

## Account deletion

`billing_accounts.owner_user_id` → `public.users(id) ON DELETE CASCADE`  
`account_subscriptions.billing_account_id` → CASCADE  

Orphan provider IDs are deleted with the account (provider cleanup is a future adapter concern).

## Remaining limitations (Phase 1)

- No payment provider / checkout / webhooks / invoices  
- Frontend PRO gates on create wedding/session (UX); not every mutation has DB-level entitlement yet  
- Trial reminder dedupe is client-side (localStorage) in addition to in-app notifications  
- Billing is not “complete” until a provider adapter is connected  
