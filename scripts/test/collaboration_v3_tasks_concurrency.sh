#!/usr/bin/env bash
set -euo pipefail

db_container=${OURWED_TEST_DB_CONTAINER:-}
expected_container=supabase_db_ourwed-collab-harness-1016
if [[ "$db_container" != "$expected_container" ]]; then
  echo "Refusing non-dedicated Tasks race database: ${db_container:-<unset>}" >&2
  exit 2
fi
script_dir=$(cd "$(dirname "$0")" && pwd)
bash "$script_dir/internal-qa-harness/assert_frozen_db_network_isolation.sh" "$db_container"
tmpdir=$(mktemp -d /private/tmp/ourwed-tasks-race.XXXXXX)
owner=e9110000-0000-4000-8000-000000000001
member=e9110000-0000-4000-8000-000000000002
wedding=e9120000-0000-4000-8000-000000000001
connection=e9130000-0000-4000-8000-000000000001
invite_key=e9140000-0000-4000-8000-000000000001
invite_accept_key=e9140000-0000-4000-8000-000000000002
task=e9150000-0000-4000-8000-000000000001

cleanup() {
  docker exec -i "$db_container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL >/dev/null 2>&1 || true
drop trigger if exists collaboration_v3_tasks_test_pause on public.tasks;
drop function if exists collaboration_private.collaboration_v3_tasks_test_pause();
delete from public.tasks where id='$task';
delete from public.wedding_collaboration_memberships where wedding_id='$wedding';
delete from public.wedding_collaboration_invitations where wedding_id='$wedding';
delete from public.collaboration_connections where id='$connection';
delete from public.weddings where id='$wedding';
delete from auth.users where id in ('$owner','$member');
SQL
  rm -rf "$tmpdir"
}
trap cleanup EXIT
cleanup
mkdir -p "$tmpdir"

docker exec -i "$db_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','$owner','authenticated','authenticated','tasks-race-owner@example.test','x',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','$member','authenticated','authenticated','tasks-race-member@example.test','x',now(),'{}','{}',now(),now());
insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status)
values ('$wedding','$owner','Tasks','Race','2027-08-01','active');
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,participant_low_name_snapshot,participant_high_name_snapshot,status)
values ('$connection','$owner','$member','Task Race Owner','Task Race Member','active');
set role authenticated;
select set_config('request.jwt.claim.sub','$owner',false);
select set_config('test.tasks_race_invitation',public.create_wedding_collaboration_invitation_v3('$wedding','$connection',null,'$invite_key','system:photographer',null,'custom','{"logistics":0,"prewedding":0,"contacts":0,"tasks":2,"notes":0,"compensation":0}'::jsonb)->>'invitation_id',false);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','$member',false);
select public.accept_wedding_collaboration_invite(current_setting('test.tasks_race_invitation')::uuid,'$invite_accept_key');
reset role;
insert into public.tasks(id,user_id,wedding_id,title,due_date)
values ('$task','$owner','$wedding','Tasks concurrency','2027-01-01');
create function collaboration_private.collaboration_v3_tasks_test_pause()
returns trigger language plpgsql set search_path = '' as \$\$
begin
  if new.id='e9150000-0000-4000-8000-000000000001'::uuid then perform pg_catalog.pg_sleep(0.8); end if;
  return new;
end \$\$;
create trigger collaboration_v3_tasks_test_pause before update on public.tasks
for each row execute function collaboration_private.collaboration_v3_tasks_test_pause();
SQL

run_writer() {
  local app=$1 output=$2 action=$3 expected=$4 title=$5
  local title_sql=null
  if [[ -n "$title" ]]; then title_sql="'$title'"; fi
  docker exec -i "$db_container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -At <<SQL >"$output" 2>&1
begin;
set local role authenticated;
set local application_name='$app';
select set_config('request.jwt.claim.sub','$member',true);
select public.mutate_my_collaborative_task_v3('$action','$wedding','1','$task','$expected',$title_sql,null);
commit;
SQL
}

run_pair() {
  local label=$1 app_a=$2 app_b=$3 action_a=$4 action_b=$5 expected=$6 next=$7 title_a=$8 title_b=$9
  run_writer "$app_a" "$tmpdir/a.out" "$action_a" "$expected" "$title_a" & pid_a=$!
  first_active=false
  for attempt in $(seq 1 80); do
    active=$(docker exec "$db_container" psql -X -q -U postgres -d postgres -Atc "select count(*) from pg_stat_activity where application_name='$app_a' and state='active' and query like '%mutate_my_collaborative_task_v3%'")
    if [[ "$active" == 1 ]]; then first_active=true; break; fi
    sleep 0.05
  done
  if [[ "$first_active" != true ]]; then
    echo "First $label writer did not reach the synchronized mutation point." >&2
    return 1
  fi
  run_writer "$app_b" "$tmpdir/b.out" "$action_b" "$expected" "$title_b" & pid_b=$!
  set +e
  wait "$pid_a"; status_a=$?
  wait "$pid_b"; status_b=$?
  set -e
  successes=0
  conflicts=0
  for result in "$tmpdir/a.out" "$tmpdir/b.out"; do
    if grep -q "\"revision\": \"$next\"" "$result"; then successes=$((successes + 1)); fi
    if grep -q 'CONFLICT' "$result"; then conflicts=$((conflicts + 1)); fi
  done
  if [[ "$successes" != 1 || "$conflicts" != 1 ]]; then
    cat "$tmpdir/a.out" "$tmpdir/b.out" >&2
    echo "Expected exactly one $label success and one normalized CONFLICT." >&2
    return 1
  fi
  if [[ $((status_a + status_b)) == 0 || $((status_a + status_b)) == 2 ]]; then
    echo "Unexpected $label writer exit status pattern: $status_a / $status_b" >&2
    return 1
  fi
  echo "Tasks concurrency PASS: $label used revision $expected; one committed revision $next, one returned CONFLICT."
}

run_pair "same-revision edits" tasks-v3-race-a tasks-v3-race-b update update 1 2 'Race winner' 'Race winner'
run_pair "complete versus edit" tasks-v3-race-c tasks-v3-race-d complete update 2 3 '' 'Race winner after completion'
