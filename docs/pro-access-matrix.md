# PRO access matrix — OurWed

Status: expired Trial read-only final hardening  
Gate field: **`canUseProFeatures`** only (never plan cards / localStorage / countdown UI).

## Product rule

| Entitlement | Product behavior |
|-------------|------------------|
| `canUseProFeatures === true` | Mutations work normally |
| `canUseProFeatures === false` | App is **READ-ONLY** for business data; view/export stay open |

## Account exceptions (always WRITE)

| Action | Access | Notes |
|--------|--------|-------|
| Edit first/last name | WRITE | profiles ungated |
| Password / email / MFA | WRITE | auth settings |
| Logout | WRITE | |
| Subscription page | WRITE | checkout still unavailable |
| Notifications mark-read | WRITE | |
| Appearance theme | WRITE | account preference |

## Public questionnaires (couples)

**Decision (unchanged):** Already-issued public links (`/form/:token`, `/ankieta/:token`) remain **usable** after studio Trial expiry.

Couples may open, fill, autosave, submit.

Studio-side apply/approve/send/generate/rotate remain **PRO_REQUIRED**.

Token security / validation is unchanged and independent of PRO gating.

## Signed contract upload

**PRO_REQUIRED** (mutation). View/download existing docs = READ.

---

## Mutation inventory

Legend: **FE** = frontend `requirePro` / page guard · **SRV** = RLS `account_has_pro_access` and/or `assert_account_can_mutate_pro_data` · **Exp** = expired behavior · **Test** = coverage note

### Weddings

| Action | FE | SRV | Exp | Test |
|--------|----|-----|-----|------|
| View list/detail | — | SELECT OK | allowed | foundation |
| Create / import | ProGateNavButton + page guard | weddings write RLS | dialog | pro-readonly |
| Edit / identity / workflow / package / price / locations | requirePro | weddings + children | dialog | pro-readonly |
| Archive / delete | requirePro | weddings | dialog | |
| Notes / payments / tasks | via edit + requirePro | notes/payments/tasks RLS | dialog | |
| Contract generate | page guard + requirePro | wedding_documents RLS | dialog | |

### Sessions

| Action | FE | SRV | Exp | Test |
|--------|----|-----|-----|------|
| View | — | SELECT | allowed | |
| Create / edit / delete | requirePro + page guard | sessions RLS | dialog | |

### Calendar

| Action | FE | SRV | Exp | Test |
|--------|----|-----|-----|------|
| View | — | SELECT | allowed | |
| Add assignment | requirePro | via create wedding/session | dialog | |
| Event write / sync | integrations gated | calendar_events + integrations RLS | dialog | |
| Drag/drop mutate | N/A (no DnD writers today) | — | — | |

### Ankiety — Form Engine (contract lead)

| Action | FE | SRV | Exp | Test |
|--------|----|-----|-----|------|
| View pending / instance | — | SELECT | allowed | questionnaires-pro |
| Generate public link | requirePro `generate_questionnaire_link` | form_instances insert RLS | dialog | questionnaires-pro |
| Send from wedding | requirePro `send_questionnaire` | form_instances + weddings | dialog | |
| Approve / reject / apply | requirePro `apply_questionnaire_responses` | form_instances + weddings | dialog | questionnaires-pro |
| Copy existing URL | clipboard only | — | allowed | |
| Public submit | public RPC | intentional | allowed | policy |

### Ankiety — Contract template config

| Action | FE | SRV | Exp | Test |
|--------|----|-----|-----|------|
| View editor | readOnly when expired | SELECT studio_details | allowed | questionnaires-pro |
| Save field config | requirePro + readOnly | studio_details write RLS | dialog | |
| Generate link CTA | requirePro | form_instances | dialog | |

### Ankiety — Pre-wedding templates

| Action | FE | SRV | Exp | Test |
|--------|----|-----|-----|------|
| View library / open card | view navigate | SELECT | allowed | questionnaires-pro |
| Create / seed / duplicate | requirePro `create_questionnaire` | questionnaire_templates RLS | dialog | questionnaires-pro |
| Edit / rename / archive / setDefault / reorder fields | requirePro `edit_questionnaire_template` | templates RLS | dialog | questionnaires-pro |
| Deep-link editor | LocalReadOnlyNotice + gated saves | templates RLS | read-only UI | |

### Ankiety — Wedding pre-wedding instance

| Action | FE | SRV | Exp | Test |
|--------|----|-----|-----|------|
| View status / responses | — | SELECT | allowed | |
| Prepare instance | requirePro `create_questionnaire` | wedding_questionnaires RLS | dialog | questionnaires-pro |
| Generate / rotate token | requirePro + action keys | **assert in `generate_prewedding_token`** + WQ RLS | dialog | questionnaires-pro |
| Send / share (mutates) | requirePro | WQ update + token RPC | dialog | |
| Copy existing cached link | clipboard | — | allowed if no rotate | |
| Apply responses to wedding | requirePro `apply_questionnaire_responses` | weddings/places/notes RLS | dialog | |
| Lifecycle status (studio) | via share/prepare gates | WQ update RLS | dialog | |
| Public couple fill | public RPCs | intentional | allowed | policy |

### Documents / packages / services / integrations / finance / notes

| Area | FE | SRV | Exp |
|------|----|-----|-----|
| Documents generate/upload/delete | requirePro | document_* + wedding_documents | dialog |
| Packages / items / extras | requirePro | packages / package_items / extra_services | dialog |
| Integrations connect/sync | requirePro | calendar_integrations | dialog |
| Finance mutations | wedding edit gate | payments RLS | dialog |
| Notes / task toggles | wedding edit gate | notes/tasks RLS | dialog |
| Travel / company (studio_details) | requirePro / isReadOnly | travel + studio_details RLS | dialog |

---

## UI system

| Piece | Role |
|-------|------|
| `ProAccessGateProvider` | entitlement + dialog + session flags |
| `requirePro(fn, { actionKey })` | single gate |
| `ProGateAction` / `ProGateNavButton` | locked CTA (lock icon, tooltip, a11y) |
| `ProLockedAffordance` | shared lock presentation |
| `UpgradeRequiredDialog` | plans + recovery copy + action context |
| Session auto-modal | once per auth session when expired |
| `ReadOnlyBanner` | heading/body/plans/Ukryj — session hide only |
| `LocalReadOnlyNotice` | mutation-heavy screens |
| `useProMutationPageGuard` | deep create routes |

Recovery: focus + 60s refresh clears banner/locks when PRO restored.

## Server

| Artifact | Role |
|----------|------|
| `account_has_pro_access()` | canonical check |
| `assert_account_can_mutate_pro_data()` | raises `PRO_ACCESS_REQUIRED` |
| Migrations | `20260811230000`, `20260811240000`, `20260811250000` (questionnaires + token RPC) |

Frontend maps `PRO_ACCESS_REQUIRED` / `pro_required` via `isProAccessRequiredError` → refresh + upgrade dialog (no raw SQL).

## Upgrade dialog

- `expired_trial` / `pro_required_action` (+ optional `actionKey` sentence)
- Recovery: „Po aktywacji PRO wszystkie funkcje zostaną odblokowane automatycznie…”
- Plan CTAs → provider-unavailable (honest)

## Banner

- Heading: Tryb tylko do odczytu
- Body: Trial ended; data still browsable
- Zobacz plany / Ukryj (session only)
