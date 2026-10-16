#!/usr/bin/env bash
set -euo pipefail

project_dir=${OURWED_FROZEN_SUPABASE_DIR:-/private/tmp/ourwed-collaboration-harness-repair-20261016}
project_id=ourwed-collab-harness-1016
db_container=supabase_db_${project_id}
supabase_cli=${SUPABASE_CLI:-/Users/marcin/.local/share/supabase/supabase}
script_dir=$(cd "$(dirname "$0")" && pwd)

if [[ ! -x "$supabase_cli" ]]; then
  echo "Supabase CLI is unavailable at the configured local path." >&2
  exit 2
fi

python3 "$script_dir/start_supabase_with_frozen_loopback.py" "$supabase_cli" start \
  --workdir "$project_dir" \
  --exclude edge-runtime,imgproxy,kong,logflare,mailpit,postgres-meta,postgrest,realtime,storage-api,studio,supavisor,vector \
  --yes

# The guarded CLI must create exactly the disposable DB and bind PostgreSQL
# to loopback. The post-start check independently inspects the actual mapping.
bash "$script_dir/assert_frozen_db_network_isolation.sh" "$db_container"

ready=false
for attempt in $(seq 1 90); do
  if docker exec "$db_container" psql -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 -c 'select 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo "The isolated disposable PostgreSQL container did not become queryable via docker exec." >&2
  exit 1
fi
echo "Disposable collaboration database is ready with a loopback-only PostgreSQL port."
