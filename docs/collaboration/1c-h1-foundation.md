# Collaboration 1C-H1 foundation

H1 adds the server authority and DTO foundation for a future unified workspace. It does not wire a rendered screen or change owner-facing data paths.

## Workspace projection

`public.list_my_workspace_weddings(date, id, limit, scope)` returns active owned weddings and active accepted memberships where effective `wedding.identity` is at least view. A global connection is not part of this predicate, so ending one does not remove an accepted membership. Pending, revoked, left, inactive-wedding, and unrelated-tenant rows are excluded.

The exact projection is: `wedding_id`, `ownership_kind`, `couple_first_name`, `couple_second_name`, `wedding_date`, `owner_display_name` (shared rows only), `membership_id`, decimal-string `access_version`, text `permission_group_mapping_version`, and an array of effective `{key, level}` capability pairs. Dates sort ascending, null dates last, then UUID ascending. Keyset paging uses that same tuple and clamps pages to 1–50. Capability collection is set-based inside one RPC.

The projection does not return contact data, package or contract values, payments, deposits, extras, tasks, notes, questionnaires, documents, travel coordinates or commercial data. Core wedding and child-resource RLS is unchanged. Existing rich owner list/detail services remain the owner-screen source.

## Capability closure and mapping versions

`collaboration_private.capability_dependencies` defines child-to-parent requirements and rejects cycles. Dependency closure is evaluated according to the membership/configuration mapping version. Effective child authority retains its own raw level only when every required parent reaches its minimum level. A parent view does not grant child access or edit; the child still needs its own grant. The frozen edges are:

- `schedule.operational_time` requires `prewedding.plan_day` view.
- `places.name` requires `wedding.identity` view.

`prewedding.plan_day` remains inactive and nongrantable in H1. For mapping v1, no Plan Day dependency applies, preserving the released operational-time behavior for historical reads and writes. For mapping v2, operational time is effectively none while the canonical Plan Day parent is unavailable, including for historical child grants. H3 must separately approve and activate the narrow canonical parent capability before a Plan Day path is exposed; H1 does not activate questionnaire access.

Versioned Viewer/Editor defaults are stored in `permission_mapping_defaults`. Existing memberships and presets remain mapping v1. V1 Custom snapshots missing `places.name` remain none, and the 1C-F v1 validator continues rejecting that H1-only capability. V2 separates `places.name` from operational time; it provides place-name view/edit defaults and keeps operational time at none pending parent activation. V2 Custom validation rejects operational-time grants while the parent is inactive and requires identity view when place-name authority is configured.

The v1-to-v2 membership migration implementation `migrate_wedding_collaboration_membership_to_v2` remains defined for controlled internal tests and future activation, and retains the decimal-string `access_version` conflict contract. It increments the version and records a permission event when invoked by its database owner. It is revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`; current application-facing APIs cannot migrate a membership to v2. Existing role-only access updates remain v1 and do not change the mapping version or rewrite grants. Preset snapshots record their mapping version; all currently exposed preset APIs create v1. The v2 preset creator is likewise revoked from application roles until version-aware 1C-G list, detail, update, duplicate, and client contracts ship.

Owner access-management DTO/client support for mapping v2 is deferred to H3. Therefore H1 keeps v1-to-v2 migration unavailable to application roles.

Configured and effective authority are different. A v2 Custom membership may retain a stored child grant such as `schedule.operational_time = edit` while its effective level is `none` because `prewedding.plan_day` is unavailable. H3 must neither report that as effective edit nor silently delete the latent stored grant.

## H3 hard prerequisites

These gates are cumulative. They preserve the frozen principles that collaborative weddings are first-class weddings; there is one canonical Wedding Detail and one canonical editor per domain; permissions shape the normal product rather than create a second collaborative product; unavailable data is not fetched and then hidden; role is descriptive while membership and effective capabilities authorize; parent/child dependencies control reachability; and legacy v1 behavior remains compatible until deliberate v2 migration. H1 adds no rendered UI and does not activate these capabilities.

### Before exposing v2 membership migration

Before any future UI invokes membership migration or makes it application-callable, H3 must provide:

- version-aware owner-management DTO and client support for mapping versions 1 and 2;
- distinct configured/stored and effective permissions after dependency closure, with accurate effective previews;
- latent-grant preservation without silent normalization or deletion;
- an owner-visible before/after authority delta and explicit owner confirmation;
- mapping-aware saves and mixed-state fidelity;
- expected-version conflict handling and regression coverage; and
- no migration on role-only edits.

This migration review UI and the version-aware contract are hard H3 requirements. Role remains descriptive; it does not authorize or implicitly migrate membership permissions.

### Before exposing Collaboration Home

H3 must normalize the global collaborator invitation/account-discovery contract before exposing the final Collaboration Home or the **“Dodaj współpracownika”** flow. The existing global invite RPC currently exposes distinguishable outcomes, including account not found, ambiguous account, already connected, and pending or existing relationship. Frontend copy alone is not sufficient mitigation. The backend observable contract must be reviewed and normalized so the email-first flow does not provide an account-enumeration side channel. Do not introduce identity preview unless it can be implemented without revealing whether an arbitrary email belongs to an OurWed account. This normalization is a hard H3 prerequisite; H1 does not implement it.

### Before canonical collaborative Wedding Detail

The target remains one canonical route, `/sluby/:weddingId`, for both owned and collaborative weddings. H3 must resolve actor authority before mounting sensitive domain queries: first resolve the owner/shared relationship and effective authority, then determine which canonical sections and domains are reachable, mount only the queries/services allowed for that actor, and render the same canonical components for allowed domains. Owner behavior remains unchanged; collaborator behavior is compositionally restricted by effective authority.

Forbidden: loading the normal owner wedding graph, fetching owner-only data, and then hiding unauthorized cards or fields in JSX. **Frontend hiding is not the security boundary.** **H3 must not mount broad owner queries for a collaborator and then hide the resulting UI.** Unauthorized owner data must never enter the collaborator component tree or cache merely to hide it visually. This applies to owner finance, package, contacts, contracts/documents, questionnaires, tasks, notes, equipment, travel/route/commercial data, and future sensitive domains. Authority-first loading is a hard H3 prerequisite.

H3 must also compose parent and child UI according to effective parent/child authority. A child capability must not create an alternate or special collaboration route when its canonical parent surface is unavailable. For `schedule.operational_time`, the canonical parent surface is **Ankieta przedślubna → Plan dnia**. If the parent is unavailable or `none`, the child is not reachable in normal product UI. H3 must not create a special “Collaborative Plan Day” or another bypass surface. Mutation affordances appear only on the canonical parent surface when effective authority permits them: VIEW uses the canonical component without mutation affordances; EDIT uses the same canonical editor as the owner where authorized; NONE means the section/action is absent. Stored latent grants must not be silently deleted when effective authority is reduced by a missing parent. Custom permission UI must not present parent-none / active-child combinations as usable. This parent/child composition is an H3 implementation prerequisite; H1 does not activate new UI capabilities.

## Places authority

`places.name` covers the existing canonical place label only. View is separately gated in curated collaboration reads. The authenticated name-write RPC renames one existing canonical place row using the shared 1C-D version ledger. It cannot insert/delete/reorder slots, or change addresses, place IDs, coordinates, route, or travel. `places.address` behavior remains in its existing RPC and retains its current location-resolution reset behavior.

The `place_name` version advances when the label or canonical row identity changes. Address and time generations keep their existing meanings. Name writes do not touch travel segments.

## Recipient invitation read and remaining prerequisites

`get_wedding_collaboration_invitation_decision` is a new invitee-bound read for the eventual decision flow. Its explicit DTO includes couple identity/date, inviter display name, invitation lifecycle timestamps, mapping version, and the recipient proposal amount/currency. It excludes owner contract value, package, payment, and wedding-price fields. The historical 1C-B preview and stored commercial snapshots remain intact for existing consumers and history.

The global connection invite RPC still has lifecycle outcomes used by current consumers. Its account-enumeration normalization is deferred to H3 and must satisfy the hard prerequisite above before Collaboration Home is exposed.

## Deferred product decisions

- H6 owner-defined compensation is separate from `wedding.price`; recipient fallback, recipient payment status/date and recipient history are recipient-private. Ordinary revoke, leave, connection end and wedding lifecycle retain that history; account erasure must be able to delete it. The owner model uses a current effective record plus immutable audit history, and pending acceptance copies final terms atomically. Numeric precision follows existing decimal conventions.
- The final collaborator Wedding Detail retains the canonical **ROZLICZENIE** slot. Before H6, owner finance is unavailable. After H6, that slot presents recipient economics: Wynagrodzenie, Status, Termin płatności and Data otrzymania. No separate recipient compensation card is planned.
- H2 can consume the workspace DTO without merging the owner list and collaboration list in the browser. Dashboard, Calendar, Search, Assistant and Finance integrations remain later surface-specific projections.
