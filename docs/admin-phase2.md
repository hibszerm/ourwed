# Admin Phase 2 — Final Report

Date: 2026-08-06

## 1. Real data inventory
See `docs/admin-phase2-data-inventory.md` (audited from migrations + `schema.sql`).

## 2. Metrics supported now
Accounts (auth.users), active users (`last_sign_in_at` in range), weddings, sessions, registration series, product usage counts (forms, prewedding, documents, payments, calendar), activation cohort sizes, attention items, user list/summary counts, audit log, integration aggregates, on-demand system checks, subscription access/trial metrics (billing foundation).

## 3. Metrics unavailable and why
| Metric | Why |
|--------|-----|
| Brief downloads | No persisted download event |
| Email deliverability history | Table + webhook ready; empty until first Resend event |
| MRR / Stripe payments | Payment provider not connected |
| Uptime % | No monitoring history |
| Chronological funnel conversion | Absolute cohorts only |
| SMTP configured boolean from DB | Not readable from SQL; shown as unknown |

## 4. Admin API architecture
**SECURITY DEFINER RPCs** on Postgres (+ JWT AAL2 gate). Browser uses anon client + user access token.  
Resend: Edge Function `resend-webhook` with service role **only** for inserting privacy-safe rows.

## 5. Authorization enforcement
`assert_admin_owner_aal2()`: session → `aal=aal2` → enabled `admin_members.role=owner`. UI guards are not trusted alone.

## 6. Database functions
`admin_get_overview_metrics`, `admin_get_registration_series`, `admin_get_product_usage`, `admin_get_activation_funnel`, `admin_get_attention_items`, `admin_list_users`, `admin_get_user_summary`, `admin_get_integration_health`, `admin_get_system_health`, `admin_list_audit`, `admin_get_email_metrics`, helpers `admin_mask_email`, `admin_range_bounds`. Billing: `admin_get_subscription_metrics`, `admin_list_subscriptions`, `admin_get_user_subscription`, `admin_extend_trial`, `admin_grant_manual_pro`, `admin_revoke_manual_access`.

## 7–10. Overview / usage / funnel / attention
Implemented on `/overview` with Europe/Warsaw ranges (`today` / `7d` / `30d`, default 30d). Definitions documented in inventory + UI tooltips. Attention only for real conditions (disabled owner, unauthorized audits, calendar errors, old unconfirmed emails).

## 11–13. Users (identity update)

`/users` and `/users/:userId` show **current account identity** for the single platform owner:

| Field | Source |
|-------|--------|
| Email | `auth.users.email` (full; after verified email-change flow) |
| First / last name | `public.profiles.first_name` / `last_name` (priority) |
| Fallback name | `auth.users.raw_user_meta_data` (`first_name` / `last_name` / `name`) |
| Missing name UI | „Nie podano” |

Shared SQL helper: `admin_compose_account_identity` (not granted to clients). List and detail use the same helper.

Registration writes metadata + `handle_new_user` fills `public.profiles`. Customer Account settings (`/ustawienia/konto`) updates `public.profiles.first_name` / `last_name` for `auth.uid()` (and aligns `public.users.name` for legacy display). Admin list/detail RPCs read those profile columns on the next query — no sync job, no duplicated identity table, no admin RPC calls from the customer app.

No couple/client names, contracts, questionnaire answers. No impersonation. Audit on user detail: `admin.user_lookup` with target user ID only (no email/name in metadata).

Corrective migrations: `20260806190000_admin_list_users_cte_scope_fix.sql`, `20260806200000_admin_user_identity_fields.sql`.

## 14–15. Email webhook
`admin_email_events` migration + Edge Function with Svix verify. UI shows setup state until events exist. Env: `RESEND_WEBHOOK_SECRET`.

Product notification deliveries (`notification_deliveries`) are updated by the same webhook when `provider_message_id` matches. See `docs/notification-engine.md`. Customer V1 success state is **sent** (not a separate delivered metric in admin).

## 16–19. Integrations / system / deploy / audit
Real calendar aggregates; Resend from events table; system checks on demand; deployment from mount + optional `VITE_VERCEL_*` (Local when local); audit paginated with allow-listed action labels + one `admin.audit_viewed` event.

## 20. Billing
Access and Trial are live (`/subscriptions`, user list entitlement column, user detail actions).  
Sidebar **Subskrypcje** links to the page. **Płatności online: Niepodłączone** — no MRR/revenue.

## 21–22. Product events / collection start
No `product_events` table added — existing tables suffice. Email metrics collect from first webhook after deploy.

## 23. QR fix
White quiet zone, 240×240 desktop / 220×220 mobile, no transform/scale/blur/border overlay. Manual secret retained.

## 24–25. States / performance
Loading / zero / unavailable / forbidden / error distinguished. Aggregates via SQL counts; indexes on `created_at` / email events documented.

## 26. Migrations
- `20260806140000_admin_phase2_aggregates.sql`
- `20260806180000_admin_phase2_rpc_signature_fix.sql`
- `20260806190000_admin_list_users_cte_scope_fix.sql`
- `20260806200000_admin_user_identity_fields.sql`
- `20260811200000_subscription_foundation.sql`
- `20260811210000_admin_users_subscription_filter.sql`

## 27. Environment variables
| Name | Where |
|------|--------|
| `RESEND_WEBHOOK_SECRET` | Edge Function (server) |
| Existing Supabase URL/anon | Browser |
| Optional `VITE_VERCEL_GIT_COMMIT_SHA` / `REF` | Build-time deploy display |

## 28–31. Tests / TS / ESLint / build
Scripts: `npm run test:admin-phase1`, `npm run test:admin-phase2`. Run results recorded in session after commands.

## 32. Browser QA
Requires owner AAL2 session against DB with migration applied. Not automated here without modifying customer data.

## 33. Remaining limitations
- Migration must be applied to remote before RPCs work.
- Resend webhook must be deployed + secret configured + Resend dashboard pointed at function URL.
- Storage connectivity not deeply probed (no secret exposure).
- User list CTE scans auth.users (acceptable for current scale; revisit if large).
- No destructive user actions in Phase 2.
