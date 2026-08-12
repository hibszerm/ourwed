# Notification Engine V1

Event-driven in-app + transactional email (Resend) for OurWed studio accounts.

## Audit summary (repo facts)

| Area | Actual path / behavior |
|------|------------------------|
| In-app table | `public.notifications` (`supabase/schema.sql`, RLS by `user_id`) |
| In-app API | `src/lib/api/notificationService.ts` |
| Dashboard list | `src/features/dashboard/components/NotificationsCard.tsx` on `DashboardPage` |
| Sidebar unread badge | Dashboard nav badge via `notificationService.unreadCount()` in `Sidebar.tsx` |
| Settings hub | `src/pages/SettingsPage.tsx` → `/ustawienia/powiadomienia` |
| Preferences UI | `src/pages/NotificationSettingsPage.tsx` |
| Catalog | `src/lib/notifications/catalog.ts` |
| Contract public submit | RPC `public_submit_form_by_token` → `notify_contract_questionnaire_completed` |
| Pre-wedding public submit | RPC `public_submit_prewedding_questionnaire` → `notify_prewedding_questionnaire_completed` |
| Resend webhook (telemetry) | `supabase/functions/resend-webhook` → `admin_email_events` + delivery status map |
| Email send | `supabase/functions/notification-email-dispatcher` only (never browser / never `VITE_RESEND_*`) |
| Auth email templates | separate (`docs/auth-emails.md`); SMTP click tracking stays off |

## Lifecycle

```
questionnaire finalized (RPC)
  → enqueue_notification_event (same transaction; failures do not roll back submit)
    → notification_events (UNIQUE event_key)
    → notifications (in-app, always for V1 questionnaire events)
    → notification_deliveries in_app = sent
    → notification_deliveries email = pending | skipped(preference_disabled)
  → request_notification_email_dispatch (pg_net if configured)
  → notification-email-dispatcher
    → re-check email preference
    → resolve auth.users email
    → Resend + Idempotency-Key
    → status sent | failed | skipped
  → resend-webhook may refine failed/bounced by provider_message_id
```

Submit success is independent of Resend. Duplicate `event_key` is idempotent success.

## Event catalog (V1)

| `event_type` | In-app | Email default | User-configurable |
|--------------|--------|---------------|-------------------|
| `questionnaire.contract.completed` | always ON | ON | email only |
| `questionnaire.prewedding.completed` | always ON | ON | email only |

Future types (not implemented): `contract.signed`, `payment.received`, `wedding.7_days`, `wedding.tomorrow`, `task.due`, `trial.3_days`, `brief.ready`.

## Exactly-once keys

| Event | `event_key` | Revision semantics |
|-------|-------------|-------------------|
| Contract | `questionnaire.contract.completed:<form_instance_id>` | One notification per instance. Instance is single-submit (`ALREADY_SUBMITTED` on retry). |
| Pre-wedding | `questionnaire.prewedding.completed:<questionnaire_id>:<submitted_at stamp>` | Legitimate resubmit/update creates a new key → new notification once. |

Delivery uniqueness: `(event_id, channel, recipient_user_id)`.

## Resend idempotency

Deterministic key stored on delivery:

`ourwed/<event_id>/<recipient_user_id>/email` (≤256 chars)

Retries reuse the same key. Dispatcher never accepts arbitrary recipient/body from clients — only `{ deliveryId }`, authorized by service role or `NOTIFICATION_DISPATCH_SECRET`.

## Preferences

Table: `notification_preferences` (`user_id`, `event_type`, `channel`, `enabled`).

- Missing row → catalog default (email ON for V1 questionnaire events).
- Preference OFF at enqueue → email delivery `skipped` / `preference_disabled` (not a failure).
- Preference re-checked at send time.
- In-app is not user-toggleable for these critical events (V1).

## Privacy

`payload_safe` / delivery rows must not store: answers, phones, addresses, tokens, contract text, full form JSON.

Email templates: `supabase/functions/notification-email-dispatcher/templates.ts` — safe couple label + wedding date only.

## Deep links

| Event | Target |
|-------|--------|
| Contract + wedding | `/sluby/:weddingId?tab=contract_finance` |
| Contract lead (no wedding) | `/ankiety/:instanceId` |
| Pre-wedding | `/sluby/:weddingId?tab=pre_wedding_questionnaire` |

CTA base: `APP_PUBLIC_URL` / `SITE_URL` (default `https://ourwed.pl`). Footer links to `/ustawienia/powiadomienia` (no one-click unsubscribe token).

`WeddingDetailV2` reads `?tab=` on mount.

## Expired Trial

Public already-issued forms still submit. Notifications (in-app + email per preference) still fire. Apply/approve remains PRO-gated (`docs/pro-access-matrix.md`).

## Async trigger choice

**Preferred:** `pg_net` HTTP POST from `request_notification_email_dispatch` when DB settings are set:

- `app.settings.notification_dispatcher_url`
- `app.settings.notification_dispatch_secret`

**Fallback:** leave email deliveries `pending` and invoke dispatcher manually / via Dashboard Database Webhook on `notification_deliveries` INSERT where `channel=email` and `status=pending`.

No fake background scheduler. Bounded retries: `max_attempts` default 5; failed rows stay retryable by re-invoking dispatcher with the same delivery id (same idempotency key). No infinite loop.

## Click tracking

Auth SMTP click tracking remains disabled. Product notification emails: **do not enable Resend click tracking in V1** unless product analytics explicitly requires it.

## Admin

`admin_email_events` remains privacy-safe Resend telemetry. Webhook also updates matching `notification_deliveries` by `provider_message_id`. Customer UI V1 treats success as **sent** (not a separate delivered state). Do not invent delivery-rate metrics without webhook data.

## Migrations

- `supabase/migrations/20260811260000_notification_engine.sql`
- `supabase/migrations/20260811270000_notification_engine_submit_hooks.sql`

## Edge Functions

- `notification-email-dispatcher`
- `resend-webhook` (extended)

## Manual production steps

1. `supabase db push`
2. Set Edge secrets: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (verified), `APP_PUBLIC_URL=https://ourwed.pl`, `NOTIFICATION_DISPATCH_SECRET`, existing `RESEND_WEBHOOK_SECRET`
3. `supabase functions deploy notification-email-dispatcher`
4. `supabase functions deploy resend-webhook`
5. Configure `app.settings.notification_dispatcher_url` + secret **or** Dashboard Database Webhook → dispatcher
6. Confirm Resend domain/from address can send
7. Browser QA: Settings → Powiadomienia; submit contract + pre-wedding forms; verify badge, deep links, no duplicate on retry
8. Confirm no questionnaire answers in email body or logs

Production is not complete until steps 1–6 are applied in the live project.
