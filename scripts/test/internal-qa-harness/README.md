# Internal QA local Supabase harness

This is test-only tooling. `build_baseline.py` extracts current account and Collaboration 1B definitions from committed canonical migrations and adds synthetic fixtures. Its output is SQL for a disposable database; it is not a Supabase migration and must not be copied into `supabase/migrations`.

## Recreate the local harness

Use a separate project directory and CLI home under `/private/tmp`. Initialize a local Supabase project, then set its `project_id` to `ourwed-internal-qa-harness-20261012`, API port to `56321`, database port to `56322`, and shadow port to `56320`. In that project's `supabase/config.toml`, disable database migrations and seeds and set Auth email confirmations off. Keep `HOME`, `XDG_CONFIG_HOME`, and `XDG_CACHE_HOME` inside a dedicated `/private/tmp` home.

Start that project with Supabase CLI 2.109.1 or a compatible local stack. Confirm its URLs are `http://127.0.0.1:56321` and `postgresql://postgres:postgres@127.0.0.1:56322/postgres`, and its project ID is the dedicated harness ID before writing anything. Save `supabase status --output env` to a mode-600 `local.env` under the harness directory.

From the repository root, generate and load the fixture, then apply the released Internal QA migration followed by the local entitlement fix under test:

```sh
python3 scripts/test/internal-qa-harness/build_baseline.py > /private/tmp/ourwed-internal-qa-harness-20261012/current_baseline.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /private/tmp/ourwed-internal-qa-harness/current_baseline.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261012154736_internal_qa_accounts.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261012175953_internal_qa_pro_entitlement_gate.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261012193244_collaboration_1c_a_wedding_lifecycle_foundation.sql
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261012212404_collaboration_1c_b_secure_invitation_reads.sql
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
