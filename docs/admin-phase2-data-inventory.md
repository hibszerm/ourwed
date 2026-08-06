# Admin Phase 2 — Data Inventory

Audit date: 2026-08-06  
Sources: `supabase/migrations/*`, `supabase/schema.sql`, `src/lib/api/*`, `src/admin/*`  
Architecture choice: **SECURITY DEFINER RPCs** (authenticated owner + JWT `aal=aal2`) for aggregates; Auth user fields read inside definer from `auth.users`. No browser service role. Edge Function optional later for Resend webhook.

---

## Metric inventory

| Metric | Source | Columns / definition | Privacy | Available | History | Notes |
|--------|--------|----------------------|---------|-----------|---------|-------|
| Konta (total) | `auth.users` | `count(*)` | Safe aggregate | Yes | Yes (created_at) | Via admin RPC |
| Konta (range) | `auth.users` | `created_at` in range (Europe/Warsaw) | Safe | Yes | Yes | |
| Active users | `auth.users` | `last_sign_in_at` in range | Safe | Yes | Yes | Definition: last_sign_in_at ∈ range — **not** claimed as DAU/MAU |
| Confirmed users | `auth.users` | `email_confirmed_at is not null` | Safe | Yes | Yes | Denominator for % |
| Weddings total | `public.weddings` | `count(*)` | Safe | Yes | Yes | No names returned |
| Weddings upcoming | `public.weddings` | `wedding_date >= current_date` AND `status = 'active'` | Safe | Yes | N/A | |
| Weddings created in range | `public.weddings` | `created_at` in range | Safe | Yes | Yes | |
| Sessions total | `public.sessions` | `count(*)` | Safe | Yes | Yes | |
| Sessions upcoming | `public.sessions` | `session_date >= current_date` | Safe | Yes | N/A | No status column |
| Sessions created in range | `public.sessions` | `created_at` in range | Safe | Yes | Yes | |
| Form questionnaires sent | `public.form_instances` | `status in ('pending','opened','submitted',…)` issued = not draft; use `created_at` or any row as issued | Safe | Yes | Partial | Issued ≈ row exists; opened ≈ `opened_at` / status |
| Form questionnaires submitted | `public.form_instances` | `status = 'submitted'` | Safe | Yes | Yes | |
| Prewedding sent | `public.wedding_questionnaires` | `sent_at is not null` | Safe | Yes | Yes | |
| Prewedding submitted | `public.wedding_questionnaires` | `submitted_at is not null` OR `status = 'submitted'` | Safe | Yes | Yes | |
| Documents generated | `public.wedding_documents` | `count(*)` | Safe | Yes | Yes | Artifacts |
| Documents signed | `public.wedding_documents` | `lock_status = 'signed'` | Safe | Yes | Yes | Also CRM `contracts.status` — we use artifacts |
| Payments recorded | `public.payments` | `count(*)` | Safe | Yes | Yes | CRM receipts, not Stripe |
| Briefs downloaded | — | — | — | **No** | No | No persisted download event |
| Google Calendar active | `public.calendar_integrations` | `provider='google' AND enabled AND google_connected_at IS NOT NULL AND google_revoked_at IS NULL` | Safe | Yes | Partial | |
| Apple Calendar active | `public.calendar_integrations` | `provider='apple' AND enabled` | Safe | Yes | Partial | |
| Registration series | `auth.users` | daily `created_at` buckets | Safe | Yes | Yes | Europe/Warsaw |
| Activation: account | `auth.users` | count | Safe | Yes | Yes | |
| Activation: email confirmed | `auth.users` | `email_confirmed_at` | Safe | Yes | Yes | Absolute + % of accounts |
| Activation: first assignment | `weddings` ∪ `sessions` | users with ≥1 wedding or session | Safe | Yes | Partial | Not strict chronological funnel |
| Activation: first questionnaire | `form_instances` ∪ `wedding_questionnaires` | distinct owners | Safe | Yes | Partial | |
| Activation: first document | `wedding_documents` via wedding owner | distinct user_id | Safe | Yes | Partial | |
| Activation: calendar connected | `calendar_integrations` | distinct user_id enabled | Safe | Yes | Partial | |
| Email deliverability | `admin_email_events` via Resend webhook | event_type aggregates | Safe (domain + hash only) | **Partial** | From first webhook | Table + Edge Function `resend-webhook` ready; empty until events |
| MRR / subscriptions | — | — | — | **No** | No | No Stripe |
| Product events | — | — | — | **No** | No | Not instrumented |
| Admin audit | `admin_audit_log` | action, created_at | Sensitive admin | Yes | Yes | Allow-listed presenter |
| Deployment metadata | Vercel env | `VERCEL_*` | Safe | Partial | N/A | Local → „Local” |

---

## Privacy exclusions (never leave server)

Couple/client names, questionnaire answers, contract/document bodies, addresses, phones, notes, payment notes, calendar event titles, storage paths with PII, tokens, secrets.

---

## Unavailable → UI truth

| Area | UI copy |
|------|---------|
| Brief downloads | „Brak wiarygodnego źródła danych” |
| Email deliverability | „Statystyki dostarczalności nie są jeszcze zbierane.” |
| Billing / MRR | Sidebar „Subskrypcje” → „Niepodłączone” |
| Uptime % | Never shown |
| Historical analytics before collection | „Brak danych historycznych” |

---

## API architecture

**Chosen:** Postgres `SECURITY DEFINER` RPCs callable by authenticated owner when `auth.jwt()->>'aal' = 'aal2'`.

**Why not Vercel serverless:** `vercel.json` is SPA-only; no existing `/api` layer.  
**Why not Edge-only for aggregates:** Aggregates are SQL-native; Auth counts accessible from definer on `auth.users`.  
**Resend webhook:** Supabase Edge Function `resend-webhook` (Svix signature, service role insert into `admin_email_events` only). Env: `RESEND_WEBHOOK_SECRET` (never `VITE_`).

Browser: existing anon Supabase client + user JWT → `supabase.rpc(...)`.

### Indexes added (Phase 2)

| Index | Table | Reason |
|-------|-------|--------|
| `weddings_created_at_idx` | `weddings(created_at)` | Range created counts |
| `sessions_created_at_idx` | `sessions(created_at)` | Range created counts |
| `admin_email_events_occurred_at_idx` | `admin_email_events(occurred_at desc)` | Recency / aggregates |
| `admin_email_events_event_type_idx` | `admin_email_events(event_type)` | Event type counts |