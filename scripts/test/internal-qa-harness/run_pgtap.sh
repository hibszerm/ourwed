#!/bin/sh
set -eu

test_file=${1:?usage: run_pgtap.sh path/to/test.sql}
db_container=${OURWED_TEST_DB_CONTAINER:-supabase_db_ourwed-internal-qa-harness-20261012}
database=${OURWED_TEST_DATABASE:-postgres}
log_file=$(mktemp /private/tmp/ourwed-pgtap.XXXXXX)
trap 'rm -f "$log_file"' EXIT HUP INT TERM

if docker exec -i "$db_container" psql -X -U postgres -d "$database" \
  -v ON_ERROR_STOP=1 -c 'set search_path=extensions,public;' -f - < "$test_file" > "$log_file" 2>&1; then
  cat "$log_file"
else
  cat "$log_file"
  exit 1
fi

if grep -Eq '(^|[[:space:]])not ok([[:space:]]|$)|Looks like you failed' "$log_file"; then
  exit 1
fi

if ! grep -q 'finish' "$log_file"; then
  echo 'pgTAP output did not include finish()' >&2
  exit 1
fi
