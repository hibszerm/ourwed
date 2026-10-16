#!/usr/bin/env bash
set -euo pipefail

db_container=${1:-${OURWED_FROZEN_DB_CONTAINER:-}}
database=${2:-${OURWED_TEST_DATABASE:-postgres}}
if [[ "$db_container" != "supabase_db_ourwed-collab-harness-1016" ]]; then
  echo "Refusing non-dedicated disposable database container: ${db_container:-<unset>}" >&2
  exit 2
fi

missing=$(docker exec "$db_container" psql -U postgres -d "$database" -Atq -v ON_ERROR_STOP=1 <<'SQL'
with required(table_name, column_name, data_type) as (
  values
    ('wedding_questionnaires','id','uuid'),
    ('wedding_questionnaires','wedding_id','uuid'),
    ('wedding_questionnaires','owner_id','uuid'),
    ('wedding_questionnaires','title','text'),
    ('wedding_questionnaires','introduction','text'),
    ('wedding_questionnaires','schema_snapshot_json','jsonb'),
    ('wedding_questionnaires','prefill_json','jsonb'),
    ('wedding_questionnaires','status','text'),
    ('wedding_questionnaires','public_token_hash','text'),
    ('wedding_questionnaires','prepared_at','timestamp with time zone'),
    ('wedding_questionnaires','sent_at','timestamp with time zone'),
    ('wedding_questionnaires','first_opened_at','timestamp with time zone'),
    ('wedding_questionnaires','last_saved_at','timestamp with time zone'),
    ('wedding_questionnaires','submitted_at','timestamp with time zone'),
    ('wedding_questionnaires','reopened_at','timestamp with time zone'),
    ('wedding_questionnaires','created_at','timestamp with time zone'),
    ('wedding_questionnaires','updated_at','timestamp with time zone'),
    ('wedding_questionnaire_responses','id','uuid'),
    ('wedding_questionnaire_responses','questionnaire_id','uuid'),
    ('wedding_questionnaire_responses','answers_json','jsonb'),
    ('wedding_questionnaire_responses','answered_required','integer'),
    ('wedding_questionnaire_responses','total_required','integer'),
    ('wedding_questionnaire_responses','submitted_at','timestamp with time zone'),
    ('wedding_questionnaire_responses','collaboration_revision','bigint'),
    ('wedding_operational_times','wedding_id','uuid'),
    ('wedding_operational_times','stop_key','text'),
    ('wedding_operational_times','operational_time','text'),
    ('wedding_operational_times','updated_by_user_id','uuid'),
    ('wedding_operational_times','updated_source','text')
)
select format('%I.%I expected %s', r.table_name, r.column_name, r.data_type)
from required r
left join information_schema.columns c
  on c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name
where c.column_name is null or c.data_type<>r.data_type
union all
select 'missing collaboration_private.wedding_operational_versions'
where to_regclass('collaboration_private.wedding_operational_versions') is null;
SQL
)

if [[ -n "$missing" ]]; then
  printf 'Frozen Pre-Wedding schema check failed:\n%s\n' "$missing" >&2
  exit 1
fi

echo "Frozen Pre-Wedding schema check passed."
