#!/bin/sh
set -eu
container=${OURWED_TEST_DB_CONTAINER:?set to the unique disposable Supabase DB container}
db=${OURWED_TEST_DATABASE:-postgres}
owner=$(uuidgen | tr '[:upper:]' '[:lower:]')
work=$(mktemp -d /private/tmp/ourwed-1cg-concurrency.XXXXXX)
gate_pid=
gate_fd_open=0

sql() { docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -Atc "$1"; }
cleanup() {
  result=$?
  if [ "$gate_fd_open" -eq 1 ]; then printf 'commit;\n' >&3 2>/dev/null || true; exec 3>&- 2>/dev/null || true; fi
  if [ -n "$gate_pid" ]; then wait "$gate_pid" 2>/dev/null || true; fi
  docker exec -i "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL || result=1
drop trigger if exists _1cg_pause_insert on collaboration_private.permission_presets;
drop trigger if exists _1cg_pause_update on collaboration_private.permission_presets;
drop function if exists public._1cg_test_pause_preset();
delete from collaboration_private.permission_presets where owner_user_id='$owner';
delete from auth.users where id='$owner';
SQL
  if [ "$result" -eq 0 ]; then rm -rf "$work"; else echo "1C-G race logs retained at $work" >&2; fi
  return "$result"
}
trap cleanup EXIT HUP INT TERM

if [ "$(sql "select count(*) from auth.users where id='$owner'")" != 0 ]; then echo 'fixture UUID collision' >&2; exit 1; fi
docker exec -i "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,
  raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','$owner','authenticated','authenticated','1cg-race-$owner@example.test','x',now(),'{}',
  '{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());
create function public._1cg_test_pause_preset() returns trigger language plpgsql set search_path='' as \$\$
begin
 if pg_catalog.current_setting('application_name',true)=tg_argv[0] and new.name=tg_argv[1]
 then perform pg_catalog.pg_advisory_xact_lock(28657,tg_argv[2]::integer); end if;
 return new;
end; \$\$;
SQL

start_gate() {
  key=$1; fifo="$work/gate-$key.fifo"; mkfifo "$fifo"
  docker exec -i -e PGAPPNAME=1cg-gate "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 < "$fifo" >"$work/gate-$key.log" 2>&1 & gate_pid=$!
  exec 3>"$fifo"; gate_fd_open=1
  printf "begin; select pg_catalog.pg_advisory_xact_lock(28657,$key); select 'GATE_READY';\n" >&3
  i=0; while [ "$i" -lt 200 ]; do
    [ "$(sql "select count(*) from pg_stat_activity where application_name='1cg-gate' and state='idle in transaction'")" -ge 1 ] && return 0
    i=$((i+1)); sleep 0.05
  done
  echo 'FAIL gate transaction did not become ready' >&2; return 1
}
release_gate() { printf 'commit;\n' >&3; exec 3>&-; gate_fd_open=0; wait "$gate_pid"; gate_pid=; }
wait_lock() {
  app=$1; i=0
  while [ "$i" -lt 300 ]; do
    [ "$(sql "select count(*) from pg_stat_activity where application_name='$app' and wait_event_type='Lock'")" -ge 1 ] && return 0
    i=$((i+1)); sleep 0.05
  done
  sql "select application_name,state,wait_event_type,wait_event from pg_stat_activity where application_name like '1cg-%'" >&2
  echo "FAIL $app did not reach a PostgreSQL lock barrier" >&2; return 1
}
start_actor() {
  app=$1; statement=$2; log=$3
  docker exec -i -e "PGAPPNAME=$app" "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 >"$work/$log" 2>&1 <<SQL &
set lock_timeout='15s'; set statement_timeout='25s'; begin; set local role authenticated;
select set_config('request.jwt.claim.sub','$owner',true);
$statement
commit;
SQL
  actor_pid=$!
}

# Same case-insensitive name: the first insert holds its unique-index entry
# after insertion; the second request must wait, then return CONFLICT.
docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c \
  "create trigger _1cg_pause_insert after insert on collaboration_private.permission_presets for each row execute function public._1cg_test_pause_preset('1cg-create-first','Same Race Name','701')" >/dev/null
start_gate 701
start_actor 1cg-create-first "select public.create_collaboration_permission_preset('Same Race Name',null,'[]'::jsonb);" create-first.log
first_pid=$actor_pid; wait_lock 1cg-create-first
start_actor 1cg-create-second "select public.create_collaboration_permission_preset('same race name',null,'[]'::jsonb);" create-second.log
second_pid=$actor_pid; wait_lock 1cg-create-second
release_gate; wait "$first_pid"
second_status=0; wait "$second_pid" || second_status=$?
[ "$second_status" -ne 0 ] && rg -q 'CONFLICT' "$work/create-second.log"
[ "$(sql "select count(*) from collaboration_private.permission_presets where owner_user_id='$owner' and lower(name)=lower('Same Race Name') and archived_at is null")" = 1 ]
echo 'PASS 1C-G simultaneous active-name create: exactly one succeeds; loser receives CONFLICT'
docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'drop trigger _1cg_pause_insert on collaboration_private.permission_presets' >/dev/null

make_preset() {
  name=$1
  sql "set role authenticated; set request.jwt.claim.sub='$owner'; select public.create_collaboration_permission_preset('$name',null,'[{\"capability_key\":\"wedding.identity\",\"level\":1},{\"capability_key\":\"places.address\",\"level\":1},{\"capability_key\":\"schedule.operational_time\",\"level\":1}]'::jsonb)->>'preset_id'" | tail -1
}

# Concurrent updates from version 1: the first row update pauses after locking;
# the second waits, then observes version 2 and returns CONFLICT.
update_id=$(make_preset 'Update Race')
docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c \
  "create trigger _1cg_pause_update after update on collaboration_private.permission_presets for each row execute function public._1cg_test_pause_preset('1cg-update-first','Update Winner','702')" >/dev/null
start_gate 702
start_actor 1cg-update-first "select public.update_collaboration_permission_preset('$update_id','1','Update Winner',null,'[{\"capability_key\":\"wedding.identity\",\"level\":1}]'::jsonb);" update-first.log
first_pid=$actor_pid; wait_lock 1cg-update-first
start_actor 1cg-update-second "select public.update_collaboration_permission_preset('$update_id','1','Update Loser',null,'[]'::jsonb);" update-second.log
second_pid=$actor_pid; wait_lock 1cg-update-second
release_gate; wait "$first_pid"
second_status=0; wait "$second_pid" || second_status=$?
[ "$second_status" -ne 0 ] && rg -q 'CONFLICT' "$work/update-second.log"
[ "$(sql "select name||':'||version::text from collaboration_private.permission_presets where id='$update_id'")" = 'Update Winner:2' ]
echo 'PASS 1C-G concurrent update/update serializes; stale writer receives CONFLICT'
docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'drop trigger _1cg_pause_update on collaboration_private.permission_presets' >/dev/null

# Update/archive uses the same row lock. The update commits version 2 first;
# the archive using version 1 then conflicts without archiving the row.
archive_id=$(make_preset 'Archive Race')
docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c \
  "create trigger _1cg_pause_update after update on collaboration_private.permission_presets for each row execute function public._1cg_test_pause_preset('1cg-update-archive','Updated Before Archive','703')" >/dev/null
start_gate 703
start_actor 1cg-update-archive "select public.update_collaboration_permission_preset('$archive_id','1','Updated Before Archive',null,'[]'::jsonb);" update-archive-first.log
first_pid=$actor_pid; wait_lock 1cg-update-archive
start_actor 1cg-archive-second "select public.archive_collaboration_permission_preset('$archive_id','1');" update-archive-second.log
second_pid=$actor_pid; wait_lock 1cg-archive-second
release_gate; wait "$first_pid"
second_status=0; wait "$second_pid" || second_status=$?
[ "$second_status" -ne 0 ] && rg -q 'CONFLICT' "$work/update-archive-second.log"
[ "$(sql "select version::text||':'||(archived_at is null)::text from collaboration_private.permission_presets where id='$archive_id'")" = '2:true' ]
echo 'PASS 1C-G update/archive serializes to one active version; stale archive receives CONFLICT'
docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'drop trigger _1cg_pause_update on collaboration_private.permission_presets' >/dev/null

# Duplicate vs update: duplicate holds FOR SHARE on source while paused after
# creating its new row. Update waits; duplicate copies the complete v1 grants.
source_id=$(make_preset 'Duplicate Update Source')
docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c \
  "create trigger _1cg_pause_insert after insert on collaboration_private.permission_presets for each row execute function public._1cg_test_pause_preset('1cg-duplicate-update','Duplicate Update Copy','704')" >/dev/null
start_gate 704
start_actor 1cg-duplicate-update "select public.duplicate_collaboration_permission_preset('$source_id','Duplicate Update Copy',null);" duplicate-update-first.log
first_pid=$actor_pid; wait_lock 1cg-duplicate-update
start_actor 1cg-source-update "select public.update_collaboration_permission_preset('$source_id','1','Source Updated',null,'[{\"capability_key\":\"wedding.identity\",\"level\":1}]'::jsonb);" source-update-second.log
second_pid=$actor_pid; wait_lock 1cg-source-update
release_gate; wait "$first_pid"; wait "$second_pid"
duplicate_id=$(sql "select id from collaboration_private.permission_presets where owner_user_id='$owner' and name='Duplicate Update Copy'")
[ "$(sql "select string_agg(capability_key||'='||level,',' order by capability_key) from collaboration_private.permission_preset_grants where preset_id='$duplicate_id'")" = 'places.address=1,schedule.operational_time=1,wedding.identity=1' ]
[ "$(sql "select version::text from collaboration_private.permission_presets where id='$source_id'")" = '2' ]
echo 'PASS 1C-G duplicate/update produces one coherent old snapshot before source update'
docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'drop trigger _1cg_pause_insert on collaboration_private.permission_presets' >/dev/null

# Duplicate vs archive: the duplicate already owns a coherent source lock and
# completes first; archive then commits. Both source history and copied rows
# remain complete, with no partial snapshot.
source_archive_id=$(make_preset 'Duplicate Archive Source')
docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c \
  "create trigger _1cg_pause_insert after insert on collaboration_private.permission_presets for each row execute function public._1cg_test_pause_preset('1cg-duplicate-archive','Duplicate Archive Copy','705')" >/dev/null
start_gate 705
start_actor 1cg-duplicate-archive "select public.duplicate_collaboration_permission_preset('$source_archive_id','Duplicate Archive Copy',null);" duplicate-archive-first.log
first_pid=$actor_pid; wait_lock 1cg-duplicate-archive
start_actor 1cg-source-archive "select public.archive_collaboration_permission_preset('$source_archive_id','1');" source-archive-second.log
second_pid=$actor_pid; wait_lock 1cg-source-archive
release_gate; wait "$first_pid"; wait "$second_pid"
archive_copy_id=$(sql "select id from collaboration_private.permission_presets where owner_user_id='$owner' and name='Duplicate Archive Copy'")
[ "$(sql "select count(*) from collaboration_private.permission_preset_grants where preset_id='$archive_copy_id'")" = 3 ]
[ "$(sql "select archived_at is not null from collaboration_private.permission_presets where id='$source_archive_id'")" = t ]
echo 'PASS 1C-G duplicate/archive serializes; copy is complete and source remains archived history'

if rg -q '40P01|deadlock detected|lock timeout' "$work"/*.log; then
  echo 'FAIL 1C-G concurrency run reported a deadlock or lock timeout' >&2; exit 1
fi
echo 'PASS 1C-G concurrency matrix completed without deadlock or lock timeout'
