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
```

Before repeating the load, reset only the disposable database's `public` schema and remove its synthetic Auth users. Do not run a repository-wide migration reset as this project deliberately skips historical migrations.

Run the existing pgTAP suite with the extension schema on the path:

```sh
docker exec -i supabase_db_ourwed-internal-qa-harness-20261012 psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'set search_path=extensions,public;' -f - < supabase/tests/internal_qa_accounts_test.sql
```

For Auth Admin provisioning and the API matrix, load only the local `API_URL`, `SERVICE_ROLE_KEY`, and `ANON_KEY` from `local.env` into the process environment. Set `INTERNAL_QA_OPERATOR=local disposable QA harness` and `INTERNAL_QA_SKIP_KEYCHAIN=1`, then run:

```sh
./node_modules/.bin/tsx scripts/internal-qa/provision.ts QA-A
./node_modules/.bin/tsx scripts/internal-qa/provision.ts QA-B
./node_modules/.bin/tsx scripts/test/internal-qa-harness/run_auth_matrix.ts /private/tmp/ourwed-internal-qa-harness-20261012/local.env
```

The matrix uses only local GoTrue/Postgres and mock email callbacks. Its synthetic schema includes the released authenticated Collaboration invite/accept functions and a no-op notification sink. The browser viewport matrix mounts the actual React `Modal` with synthetic incoming, outgoing, and active Collaboration states at 390×844, 375×812, 393×852, and desktop sizes. The provisioner skips macOS Keychain writes only when the target is local and `INTERNAL_QA_SKIP_KEYCHAIN=1` is explicitly set.
