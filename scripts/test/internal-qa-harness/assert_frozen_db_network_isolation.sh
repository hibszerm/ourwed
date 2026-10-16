#!/usr/bin/env bash
set -euo pipefail

db_container=${1:-${OURWED_TEST_DB_CONTAINER:-}}
expected_container=supabase_db_ourwed-collab-harness-1016
if [[ "$db_container" != "$expected_container" ]]; then
  echo "Refusing non-dedicated disposable database container: ${db_container:-<unset>}" >&2
  exit 2
fi

matches=$(docker ps -a --filter "label=com.supabase.cli.project=ourwed-collab-harness-1016" --format '{{.Names}}')
db_count=$(printf '%s\n' "$matches" | awk -v expected="$expected_container" '$0 == expected { count++ } END { print count+0 }')
if [[ "$db_count" != 1 ]]; then
  echo "Expected exactly one database container for the disposable project; found missing or duplicate DB identity." >&2
  exit 1
fi
while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  case "$name" in
    "$expected_container"|supabase_auth_ourwed-collab-harness-1016) ;;
    *) echo "Unexpected project container is present: $name" >&2; exit 1 ;;
  esac
done <<< "$matches"

mapping=$(docker inspect --format '{{json .NetworkSettings.Ports}}' "$db_container")
labels=$(docker inspect --format '{{json .Config.Labels}}' "$db_container")
python3 - "$mapping" "$labels" <<'PY'
import json
import sys

try:
    ports = json.loads(sys.argv[1])
    labels = json.loads(sys.argv[2])
except (IndexError, json.JSONDecodeError) as exc:
    print(f"Cannot inspect database port publication safely: {exc}", file=sys.stderr)
    raise SystemExit(1)

expected = {
    "com.docker.compose.project": "ourwed-collab-harness-1016",
    "com.supabase.cli.project": "ourwed-collab-harness-1016",
}
if not isinstance(labels, dict) or any(labels.get(key) != value for key, value in expected.items()):
    print("Database network safety check failed: exact disposable project labels are absent.", file=sys.stderr)
    raise SystemExit(1)

if not isinstance(ports, dict):
    print("Cannot inspect database port publication safely: unexpected Docker response", file=sys.stderr)
    raise SystemExit(1)

bindings = ports.get("5432/tcp")
if bindings is None or bindings == []:
    print("Database network safety check failed: expected loopback-only host publication is absent.", file=sys.stderr)
    raise SystemExit(1)

if not isinstance(bindings, list) or not bindings:
    print("Database network safety check failed: malformed PostgreSQL port mapping.", file=sys.stderr)
    raise SystemExit(1)

allowed = {"127.0.0.1"}
observed = []
for binding in bindings:
    if not isinstance(binding, dict):
        print("Database network safety check failed: malformed PostgreSQL binding.", file=sys.stderr)
        raise SystemExit(1)
    host_ip = binding.get("HostIp")
    host_port = binding.get("HostPort")
    if not isinstance(host_ip, str) or not isinstance(host_port, str) or not host_port.isdigit():
        print("Database network safety check failed: incomplete PostgreSQL binding.", file=sys.stderr)
        raise SystemExit(1)
    observed.append(f"{host_ip}:{host_port}")
    if host_ip not in allowed:
        print(
            f"Database network safety check failed: non-loopback PostgreSQL publication {host_ip}:{host_port}.",
            file=sys.stderr,
        )
        raise SystemExit(1)

print("Database network safety check passed: loopback-only PostgreSQL publication " + ", ".join(observed) + ".")
PY

if docker inspect supabase_auth_ourwed-collab-harness-1016 >/dev/null 2>&1; then
  auth_meta=$(docker inspect supabase_auth_ourwed-collab-harness-1016 --format '{{json .Config.Labels}} {{.Config.Image}} {{.HostConfig.NetworkMode}} {{json .NetworkSettings.Ports}}')
  python3 - "$auth_meta" <<'PY'
import json
import sys

try:
    labels_text, image, network_mode, ports_text = sys.argv[1].split(" ", 3)
    labels = json.loads(labels_text)
    ports = json.loads(ports_text)
except (IndexError, ValueError, json.JSONDecodeError) as exc:
    print(f"Auth schema initializer metadata could not be verified: {exc}", file=sys.stderr)
    raise SystemExit(1)

expected_labels = {
    "com.docker.compose.project": "ourwed-collab-harness-1016",
    "com.supabase.cli.project": "ourwed-collab-harness-1016",
}
if any(labels.get(key) != value for key, value in expected_labels.items()):
    print("Auth schema initializer has unexpected project labels.", file=sys.stderr)
    raise SystemExit(1)
if image != "public.ecr.aws/supabase/gotrue:v2.192.0":
    print("Auth schema initializer image is not the pinned local Supabase image.", file=sys.stderr)
    raise SystemExit(1)
if network_mode != "supabase_network_ourwed-collab-harness-1016":
    print("Auth schema initializer is outside the disposable project network.", file=sys.stderr)
    raise SystemExit(1)
if not isinstance(ports, dict) or any(bindings not in (None, []) for bindings in ports.values()):
    print("Auth schema initializer unexpectedly publishes host ports.", file=sys.stderr)
    raise SystemExit(1)
print("Auth schema initializer is confined to the exact disposable project network with no host port.")
PY
fi
