#!/bin/sh
set -eu

db_container=supabase_db_ourwed-internal-qa-harness-20261012
db_name=${OURWED_TEST_DATABASE:-postgres}
owner_id=1cd10000-0000-4000-8000-000000000001
member_id=1cd10000-0000-4000-8000-000000000002
erase_owner_id=1cd10000-0000-4000-8000-000000000003
work_dir=$(mktemp -d /private/tmp/ourwed-1cd-locks.XXXXXX)
gate_fd_open=0

cleanup() {
  result=$?
  if [ "$gate_fd_open" -eq 1 ]; then
    printf 'COMMIT;\n' >&3 2>/dev/null || true
    exec 3>&- 2>/dev/null || true
  fi
  docker exec "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 -c \
    "drop trigger if exists z_1cd_test_pause_recovery on public.wedding_contract_recoveries; drop trigger if exists z_1cd_test_pause_place on public.wedding_places; drop trigger if exists z_1cd_test_pause_delete on public.weddings; drop trigger if exists z_1cd_test_pause_owner_time on public.weddings; drop trigger if exists z_1cd_test_pause_collab_time on public.wedding_operational_times; drop trigger if exists z_1cd_test_pause_revoke on public.wedding_collaboration_memberships; drop trigger if exists z_1cd_test_pause_travel on public.travel_segments; drop trigger if exists z_1cd_test_pause_reorder on public.wedding_places; drop trigger if exists z_1cd_test_pause_studio on public.studio_travel_settings; drop trigger if exists z_1cd_test_pause_extra on public.wedding_extra_services; drop trigger if exists z_1cd_test_pause_form on public.form_instances; drop function if exists public._1cd_test_pause_recovery(); drop function if exists public._1cd_test_pause_place(); drop function if exists public._1cd_test_pause_delete(); drop function if exists public._1cd_test_pause_owner_time(); drop function if exists public._1cd_test_pause_collab_time(); drop function if exists public._1cd_test_pause_revoke(); drop function if exists public._1cd_test_pause_travel(); drop function if exists public._1cd_test_pause_reorder(); drop function if exists public._1cd_test_pause_studio(); drop function if exists public._1cd_test_pause_extra(); drop function if exists public._1cd_test_pause_form(); drop function if exists public._1cd_test_refresh_route_snapshot(uuid); drop function if exists public._1cd_test_persist_route(uuid); drop table if exists public._1cd_test_route_snapshots; delete from public.weddings where id in ('1cd10000-0000-4000-8000-000000000101','1cd10000-0000-4000-8000-000000000102','1cd10000-0000-4000-8000-000000000103','1cd10000-0000-4000-8000-000000000104','1cd10000-0000-4000-8000-000000000105','1cd10000-0000-4000-8000-000000000106','1cd10000-0000-4000-8000-000000000107','1cd10000-0000-4000-8000-000000000108','1cd10000-0000-4000-8000-000000000109','1cd10000-0000-4000-8000-000000000110'); delete from auth.users where id in ('$owner_id','$member_id');" \
    >/dev/null 2>&1 || true
  if [ "$result" -eq 0 ]; then
    rm -rf "$work_dir"
  else
    echo "debug logs retained at $work_dir" >&2
    for log in "$work_dir"/*.log; do [ -e "$log" ] && { echo "--- $(basename "$log")" >&2; tail -20 "$log" >&2; }; done
  fi
}
trap cleanup EXIT HUP INT TERM

docker exec "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 -c \
  "delete from public.wedding_collaboration_memberships where wedding_id_snapshot in ('1cd10000-0000-4000-8000-000000000101','1cd10000-0000-4000-8000-000000000102','1cd10000-0000-4000-8000-000000000103','1cd10000-0000-4000-8000-000000000104','1cd10000-0000-4000-8000-000000000107','1cd10000-0000-4000-8000-000000000108','1cd10000-0000-4000-8000-000000000109','1cd10000-0000-4000-8000-000000000110'); delete from public.wedding_collaboration_invitations where wedding_id_snapshot in ('1cd10000-0000-4000-8000-000000000101','1cd10000-0000-4000-8000-000000000102','1cd10000-0000-4000-8000-000000000103','1cd10000-0000-4000-8000-000000000104','1cd10000-0000-4000-8000-000000000105','1cd10000-0000-4000-8000-000000000106','1cd10000-0000-4000-8000-000000000107','1cd10000-0000-4000-8000-000000000108','1cd10000-0000-4000-8000-000000000109','1cd10000-0000-4000-8000-000000000110'); delete from public.weddings where id in ('1cd10000-0000-4000-8000-000000000101','1cd10000-0000-4000-8000-000000000102','1cd10000-0000-4000-8000-000000000103','1cd10000-0000-4000-8000-000000000104','1cd10000-0000-4000-8000-000000000105','1cd10000-0000-4000-8000-000000000106','1cd10000-0000-4000-8000-000000000107','1cd10000-0000-4000-8000-000000000108','1cd10000-0000-4000-8000-000000000109','1cd10000-0000-4000-8000-000000000110'); delete from auth.users where id in ('$owner_id','$member_id');" \
  > "$work_dir/preclean.log" 2>&1

sql() {
  docker exec "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 -Atc "$1"
}
wait_for_gate_idle() {
  i=0
  while [ "$i" -lt 200 ]; do
    if [ "$(sql "select count(*) from pg_stat_activity where application_name='1cd-test-gate' and state='idle in transaction'")" = 1 ]; then return 0; fi
    i=$((i+1)); sleep 0.05
  done
  echo 'FAIL local test gate did not become ready' >&2
  return 1
}
wait_for_lock_wait() {
  app=$1
  i=0
  while [ "$i" -lt 200 ]; do
    if [ "$(sql "select count(*) from pg_stat_activity where application_name='$app' and wait_event_type='Lock'")" -gt 0 ]; then return 0; fi
    i=$((i+1)); sleep 0.05
  done
  echo "FAIL $app never entered a PostgreSQL lock wait" >&2
  sql "select application_name,state,wait_event_type,wait_event from pg_stat_activity where application_name like '1cd-%'"
  return 1
}
start_gate() {
  mkfifo "$work_dir/gate.in"
  docker exec -i -e PGAPPNAME=1cd-test-gate "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 < "$work_dir/gate.in" > "$work_dir/gate.log" 2>&1 &
  gate_pid=$!
  exec 3>"$work_dir/gate.in"
  gate_fd_open=1
  printf "begin; select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:1cd-test-pause',0));\n" >&3
  wait_for_gate_idle
}
release_gate() {
  printf 'commit;\n' >&3
  exec 3>&-
  gate_fd_open=0
  wait "$gate_pid"
  rm -f "$work_dir/gate.in"
}
start_recovery() {
  suffix=$1
  expected_error=$2
  actor_id=${3:-$owner_id}
  if [ "$expected_error" = 'none' ]; then
    docker exec -i -e PGAPPNAME="1cd-recovery-$suffix" "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/recovery-$suffix.log" 2>&1 <<SQL &
begin;
set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s';
select wedding_updated_at_snapshot as expected from public.wedding_contract_recoveries where id='1cd10000-0000-4000-8000-00000000060${suffix}'::uuid \gset
set local role authenticated;
select set_config('request.jwt.claim.sub','$actor_id',true);
select public.apply_wedding_contract_recovery('1cd10000-0000-4000-8000-00000000060${suffix}'::uuid,'1cd10000-0000-4000-8000-00000000050${suffix}'::uuid,'1cd10000-0000-4000-8000-00000000010${suffix}'::uuid,:'expected'::timestamptz,'[]'::jsonb,false,array[]::integer[],array[]::integer[]);
commit;
SQL
    recovery_pid=$!
  else
    docker exec -i -e PGAPPNAME="1cd-recovery-$suffix" "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/recovery-$suffix.log" 2>&1 <<SQL &
begin;
set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s';
set local role authenticated;
select set_config('request.jwt.claim.sub','$actor_id',true);
select public.apply_wedding_contract_recovery('1cd10000-0000-4000-8000-00000000060${suffix}'::uuid,'1cd10000-0000-4000-8000-00000000050${suffix}'::uuid,'1cd10000-0000-4000-8000-00000000010${suffix}'::uuid,null,'[]'::jsonb,false,array[]::integer[],array[]::integer[]);
commit;
SQL
    recovery_pid=$!
  fi
}

start_extra_mutation() {
  action=$1
  wedding_suffix=$2
  extra_suffix=$3
  app=$4
  if [ "$action" = update ]; then
    statement="update public.wedding_extra_services set quantity=quantity+1 where id='1cd10000-0000-4000-8000-000000000${extra_suffix}';"
  else
    statement="delete from public.wedding_extra_services where id='1cd10000-0000-4000-8000-000000000${extra_suffix}';"
  fi
  printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; select set_config('request.jwt.claim.sub','$owner_id',true); $statement commit;\n" |
    docker exec -i -e PGAPPNAME="$app" "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/$app.log" 2>&1 &
  extra_pid=$!
}
start_form_submission() {
  suffix=$1
  app=$2
  token="1cd-form-lock-order-token-$suffix"
  printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; select public.public_submit_form_by_token('$token','{\"fields\":{\"additionalNotes\":\"1C-D lock-order test\"}}'::jsonb); commit;\n" |
    docker exec -i -e PGAPPNAME="$app" "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/$app.log" 2>&1 &
  form_pid=$!
}
start_erasure() {
  target_id=$1
  app=$2
  printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='20s'; select set_config('request.jwt.claim.role','service_role',true); select public.erase_account_data('$target_id'::uuid); commit;\n" |
    docker exec -i -e PGAPPNAME="$app" "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/$app.log" 2>&1 &
  erase_pid=$!
}

start_address() {
  suffix=$1
  value=$2
  expected=$(sql "select coalesce((select version::text from collaboration_private.wedding_operational_versions where wedding_id='1cd10000-0000-4000-8000-00000000010${suffix}' and resource_type='place_address' and role='ceremony'),'1')")
  printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; set local role authenticated; select set_config('request.jwt.claim.sub','$member_id',true); select public.update_collaborative_wedding_place('1cd10000-0000-4000-8000-00000000010${suffix}'::uuid,'ceremony','$value','$expected'); commit;\n" |
    docker exec -i -e PGAPPNAME="1cd-address-$suffix" "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/address-$suffix.log" 2>&1 &
  address_pid=$!
}
start_route_persist() {
  wedding_suffix=$1
  app=$2
  printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public._1cd_test_persist_route('1cd10000-0000-4000-8000-00000000010${wedding_suffix}'::uuid); commit;\n" |
    docker exec -i -e PGAPPNAME="$app" "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/$app.log" 2>&1 &
  route_pid=$!
}
start_owner_place() {
  wedding_suffix=$1
  app=$2
  value=$3
  printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public.mutate_owner_wedding_places('1cd10000-0000-4000-8000-00000000010${wedding_suffix}'::uuid,'upsert','{\"role\":\"ceremony\",\"formatted_address\":\"$value\"}'::jsonb); commit;\n" |
    docker exec -i -e PGAPPNAME="$app" "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/$app.log" 2>&1 &
  place_pid=$!
}
start_owner_reorder() {
  wedding_suffix=$1
  app=$2
  direction=${3:-forward}
  first_place="1cd10000-0000-4000-8000-00000000030${wedding_suffix}"
  second_place="1cd10000-0000-4000-8000-00000000030$((wedding_suffix + 2))"
  if [ "$direction" = reverse ]; then swap=$first_place; first_place=$second_place; second_place=$swap; fi
  printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public.mutate_owner_wedding_places('1cd10000-0000-4000-8000-00000000010${wedding_suffix}'::uuid,'reorder','{\"ordered_place_ids\":[\"$first_place\",\"$second_place\"]}'::jsonb); commit;\n" |
    docker exec -i -e PGAPPNAME="$app" "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/$app.log" 2>&1 &
  place_pid=$!
}
start_studio_origin() {
  app=$1
  city=$2
  printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public.upsert_studio_travel_settings_guarded(jsonb_build_object('studio_name','Local route studio','street','Route Street','building_number','1','postal_code','00-001','city','$city','country','Polska','formatted_address','Route origin $city','latitude',5.1,'longitude',6.1,'place_id','route-studio-$city','free_distance_km',50),false); commit;\n" |
    docker exec -i -e PGAPPNAME="$app" "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/$app.log" 2>&1 &
  origin_pid=$!
}
start_owner_time() {
  wedding_suffix=$1
  app=$2
  time_value=$3
  printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); update public.weddings set ceremony_time='$time_value' where id='1cd10000-0000-4000-8000-00000000010${wedding_suffix}'; commit;\n" |
    docker exec -i -e PGAPPNAME="$app" "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/$app.log" 2>&1 &
  time_pid=$!
}
start_collab_time() {
  wedding_suffix=$1
  app=$2
  time_value=$3
  wedding_number=$((100 + wedding_suffix))
  wedding_id=$(printf '1cd10000-0000-4000-8000-%012d' "$wedding_number")
  expected=$(sql "select version::text from collaboration_private.wedding_operational_versions where wedding_id='$wedding_id' and resource_type='operational_time' and role='ceremony'")
  expected_arg=null
  if [ -n "$expected" ]; then expected_arg="'$expected'"; fi
  printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; set local role authenticated; select set_config('request.jwt.claim.sub','$member_id',true); select public.update_collaborative_operational_time('$wedding_id'::uuid,'ceremony','$time_value',$expected_arg); commit;\n" |
    docker exec -i -e PGAPPNAME="$app" "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/$app.log" 2>&1 &
  time_pid=$!
}
start_revoke() {
  wedding_suffix=$1
  app=$2
  membership_id=$(sql "select id from public.wedding_collaboration_memberships where wedding_id='1cd10000-0000-4000-8000-00000000010${wedding_suffix}' and status='active'")
  printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public.revoke_wedding_collaboration_membership('$membership_id'::uuid,extensions.gen_random_uuid()); commit;\n" |
    docker exec -i -e PGAPPNAME="$app" "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/$app.log" 2>&1 &
  revoke_pid=$!
}
reset_recovery() {
  suffix=$1
  sql "update public.wedding_source_contracts set status='ready_for_review' where id='1cd10000-0000-4000-8000-00000000050${suffix}'; update public.wedding_contract_recoveries r set status='ready_for_review',applied_at=null,wedding_updated_at_snapshot=w.updated_at,related_state_snapshot=public.wedding_contract_related_state_snapshot(w.id) from public.weddings w where r.id='1cd10000-0000-4000-8000-00000000060${suffix}' and r.wedding_id=w.id" >/dev/null
}

# Synthetic test-only pause triggers let the harness observe both transactions
# after their domain locks have been acquired. The shell releases the gate only
# after pg_stat_activity proves the competing path is waiting on PostgreSQL.
docker exec -i "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/setup.log" 2>&1 <<SQL
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','$owner_id','authenticated','authenticated','1cd-lock-owner@example.test','x',now(),'{"provider":"email","providers":["email"]}','{"first_name":"Local","last_name":"Owner","profession":"photographer","legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','$member_id','authenticated','authenticated','1cd-lock-member@example.test','x',now(),'{"provider":"email","providers":["email"]}','{"first_name":"Local","last_name":"Member","profession":"photographer","legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());
insert into public.weddings(id,user_id,bride_name,groom_name,status) values
 ('1cd10000-0000-4000-8000-000000000101','$owner_id','Local','Race A','active'),
 ('1cd10000-0000-4000-8000-000000000102','$owner_id','Local','Race B','active'),
 ('1cd10000-0000-4000-8000-000000000103','$owner_id','Local','Race C','active'),
 ('1cd10000-0000-4000-8000-000000000104','$owner_id','Local','Race D','active'),
 ('1cd10000-0000-4000-8000-000000000105','$owner_id','Local','Erase race owner','active'),
 ('1cd10000-0000-4000-8000-000000000106','$member_id','Local','Erase race member','active'),
 ('1cd10000-0000-4000-8000-000000000107','$owner_id','Local','Address/delete race','active'),
 ('1cd10000-0000-4000-8000-000000000108','$owner_id','Local','Time/delete race','active'),
 ('1cd10000-0000-4000-8000-000000000109','$owner_id','Local','Address/delete race reverse','active'),
 ('1cd10000-0000-4000-8000-000000000110','$owner_id','Local','Time/delete race reverse','active');
insert into public.wedding_collaboration_invitations(id,wedding_id,wedding_id_snapshot,owner_user_id,invitee_user_id,status,terms_version,currency_snapshot,terms_snapshot,idempotency_key,accepted_at)
values ('1cd10000-0000-4000-8000-000000000201','1cd10000-0000-4000-8000-000000000101','1cd10000-0000-4000-8000-000000000101','$owner_id','$member_id','accepted',1,'PLN','{}'::jsonb,extensions.gen_random_uuid(),now()),
       ('1cd10000-0000-4000-8000-000000000202','1cd10000-0000-4000-8000-000000000102','1cd10000-0000-4000-8000-000000000102','$owner_id','$member_id','accepted',1,'PLN','{}'::jsonb,extensions.gen_random_uuid(),now()),
       ('1cd10000-0000-4000-8000-000000000203','1cd10000-0000-4000-8000-000000000103','1cd10000-0000-4000-8000-000000000103','$owner_id','$member_id','accepted',1,'PLN','{}'::jsonb,extensions.gen_random_uuid(),now()),
       ('1cd10000-0000-4000-8000-000000000204','1cd10000-0000-4000-8000-000000000104','1cd10000-0000-4000-8000-000000000104','$owner_id','$member_id','accepted',1,'PLN','{}'::jsonb,extensions.gen_random_uuid(),now()),
       ('1cd10000-0000-4000-8000-000000000207','1cd10000-0000-4000-8000-000000000107','1cd10000-0000-4000-8000-000000000107','$owner_id','$member_id','accepted',1,'PLN','{}'::jsonb,extensions.gen_random_uuid(),now()),
       ('1cd10000-0000-4000-8000-000000000208','1cd10000-0000-4000-8000-000000000108','1cd10000-0000-4000-8000-000000000108','$owner_id','$member_id','accepted',1,'PLN','{}'::jsonb,extensions.gen_random_uuid(),now()),
       ('1cd10000-0000-4000-8000-000000000209','1cd10000-0000-4000-8000-000000000109','1cd10000-0000-4000-8000-000000000109','$owner_id','$member_id','accepted',1,'PLN','{}'::jsonb,extensions.gen_random_uuid(),now()),
       ('1cd10000-0000-4000-8000-000000000210','1cd10000-0000-4000-8000-000000000110','1cd10000-0000-4000-8000-000000000110','$owner_id','$member_id','accepted',1,'PLN','{}'::jsonb,extensions.gen_random_uuid(),now());
insert into public.wedding_collaboration_memberships(wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,accepted_invitation_id,status,accepted_at)
select i.wedding_id,i.wedding_id,i.owner_user_id,i.invitee_user_id,i.id,'active',now() from public.wedding_collaboration_invitations i where i.owner_user_id='$owner_id';
insert into public.wedding_places(id,wedding_id,role,formatted_address,sort_order,place_id,latitude,longitude)
values ('1cd10000-0000-4000-8000-000000000301','1cd10000-0000-4000-8000-000000000101','ceremony','Race baseline A',30,'place-a',1,2),
       ('1cd10000-0000-4000-8000-000000000302','1cd10000-0000-4000-8000-000000000102','ceremony','Race baseline B',30,'place-b',1,2),
 ('1cd10000-0000-4000-8000-000000000305','1cd10000-0000-4000-8000-000000000103','ceremony','Race baseline C',30,'place-c',1,2),
 ('1cd10000-0000-4000-8000-000000000306','1cd10000-0000-4000-8000-000000000104','ceremony','Race baseline D',30,'place-d',1,2),
 ('1cd10000-0000-4000-8000-000000000307','1cd10000-0000-4000-8000-000000000107','ceremony','Race baseline address/delete',30,'place-g',1,2),
 ('1cd10000-0000-4000-8000-000000000308','1cd10000-0000-4000-8000-000000000108','ceremony','Race baseline time/delete',30,'place-h',1,2),
 ('1cd10000-0000-4000-8000-000000000309','1cd10000-0000-4000-8000-000000000109','ceremony','Race baseline address/delete reverse',30,'place-i',1,2),
 ('1cd10000-0000-4000-8000-000000000310','1cd10000-0000-4000-8000-000000000110','ceremony','Race baseline time/delete reverse',30,'place-j',1,2);
insert into public.wedding_operational_times(wedding_id,stop_key,operational_time) values
 ('1cd10000-0000-4000-8000-000000000108','1cd10000-0000-4000-8000-000000000308','09:00'),
 ('1cd10000-0000-4000-8000-000000000110','1cd10000-0000-4000-8000-000000000310','09:00');
insert into public.wedding_places(id,wedding_id,role,formatted_address,sort_order,place_id,latitude,longitude)
values ('1cd10000-0000-4000-8000-000000000303','1cd10000-0000-4000-8000-000000000101','reception','Route destination A',40,'route-place-a',3,4),
       ('1cd10000-0000-4000-8000-000000000304','1cd10000-0000-4000-8000-000000000102','reception','Route destination B',40,'route-place-b',3,4);
insert into public.wedding_extra_services(id,wedding_id,price_snapshot,name_snapshot,quantity)
values ('1cd10000-0000-4000-8000-000000000701','1cd10000-0000-4000-8000-000000000101',100,'Race extra A',1),
       ('1cd10000-0000-4000-8000-000000000702','1cd10000-0000-4000-8000-000000000102',200,'Race extra B',1);
insert into public.form_instances(id,form_id,wedding_id,user_id,token,token_hash,status,options_snapshot)
select v.instance_id,f.id,v.wedding_id,'$owner_id',v.token,encode(extensions.digest(convert_to(v.token,'UTF8'),'sha256'),'hex'),'pending','{}'::jsonb
from (values ('1cd10000-0000-4000-8000-000000000801'::uuid,'1cd10000-0000-4000-8000-000000000101'::uuid,'1cd-form-lock-order-token-1'),
             ('1cd10000-0000-4000-8000-000000000802'::uuid,'1cd10000-0000-4000-8000-000000000102'::uuid,'1cd-form-lock-order-token-2')) v(instance_id,wedding_id,token)
cross join lateral (select id from public.forms order by created_at limit 1) f;
insert into public.studio_travel_settings(user_id,studio_name,formatted_address,latitude,longitude,place_id)
values ('$owner_id','Local route studio','Route origin',5,6,'route-studio')
on conflict(user_id) do update set formatted_address=excluded.formatted_address,latitude=excluded.latitude,longitude=excluded.longitude,place_id=excluded.place_id;
insert into collaboration_private.studio_route_input_versions(user_id,version) values ('$owner_id',1)
on conflict(user_id) do nothing;
insert into public.wedding_source_contracts(id,user_id,wedding_id,file_path,original_file_name,stored_file_name,mime_type,file_size,status)
values ('1cd10000-0000-4000-8000-000000000501','$owner_id','1cd10000-0000-4000-8000-000000000101','synthetic','synthetic.pdf','synthetic.pdf','application/pdf',1,'ready_for_review'),
       ('1cd10000-0000-4000-8000-000000000502','$owner_id','1cd10000-0000-4000-8000-000000000102','synthetic','synthetic.pdf','synthetic.pdf','application/pdf',1,'ready_for_review'),
 ('1cd10000-0000-4000-8000-000000000503','$owner_id','1cd10000-0000-4000-8000-000000000103','synthetic','synthetic.pdf','synthetic.pdf','application/pdf',1,'ready_for_review'),
 ('1cd10000-0000-4000-8000-000000000504','$owner_id','1cd10000-0000-4000-8000-000000000104','synthetic','synthetic.pdf','synthetic.pdf','application/pdf',1,'ready_for_review'),
 ('1cd10000-0000-4000-8000-000000000505','$owner_id','1cd10000-0000-4000-8000-000000000105','synthetic','synthetic.pdf','synthetic.pdf','application/pdf',1,'ready_for_review'),
 ('1cd10000-0000-4000-8000-000000000506','$member_id','1cd10000-0000-4000-8000-000000000106','synthetic','synthetic.pdf','synthetic.pdf','application/pdf',1,'ready_for_review');
insert into public.wedding_contract_recoveries(id,user_id,wedding_id,source_contract_id,status,extraction_version,prompt_version,normalized_extraction,comparison_proposal,wedding_updated_at_snapshot,related_state_snapshot)
select v.recovery_id,w.user_id,w.id,s.id,'ready_for_review','test','test','{}'::jsonb,'{"fields":[]}'::jsonb,w.updated_at,public.wedding_contract_related_state_snapshot(w.id)
from (values ('1cd10000-0000-4000-8000-000000000601'::uuid,'1cd10000-0000-4000-8000-000000000101'::uuid,'1cd10000-0000-4000-8000-000000000501'::uuid),
             ('1cd10000-0000-4000-8000-000000000602'::uuid,'1cd10000-0000-4000-8000-000000000102'::uuid,'1cd10000-0000-4000-8000-000000000502'::uuid),
             ('1cd10000-0000-4000-8000-000000000603'::uuid,'1cd10000-0000-4000-8000-000000000103'::uuid,'1cd10000-0000-4000-8000-000000000503'::uuid),
             ('1cd10000-0000-4000-8000-000000000604'::uuid,'1cd10000-0000-4000-8000-000000000104'::uuid,'1cd10000-0000-4000-8000-000000000504'::uuid),
             ('1cd10000-0000-4000-8000-000000000605'::uuid,'1cd10000-0000-4000-8000-000000000105'::uuid,'1cd10000-0000-4000-8000-000000000505'::uuid),
             ('1cd10000-0000-4000-8000-000000000606'::uuid,'1cd10000-0000-4000-8000-000000000106'::uuid,'1cd10000-0000-4000-8000-000000000506'::uuid)) v(recovery_id,wedding_id,source_id)
join public.weddings w on w.id=v.wedding_id
join public.wedding_source_contracts s on s.id=v.source_id;
create table public._1cd_test_route_snapshots(wedding_id uuid primary key,snapshot jsonb not null);
grant select,insert,update on public._1cd_test_route_snapshots to authenticated;
create function public._1cd_test_refresh_route_snapshot(p_wedding_id uuid) returns void
language plpgsql security invoker set search_path='' as \$\$
begin
  insert into public._1cd_test_route_snapshots(wedding_id,snapshot)
  values(p_wedding_id,public.get_wedding_travel_route_snapshot(p_wedding_id))
  on conflict(wedding_id) do update set snapshot=excluded.snapshot;
end; \$\$;
create function public._1cd_test_persist_route(p_wedding_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as \$\$
declare v_snapshot jsonb; v_payload jsonb;
begin
  select snapshot into v_snapshot from public._1cd_test_route_snapshots where wedding_id=p_wedding_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'wedding_id',p_wedding_id,'sequence',t->'sequence','origin_kind',t->'origin_kind',
    'origin_wedding_place_id',t->'origin_wedding_place_id','destination_kind',t->'destination_kind',
    'destination_wedding_place_id',t->'destination_wedding_place_id','endpoints_hash',t->'endpoints_hash',
    'distance_meters',1200,'distance_text','D-PAUSE-TRAVEL','duration_seconds',300,'duration_text','5 min',
    'travel_mode','DRIVE','provider','google','status','ok','error_message',null,'calculated_at',now()::text)
    order by (t->>'sequence')::integer),'[]'::jsonb)
    into v_payload from jsonb_array_elements(v_snapshot->'route_topology') t;
  return public.replace_wedding_travel_segments_if_current(p_wedding_id,1,v_snapshot->>'wedding_route_input_version',
    v_snapshot->>'studio_origin_version','google','DRIVE',v_snapshot->>'topology_token',v_payload);
end; \$\$;
create function public._1cd_test_pause_travel() returns trigger language plpgsql security definer set search_path='' as \$\$
begin
  if current_setting('application_name',true) like '1cd-route-%' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:1cd-test-pause',0));
  end if;
  return new;
end; \$\$;
create trigger z_1cd_test_pause_travel before insert or update on public.travel_segments
for each row execute function public._1cd_test_pause_travel();
create function public._1cd_test_pause_reorder() returns trigger language plpgsql security definer set search_path='' as \$\$
begin
  if current_setting('application_name',true)='1cd-owner-reorder-wins' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:1cd-test-pause',0));
  end if;
  return new;
end; \$\$;
create trigger z_1cd_test_pause_reorder after update on public.wedding_places
for each row execute function public._1cd_test_pause_reorder();
create function public._1cd_test_pause_studio() returns trigger language plpgsql security definer set search_path='' as \$\$
begin
  if current_setting('application_name',true) like '1cd-studio-origin-%' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:1cd-test-pause',0));
  end if;
  return new;
end; \$\$;
create trigger z_1cd_test_pause_studio after update on public.studio_travel_settings
for each row execute function public._1cd_test_pause_studio();
create function public._1cd_test_pause_recovery() returns trigger language plpgsql security definer set search_path='' as \$\$
begin if new.status='applying' then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:1cd-test-pause',0)); end if; return new; end; \$\$;
create function public._1cd_test_pause_place() returns trigger language plpgsql security definer set search_path='' as \$\$
begin if new.formatted_address like 'D-PAUSE-%' then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:1cd-test-pause',0)); end if; return new; end; \$\$;
create function public._1cd_test_pause_delete() returns trigger language plpgsql security definer set search_path='' as \$\$
begin if old.id in ('1cd10000-0000-4000-8000-000000000101','1cd10000-0000-4000-8000-000000000103','1cd10000-0000-4000-8000-000000000104','1cd10000-0000-4000-8000-000000000105','1cd10000-0000-4000-8000-000000000106','1cd10000-0000-4000-8000-000000000107','1cd10000-0000-4000-8000-000000000108','1cd10000-0000-4000-8000-000000000109','1cd10000-0000-4000-8000-000000000110') then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:1cd-test-pause',0)); end if; return old; end; \$\$;
create function public._1cd_test_pause_owner_time() returns trigger language plpgsql security definer set search_path='' as \$\$
begin
  if current_setting('application_name',true) like '1cd-owner-time-%' and new.ceremony_time=time '10:30' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:1cd-test-pause',0));
  end if;
  return new;
end; \$\$;
create function public._1cd_test_pause_collab_time() returns trigger language plpgsql security definer set search_path='' as \$\$
begin
  if current_setting('application_name',true) like '1cd-collab-time-%' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:1cd-test-pause',0));
  end if;
  return new;
end; \$\$;
create function public._1cd_test_pause_revoke() returns trigger language plpgsql security definer set search_path='' as \$\$
begin
  if current_setting('application_name',true) like '1cd-revoke-%' and new.status='revoked' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:1cd-test-pause',0));
  end if;
  return new;
end; \$\$;
create trigger z_1cd_test_pause_recovery before update on public.wedding_contract_recoveries for each row execute function public._1cd_test_pause_recovery();
create trigger z_1cd_test_pause_place after update on public.wedding_places for each row execute function public._1cd_test_pause_place();
create trigger z_1cd_test_pause_delete before delete on public.weddings for each row execute function public._1cd_test_pause_delete();
create trigger z_1cd_test_pause_owner_time after update on public.weddings for each row execute function public._1cd_test_pause_owner_time();
create trigger z_1cd_test_pause_collab_time after insert or update on public.wedding_operational_times for each row execute function public._1cd_test_pause_collab_time();
create trigger z_1cd_test_pause_revoke after update on public.wedding_collaboration_memberships for each row execute function public._1cd_test_pause_revoke();
create function public._1cd_test_pause_extra() returns trigger language plpgsql security definer set search_path='' as \$\$
begin
  if current_setting('application_name',true) like '1cd-extra-%' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:1cd-test-pause',0));
  end if;
  return case when tg_op='DELETE' then old else new end;
end; \$\$;
create trigger z_1cd_test_pause_extra after update or delete on public.wedding_extra_services
for each row execute function public._1cd_test_pause_extra();
create function public._1cd_test_pause_form() returns trigger language plpgsql security definer set search_path='' as \$\$
begin
  if current_setting('application_name',true) like '1cd-form-%' and new.status='submitted' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ourwed:1cd-test-pause',0));
  end if;
  return new;
end; \$\$;
create trigger z_1cd_test_pause_form after update on public.form_instances
for each row execute function public._1cd_test_pause_form();
grant execute on function public._1cd_test_refresh_route_snapshot(uuid),public._1cd_test_persist_route(uuid) to authenticated;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','$owner_id',true);
select public._1cd_test_refresh_route_snapshot('1cd10000-0000-4000-8000-000000000101');
select public._1cd_test_refresh_route_snapshot('1cd10000-0000-4000-8000-000000000102');
commit;
SQL

# Recovery holds E/wedding/O/S before waiting at the injected row trigger;
# address must wait on the wedding, then both finish after explicit gate release.
start_gate
start_recovery 1 none
wait_for_lock_wait 1cd-recovery-1
start_address 1 'D-PAUSE-RECOVERY-FIRST'
wait_for_lock_wait 1cd-address-1
release_gate
wait "$recovery_pid"
wait "$address_pid"
echo 'PASS recovery-first vs collaborator-address (pg_stat_activity confirmed lock waits; SQLSTATE 40P01 absent)'

# Address holds wedding/O/S/resource/ledger before pausing; recovery waits on
# wedding and then returns its existing stale-related-state domain conflict.
start_gate
start_address 2 'D-PAUSE-ADDRESS-FIRST'
wait_for_lock_wait 1cd-address-2
start_recovery 2 expected
wait_for_lock_wait 1cd-recovery-2
release_gate
wait "$address_pid"
if wait "$recovery_pid"; then
  echo 'FAIL address-first recovery did not return its stale-state conflict' >&2
  exit 1
fi
rg -q 'CONTRACT_RECOVERY_WEDDING_CHANGED' "$work_dir/recovery-2.log"
echo 'PASS collaborator-address-first vs recovery (expected wedding-changed conflict; SQLSTATE 40P01 absent)'

# Snapshot A is captured before either session starts. When collaborator B wins,
# guarded persistence must reject A after both transactions have contended.
sql "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public._1cd_test_refresh_route_snapshot('1cd10000-0000-4000-8000-000000000101'); commit" >/dev/null
start_gate
start_address 1 'D-PAUSE-TRAVEL-ADDRESS-WINS'
wait_for_lock_wait 1cd-address-1
start_route_persist 1 1cd-route-address-loses
wait_for_lock_wait 1cd-route-address-loses
release_gate
wait "$address_pid"
route_status=0
wait "$route_pid" || route_status=$?
if [ "$route_status" -eq 0 ] || ! rg -q 'STALE_ROUTE_INPUT' "$work_dir/1cd-route-address-loses.log"; then
  echo 'FAIL travel persistence accepted a collaborator-address snapshot that lost the race' >&2
  exit 1
fi
sql "select case when count(*)=0 and (select version from collaboration_private.wedding_route_input_versions where wedding_id='1cd10000-0000-4000-8000-000000000101')>1 then 'clean' else 'bad' end from public.travel_segments where wedding_id='1cd10000-0000-4000-8000-000000000101'" | grep -qx clean
echo 'PASS travel address-wins (old persistence returned STALE_ROUTE_INPUT; no segment rows; route generation advanced)'

# Reverse the schedule: valid A commits while B waits; B then advances the
# route generation and removes A's segments before either caller returns.
sql "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public._1cd_test_refresh_route_snapshot('1cd10000-0000-4000-8000-000000000101'); commit" >/dev/null
start_gate
start_route_persist 1 1cd-route-persist-wins
wait_for_lock_wait 1cd-route-persist-wins
start_address 1 'D-PAUSE-TRAVEL-ADDRESS-AFTER'
wait_for_lock_wait 1cd-address-1
release_gate
wait "$route_pid"
wait "$address_pid"
sql "select case when count(*)=0 and (select version from collaboration_private.wedding_route_input_versions where wedding_id='1cd10000-0000-4000-8000-000000000101')>2 then 'clean' else 'bad' end from public.travel_segments where wedding_id='1cd10000-0000-4000-8000-000000000101'" | grep -qx clean
echo 'PASS travel persistence-wins (later address mutation advanced generation and removed every persisted segment)'

# Owner place/map source change versus the same guarded writer, in both orders.
sql "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public._1cd_test_refresh_route_snapshot('1cd10000-0000-4000-8000-000000000101'); commit" >/dev/null
start_gate
start_owner_place 1 1cd-owner-map-wins 'D-PAUSE-MAP-OWNER-WINS'
wait_for_lock_wait 1cd-owner-map-wins
start_route_persist 1 1cd-route-map-loses
wait_for_lock_wait 1cd-route-map-loses
release_gate
wait "$place_pid"
route_status=0
wait "$route_pid" || route_status=$?
if [ "$route_status" -eq 0 ] || ! rg -q 'STALE_ROUTE_INPUT' "$work_dir/1cd-route-map-loses.log"; then
  echo 'FAIL route persistence accepted pre-map-change snapshot' >&2
  exit 1
fi
sql "select case when count(*)=0 then 'clean' else 'bad' end from public.travel_segments where wedding_id='1cd10000-0000-4000-8000-000000000101'" | grep -qx clean
echo 'PASS travel owner-map-wins (stale route rejected; no segments survive)'

sql "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public._1cd_test_refresh_route_snapshot('1cd10000-0000-4000-8000-000000000101'); commit" >/dev/null
start_gate
start_route_persist 1 1cd-route-map-persist-wins
wait_for_lock_wait 1cd-route-map-persist-wins
start_owner_place 1 1cd-owner-map-after-persist 'Map change after route persistence'
wait_for_lock_wait 1cd-owner-map-after-persist
release_gate
wait "$route_pid"
wait "$place_pid"
sql "select case when count(*)=0 then 'clean' else 'bad' end from public.travel_segments where wedding_id='1cd10000-0000-4000-8000-000000000101'" | grep -qx clean
echo 'PASS travel route-persist-wins vs owner-map (later place mutation invalidated all segments)'

# Reordering changes route topology even when endpoint coordinates are stable.
sql "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public._1cd_test_refresh_route_snapshot('1cd10000-0000-4000-8000-000000000101'); commit" >/dev/null
start_gate
start_owner_reorder 1 1cd-owner-reorder-wins
wait_for_lock_wait 1cd-owner-reorder-wins
start_route_persist 1 1cd-route-reorder-loses
wait_for_lock_wait 1cd-route-reorder-loses
release_gate
wait "$place_pid"
route_status=0
wait "$route_pid" || route_status=$?
if [ "$route_status" -eq 0 ] || ! rg -q 'STALE_ROUTE_INPUT' "$work_dir/1cd-route-reorder-loses.log"; then
  echo 'FAIL route persistence accepted pre-reorder snapshot' >&2
  exit 1
fi
sql "select case when count(*)=0 then 'clean' else 'bad' end from public.travel_segments where wedding_id='1cd10000-0000-4000-8000-000000000101'" | grep -qx clean
echo 'PASS travel reorder-wins (stale route rejected; no segments survive)'

sql "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public._1cd_test_refresh_route_snapshot('1cd10000-0000-4000-8000-000000000101'); commit" >/dev/null
before_reorder_version=$(sql "select version from collaboration_private.wedding_route_input_versions where wedding_id='1cd10000-0000-4000-8000-000000000101'")
start_gate
start_route_persist 1 1cd-route-reorder-persist-wins
wait_for_lock_wait 1cd-route-reorder-persist-wins
start_owner_reorder 1 1cd-owner-reorder-after-persist reverse
wait_for_lock_wait 1cd-owner-reorder-after-persist
release_gate
wait "$route_pid"
wait "$place_pid"
state=$(sql "select count(*)||'|'||(select version::text from collaboration_private.wedding_route_input_versions where wedding_id='1cd10000-0000-4000-8000-000000000101') from public.travel_segments where wedding_id='1cd10000-0000-4000-8000-000000000101'")
segment_count=${state%%|*}
route_version=${state#*|}
if [ "$segment_count" != '0' ] || [ "$route_version" -le "$before_reorder_version" ]; then echo "FAIL route-persist/reorder final state=$state baseline_generation=$before_reorder_version" >&2; exit 1; fi
echo 'PASS travel route-persist-wins vs reorder (new topology invalidated every old segment)'

# Studio origin mutation takes the owner row before route persistence's key-share.
sql "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public._1cd_test_refresh_route_snapshot('1cd10000-0000-4000-8000-000000000101'); commit" >/dev/null
start_gate
start_studio_origin 1cd-studio-origin-wins Warsaw
wait_for_lock_wait 1cd-studio-origin-wins
start_route_persist 1 1cd-route-origin-loses
wait_for_lock_wait 1cd-route-origin-loses
release_gate
wait "$origin_pid"
route_status=0
wait "$route_pid" || route_status=$?
if [ "$route_status" -eq 0 ] || ! rg -q 'STALE_ROUTE_INPUT' "$work_dir/1cd-route-origin-loses.log"; then
  echo 'FAIL route persistence accepted pre-origin-change snapshot' >&2
  exit 1
fi
sql "select case when count(*)=0 then 'clean' else 'bad' end from public.travel_segments where wedding_id='1cd10000-0000-4000-8000-000000000101'" | grep -qx clean
echo 'PASS travel studio-origin-wins (stale route rejected; no segments survive)'

sql "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public._1cd_test_refresh_route_snapshot('1cd10000-0000-4000-8000-000000000101'); commit" >/dev/null
start_gate
start_route_persist 1 1cd-route-origin-persist-wins
wait_for_lock_wait 1cd-route-origin-persist-wins
start_studio_origin 1cd-studio-origin-after-persist Krakow
wait_for_lock_wait 1cd-studio-origin-after-persist
release_gate
wait "$route_pid"
wait "$origin_pid"
sql "select case when count(*)=0 and (select version from collaboration_private.studio_route_input_versions where user_id='$owner_id')>1 then 'clean' else 'bad' end from public.travel_segments where wedding_id='1cd10000-0000-4000-8000-000000000101'" | grep -qx clean
echo 'PASS travel route-persist-wins vs studio-origin (new origin advanced version and invalidated all segments)'

# Recovery and owner place command both lock the owner identity before wedding
# state. Source-state changes by the owner must survive as the recovery loser.
reset_recovery 2
start_gate
start_recovery 2 none
wait_for_lock_wait 1cd-recovery-2
start_owner_place 2 1cd-owner-place-after-recovery 'D-PAUSE-OWNER-PLACE-AFTER-RECOVERY'
wait_for_lock_wait 1cd-owner-place-after-recovery
release_gate
wait "$recovery_pid"
wait "$place_pid"
echo 'PASS recovery-first vs owner-place (owner command waited on identity lock; both completed)'

reset_recovery 2
start_gate
start_owner_place 2 1cd-owner-place-first 'D-PAUSE-OWNER-PLACE-FIRST-RECOVERY'
wait_for_lock_wait 1cd-owner-place-first
start_recovery 2 expected
wait_for_lock_wait 1cd-recovery-2
release_gate
wait "$place_pid"
recovery_status=0
wait "$recovery_pid" || recovery_status=$?
if [ "$recovery_status" -eq 0 ] || ! rg -q 'CONTRACT_RECOVERY_WEDDING_CHANGED' "$work_dir/recovery-2.log"; then
  echo 'FAIL owner-place-first recovery did not return its stale source-state result' >&2
  exit 1
fi
echo 'PASS owner-place-first vs recovery (recovery stale result; place mutation preserved)'

# Recovery versus the legacy owner time field, which holds only the wedding row
# and does not take operational O or source-contract S.
reset_recovery 2
start_gate
start_recovery 2 none
wait_for_lock_wait 1cd-recovery-2
start_owner_time 2 1cd-owner-time-after-recovery 10:30
wait_for_lock_wait 1cd-owner-time-after-recovery
release_gate
wait "$recovery_pid"
wait "$time_pid"
echo 'PASS recovery-first vs owner ceremony-time (owner update waited on wedding; both completed)'

reset_recovery 2
start_gate
start_owner_time 2 1cd-owner-time-first 10:30
wait_for_lock_wait 1cd-owner-time-first
start_recovery 2 expected
wait_for_lock_wait 1cd-recovery-2
release_gate
wait "$time_pid"
recovery_status=0
wait "$recovery_pid" || recovery_status=$?
if [ "$recovery_status" -eq 0 ] || ! rg -q 'CONTRACT_RECOVERY_WEDDING_CHANGED' "$work_dir/recovery-2.log"; then
  echo 'FAIL owner-time-first recovery did not return its existing stale wedding result' >&2
  exit 1
fi
sql "select case when ceremony_time=time '10:30' then 'valid' else 'bad' end from public.weddings where id='1cd10000-0000-4000-8000-000000000102'" | grep -qx valid
echo 'PASS owner ceremony-time-first vs recovery (stale recovery rejected; time preserved)'

# Collaborator operational time uses wedding/O/membership/resource/version locks.
reset_recovery 2
start_gate
start_recovery 2 none
wait_for_lock_wait 1cd-recovery-2
start_collab_time 2 1cd-collab-time-after-recovery 12:00
wait_for_lock_wait 1cd-collab-time-after-recovery
release_gate
wait "$recovery_pid"
wait "$time_pid"
sql "select case when operational_time='12:00' and (select version from collaboration_private.wedding_operational_versions where wedding_id='1cd10000-0000-4000-8000-000000000102' and resource_type='operational_time' and role='ceremony')=1 then 'valid' else 'bad' end from public.wedding_operational_times where wedding_id='1cd10000-0000-4000-8000-000000000102'" | grep -qx valid
echo 'PASS recovery-first vs collaborator operational-time (both completed; time version advanced)'

reset_recovery 2
start_gate
start_collab_time 2 1cd-collab-time-first 12:30
wait_for_lock_wait 1cd-collab-time-first
start_recovery 2 none
wait_for_lock_wait 1cd-recovery-2
release_gate
wait "$time_pid"
wait "$recovery_pid"
sql "select case when operational_time='12:30' and (select version from collaboration_private.wedding_operational_versions where wedding_id='1cd10000-0000-4000-8000-000000000102' and resource_type='operational_time' and role='ceremony')=2 then 'valid' else 'bad' end from public.wedding_operational_times where wedding_id='1cd10000-0000-4000-8000-000000000102'" | grep -qx valid
echo 'PASS collaborator operational-time-first vs recovery (both completed; later time and version preserved)'

# Membership revoke serialization: a command that already holds FOR SHARE may
# commit before revoke; a command that arrives after revoke must be unavailable.
start_gate
start_address 1 'D-PAUSE-ADDRESS-BEFORE-REVOKE'
wait_for_lock_wait 1cd-address-1
start_revoke 1 1cd-revoke-after-address
wait_for_lock_wait 1cd-revoke-after-address
release_gate
wait "$address_pid"
wait "$revoke_pid"
sql "select case when status='revoked' and (select formatted_address from public.wedding_places where wedding_id='1cd10000-0000-4000-8000-000000000101' and role='ceremony')='D-PAUSE-ADDRESS-BEFORE-REVOKE' then 'valid' else 'bad' end from public.wedding_collaboration_memberships where wedding_id='1cd10000-0000-4000-8000-000000000101'" | grep -qx valid
echo 'PASS collaborator address-before-revoke (address committed under membership share lock; revoke committed afterward)'

sql "update public.wedding_collaboration_memberships set status='active',revoked_at=null,updated_at=now() where wedding_id='1cd10000-0000-4000-8000-000000000101'"
address_version_before=$(sql "select version from collaboration_private.wedding_operational_versions where wedding_id='1cd10000-0000-4000-8000-000000000101' and resource_type='place_address' and role='ceremony'")
start_gate
start_revoke 1 1cd-revoke-before-address
wait_for_lock_wait 1cd-revoke-before-address
start_address 1 'Address-after-revoke-must-not-write'
wait_for_lock_wait 1cd-address-1
sql "select application_name||' waits='||coalesce(wait_event,'none')||' blockers='||array_to_string(pg_catalog.pg_blocking_pids(pid),',') from pg_catalog.pg_stat_activity where application_name in ('1cd-revoke-before-address','1cd-address-1','1cd-test-gate') order by application_name" >&2
release_gate
wait "$revoke_pid"
address_status=0
wait "$address_pid" || address_status=$?
if [ "$address_status" -eq 0 ] || ! rg -q 'UNAVAILABLE' "$work_dir/address-1.log"; then
  echo 'FAIL address command after revoke did not return UNAVAILABLE' >&2
  exit 1
fi
sql "select case when m.status='revoked' and p.formatted_address='D-PAUSE-ADDRESS-BEFORE-REVOKE' and v.version=$address_version_before then 'valid' else 'bad' end from public.wedding_collaboration_memberships m join public.wedding_places p on p.wedding_id=m.wedding_id and p.role='ceremony' join collaboration_private.wedding_operational_versions v on v.wedding_id=m.wedding_id and v.resource_type='place_address' and v.role='ceremony' where m.wedding_id='1cd10000-0000-4000-8000-000000000101'" | grep -qx valid
echo 'PASS revoke-before-collaborator-address (command returned UNAVAILABLE; zero address/version mutation)'

start_gate
start_collab_time 2 1cd-collab-time-before-revoke 13:00
wait_for_lock_wait 1cd-collab-time-before-revoke
start_revoke 2 1cd-revoke-after-time
wait_for_lock_wait 1cd-revoke-after-time
release_gate
wait "$time_pid"
wait "$revoke_pid"
sql "select case when m.status='revoked' and ot.operational_time='13:00' and v.version=3 then 'valid' else 'bad' end from public.wedding_collaboration_memberships m join public.wedding_operational_times ot on ot.wedding_id=m.wedding_id join collaboration_private.wedding_operational_versions v on v.wedding_id=m.wedding_id and v.resource_type='operational_time' and v.role='ceremony' where m.wedding_id='1cd10000-0000-4000-8000-000000000102'" | grep -qx valid
echo 'PASS collaborator time-before-revoke (time committed under membership share lock; revoke committed afterward)'

sql "update public.wedding_collaboration_memberships set status='active',revoked_at=null,updated_at=now() where wedding_id='1cd10000-0000-4000-8000-000000000102'"
time_version_before=$(sql "select version from collaboration_private.wedding_operational_versions where wedding_id='1cd10000-0000-4000-8000-000000000102' and resource_type='operational_time' and role='ceremony'")
start_gate
start_revoke 2 1cd-revoke-before-time
wait_for_lock_wait 1cd-revoke-before-time
start_collab_time 2 1cd-collab-time-after-revoke 14:00
wait_for_lock_wait 1cd-collab-time-after-revoke
release_gate
wait "$revoke_pid"
time_status=0
wait "$time_pid" || time_status=$?
if [ "$time_status" -eq 0 ] || ! rg -q 'UNAVAILABLE' "$work_dir/1cd-collab-time-after-revoke.log"; then
  echo 'FAIL time command after revoke did not return UNAVAILABLE' >&2
  exit 1
fi
sql "select case when m.status='revoked' and ot.operational_time='13:00' and v.version=$time_version_before then 'valid' else 'bad' end from public.wedding_collaboration_memberships m join public.wedding_operational_times ot on ot.wedding_id=m.wedding_id join collaboration_private.wedding_operational_versions v on v.wedding_id=m.wedding_id and v.resource_type='operational_time' and v.role='ceremony' where m.wedding_id='1cd10000-0000-4000-8000-000000000102'" | grep -qx valid
echo 'PASS revoke-before-collaborator-time (command returned UNAVAILABLE; zero time/version mutation)'

reset_recovery 1
start_gate
start_recovery 1 none
wait_for_lock_wait 1cd-recovery-1
start_extra_mutation update 1 701 1cd-extra-update-after-recovery
wait_for_lock_wait 1cd-extra-update-after-recovery
release_gate
wait "$recovery_pid"
wait "$extra_pid"
sql "select case when quantity=2 and exists(select 1 from public.wedding_contract_recoveries where id='1cd10000-0000-4000-8000-000000000601' and status='applied') then 'consistent' else 'bad' end from public.wedding_extra_services where id='1cd10000-0000-4000-8000-000000000701'" | grep -qx consistent
echo 'PASS recovery-first vs extra UPDATE (extra waited on E; both committed; state consistent)'

reset_recovery 2
start_gate
start_extra_mutation delete 2 702 1cd-extra-delete-first
wait_for_lock_wait 1cd-extra-delete-first
start_recovery 2 none
wait_for_lock_wait 1cd-recovery-2
release_gate
wait "$extra_pid"
recovery_status=0
wait "$recovery_pid" || recovery_status=$?
if [ "$recovery_status" -eq 0 ] || ! rg -q 'CONTRACT_RECOVERY_WEDDING_CHANGED|CONTRACT_RECOVERY_NOT_FOUND|CONTRACT_RECOVERY_UNAUTHORIZED' "$work_dir/recovery-2.log"; then
  echo 'FAIL recovery after extra DELETE did not return a stale/unavailable result' >&2
  exit 1
fi
sql "select case when not exists(select 1 from public.wedding_extra_services where id='1cd10000-0000-4000-8000-000000000702') then 'deleted' else 'bad' end" | grep -qx deleted
echo 'PASS extra DELETE first vs recovery (recovery rejected stale snapshot; delete completed)'

reset_recovery 1
start_gate
start_extra_mutation update 1 701 1cd-extra-update-first
wait_for_lock_wait 1cd-extra-update-first
start_recovery 1 none
wait_for_lock_wait 1cd-recovery-1
release_gate
wait "$extra_pid"
recovery_status=0
wait "$recovery_pid" || recovery_status=$?
if [ "$recovery_status" -eq 0 ] || ! rg -q 'CONTRACT_RECOVERY_WEDDING_CHANGED|CONTRACT_RECOVERY_NOT_FOUND|CONTRACT_RECOVERY_UNAUTHORIZED' "$work_dir/recovery-1.log"; then
  echo 'FAIL recovery after extra UPDATE did not return a stale/unavailable result' >&2
  exit 1
fi
sql "select case when quantity=3 then 'updated' else 'bad' end from public.wedding_extra_services where id='1cd10000-0000-4000-8000-000000000701'" | grep -qx updated
echo 'PASS extra UPDATE first vs recovery (recovery rejected stale snapshot; update completed)'

reset_recovery 1
start_gate
start_recovery 1 none
wait_for_lock_wait 1cd-recovery-1
start_extra_mutation delete 1 701 1cd-extra-delete-after-recovery
wait_for_lock_wait 1cd-extra-delete-after-recovery
release_gate
wait "$recovery_pid"
wait "$extra_pid"
sql "select case when not exists(select 1 from public.wedding_extra_services where id='1cd10000-0000-4000-8000-000000000701') and exists(select 1 from public.wedding_contract_recoveries where id='1cd10000-0000-4000-8000-000000000601' and status='applied') then 'consistent' else 'bad' end" | grep -qx consistent
echo 'PASS recovery-first vs extra DELETE (delete waited on E; recovery and deletion both committed consistently)'

reset_recovery 1
start_gate
start_recovery 1 none
wait_for_lock_wait 1cd-recovery-1
start_form_submission 1 1cd-form-after-recovery
wait_for_lock_wait 1cd-form-after-recovery
release_gate
wait "$recovery_pid"
wait "$form_pid"
sql "select case when fi.status='submitted' and (select count(*) from public.form_answers fa where fa.instance_id=fi.id)=1 then 'valid' else 'bad' end from public.form_instances fi where fi.id='1cd10000-0000-4000-8000-000000000801'" | grep -qx valid
echo 'PASS recovery-first vs public form submission (form waited on E; both completed; exactly one answer)'

reset_recovery 2
start_gate
start_form_submission 2 1cd-form-first
wait_for_lock_wait 1cd-form-first
start_recovery 2 none
wait_for_lock_wait 1cd-recovery-2
release_gate
wait "$form_pid"
recovery_status=0
wait "$recovery_pid" || recovery_status=$?
if [ "$recovery_status" -ne 0 ] && ! rg -q 'CONTRACT_RECOVERY_WEDDING_CHANGED|CONTRACT_RECOVERY_NOT_FOUND|CONTRACT_RECOVERY_UNAUTHORIZED' "$work_dir/recovery-2.log"; then
  echo 'FAIL recovery after public form submission returned an unexpected error' >&2
  exit 1
fi
sql "select case when fi.status='submitted' and (select count(*) from public.form_answers fa where fa.instance_id=fi.id)=1 then 'valid' else 'bad' end from public.form_instances fi where fi.id='1cd10000-0000-4000-8000-000000000802'" | grep -qx valid
echo 'PASS public form submission first vs recovery (no duplicate/partial answer; recovery completed or returned valid stale state)'

# Wedding DELETE first holds the statement-level extra barrier before it reaches
# the wedding row. The owner command must still finish without a lock cycle.
start_gate
printf "begin; set local lock_timeout='10s'; set local statement_timeout='15s'; select set_config('request.jwt.claim.sub','$owner_id',true); delete from public.weddings where id='1cd10000-0000-4000-8000-000000000101'; commit;\n" |
  docker exec -i -e PGAPPNAME=1cd-delete-first "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/delete-first.log" 2>&1 &
delete_pid=$!
wait_for_lock_wait 1cd-delete-first
printf "begin; set local lock_timeout='10s'; set local statement_timeout='15s'; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public.mutate_owner_wedding_places('1cd10000-0000-4000-8000-000000000101','upsert','{\"role\":\"ceremony\",\"formatted_address\":\"Delete race owner update\"}'::jsonb); commit;\n" |
  docker exec -i -e PGAPPNAME=1cd-owner-place-delete-first "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/owner-place-delete-first.log" 2>&1 &
place_pid=$!
wait_for_lock_wait 1cd-owner-place-delete-first
release_gate
wait "$delete_pid"
place_status=0
wait "$place_pid" || place_status=$?
if [ "$place_status" -eq 0 ] || ! rg -q 'UNAVAILABLE' "$work_dir/owner-place-delete-first.log"; then
  echo 'FAIL delete-first owner-place command did not return the expected unavailable result' >&2
  exit 1
fi
sql "select case when not exists(select 1 from public.weddings where id='1cd10000-0000-4000-8000-000000000101') and not exists(select 1 from public.wedding_places where wedding_id='1cd10000-0000-4000-8000-000000000101') then 'clean' else 'bad' end" | grep -qx clean
echo 'PASS wedding-delete-first vs owner-place (delete won; owner command returned UNAVAILABLE; final wedding/places absent)'

# Owner place obtains the wedding/O/source locks first; DELETE must wait and
# then cascade cleanly after the route/place mutation commits.
start_gate
printf "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$owner_id',true); select public.mutate_owner_wedding_places('1cd10000-0000-4000-8000-000000000102','upsert','{\"role\":\"ceremony\",\"formatted_address\":\"D-PAUSE-OWNER-PLACE-FIRST\"}'::jsonb); commit;\n" |
  docker exec -i -e PGAPPNAME=1cd-owner-place-first "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/owner-place-first.log" 2>&1 &
address_pid=$!
wait_for_lock_wait 1cd-owner-place-first
printf "begin; set local lock_timeout='10s'; set local statement_timeout='15s'; select set_config('request.jwt.claim.sub','$owner_id',true); delete from public.weddings where id='1cd10000-0000-4000-8000-000000000102'; commit;\n" |
  docker exec -i -e PGAPPNAME=1cd-delete-after-place "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/delete-after-place.log" 2>&1 &
delete_pid=$!
wait_for_lock_wait 1cd-delete-after-place
release_gate
wait "$address_pid"
wait "$delete_pid"
sql "select case when not exists(select 1 from public.weddings where id='1cd10000-0000-4000-8000-000000000102') and not exists(select 1 from public.wedding_places where wedding_id='1cd10000-0000-4000-8000-000000000102') then 'clean' else 'bad' end" | grep -qx clean
echo 'PASS owner-place-first vs wedding-delete (delete waited; both completed; final wedding/places absent)'

# Recovery and deletion share E before wedding locks. Both deterministic orders
# must finish without leaving the wedding or its route children behind.
reset_recovery 3
start_gate
start_recovery 3 none
wait_for_lock_wait 1cd-recovery-3
printf "begin; set local lock_timeout='10s'; set local statement_timeout='15s'; select set_config('request.jwt.claim.sub','$owner_id',true); delete from public.weddings where id='1cd10000-0000-4000-8000-000000000103'; commit;\n" |
  docker exec -i -e PGAPPNAME=1cd-delete-after-recovery "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/delete-after-recovery.log" 2>&1 &
delete_pid=$!
wait_for_lock_wait 1cd-delete-after-recovery
release_gate
wait "$recovery_pid"
wait "$delete_pid"
sql "select case when not exists(select 1 from public.weddings where id='1cd10000-0000-4000-8000-000000000103') and not exists(select 1 from public.wedding_places where wedding_id='1cd10000-0000-4000-8000-000000000103') then 'clean' else 'bad' end" | grep -qx clean
echo 'PASS recovery-first vs wedding-delete (both completed; deletion left no wedding/place rows)'

start_gate
printf "begin; set local lock_timeout='10s'; set local statement_timeout='15s'; select set_config('request.jwt.claim.sub','$owner_id',true); delete from public.weddings where id='1cd10000-0000-4000-8000-000000000104'; commit;\n" |
  docker exec -i -e PGAPPNAME=1cd-delete-before-recovery "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/delete-before-recovery.log" 2>&1 &
delete_pid=$!
wait_for_lock_wait 1cd-delete-before-recovery
start_recovery 4 none
wait_for_lock_wait 1cd-recovery-4
release_gate
wait "$delete_pid"
recovery_status=0
wait "$recovery_pid" || recovery_status=$?
if [ "$recovery_status" -eq 0 ] || ! rg -q 'CONTRACT_RECOVERY_NOT_FOUND|CONTRACT_RECOVERY_UNAUTHORIZED|wedding_unavailable' "$work_dir/recovery-4.log"; then
  echo 'FAIL recovery after wedding deletion did not return its existing unavailable result' >&2
  exit 1
fi
sql "select case when not exists(select 1 from public.weddings where id='1cd10000-0000-4000-8000-000000000104') and not exists(select 1 from public.wedding_places where wedding_id='1cd10000-0000-4000-8000-000000000104') then 'clean' else 'bad' end" | grep -qx clean
echo 'PASS wedding-delete-first vs recovery (recovery returned unavailable; final wedding/place rows absent)'

# Collaborator address and operational-time writes must serialize with deletion
# in either winner order. The delete statement lock is taken before row locks;
# the paused row trigger makes the opposing request's wait observable.
start_gate
start_address 7 'D-PAUSE-ADDRESS-DELETE-FIRST'
wait_for_lock_wait 1cd-address-7
printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; select set_config('request.jwt.claim.sub','$owner_id',true); delete from public.weddings where id='1cd10000-0000-4000-8000-000000000107'; commit;\n" |
  docker exec -i -e PGAPPNAME=1cd-delete-after-address "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/delete-after-address.log" 2>&1 &
delete_pid=$!
wait_for_lock_wait 1cd-delete-after-address
release_gate
wait "$address_pid"
wait "$delete_pid"
sql "select case when not exists(select 1 from public.weddings where id='1cd10000-0000-4000-8000-000000000107') and not exists(select 1 from public.wedding_places where wedding_id='1cd10000-0000-4000-8000-000000000107') and not exists(select 1 from collaboration_private.wedding_operational_versions where wedding_id='1cd10000-0000-4000-8000-000000000107') then 'clean' else 'bad' end" | grep -qx clean
echo 'PASS collaborator-address-first vs wedding-delete (address committed; deletion removed wedding/place/version rows)'

start_gate
printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; select set_config('request.jwt.claim.sub','$owner_id',true); delete from public.weddings where id='1cd10000-0000-4000-8000-000000000109'; commit;\n" |
  docker exec -i -e PGAPPNAME=1cd-delete-before-address "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/delete-before-address.log" 2>&1 &
delete_pid=$!
wait_for_lock_wait 1cd-delete-before-address
start_address 9 'D-DELETE-WON-ADDRESS'
wait_for_lock_wait 1cd-address-9
address_status=0
release_gate
wait "$delete_pid"
wait "$address_pid" || address_status=$?
if [ "$address_status" -eq 0 ] || ! rg -q 'WEDDING_UNAVAILABLE|UNAVAILABLE|P0001' "$work_dir/address-9.log"; then
  echo 'FAIL collaborator address after wedding deletion did not return unavailable' >&2
  exit 1
fi
sql "select case when not exists(select 1 from public.weddings where id='1cd10000-0000-4000-8000-000000000109') and not exists(select 1 from public.wedding_places where wedding_id='1cd10000-0000-4000-8000-000000000109') then 'clean' else 'bad' end" | grep -qx clean
echo 'PASS wedding-delete-first vs collaborator-address (address returned unavailable; zero orphan place rows)'

start_gate
start_collab_time 8 1cd-collab-time-delete-first '10:15'
wait_for_lock_wait 1cd-collab-time-delete-first
printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; select set_config('request.jwt.claim.sub','$owner_id',true); delete from public.weddings where id='1cd10000-0000-4000-8000-000000000108'; commit;\n" |
  docker exec -i -e PGAPPNAME=1cd-delete-after-time "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/delete-after-time.log" 2>&1 &
delete_pid=$!
wait_for_lock_wait 1cd-delete-after-time
release_gate
wait "$time_pid"
wait "$delete_pid"
sql "select case when not exists(select 1 from public.weddings where id='1cd10000-0000-4000-8000-000000000108') and not exists(select 1 from public.wedding_operational_times where wedding_id='1cd10000-0000-4000-8000-000000000108') and not exists(select 1 from collaboration_private.wedding_operational_versions where wedding_id='1cd10000-0000-4000-8000-000000000108') then 'clean' else 'bad' end" | grep -qx clean
echo 'PASS collaborator-time-first vs wedding-delete (time committed; deletion removed time/version rows)'

start_gate
printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; select set_config('request.jwt.claim.sub','$owner_id',true); delete from public.weddings where id='1cd10000-0000-4000-8000-000000000110'; commit;\n" |
  docker exec -i -e PGAPPNAME=1cd-delete-before-time "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/delete-before-time.log" 2>&1 &
delete_pid=$!
wait_for_lock_wait 1cd-delete-before-time
start_collab_time 10 1cd-collab-time-delete-loses '10:30'
wait_for_lock_wait 1cd-collab-time-delete-loses
time_status=0
release_gate
wait "$delete_pid"
wait "$time_pid" || time_status=$?
if [ "$time_status" -eq 0 ] || ! rg -q 'WEDDING_UNAVAILABLE|UNAVAILABLE|P0001' "$work_dir/1cd-collab-time-delete-loses.log"; then
  echo 'FAIL collaborator time after wedding deletion did not return unavailable' >&2
  exit 1
fi
sql "select case when not exists(select 1 from public.weddings where id='1cd10000-0000-4000-8000-000000000110') and not exists(select 1 from public.wedding_operational_times where wedding_id='1cd10000-0000-4000-8000-000000000110') then 'clean' else 'bad' end" | grep -qx clean
echo 'PASS wedding-delete-first vs collaborator-time (time returned unavailable; zero orphan time rows)'

# Account erasure locks the owner/participants in UUID order before E. Exercise
# recovery-first on one disposable account, then erasure-first against recovery
# and a direct owner DELETE on a second disposable wedding/account.
reset_recovery 5
start_gate
start_recovery 5 none "$owner_id"
wait_for_lock_wait 1cd-recovery-5
start_erasure "$owner_id" 1cd-erasure-after-recovery
wait_for_lock_wait 1cd-erasure-after-recovery
release_gate
wait "$recovery_pid"
wait "$erase_pid"
sql "select case when not exists(select 1 from public.users where id='$owner_id') and not exists(select 1 from public.weddings where user_id='$owner_id') then 'erased' else 'bad' end" | grep -qx erased
echo 'PASS recovery-first vs account erasure (erasure waited on user lock; recovery and cleanup completed)'

start_gate
start_erasure "$member_id" 1cd-erasure-first
wait_for_lock_wait 1cd-erasure-first
start_recovery 6 none "$member_id"
wait_for_lock_wait 1cd-recovery-6
printf "begin; set local deadlock_timeout='250ms'; set local lock_timeout='10s'; set local statement_timeout='15s'; select set_config('request.jwt.claim.sub','$member_id',true); delete from public.weddings where id='1cd10000-0000-4000-8000-000000000106'; commit;\n" |
  docker exec -i -e PGAPPNAME=1cd-delete-after-erasure "$db_container" psql -X -U postgres -d "$db_name" -v ON_ERROR_STOP=1 > "$work_dir/delete-after-erasure.log" 2>&1 &
delete_pid=$!
wait_for_lock_wait 1cd-delete-after-erasure
release_gate
wait "$erase_pid"
recovery_status=0
wait "$recovery_pid" || recovery_status=$?
wait "$delete_pid"
if [ "$recovery_status" -eq 0 ] || ! rg -q 'CONTRACT_RECOVERY_NOT_FOUND|CONTRACT_RECOVERY_UNAUTHORIZED|wedding_unavailable' "$work_dir/recovery-6.log"; then
  echo 'FAIL recovery after account erasure did not return its unavailable result' >&2
  exit 1
fi
sql "select case when not exists(select 1 from public.users where id='$member_id') and not exists(select 1 from public.weddings where id='1cd10000-0000-4000-8000-000000000106') and not exists(select 1 from public.wedding_collaboration_memberships where owner_user_id='$member_id' and status='active') and not exists(select 1 from public.wedding_collaboration_invitations where owner_user_id='$member_id' and status='pending') then 'clean' else 'bad' end" | grep -qx clean
echo 'PASS account-erasure-first vs recovery and wedding-delete (both waited; no orphan active/pending lifecycle rows)'

# Distinguish tested deadlocks from ordinary expected errors in captured output.
if rg -q '40P01|deadlock detected' "$work_dir"/*.log; then
  echo 'FAIL SQLSTATE 40P01 observed in the tested races' >&2
  exit 1
fi
