#!/bin/sh
set -eu

test_file=${1:?usage: run_pgtap.sh path/to/test.sql}
frozen_db_container=supabase_db_ourwed-collab-harness-1016
legacy_db_container=supabase_db_ourwed-internal-qa-harness-20261012
case "${test_file##*/}" in
  collaboration_v3_prewedding_shared_test.sql|\
  collaboration_v3_six_area_foundation_test.sql|\
  collaboration_1c_h3_detail_authority_test.sql|\
  collaboration_1c_h3_shared_identity_projection_test.sql|\
  collaboration_1c_h1_workspace_authority_test.sql|\
  collaboration_v3_logistics_test.sql)
    if [[ -n ${OURWED_TEST_DB_CONTAINER:-} && "$OURWED_TEST_DB_CONTAINER" != "$frozen_db_container" ]]; then
      echo "Refusing to run a frozen Collaboration suite against a non-frozen database container: $OURWED_TEST_DB_CONTAINER" >&2
      exit 2
    fi
    db_container=$frozen_db_container
    ;;
  *)
    db_container=${OURWED_TEST_DB_CONTAINER:-$legacy_db_container}
    ;;
esac
database=${OURWED_TEST_DATABASE:-postgres}
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
log_file=$(mktemp /private/tmp/ourwed-pgtap.XXXXXX)
trap 'rm -f "$log_file"' EXIT HUP INT TERM

if [[ "$db_container" == "$frozen_db_container" ]]; then
  bash "$script_dir/assert_frozen_db_network_isolation.sh" "$db_container"
fi

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
