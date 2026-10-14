#!/bin/sh
set -eu

container=supabase_db_ourwed-internal-qa-harness-20261012
migration=${1:-supabase/migrations/20261014100000_collaboration_1c_e_permission_foundation.sql}
db_migration_first=ourwed_1ce_race_migration_first
db_accept_first=ourwed_1ce_race_accept_first
work_dir=$(mktemp -d /private/tmp/ourwed-1ce-race.XXXXXX)
repo_root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$repo_root"
case "$migration" in /*) ;; *) migration="$repo_root/$migration" ;; esac
gate_fd_open=0
gate_pid=
worker_pid=
migration_pid=
accept_pid=

cleanup() {
  result=$?
  if [ "$gate_fd_open" -eq 1 ]; then
    printf 'COMMIT;\n' >&3 2>/dev/null || true
    exec 3>&- 2>/dev/null || true
    gate_fd_open=0
  fi
  if [ -n "$worker_pid" ]; then wait "$worker_pid" 2>/dev/null || true; fi
  if [ -n "$migration_pid" ]; then wait "$migration_pid" 2>/dev/null || true; fi
  if [ -n "$accept_pid" ]; then wait "$accept_pid" 2>/dev/null || true; fi
  if [ -n "$gate_pid" ]; then wait "$gate_pid" 2>/dev/null || true; fi
  for db in "$db_migration_first" "$db_accept_first"; do
    docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c \
      "drop event trigger if exists z_1ce_pause_migration; drop trigger if exists z_1ce_pause_accept on public.wedding_collaboration_events; drop function if exists public._1ce_pause_migration(); drop function if exists public._1ce_pause_accept();" \
      >/dev/null 2>&1 || true
  done
  if [ "$result" -eq 0 ]; then rm -rf "$work_dir"; else echo "race diagnostics: $work_dir" >&2; fi
}
trap cleanup EXIT HUP INT TERM

sql() {
  db=$1
  query=$2
  docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -Atc "$query"
}
wait_for_lock_wait() {
  db=$1
  app=$2
  i=0
  while [ "$i" -lt 400 ]; do
    if [ "$(sql "$db" "select count(*) from pg_stat_activity where application_name='$app' and wait_event_type='Lock'")" -gt 0 ]; then return 0; fi
    i=$((i+1)); sleep 0.05
  done
  echo "FAIL $app did not enter a PostgreSQL lock wait" >&2
  sql "$db" "select application_name,state,wait_event_type,wait_event from pg_stat_activity where application_name like '1ce-%'" >&2
  return 1
}
start_gate() {
  db=$1
  fifo="$work_dir/$db.gate"
  mkfifo "$fifo"
  docker exec -i -e PGAPPNAME=1ce-gate "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 < "$fifo" > "$work_dir/$db-gate.log" 2>&1 &
  gate_pid=$!
  exec 3>"$fifo"
  gate_fd_open=1
  printf 'begin; select pg_catalog.pg_advisory_xact_lock(28654,1);\n' >&3
  i=0
  while [ "$i" -lt 200 ]; do
    if [ "$(sql "$db" "select count(*) from pg_stat_activity where application_name='1ce-gate' and state='idle in transaction'")" -eq 1 ]; then return 0; fi
    i=$((i+1)); sleep 0.05
  done
  echo "FAIL advisory gate did not become ready for $db" >&2
  return 1
}
release_gate() {
  printf 'commit;\n' >&3
  exec 3>&-
  gate_fd_open=0
  wait "$gate_pid"
  gate_pid=
}
seed_fixture() {
  db=$1
  docker exec -i "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','1ce00000-0000-4000-8000-000000000001','authenticated','authenticated','1ce-race-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','1ce00000-0000-4000-8000-000000000002','authenticated','authenticated','1ce-race-member@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());
insert into public.users(id,email,name) values
 ('1ce00000-0000-4000-8000-000000000001','1ce-race-owner@example.test','Race Owner'),
 ('1ce00000-0000-4000-8000-000000000002','1ce-race-member@example.test','Race Member')
on conflict(id) do update set email=excluded.email,name=excluded.name;
insert into public.weddings(id,user_id,bride_name,groom_name,status)
values ('1ce00000-0000-4000-8000-000000000001','1ce00000-0000-4000-8000-000000000001','Local','Migration race','active');
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
  participant_low_name_snapshot,participant_high_name_snapshot,status)
values ('1ce00000-0000-4000-8000-000000000001','1ce00000-0000-4000-8000-000000000001',
  '1ce00000-0000-4000-8000-000000000002','Owner','Member','active');
insert into public.wedding_collaboration_invitations(id,wedding_id,wedding_id_snapshot,owner_user_id,invitee_user_id,
  source_connection_id,status,terms_version,currency_snapshot,terms_snapshot,idempotency_key)
values ('1ce00000-0000-4000-8000-000000000001','1ce00000-0000-4000-8000-000000000001',
  '1ce00000-0000-4000-8000-000000000001','1ce00000-0000-4000-8000-000000000001','1ce00000-0000-4000-8000-000000000002',
  '1ce00000-0000-4000-8000-000000000001','pending',1,'PLN','{}','1ce00000-0000-4000-8000-000000000011');
SQL
  sql "$db" "select (email_confirmed_at is not null)::text||':'||(deleted_at is null)::text||':'||(not is_anonymous)::text||':'||(banned_until is null or banned_until<=now())::text from auth.users where id='1ce00000-0000-4000-8000-000000000002'" > "$work_dir/$db-auth-check.log"
  sql "$db" "select count(*) from public.users where id='1ce00000-0000-4000-8000-000000000002'" > "$work_dir/$db-public-user-check.log"
  [ "$(sql "$db" "select public.wedding_collaboration_actor_is_eligible('1ce00000-0000-4000-8000-000000000002')")" = t ] || { echo "FAIL synthetic invitee is ineligible in $db" >&2; return 1; }
  [ "$(sql "$db" "select count(*) from public.wedding_collaboration_invitations where id='1ce00000-0000-4000-8000-000000000001' and invitee_user_id='1ce00000-0000-4000-8000-000000000002' and status='pending'")" = 1 ] || { echo "FAIL synthetic invitation was not created in $db" >&2; return 1; }
}
build_pre_e_database() {
  db=$1
  docker exec "$container" dropdb -U postgres --if-exists "$db" >/dev/null
  docker exec "$container" createdb -U postgres "$db"
  docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c \
    'create schema extensions; create extension pgcrypto with schema extensions; create extension pgtap with schema extensions;' >/dev/null
  docker exec "$container" pg_dump -U postgres -d postgres -n auth --schema-only --no-owner --no-privileges > "$work_dir/auth-schema.sql"
  python3 - "$work_dir/auth-schema.sql" "$work_dir/auth-schema-filtered.sql" <<'PY'
import sys
source, destination = sys.argv[1:]
with open(source, 'rb') as src:
    lines = [line for line in src if b'CREATE TRIGGER on_auth_user_created ' not in line and b'CREATE TRIGGER on_auth_user_qa_metadata_updated ' not in line]
with open(destination, 'wb') as dst:
    dst.writelines(lines)
PY
  docker exec -i "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 < "$work_dir/auth-schema-filtered.sql" >/dev/null
  python3 scripts/test/internal-qa-harness/build_baseline.py > "$work_dir/current-baseline.sql"
  docker exec -i "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 < "$work_dir/current-baseline.sql" >/dev/null
  for file in \
    supabase/migrations/20260728160000_wedding_contract_recovery.sql \
    supabase/migrations/20261006214925_source_contract_atomic_apply.sql \
    supabase/migrations/20261007171734_source_contract_apply_partner_answers.sql \
    supabase/migrations/20261012154736_internal_qa_accounts.sql \
    supabase/migrations/20261012175953_internal_qa_pro_entitlement_gate.sql \
    supabase/migrations/20261012193244_collaboration_1c_a_wedding_lifecycle_foundation.sql \
    supabase/migrations/20261012212404_collaboration_1c_b_secure_invitation_reads.sql \
    supabase/migrations/20261013103640_collaboration_1c_b_invite_from_connection.sql \
    supabase/migrations/20261013113439_collaboration_1c_c_curated_reads.sql \
    supabase/migrations/20261013130000_collaboration_1c_d_operational_writes.sql; do
    docker exec -i "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 < "$file" >/dev/null
  done
  docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c \
    'grant usage on schema extensions to authenticated; grant execute on all functions in schema extensions to authenticated; grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to public; grant execute on function auth.role() to public;' >/dev/null 2>&1
}
assert_acceptance() {
  db=$1
  result=$(sql "$db" "select coalesce((select status from public.wedding_collaboration_invitations where id='1ce00000-0000-4000-8000-000000000001'),'missing')||'|'||(select count(*) from public.wedding_collaboration_memberships where accepted_invitation_id='1ce00000-0000-4000-8000-000000000001' and status='active')||'|'||(select count(*) from collaboration_private.membership_permission_grants g join public.wedding_collaboration_memberships m on m.id=g.membership_id where m.accepted_invitation_id='1ce00000-0000-4000-8000-000000000001')||'|'||(select count(*) from public.wedding_collaboration_events where invitation_id='1ce00000-0000-4000-8000-000000000001' and event_type='invitation_accepted')")
  [ "$result" = 'accepted|1|3|1' ] || { echo "FAIL $db accepted snapshot counts: $result" >&2; return 1; }
}
start_acceptance() {
  db=$1
  app=$2
  printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='15s'; set local statement_timeout='20s'; set local role authenticated; select set_config('request.jwt.claim.sub','1ce00000-0000-4000-8000-000000000002',true); select public.accept_wedding_collaboration_invite('1ce00000-0000-4000-8000-000000000001','1ce00000-0000-4000-8000-000000000012'); commit;\n" |
    docker exec -i -e PGAPPNAME="$app" "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 > "$work_dir/$app.log" 2>&1 &
  worker_pid=$!
}

# Build disposable pre-E database copies from the documented synthetic
# baseline so the actual candidate migration bytes can be run in both orders.
build_pre_e_database "$db_migration_first"
build_pre_e_database "$db_accept_first"

# Migration-first: a test event trigger pauses the real migration after it has
# acquired all lifecycle table locks. The call may resolve the old RPC body
# before blocking; the membership trigger must still seed its v0 grant snapshot.
seed_fixture "$db_migration_first"
docker exec -i "$container" psql -X -U postgres -d "$db_migration_first" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create function public._1ce_pause_migration() returns event_trigger language plpgsql as $$
begin if tg_tag='ALTER TABLE' then perform pg_catalog.pg_advisory_xact_lock(28654,1); end if; end $$;
create event trigger z_1ce_pause_migration on ddl_command_start when tag in ('ALTER TABLE') execute function public._1ce_pause_migration();
SQL
start_gate "$db_migration_first"
docker exec -i -e PGAPPNAME=1ce-migration-first "$container" psql -X -U postgres -d "$db_migration_first" -v ON_ERROR_STOP=1 < "$migration" > "$work_dir/migration-first.log" 2>&1 &
migration_pid=$!
wait_for_lock_wait "$db_migration_first" 1ce-migration-first
start_acceptance "$db_migration_first" 1ce-accept-after-migration
accept_pid=$worker_pid
worker_pid=
wait_for_lock_wait "$db_migration_first" 1ce-accept-after-migration
release_gate
wait "$migration_pid"
migration_pid=
wait "$accept_pid"
accept_pid=
assert_acceptance "$db_migration_first"
if rg -q '40P01|deadlock detected' "$work_dir/migration-first.log" "$work_dir/1ce-accept-after-migration.log"; then echo 'FAIL migration-first race deadlocked' >&2; exit 1; fi
echo 'PASS migration-first race: blocked old-body acceptance received the exact v0 snapshot'

# Acceptance-first: pause acceptance after it has changed the invitation and
# inserted its membership/grants. The real migration must fail immediately on
# the first NOWAIT lifecycle lock, leaving all schema DDL unapplied. Once
# acceptance commits, retry the migration and verify the backfilled snapshot.
seed_fixture "$db_accept_first"
docker exec -i "$container" psql -X -U postgres -d "$db_accept_first" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create function public._1ce_pause_accept() returns trigger language plpgsql as $$
begin if new.event_type='invitation_accepted' then perform pg_catalog.pg_advisory_xact_lock(28654,1); end if; return new; end $$;
create trigger z_1ce_pause_accept before insert on public.wedding_collaboration_events for each row execute function public._1ce_pause_accept();
SQL
start_gate "$db_accept_first"
start_acceptance "$db_accept_first" 1ce-accept-first
wait_for_lock_wait "$db_accept_first" 1ce-accept-first
set +e
docker exec -i -e PGAPPNAME=1ce-migration-after-accept-start "$container" psql -X -U postgres -d "$db_accept_first" -v ON_ERROR_STOP=1 < "$migration" > "$work_dir/migration-after-accept.log" 2>&1
migration_status=$?
set -e
[ "$migration_status" -ne 0 ] || { echo 'FAIL migration did not reject the active acceptance lock holder' >&2; exit 1; }
rg -q '55P03|lock_not_available|could not obtain lock' "$work_dir/migration-after-accept.log" || { echo 'FAIL migration did not fail specifically on NOWAIT' >&2; exit 1; }
[ "$(sql "$db_accept_first" "select count(*) from information_schema.columns where table_schema='public' and table_name='wedding_collaboration_invitations' and column_name='access_configuration_version'")" = 0 ] || { echo 'FAIL failed migration left schema changes behind' >&2; exit 1; }
release_gate
wait "$worker_pid"
worker_pid=
if rg -q '40P01|deadlock detected' "$work_dir/migration-after-accept.log" "$work_dir/1ce-accept-first.log"; then echo 'FAIL acceptance-first race deadlocked' >&2; exit 1; fi
docker exec -i "$container" psql -X -U postgres -d "$db_accept_first" -v ON_ERROR_STOP=1 < "$migration" > "$work_dir/migration-retry.log" 2>&1
assert_acceptance "$db_accept_first"
[ "$(sql "$db_accept_first" "select count(*) from public.wedding_collaboration_memberships where accepted_invitation_id='1ce00000-0000-4000-8000-000000000001'")" = 1 ] || { echo 'FAIL migration retry duplicated acceptance membership' >&2; exit 1; }
echo 'PASS acceptance-first race: NOWAIT rolled back the migration; committed acceptance backfilled once on retry'
