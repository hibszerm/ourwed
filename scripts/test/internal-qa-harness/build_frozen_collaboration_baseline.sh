#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../../.." && pwd)
db_container=${1:-${OURWED_FROZEN_DB_CONTAINER:-}}
if [[ "$db_container" != "supabase_db_ourwed-collab-harness-1016" ]]; then
  echo "Refusing baseline build against non-dedicated container: ${db_container:-<unset>}" >&2
  exit 2
fi

bash "$repo_root/scripts/test/internal-qa-harness/assert_frozen_db_network_isolation.sh" "$db_container"

db_name=$(docker exec "$db_container" psql -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 -c 'select current_database()')
if [[ "$db_name" != postgres ]]; then
  echo "Refusing unexpected database name: $db_name" >&2
  exit 2
fi

verify_hash() {
  local path=$1 expected=$2 actual
  actual=$(shasum -a 256 "$repo_root/supabase/migrations/$path" | awk '{print $1}')
  if [[ "$actual" != "$expected" ]]; then
    echo "Frozen migration hash mismatch: $path ($actual)" >&2
    exit 1
  fi
}

verify_hash 20261015130000_collaboration_1c_h1_workspace_authority.sql 67fe13be835abd1cb3bc2fe70c9a6b1a0959ae69c56b0026f81dd6324ad7923a
verify_hash 20261015133000_collaboration_1c_h1_place_name_authority.sql b81b0c1c3ad12be04243dff7dd78230961d619d5de5a23b8906940fe5d1b1242
verify_hash 20261015140000_collaboration_1c_h1_mapping_activation.sql ff30671e1aca46e26541efff94499d0f3d4756620ddf6b4b51758617fc3127d1
verify_hash 20261015143000_collaboration_1c_h1_versioned_access_dto.sql 9c20996f02e1097acd20b64e6ee60b967920e30f535ca29020e2260eb16ab78c
verify_hash 20261016100000_collaboration_1c_h3_detail_authority.sql a47b437b173dd6df7afff28cf77f6b35f76bca5c7156d8bef3a2b26684a96a73
verify_hash 20261016101826_collaboration_v3_six_area_authority_management.sql 63038cc4c2ec4985e2cc201624553c2bc18fc207034959147310428ee4b7a5f1
verify_hash 20261016103000_collaboration_1c_h3_shared_identity_projection.sql 1b90ceaa574410ef090ab0d279efb0a6bb2a9b22810bf83c3d4482ef392a58ae
verify_hash 20261016115805_collaboration_v3_logistics.sql 4eda5a51010734421c6a07a642a4445d175b147ffb17c90b91f36507d19e51a4
verify_hash 20261016132505_collaboration_v3_prewedding_shared.sql 695c3532a05f042af2f74e998e8a0e39c5de15c648b19a519883e56a96ab29aa

if [[ -n $(docker exec "$db_container" psql -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 -c "select to_regclass('public.wedding_questionnaires')") ]]; then
  echo "Refusing a non-fresh database: public.wedding_questionnaires already exists" >&2
  exit 2
fi

tmpdir=$(mktemp -d "/private/tmp/ourwed-frozen-baseline.XXXXXX")
trap 'rm -rf "$tmpdir"' EXIT
python3 "$repo_root/scripts/test/internal-qa-harness/build_baseline.py" > "$tmpdir/current_baseline.sql"

docker exec -i "$db_container" psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 < "$tmpdir/current_baseline.sql"

migrations=(
  20260722160000_repair_multi_tenant_ownership.sql
  20260723180000_studio_details.sql
  20260725180000_contract_questionnaire_config.sql
  20260728160000_wedding_contract_recovery.sql
  20260729180000_prewedding_public_studio_branding.sql
  20260729200000_prewedding_questionnaire.sql
  20260729210000_prewedding_pgcrypto_search_path.sql
  20260729220000_prewedding_public_studio_branding_restore.sql
  20260729230000_questionnaire_template_library_types.sql
  20260730140000_prewedding_allow_resubmit.sql
  20260811250000_pro_questionnaire_mutation_gate.sql
  20260811260000_notification_engine.sql
  20260811270000_notification_engine_submit_hooks.sql
  20260812120000_fix_notification_wedding_date.sql
  20260813120000_wedding_operational_times.sql
  20260816190000_founder_brand_purge.sql
  20260824220000_official_pre_wedding_presets_v1.sql
  20260907210000_public_questionnaire_privacy_controller.sql
  20261006214925_source_contract_atomic_apply.sql
  20261007171734_source_contract_apply_partner_answers.sql
  20261012193244_collaboration_1c_a_wedding_lifecycle_foundation.sql
  20261012212404_collaboration_1c_b_secure_invitation_reads.sql
  20261013103640_collaboration_1c_b_invite_from_connection.sql
  20261013113439_collaboration_1c_c_curated_reads.sql
  20261013130000_collaboration_1c_d_operational_writes.sql
  20261014100000_collaboration_1c_e_permission_foundation.sql
  20261014150000_collaboration_1c_f_owner_access_management.sql
  20261015100000_collaboration_1c_g_permission_presets.sql
  20261015130000_collaboration_1c_h1_workspace_authority.sql
  20261015133000_collaboration_1c_h1_place_name_authority.sql
  20261015140000_collaboration_1c_h1_mapping_activation.sql
  20261015143000_collaboration_1c_h1_versioned_access_dto.sql
  20261016100000_collaboration_1c_h3_detail_authority.sql
  20261016101826_collaboration_v3_six_area_authority_management.sql
  20261016103000_collaboration_1c_h3_shared_identity_projection.sql
  20261016115805_collaboration_v3_logistics.sql
  20261016132505_collaboration_v3_prewedding_shared.sql
)

for migration in "${migrations[@]}"; do
  migration_path="$repo_root/supabase/migrations/$migration"
  if [[ ! -f "$migration_path" ]]; then
    echo "Missing canonical migration: $migration_path" >&2
    exit 1
  fi
  echo "Applying $migration"
  docker exec -i "$db_container" psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 < "$migration_path"
done

bash "$repo_root/scripts/test/internal-qa-harness/assert_frozen_pre_wedding_schema.sh" "$db_container"
