# Internal QA local Supabase harness

## Frozen Collaboration baseline through V3 Pre-Wedding

For frozen checkpoint `0670d0c5795d9951d2eed9d28dc23ef8d057a7ab`, use disposable local Supabase project `ourwed-collab-harness-1016`, database container `supabase_db_ourwed-collab-harness-1016`, and the unpublished GoTrue schema initializer `supabase_auth_ourwed-collab-harness-1016` (database `postgres`). This project lives under `/private/tmp`; its migrations and seeds are disabled, and no other application services are enabled. It is never production data.

The startup wrapper exists because Supabase CLI 2.109.1 may publish PostgreSQL on wildcard interfaces. It runs the CLI through a fail-closed Docker API guard on a temporary owner-only Unix socket (directory `0700`, socket `0600`). The guard recognizes only the exact project, DB container, unpublished GoTrue initializer, DB volume, and project network; unknown API calls are denied. On the exact DB create request it rewrites only PostgreSQL `HostIp` to `127.0.0.1`, retaining the assigned host port and all other request configuration. GoTrue is allowed only on the project network with no host ports, to provision the `auth.users` schema required by the frozen migrations. The guard timeout is 240 seconds; after it expires, the CLI child is stopped and the temporary socket and directory are removed. This wrapper is the trusted startup procedure; do not run the Supabase CLI directly for this project.

```sh
export HOME=/private/tmp/ourwed-harness-repair-home
export XDG_CONFIG_HOME="$HOME/config"
export XDG_CACHE_HOME="$HOME/cache"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
SUPABASE=/Users/marcin/.local/share/supabase/supabase
"$SUPABASE" stop --workdir /private/tmp/ourwed-collaboration-harness-repair-20261016 --project-id ourwed-collab-harness-1016 --no-backup --yes >/dev/null
bash scripts/test/internal-qa-harness/start_frozen_collaboration_db.sh
```

The start script verifies the actual PostgreSQL mapping and `docker exec` SQL access. Confirm the live state before building or testing:

```sh
bash scripts/test/internal-qa-harness/assert_frozen_db_network_isolation.sh supabase_db_ourwed-collab-harness-1016
```

The safety check requires the exact project labels and exactly one DB container, then verifies PostgreSQL is published only as `127.0.0.1:<port>`. Missing, duplicate, malformed, wildcard, IPv6, or other host bindings fail closed. Baseline construction and pgTAP execution also run this check automatically.

Build only on a fresh database in that dedicated container. The builder extracts the current account fixture and then applies the repository's canonical prerequisite, Pre-Wedding, operational-time, source-contract, and frozen Collaboration migrations in order. It verifies the frozen H1/H3/V3 migration hashes, checks the resulting schema, and deliberately does not apply the V3 Contacts migration:

```sh
bash scripts/test/internal-qa-harness/build_frozen_collaboration_baseline.sh supabase_db_ourwed-collab-harness-1016
bash scripts/test/internal-qa-harness/assert_frozen_pre_wedding_schema.sh supabase_db_ourwed-collab-harness-1016 postgres
```

Run the six frozen suites, in this order, against that same disposable database. The frozen gate contains 349 assertions:

```sh
export OURWED_TEST_DB_CONTAINER=supabase_db_ourwed-collab-harness-1016
scripts/test/internal-qa-harness/run_pgtap.sh supabase/tests/collaboration_v3_prewedding_shared_test.sql
scripts/test/internal-qa-harness/run_pgtap.sh supabase/tests/collaboration_v3_six_area_foundation_test.sql
scripts/test/internal-qa-harness/run_pgtap.sh supabase/tests/collaboration_1c_h3_detail_authority_test.sql
scripts/test/internal-qa-harness/run_pgtap.sh supabase/tests/collaboration_1c_h3_shared_identity_projection_test.sql
scripts/test/internal-qa-harness/run_pgtap.sh supabase/tests/collaboration_1c_h1_workspace_authority_test.sql
scripts/test/internal-qa-harness/run_pgtap.sh supabase/tests/collaboration_v3_logistics_test.sql
```

The verified `postgres` database in this named disposable project is the reusable baseline. To rebuild from fresh state, stop only this project with the documented `--no-backup` option, start it through the guarded wrapper, and run the build command above. Do not run broad Docker cleanup commands. Do not apply `supabase/migrations/20261016151212_collaboration_v3_contacts_canonical.sql`; the Contacts migration is excluded. The schema self-check guards against skeletal questionnaire tables by requiring canonical `introduction`, `status`, response revision, and operational-time version fields before the Pre-Wedding suite runs.

This is test-only tooling. `build_baseline.py` extracts current account and Collaboration 1B definitions from committed canonical migrations and adds synthetic fixtures. Its output is SQL for a disposable database; it is not a Supabase migration and must not be copied into `supabase/migrations`.

## Recreate the local harness

Use a separate project directory and CLI home under `/private/tmp`. Initialize a local Supabase project, then set its `project_id` to `ourwed-internal-qa-harness-20261012`, API port to `56321`, database port to `56322`, and shadow port to `56320`. In that project's `supabase/config.toml`, disable database migrations and seeds and set Auth email confirmations off. Keep `HOME`, `XDG_CONFIG_HOME`, and `XDG_CACHE_HOME` inside a dedicated `/private/tmp` home.

Start that project with Supabase CLI 2.109.1 or a compatible local stack. Confirm its URLs are `http://127.0.0.1:56321` and `postgresql://postgres:postgres@127.0.0.1:56322/postgres`, and its project ID is the dedicated harness ID before writing anything. Save `supabase status --output env` to a mode-600 `local.env` under the harness directory.

From the repository root, generate and load the fixture, then apply the source-contract table security migrations, the released Internal QA migration, and the collaboration stack. The source-contract layer gives the 1C-D lock-order tests the active recovery tables and owner-scoped grants:

```sh
python3 scripts/test/internal-qa-harness/build_baseline.py > /private/tmp/ourwed-internal-qa-harness-20261012/current_baseline.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /private/tmp/ourwed-internal-qa-harness/current_baseline.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20260728160000_wedding_contract_recovery.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261006214925_source_contract_atomic_apply.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261007171734_source_contract_apply_partner_answers.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261012154736_internal_qa_accounts.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261012175953_internal_qa_pro_entitlement_gate.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261012193244_collaboration_1c_a_wedding_lifecycle_foundation.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261012212404_collaboration_1c_b_secure_invitation_reads.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261013103640_collaboration_1c_b_invite_from_connection.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261013113439_collaboration_1c_c_curated_reads.sql
```

The baseline fixture includes the invitation-visible wedding commercial
columns, the frozen extra-service junction, and minimal owner-only RLS rows for
the child-data isolation matrix. Run the dedicated lifecycle and zero-access
regression after loading the 1C-A migration:

```sh
scripts/test/internal-qa-harness/run_pgtap.sh supabase/tests/collaboration_v1_1b_test.sql
scripts/test/internal-qa-harness/run_pgtap.sh supabase/tests/collaboration_v1_1c_a_test.sql
scripts/test/internal-qa-harness/run_pgtap.sh supabase/tests/collaboration_v1_1c_c_test.sql
scripts/test/internal-qa-harness/run_pgtap.sh supabase/tests/internal_qa_accounts_test.sql
TSX_TSCONFIG_PATH=tsconfig.app.json node --import tsx src/features/collaboration/collaboration1cBAcceptance.test.ts
TSX_TSCONFIG_PATH=tsconfig.app.json node --import tsx src/features/collaboration/collaboration1cCAcceptance.test.ts
node scripts/test/internal-qa-harness/collaboration_1c_c_mobile_viewport.mjs
node scripts/test/internal-qa-harness/collaboration_1c_c_behavioral.mjs /private/tmp/ourwed-internal-qa-harness-20261012/local.env
node scripts/test/internal-qa-harness/collaboration_1c_b_mobile_viewport.mjs
```

Before repeating the load, reset only the disposable database's `public` schema and remove its synthetic Auth users. Do not run a repository-wide migration reset as this project deliberately skips historical migrations.

The wrapper checks TAP output for assertion failures because `psql` can exit
successfully even when pgTAP has emitted `not ok` results.

For Auth Admin provisioning and the API matrix, load only the local `API_URL`, `SERVICE_ROLE_KEY`, and `ANON_KEY` from `local.env` into the process environment. Set `INTERNAL_QA_OPERATOR=local disposable QA harness` and `INTERNAL_QA_SKIP_KEYCHAIN=1`, then run:

```sh
./node_modules/.bin/tsx scripts/internal-qa/provision.ts QA-A
./node_modules/.bin/tsx scripts/internal-qa/provision.ts QA-B
./node_modules/.bin/tsx scripts/test/internal-qa-harness/run_auth_matrix.ts /private/tmp/ourwed-internal-qa-harness-20261012/local.env
```

The matrix uses only local GoTrue/Postgres and mock email callbacks. Its synthetic schema includes the released authenticated Collaboration invite/accept/end functions and a no-op notification sink. The browser viewport matrix mounts the actual React `Modal` with synthetic incoming, outgoing, and active Collaboration states at 390×844, 375×812, 393×852, and desktop sizes. The provisioner skips macOS Keychain writes only when the target is local and `INTERNAL_QA_SKIP_KEYCHAIN=1` is explicitly set.

For Collaboration 1C-A Auth and race verification, use the two standalone runners
below. They create ordinary temporary local Auth users, never Internal QA
accounts, and delete their local users and weddings in `finally` cleanup:

```sh
node scripts/test/internal-qa-harness/collaboration_1c_a_auth_integration.mjs /private/tmp/ourwed-internal-qa-harness-20261012/local.env
node scripts/test/internal-qa-harness/collaboration_1c_a_concurrency.mjs /private/tmp/ourwed-internal-qa-harness-20261012/local.env
```

The Auth/PostgREST runner verifies owner-readable synthetic rows and zero member
rows for contacts, notes, tasks, questionnaires and responses, documents and
drafts, calendar/timeline, wedding brief/places, operational times/completions,
extras, travel, contract generation/recovery, sessions, and payments at global
connection, pending invitation, and accepted membership stages.

For 1C-B the same loopback-only Auth/PostgREST runner also verifies the explicit
preview allowlist and invitee-only IDOR boundary, third-party and connected
collaborator denial, owner-only state RPC, invitee-only incoming list, safe
in-app notification creation, and unchanged zero wedding access. The viewport
fixture uses the production invitation layout stylesheet at 390×844, 375×812,
393×852, and desktop; it checks overflow, dynamic-height scrolling, and action
reachability. These commands target only the disposable local harness.

The concurrency runner opens separate `psql` sessions and holds the first
transaction's row locks briefly after its state transition. It covers the
seven existing 1C-A lifecycle races, opposite-direction extra reparenting,
both start orders for an extra mutation against wedding deletion,
both start orders for invitee and owner erasure against wedding acceptance, and
both start orders for global 1B invite decline/cancel against actor erasure.
Invitation expiry is covered by the permanent pgTAP regression. 1C-A has no
invitation preview/read RPC, and private invitation tables are not readable by
clients.

The 1C-C pgTAP matrix exercises active membership projections, stable date/id
pagination including undated weddings, same-wedding multi-member reads, active
account validation, owner/third-party/archived-wedding denial, curated location
and time fields, and unchanged direct wedding/child-table RLS boundaries.
It also exercises pending-only denial, lifecycle-RPC revocation, and active
wedding membership after the global connection has ended. The browser behavior
runner uses normal local Auth sessions, the real AuthProvider, collaboration
hooks/query keys/QueryClient and React list/detail pages; its RPC responses are
mocked to hold and then return unavailable during access revalidation. It
verifies cache clearing across owner/member identities and runs the viewport
matrix against the actual React detail page. A separate CSS fixture matrix is
kept for the 1C-C styles as a focused layout diagnostic.

For 1C-D, apply the additive migration to this disposable database after 1C-C,
then run the version-ledger, owner-DML, conflict/ABA, and direct-write tests:

```sh
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261013130000_collaboration_1c_d_operational_writes.sql
scripts/test/internal-qa-harness/run_pgtap.sh supabase/tests/collaboration_v1_1c_d_test.sql
sh scripts/test/internal-qa-harness/collaboration_1c_d_concurrency.sh
sh scripts/test/internal-qa-harness/collaboration_1c_d_lock_order_concurrency.sh
npm run test:collaboration-1c-d
npm run test:collaboration-1c-d-behavioral
```

The optimistic race runner creates one disposable local owner/member/wedding,
contends two authenticated RPC updates with the same expected generation, and
cleans the fixture afterward. Both 1C-D concurrency runners rely on the 1C-E
membership seed trigger for directly-created legacy fixture memberships. Run
them after applying 1C-E; set `OURWED_TEST_DATABASE` to a disposable replay DB
when the project `postgres` database is not yet at that migration. The variable
defaults to `postgres`. The lock-order runner uses two PostgreSQL sessions,
test-only pause triggers, and `pg_stat_activity`/blocking lock observations to
exercise recovery/address contention in both start orders; it never coordinates
the race by arbitrary sleeps. The browser test extends the existing local
AuthProvider/QueryClient harness with edit-state and mutation responses; it
checks draft preservation after conflict, refreshed retry, address/time edits,
access-loss cleanup, and the 390×844, 375×812, 393×852, and desktop editor
layouts.

For 1C-E, replay the additive permission-foundation migration after 1C-D and
run the frozen authority/read projection and invitation-configuration matrix:

```sh
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261014100000_collaboration_1c_e_permission_foundation.sql
scripts/test/internal-qa-harness/run_pgtap.sh supabase/tests/collaboration_1c_e_permission_foundation_test.sql
sh scripts/test/internal-qa-harness/collaboration_1c_e_migration_acceptance_race.sh
```

The migration race runner builds two fresh local database replays from the
synthetic baseline through 1C-D. It pauses the actual migration and acceptance
RPC at deterministic PostgreSQL lock points, then checks both start orders for
deadlocks, partial DDL, duplicate lifecycle rows, and the exact three-grant
legacy permission snapshot. It uses only the disposable local Supabase database
container and keeps its replay databases for inspection; the next run rebuilds
them from scratch.

For Collaboration 1C-H1, apply the four additive migrations after 1C-G, then
run the workspace/authority pgTAP matrix and the place-name optimistic race:

```sh
scripts/test/internal-qa-harness/run_pgtap.sh supabase/tests/collaboration_1c_h1_workspace_authority_test.sql
sh scripts/test/internal-qa-harness/collaboration_1c_h1_name_concurrency.sh
```

The H1 race creates one disposable local owner/member/wedding with explicit v2
name authority, issues two concurrent renames against one expected generation,
and requires one commit plus one stale-version conflict. It removes only its
fixed synthetic identities and wedding in cleanup. The lock-order runner uses
legacy v1 memberships without activating Plan Day; v1 operational-time
behavior remains available. In H1, Plan Day gates operational time only for
mapping-v2 memberships and stays inactive until a later phase explicitly
activates that canonical parent capability.
