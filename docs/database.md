# OurWed Database Architecture

Production-oriented Supabase / Postgres schema for the OurWed wedding photographer CRM.

Source of truth for DDL: [`supabase/schema.sql`](../supabase/schema.sql)

This document describes tables, relationships, constraints, and how the schema supports the existing product workflow. It does **not** describe frontend implementation.

---

## Design principles

- **Wedding is the root object.** Almost every operational record belongs to a wedding.
- **UUID primary keys** on every table.
- **`timestamptz`** for all timestamps (stored in UTC via `timezone('utc', now())` defaults).
- **Foreign keys** enforce ownership and cascade only when child rows cannot exist alone.
- **RLS is enabled on every table.** Current policies are temporary `dev_allow_all_*` (allow all). Replace before production.
- **No seed / fake data** in the schema file.
- **Workflow rules stay in application code.** The database stores `workflow_stage`; it does not implement transitions.
- **Form Engine** replaces questionnaire-specific tables with a generic, extensible forms model.

---

## Entity relationship overview

```text
users
 ├── weddings
 │    ├── contacts
 │    ├── payments
 │    ├── notes
 │    ├── timeline_events
 │    ├── tasks
 │    ├── contracts            (1:1)
 │    ├── calendar_events
 │    ├── galleries            (1:1)
 │    └── form_instances
 │         └── form_answers    (1:1)
 │
 ├── notifications
 │
 └── (via form_instances)
      forms  ←── form_instances.form_id
```

---

## Form Engine

The Form Engine is the reusable content system behind contract questionnaires, pre-wedding questionnaires, shot lists, opinion forms, session planning, and any future couple-facing or studio form.

### `forms` vs `form_instances`

| Concept | Table | Meaning |
| --- | --- | --- |
| **Definition** | `forms` | Reusable template: name, slug, category, version, and full `schema` JSON |
| **Instance** | `form_instances` | One issued copy for one wedding, with a public `token` and lifecycle status |
| **Submission** | `form_answers` | One JSON document of answers for one submitted instance |

One `forms` row can generate **unlimited** `form_instances` (many weddings, resends, new versions over time).

Examples of form definitions:

- Contract questionnaire
- Pre-wedding questionnaire
- Family shot list
- Opinion / feedback form
- Session planning

### Why `schema` is JSONB on `forms`

The complete form definition (sections, fields, validation, conditionals, labels) lives in `forms.schema`.

There are **no** separate `questions` / `options` tables. That keeps the database stable while the product adds field types without migrations.

### Why answers are a single JSON document

`form_answers.answer_json` stores the full submission once per instance (`unique(instance_id)`).

This supports:

- checkboxes / multi-select
- nested groups
- repeaters (e.g. guest lists, family groups)
- mixed scalar + structured values
- future AI processing over the whole payload

Row-per-question storage would force schema churn and awkward joins for nested data. Document storage keeps structure flexible for years.

### Lifecycle (application-owned)

Typical statuses on `form_instances`:

`pending` → `opened` → `submitted` (or `expired` / `revoked`)

Timestamps:

- `created_at` — link generated
- `opened_at` — first open
- `submitted_at` — successful submit
- `expires_at` — optional expiry

Public URL shape (app concern): `/form/{token}`

### Seeding forms

Form definitions are seeded separately from DDL. Do **not** put form rows in `schema.sql`.

Seed file: [`supabase/seeds/forms.sql`](../supabase/seeds/forms.sql)

Apply order:

1. `supabase/schema.sql`
2. `supabase/seeds/forms.sql`

Initial production seed:

| Field | Value |
| --- | --- |
| `name` | Contract Questionnaire |
| `slug` | `contract-questionnaire` |
| `category` | `contract` |
| `version` | `1` |
| `is_active` | `true` |
| `schema` | JSON mirroring the existing demo Contract Questionnaire (`CONTRACT_QUESTIONNAIRE_TEMPLATE`) — same question ids, types, labels, `fieldKey`s, and package options |

The seed is idempotent via `on conflict (slug, version) do update`.

To add another form later (pre-wedding, shot list, opinion, session planning):

1. Append a new `insert into public.forms (...)` block in `supabase/seeds/forms.sql`
2. Put the full definition in `schema` jsonb (same shape as the Contract Questionnaire seed)
3. Use a unique `(slug, version)` and the correct `category`
4. Keep `is_active = true` for the version studio should issue via `getActiveFormByCategory`

There is no form builder yet — definitions are maintained as SQL seeds.

---

## Workflow support

The schema does **not** implement workflow logic. `weddings.workflow_stage` stores the current stage so the existing UI / engine can map to:

| Stored value (`workflow_stage`) | Product meaning |
| --- | --- |
| `reservation` | Reservation |
| `contract` | Contract |
| `deposit` | Deposit |
| `preparation` | Formalności zakończone |
| `pre_wedding_questionnaire` | Ankieta przedślubna |
| `wedding_day` | Wedding |
| `post_production` | Postproduction |
| `completed` | Delivered |

Supporting tables for that pipeline (without encoding rules):

| Stage concern | Tables |
| --- | --- |
| Reservation / wedding project | `weddings` |
| Contract | `contracts`, contract forms via Form Engine |
| Deposit | `weddings.deposit_amount`, `payments` (`type = 'deposit'`) |
| Formalities / prep | `tasks`, `notes`, `timeline_events` |
| Pre-wedding questionnaire | Form Engine (`forms` / `form_instances` / `form_answers`) |
| Wedding day | `calendar_events`, `weddings.wedding_date` / `ceremony_time` / `venue` |
| Postproduction / delivery | `galleries`, `timeline_events`, `notifications` |

---

## Future Auth (not implemented)

`public.users` is the studio profile table. It is designed to map 1:1 with Supabase Auth later:

- Prefer `public.users.id = auth.users.id`
- On signup, create/update the profile row from `auth.users`
- Keep email (and optional avatar/name metadata) in sync
- Scope RLS with `auth.uid()` against `users.id` / `weddings.user_id`
- Passwords stay only in Supabase Auth — never in `public.users`

See SQL comments on `public.users` in `schema.sql`.

---

## Tables

### 1. `users`

Photographer / studio accounts (future Auth profile).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK; future = `auth.users.id` |
| `email` | `text` | Unique, required |
| `name` | `text` | Display name |
| `avatar_url` | `text` | Optional |
| `created_at` | `timestamptz` | Default now |

**Relationships**

- `1 → N` `weddings`
- `1 → N` `notifications`
- Optional author refs: `timeline_events.created_by`, `contracts.generated_by`

**Delete behavior**

- Deleting a user cascades to their weddings and notifications
- Authored FKs use `ON DELETE SET NULL` where appropriate

---

### 2. `weddings`

One wedding = one project. Primary domain entity.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `users.id` |
| `bride_name` | `text` | Required |
| `groom_name` | `text` | Required |
| `email` | `text` | Couple primary email |
| `phone` | `text` | Couple primary phone |
| `wedding_date` | `date` | Ceremony / wedding date |
| `ceremony_time` | `time` | Optional |
| `venue` | `text` | Venue / location label |
| `status` | `text` | `active` \| `archived` \| `cancelled` |
| `workflow_stage` | `text` | See workflow table above |
| `package_name` | `text` | Selected package label |
| `contract_value` | `numeric(12,2)` | Agreed total |
| `deposit_amount` | `numeric(12,2)` | Agreed deposit amount |
| `currency` | `text` | Default `PLN` |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Maintained by trigger |

**Relationships**

- `N → 1` `users`
- Parent of: `contacts`, `payments`, `notes`, `timeline_events`, `tasks`, `form_instances`, `contracts`, `calendar_events`, `galleries`

**Indexes**

- `user_id`, `wedding_date`, `workflow_stage`, `status`

---

### 3. `contacts`

Additional people related to a wedding (beyond bride/groom fields on `weddings`).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `wedding_id` | `uuid` | FK → `weddings.id` |
| `name` | `text` | Required |
| `role` | `text` | e.g. planner, parent |
| `phone` | `text` | |
| `email` | `text` | |
| `created_at` | `timestamptz` | |

**Relationships**

- `N → 1` `weddings` (`ON DELETE CASCADE`)

---

### 4. `payments`

Money received (or recorded) toward the wedding engagement.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `wedding_id` | `uuid` | FK → `weddings.id` |
| `type` | `text` | `deposit` \| `installment` \| `final` \| `other` |
| `amount` | `numeric(12,2)` | `>= 0` |
| `payment_date` | `date` | When paid / booked |
| `method` | `text` | `transfer` \| `cash` \| `blik` \| `other` |
| `note` | `text` | |
| `created_at` | `timestamptz` | |

**Relationships**

- `N → 1` `weddings` (`ON DELETE CASCADE`)

---

### 5. `notes`

Conversation-style / operational notes on a wedding.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `wedding_id` | `uuid` | FK → `weddings.id` |
| `author` | `text` | Display author |
| `content` | `text` | Required |
| `pinned` | `boolean` | Default `false` |
| `created_at` | `timestamptz` | |

**Relationships**

- `N → 1` `weddings` (`ON DELETE CASCADE`)

---

### 6. `timeline_events`

Historical feed for a wedding.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `wedding_id` | `uuid` | FK → `weddings.id` |
| `type` | `text` | Event category (app-defined) |
| `title` | `text` | Required |
| `description` | `text` | Optional detail |
| `created_by` | `uuid` | FK → `users.id`, nullable, `ON DELETE SET NULL` |
| `system_generated` | `boolean` | Default `false` |
| `created_at` | `timestamptz` | Event time |

**Relationships**

- `N → 1` `weddings` (`ON DELETE CASCADE`)
- Optional `N → 1` `users` via `created_by`

---

### 7. `tasks`

Wedding-scoped to-dos.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `wedding_id` | `uuid` | FK → `weddings.id` |
| `title` | `text` | Required |
| `description` | `text` | |
| `status` | `text` | `todo` \| `in_progress` \| `done` \| `cancelled` |
| `due_date` | `date` | |
| `completed_at` | `timestamptz` | Set when done |
| `created_at` | `timestamptz` | |

**Relationships**

- `N → 1` `weddings` (`ON DELETE CASCADE`)

---

### 8. `forms` (Form Engine definitions)

Reusable form definitions. Complete structure in `schema` jsonb.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `name` | `text` | Human label |
| `slug` | `text` | Stable key; unique with `version` |
| `description` | `text` | Optional |
| `category` | `text` | `contract` \| `pre_wedding` \| `wedding_day` \| `feedback` \| `planning` \| `other` |
| `schema` | `jsonb` | Full form definition |
| `version` | `integer` | `>= 1` |
| `is_active` | `boolean` | Soft activation |
| `created_at` | `timestamptz` | |

**Relationships**

- `1 → N` `form_instances`

**Delete behavior**

- Instances reference forms with `ON DELETE RESTRICT`

---

### 9. `form_instances`

One generated form sent to one wedding.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `form_id` | `uuid` | FK → `forms.id` |
| `wedding_id` | `uuid` | FK → `weddings.id` |
| `token` | `text` | Unique public token |
| `status` | `text` | `pending` \| `opened` \| `submitted` \| `expired` \| `revoked` |
| `expires_at` | `timestamptz` | Nullable |
| `opened_at` | `timestamptz` | Nullable |
| `submitted_at` | `timestamptz` | Nullable |
| `created_at` | `timestamptz` | |

**Relationships**

- `N → 1` `forms` (`ON DELETE RESTRICT`)
- `N → 1` `weddings` (`ON DELETE CASCADE`)
- `1 → 1` `form_answers`

---

### 10. `form_answers`

One JSON submission document per instance.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `instance_id` | `uuid` | FK → `form_instances.id`, unique |
| `answer_json` | `jsonb` | Full answers payload |
| `created_at` | `timestamptz` | |

**Relationships**

- `1 → 1` `form_instances` (`ON DELETE CASCADE`)

---

### 11. `contracts`

Contract lifecycle for a wedding (one row per wedding).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `wedding_id` | `uuid` | FK → `weddings.id`, unique |
| `status` | `text` | `none` \| `generated` \| `sent` \| `signed` |
| `version` | `integer` | Default `1` |
| `generated_by` | `uuid` | FK → `users.id`, nullable |
| `generated_at` | `timestamptz` | |
| `signed_at` | `timestamptz` | |
| `file_url` | `text` | Generated PDF / storage URL |
| `created_at` | `timestamptz` | |

**Relationships**

- `1 → 1` `weddings` (`ON DELETE CASCADE`)
- Optional `N → 1` `users` via `generated_by` (`ON DELETE SET NULL`)

---

### 12. `calendar_events`

Calendar items linked to a wedding.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `wedding_id` | `uuid` | FK → `weddings.id` |
| `title` | `text` | Required |
| `start_date` | `timestamptz` | Required |
| `end_date` | `timestamptz` | Nullable; must be `>= start_date` |
| `type` | `text` | `wedding` \| `meeting` \| `delivery` \| `shoot` \| `other` |
| `location` | `text` | |
| `notes` | `text` | |
| `color` | `text` | UI accent |
| `all_day` | `boolean` | Default `false` |
| `created_at` | `timestamptz` | |

**Relationships**

- `N → 1` `weddings` (`ON DELETE CASCADE`)

---

### 13. `galleries`

Client gallery delivery metadata (one row per wedding for now).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `wedding_id` | `uuid` | FK → `weddings.id`, unique |
| `status` | `text` | `not_ready` \| `processing` \| `ready` \| `expired` |
| `gallery_url` | `text` | Public / share URL |
| `provider` | `text` | e.g. pixieset, shootproof, custom |
| `provider_gallery_id` | `text` | Remote id at provider |
| `expires_at` | `timestamptz` | Access expiry |
| `created_at` | `timestamptz` | |

**Future expansion**

- `gallery_images` is **not** created yet
- When needed, it should FK to `galleries.id`

**Relationships**

- `1 → 1` `weddings` (`ON DELETE CASCADE`)

---

### 14. `notifications`

Photographer-scoped in-app notifications with deep-link targets.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `users.id` |
| `type` | `text` | `info` \| `warning` \| `success` \| `error` |
| `title` | `text` | Required |
| `content` | `text` | Required |
| `entity_type` | `text` | e.g. `wedding`, `form_instance`, `payment` |
| `entity_id` | `uuid` | Matching entity id |
| `link` | `text` | App path/URL to open |
| `read` | `boolean` | Default `false` |
| `created_at` | `timestamptz` | |

**Relationships**

- `N → 1` `users` (`ON DELETE CASCADE`)

---

## Foreign key & cascade summary

| Child | Parent | On delete |
| --- | --- | --- |
| `weddings` | `users` | `CASCADE` |
| `contacts` | `weddings` | `CASCADE` |
| `payments` | `weddings` | `CASCADE` |
| `notes` | `weddings` | `CASCADE` |
| `timeline_events` | `weddings` | `CASCADE` |
| `timeline_events.created_by` | `users` | `SET NULL` |
| `tasks` | `weddings` | `CASCADE` |
| `form_instances` | `weddings` | `CASCADE` |
| `form_instances` | `forms` | `RESTRICT` |
| `form_answers` | `form_instances` | `CASCADE` |
| `contracts` | `weddings` | `CASCADE` |
| `contracts.generated_by` | `users` | `SET NULL` |
| `calendar_events` | `weddings` | `CASCADE` |
| `galleries` | `weddings` | `CASCADE` |
| `notifications` | `users` | `CASCADE` |

Rationale:

- **CASCADE** when the child is meaningless without the parent.
- **RESTRICT** on form definitions so historical instances cannot lose their template.
- **SET NULL** on optional authorship fields.

---

## Row Level Security

Every table has RLS enabled.

Current policies are temporary development policies named `dev_allow_all_<table>`:

- `USING (true)`
- `WITH CHECK (true)`

**Before production**, replace these with ownership-scoped policies once Auth is wired:

- Photographers only see `weddings` where `user_id = auth.uid()`
- Wedding children authorized via ownership join on `weddings`
- Public form access via `token` should use a narrow policy or Edge Function — not `dev_allow_all_*`

---

## Extensibility (next few years)

This schema is intentionally frozen as a structural base:

| Need | How it extends without redesign |
| --- | --- |
| New form types | New `forms` rows / versions; richer `schema` jsonb |
| Nested / repeater answers | Already supported by `answer_json` |
| Gallery providers | `provider` + `provider_gallery_id`; later `gallery_images` |
| Auth | Map `users.id` → `auth.users.id`; tighten RLS |
| Notification deep links | `entity_type` / `entity_id` / `link` |
| Contract regenerations | `contracts.version` + `generated_by` |
| Money | `contract_value`, `deposit_amount`, `currency` + `payments` |

Avoid introducing questionnaire-specific tables again. Prefer Form Engine + JSON documents.

---

## Applying the schema

In the Supabase SQL editor (or CLI), apply:

1. [`supabase/schema.sql`](../supabase/schema.sql) — structure
2. [`supabase/seeds/forms.sql`](../supabase/seeds/forms.sql) — Form Engine definitions

Notes:

- Assumes a **fresh** public schema for these objects (no duplicate questionnaire tables).
- If older `questionnaires` / `questionnaire_tokens` / `questionnaire_answers` exist from experiments, drop or migrate them before applying.
- After DDL, reload the PostgREST schema cache if the API cannot see new tables.
- Form seeds are production definitions (Contract Questionnaire), not fake weddings/clients.

---

## Out of scope (intentionally)

This architecture pass does **not**:

- Modify React / UI / routes
- Replace in-app mocks
- Implement a form builder UI
- Implement dynamic rendering from `forms.schema` in the public page (current public UI still uses the demo template components)
- Implement authentication
- Create `gallery_images`
- Encode workflow transition rules in SQL
- Seed fake wedding / client demo data
