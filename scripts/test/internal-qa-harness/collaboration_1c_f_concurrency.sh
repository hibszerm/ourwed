#!/bin/sh
set -eu
container=${OURWED_TEST_DB_CONTAINER:-supabase_db_ourwed-internal-qa-harness-20261012}
db=${OURWED_TEST_DATABASE:-postgres}
owner=1cf00000-0000-4000-8000-000000000001
member=1cf00000-0000-4000-8000-000000000002
connection=1cf10000-0000-4000-8000-000000000001
work=$(mktemp -d /private/tmp/ourwed-1cf-concurrency.XXXXXX)
gate_fd_open=0
gate_pid=

sql() { docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -Atc "$1"; }
cleanup() {
  result=$?
  if [ "$gate_fd_open" -eq 1 ]; then printf 'commit;\n' >&3 2>/dev/null || true; exec 3>&- 2>/dev/null || true; fi
  if [ -n "$gate_pid" ]; then wait "$gate_pid" 2>/dev/null || true; fi
  if ! docker exec -i "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 >"$work/cleanup.log" 2>&1 <<SQL
 drop trigger if exists _1cf_pause_membership on public.wedding_collaboration_memberships;
 drop trigger if exists _1cf_pause_invitation on public.wedding_collaboration_invitations;
 drop trigger if exists _1cf_pause_connection on public.collaboration_connections;
 drop trigger if exists _1cf_pause_accept on public.wedding_collaboration_memberships;
 drop trigger if exists _1cf_pause_revoke on public.wedding_collaboration_memberships;
 drop trigger if exists _1cf_pause_address_downgrade on public.wedding_collaboration_memberships;
 drop trigger if exists _1cf_pause_time_downgrade on public.wedding_collaboration_memberships;
 drop trigger if exists _1cf_pause_invitation_end on public.wedding_collaboration_invitations;
 drop trigger if exists _1cf_pause_delete on public.weddings;
 drop trigger if exists _1cf_pause_erasure_edit on public.wedding_collaboration_memberships;
 drop function if exists public._1cf_test_pause();
 delete from public.wedding_collaboration_memberships
   where id::text like '1cf30000-0000-4000-8000-%'
      or accepted_invitation_id::text like '1cf30000-0000-4000-8000-%'
      or wedding_id_snapshot::text like '1cf20000-0000-4000-8000-%';
 delete from public.wedding_collaboration_invitations
   where id::text like '1cf30000-0000-4000-8000-%'
      or wedding_id_snapshot::text like '1cf20000-0000-4000-8000-%';
 delete from public.weddings where id::text like '1cf20000-0000-4000-8000-%';
 delete from public.collaboration_connections where id='$connection';
 delete from auth.users where id in ('$owner','$member');
SQL
  then
    cat "$work/cleanup.log" >&2
    result=1
  fi
  remaining=$(docker exec "$container" psql -X -U postgres -d "$db" -Atc "select
    (select count(*) from auth.users where id in ('$owner','$member'))+
    (select count(*) from public.weddings where id::text like '1cf20000-0000-4000-8000-%')+
    (select count(*) from public.wedding_collaboration_invitations where id::text like '1cf30000-0000-4000-8000-%')+
    (select count(*) from public.collaboration_connections where id='$connection')")
  if [ "$remaining" != 0 ]; then echo "1C-F cleanup left $remaining disposable rows" >&2; result=1; fi
  if [ "$result" -eq 0 ]; then rm -rf "$work"; else echo "1C-F race logs retained at $work" >&2; fi
}
trap cleanup EXIT HUP INT TERM

# Fixed synthetic IDs are unique to this task's disposable test stack. Never
# clean the shared Internal QA harness; select its container explicitly.
if [ "$(sql "select count(*) from auth.users where id in ('$owner','$member')")" != 0 ] ||
   [ "$(sql "select count(*) from public.weddings where id::text like '1cf20000-0000-4000-8000-%'")" != 0 ] ||
   [ "$(sql "select count(*) from public.collaboration_connections where id='$connection'")" != 0 ] ||
   [ "$(sql "select count(*) from public.wedding_collaboration_invitations where id::text like '1cf30000-0000-4000-8000-%'")" != 0 ] ||
   [ "$(sql "select count(*) from public.wedding_collaboration_memberships where accepted_invitation_id::text like '1cf30000-0000-4000-8000-%'")" != 0 ]; then
  echo 'FAIL 1C-F concurrency fixture ID collision' >&2; exit 1
fi

docker exec -i "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','$owner','authenticated','authenticated','1cf-owner@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','$member','authenticated','authenticated','1cf-member@example.test','x',now(),'{}','{"legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());
insert into public.weddings(id,user_id,bride_name,groom_name,status)
select ('1cf20000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'$owner','Local','Race '||n,'active' from generate_series(1,8) n;
insert into public.collaboration_connections(id,participant_low_id,participant_high_id,participant_low_name_snapshot,participant_high_name_snapshot,status)
values('$connection','$owner','$member','Owner','Member','active');
insert into public.wedding_collaboration_invitations(
 id,wedding_id,wedding_id_snapshot,owner_user_id,invitee_user_id,source_connection_id,status,terms_version,
 currency_snapshot,terms_snapshot,idempotency_key,accepted_at,access_configuration_version,role_key,access_mode,permission_group_mapping_version)
select ('1cf30000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('1cf20000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('1cf20000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'$owner','$member','$connection',
 case when n<=4 then 'accepted' else 'pending' end,1,'PLN','{}'::jsonb,
 ('1cf40000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n<=4 then now() else null end,1,'unspecified','editor','1'
from generate_series(1,8) n;
insert into public.wedding_collaboration_memberships(wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,accepted_invitation_id,status,accepted_at,role_key,access_mode)
select i.wedding_id,i.wedding_id,'$owner','$member',i.id,'active',now(),'unspecified','editor'
from public.wedding_collaboration_invitations i where i.id in
 ('1cf30000-0000-4000-8000-000000000001','1cf30000-0000-4000-8000-000000000002','1cf30000-0000-4000-8000-000000000003','1cf30000-0000-4000-8000-000000000004');
insert into public.wedding_places(id,wedding_id,role,formatted_address,sort_order,place_id,latitude,longitude)
select ('1cf50000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('1cf20000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ceremony','Race address '||n,30,'race-place-'||n,1,2 from generate_series(3,4) n;
insert into public.wedding_operational_times(wedding_id,stop_key,operational_time)
select ('1cf20000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('1cf50000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'09:00' from generate_series(3,4) n;
create function public._1cf_test_pause() returns trigger language plpgsql set search_path='' as \$\$
begin
 if pg_catalog.current_setting('application_name',true)=tg_argv[0]
   and (case when tg_table_name='wedding_collaboration_memberships'
       then coalesce(pg_catalog.to_jsonb(new)->>'accepted_invitation_id',pg_catalog.to_jsonb(old)->>'accepted_invitation_id')=tg_argv[1]
       when tg_table_name in ('wedding_collaboration_invitations','collaboration_connections','weddings')
       then coalesce(pg_catalog.to_jsonb(new)->>'id',pg_catalog.to_jsonb(old)->>'id')=tg_argv[1]
       else false end)
 then perform pg_catalog.pg_advisory_xact_lock(28654,tg_argv[2]::integer); end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; \$\$;
create trigger _1cf_pause_membership before update on public.wedding_collaboration_memberships for each row execute function public._1cf_test_pause('1cf-membership-edit-first','1cf30000-0000-4000-8000-000000000001','61');
create trigger _1cf_pause_invitation before update on public.wedding_collaboration_invitations for each row execute function public._1cf_test_pause('1cf-invitation-edit-first','1cf30000-0000-4000-8000-000000000005','62');
create trigger _1cf_pause_address_downgrade before update on public.wedding_collaboration_memberships for each row execute function public._1cf_test_pause('1cf-address-downgrade','1cf30000-0000-4000-8000-000000000003','65');
create trigger _1cf_pause_time_downgrade before update on public.wedding_collaboration_memberships for each row execute function public._1cf_test_pause('1cf-time-downgrade','1cf30000-0000-4000-8000-000000000004','66');
create trigger _1cf_pause_invitation_end before update on public.wedding_collaboration_invitations for each row execute function public._1cf_test_pause('1cf-invitation-end-edit','1cf30000-0000-4000-8000-000000000007','67');
create trigger _1cf_pause_delete before delete on public.weddings for each row execute function public._1cf_test_pause('1cf-delete-first','1cf20000-0000-4000-8000-000000000003','68');
create trigger _1cf_pause_erasure_edit before update on public.wedding_collaboration_memberships for each row execute function public._1cf_test_pause('1cf-management-first','1cf30000-0000-4000-8000-000000000004','69');
SQL

start_gate() {
  key=$1; fifo="$work/gate-$key.fifo"; mkfifo "$fifo"
  docker exec -i -e PGAPPNAME=1cf-gate "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 < "$fifo" >"$work/gate-$key.log" 2>&1 & gate_pid=$!
  exec 3>"$fifo"; gate_fd_open=1
  printf "begin; select pg_catalog.pg_advisory_xact_lock(28654,$key); select 'GATE_READY';\n" >&3
  i=0; while [ "$i" -lt 200 ]; do
    [ "$(sql "select count(*) from pg_stat_activity where application_name='1cf-gate' and state='idle in transaction'")" -ge 1 ] && return 0
    i=$((i+1)); sleep 0.05
  done
  echo 'FAIL advisory gate did not become ready' >&2; return 1
}
release_gate() { printf 'commit;\n' >&3; exec 3>&-; gate_fd_open=0; wait "$gate_pid"; gate_pid=; }
wait_lock() {
  app=$1; i=0; while [ "$i" -lt 300 ]; do
    [ "$(sql "select count(*) from pg_stat_activity where application_name='$app' and wait_event_type='Lock'")" -ge 1 ] && return 0
    i=$((i+1)); sleep 0.05
  done
  sql "select application_name,state,wait_event_type,wait_event from pg_stat_activity where application_name like '1cf-%'" >&2
  echo "FAIL $app did not reach a PostgreSQL lock barrier" >&2; return 1
}
start_actor() {
  app=$1; actor=$2; statement=$3; log=$4
  docker exec -i -e "PGAPPNAME=$app" "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 >"$work/$log" 2>&1 <<SQL &
set lock_timeout='15s'; set statement_timeout='20s'; begin; set local role authenticated;
select set_config('request.jwt.claim.sub','$actor',true);
$statement
commit;
SQL
  actor_pid=$!
}
check_nondeadlock() { ! rg -q '40P01|deadlock detected|lock timeout' "$work"/*.log; }

# Membership edit wins against revoke: both lock actual authority rows; no
# timing sleeps are used to decide ordering, only PostgreSQL lock observation.
start_gate 61
membership1=$(sql "select id from public.wedding_collaboration_memberships where accepted_invitation_id='1cf30000-0000-4000-8000-000000000001'")
start_actor 1cf-membership-edit-first "$owner" "select public.update_wedding_collaboration_membership_access('1cf20000-0000-4000-8000-000000000001','$membership1','1','system:photographer',null,'viewer',null);" edit-first.log
edit_pid=$actor_pid
wait_lock 1cf-membership-edit-first
start_actor 1cf-revoke-waits "$owner" "select public.revoke_wedding_collaboration_membership('$membership1','1cf70000-0000-4000-8000-000000000001');" revoke-after-edit.log
revoke_pid=$actor_pid
wait_lock 1cf-revoke-waits
release_gate
wait "$edit_pid"; wait "$revoke_pid"
[ "$(sql "select status||':'||access_version::text from public.wedding_collaboration_memberships where id='$membership1'")" = 'revoked:3' ]
echo 'PASS 1C-F membership access edit wins then revoke completes; no authority restoration'

# Revoke wins against access edit: edit sees terminal state and remains zero-write.
membership2=$(sql "select id from public.wedding_collaboration_memberships where accepted_invitation_id='1cf30000-0000-4000-8000-000000000002'")
docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c \
 "create trigger _1cf_pause_revoke before update on public.wedding_collaboration_memberships for each row execute function public._1cf_test_pause('1cf-revoke-first','1cf30000-0000-4000-8000-000000000002','63')" >/dev/null
start_gate 63
start_actor 1cf-revoke-first "$owner" "select public.revoke_wedding_collaboration_membership('$membership2','1cf70000-0000-4000-8000-000000000002');" revoke-first.log
revoke_pid=$actor_pid
wait_lock 1cf-revoke-first
start_actor 1cf-edit-after-revoke "$owner" "select public.update_wedding_collaboration_membership_access('1cf20000-0000-4000-8000-000000000002','$membership2','1','system:photographer',null,'viewer',null);" edit-after-revoke.log
edit_pid=$actor_pid
wait_lock 1cf-edit-after-revoke
release_gate
wait "$revoke_pid"; edit_status=0; wait "$edit_pid" || edit_status=$?
[ "$edit_status" -ne 0 ] && rg -q 'membership_unavailable|UNAVAILABLE' "$work/edit-after-revoke.log"
[ "$(sql "select status||':'||access_version::text from public.wedding_collaboration_memberships where id='$membership2'")" = 'revoked:2' ]
echo 'PASS 1C-F revoke wins; later access edit is UNAVAILABLE and leaves terminal version unchanged'

# Pending configuration edit wins against acceptance; acceptance receives the
# full new configuration after waiting on the invitation lifecycle locks.
start_gate 62
start_actor 1cf-invitation-edit-first "$owner" "select public.update_wedding_collaboration_invitation_access('1cf20000-0000-4000-8000-000000000005','1cf30000-0000-4000-8000-000000000005','1','system:assistant',null,'custom','[{\"capability_key\":\"wedding.identity\",\"level\":1}]'::jsonb);" invite-edit-first.log
edit_pid=$actor_pid
wait_lock 1cf-invitation-edit-first
start_actor 1cf-accept-waits "$member" "select public.accept_wedding_collaboration_invite('1cf30000-0000-4000-8000-000000000005','1cf70000-0000-4000-8000-000000000005');" accept-after-edit.log
accept_pid=$actor_pid
wait_lock 1cf-accept-waits
release_gate
wait "$edit_pid"; wait "$accept_pid"
[ "$(sql "select m.role_key||':'||m.access_mode||':'||(select string_agg(g.capability_key||'='||g.level,',' order by g.capability_key) from collaboration_private.membership_permission_grants g where g.membership_id=m.id) from public.wedding_collaboration_memberships m where m.accepted_invitation_id='1cf30000-0000-4000-8000-000000000005'")" = 'system:assistant:custom:wedding.identity=1' ]
echo 'PASS 1C-F invitation edit wins and acceptance copies one complete v1 Custom snapshot'

# Acceptance wins against invitation management; the owner edit sees accepted
# state and cannot alter the invitation after membership creation.
docker exec "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c \
 "create trigger _1cf_pause_accept before insert on public.wedding_collaboration_memberships for each row execute function public._1cf_test_pause('1cf-accept-first','1cf30000-0000-4000-8000-000000000006','64')" >/dev/null
start_gate 64
start_actor 1cf-accept-first "$member" "select public.accept_wedding_collaboration_invite('1cf30000-0000-4000-8000-000000000006','1cf70000-0000-4000-8000-000000000006');" accept-first.log
accept_pid=$actor_pid
wait_lock 1cf-accept-first
start_actor 1cf-edit-after-accept "$owner" "select public.update_wedding_collaboration_invitation_access('1cf20000-0000-4000-8000-000000000006','1cf30000-0000-4000-8000-000000000006','1','system:assistant',null,'custom','[{\"capability_key\":\"wedding.identity\",\"level\":1}]'::jsonb);" edit-after-accept.log
edit_pid=$actor_pid
wait_lock 1cf-edit-after-accept
release_gate
wait "$accept_pid"; edit_status=0; wait "$edit_pid" || edit_status=$?
[ "$edit_status" -ne 0 ] && rg -q 'invitation_unavailable|UNAVAILABLE' "$work/edit-after-accept.log"
[ "$(sql "select i.status||':'||i.role_key||':'||m.role_key||':'||m.access_mode from public.wedding_collaboration_invitations i join public.wedding_collaboration_memberships m on m.accepted_invitation_id=i.id where i.id='1cf30000-0000-4000-8000-000000000006'")" = 'accepted:unspecified:unspecified:editor' ]
echo 'PASS 1C-F acceptance wins; later invitation update is UNAVAILABLE with original full configuration'

# A Viewer downgrade takes the membership update lock before either domain
# mutation can authorize. Both address and operational-time writes must wait,
# then fail under current authority while the membership remains active.
membership3=$(sql "select id from public.wedding_collaboration_memberships where accepted_invitation_id='1cf30000-0000-4000-8000-000000000003'")
start_gate 65
start_actor 1cf-address-downgrade "$owner" "select public.update_wedding_collaboration_membership_access('1cf20000-0000-4000-8000-000000000003','$membership3','1','unspecified',null,'viewer',null);" address-downgrade.log
edit_pid=$actor_pid
wait_lock 1cf-address-downgrade
start_actor 1cf-address-after-downgrade "$member" "select public.update_collaborative_wedding_place('1cf20000-0000-4000-8000-000000000003','ceremony','Stale writer address','1');" address-after-downgrade.log
write_pid=$actor_pid
wait_lock 1cf-address-after-downgrade
release_gate
wait "$edit_pid"; write_status=0; wait "$write_pid" || write_status=$?
[ "$write_status" -ne 0 ] && rg -q 'FORBIDDEN' "$work/address-after-downgrade.log"
[ "$(sql "select m.status||':'||m.access_mode||':'||p.formatted_address from public.wedding_collaboration_memberships m join public.wedding_places p on p.wedding_id=m.wedding_id where m.id='$membership3'")" = 'active:viewer:Race address 3' ]
echo 'PASS 1C-F downgrade wins; stale collaborator address write returns FORBIDDEN with no data mutation'

membership4=$(sql "select id from public.wedding_collaboration_memberships where accepted_invitation_id='1cf30000-0000-4000-8000-000000000004'")
start_gate 66
start_actor 1cf-time-downgrade "$owner" "select public.update_wedding_collaboration_membership_access('1cf20000-0000-4000-8000-000000000004','$membership4','1','unspecified',null,'viewer',null);" time-downgrade.log
edit_pid=$actor_pid
wait_lock 1cf-time-downgrade
start_actor 1cf-time-after-downgrade "$member" "select public.update_collaborative_operational_time('1cf20000-0000-4000-8000-000000000004','ceremony','11:30','1');" time-after-downgrade.log
write_pid=$actor_pid
wait_lock 1cf-time-after-downgrade
release_gate
wait "$edit_pid"; write_status=0; wait "$write_pid" || write_status=$?
[ "$write_status" -ne 0 ] && rg -q 'FORBIDDEN' "$work/time-after-downgrade.log"
[ "$(sql "select m.status||':'||m.access_mode||':'||t.operational_time from public.wedding_collaboration_memberships m join public.wedding_operational_times t on t.wedding_id=m.wedding_id where m.id='$membership4'")" = 'active:viewer:09:00' ]
echo 'PASS 1C-F downgrade wins; stale collaborator operational-time write returns FORBIDDEN with no data mutation'

# Pending edit serializes with ending the source connection. The edit holds
# participant locks and the source lifecycle rows first; ending waits, then
# terminalizes the pending invitation without losing the complete snapshot.
start_gate 67
start_actor 1cf-invitation-end-edit "$owner" "select public.update_wedding_collaboration_invitation_access('1cf20000-0000-4000-8000-000000000007','1cf30000-0000-4000-8000-000000000007','1','system:assistant',null,'custom','[{\"capability_key\":\"wedding.identity\",\"level\":1}]'::jsonb);" invite-before-end.log
edit_pid=$actor_pid
wait_lock 1cf-invitation-end-edit
start_actor 1cf-connection-end "$owner" "select public.end_collaboration('$connection','1cf70000-0000-4000-8000-000000000007');" end-after-invite-edit.log
end_pid=$actor_pid
wait_lock 1cf-connection-end
release_gate
wait "$edit_pid"; wait "$end_pid"
[ "$(sql "select status||':'||role_key||':'||access_mode from public.wedding_collaboration_invitations where id='1cf30000-0000-4000-8000-000000000007'")" = 'cancelled:system:assistant:custom' ]
echo 'PASS 1C-F pending access edit serializes with global connection end and preserves terminal configuration'

# Wedding deletion wins after its row lock; a waiting owner management update
# returns unavailable and cannot revive configuration for a deleted wedding.
start_gate 68
docker exec -i -e PGAPPNAME=1cf-delete-first "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 >"$work/delete-first.log" 2>&1 <<SQL &
set lock_timeout='15s'; set statement_timeout='20s'; begin; select set_config('request.jwt.claim.sub','$owner',true);
delete from public.weddings where id='1cf20000-0000-4000-8000-000000000003'; commit;
SQL
delete_pid=$!
wait_lock 1cf-delete-first
start_actor 1cf-management-after-delete "$owner" "select public.update_wedding_collaboration_membership_access('1cf20000-0000-4000-8000-000000000003','$membership3','2','system:photographer',null,'editor',null);" update-after-delete.log
update_pid=$actor_pid
wait_lock 1cf-management-after-delete
release_gate
wait "$delete_pid"; update_status=0; wait "$update_pid" || update_status=$?
[ "$update_status" -ne 0 ] && rg -q 'UNAVAILABLE|membership_unavailable' "$work/update-after-delete.log"
[ "$(sql "select count(*) from public.weddings where id='1cf20000-0000-4000-8000-000000000003'")" = 0 ]
echo 'PASS 1C-F wedding deletion wins; waiting management update is unavailable'

# Management takes the ordered participant locks before its membership write.
# A concurrent account erase waits behind that committed management command,
# then removes access without leaving an active/pending row for the erased user.
membership4=$(sql "select id from public.wedding_collaboration_memberships where accepted_invitation_id='1cf30000-0000-4000-8000-000000000004'")
start_gate 69
start_actor 1cf-management-first "$owner" "select public.update_wedding_collaboration_membership_access('1cf20000-0000-4000-8000-000000000004','$membership4','2','system:assistant',null,'custom','[{\"capability_key\":\"wedding.identity\",\"level\":1}]'::jsonb);" management-before-erasure.log
edit_pid=$actor_pid
wait_lock 1cf-management-first
docker exec -i -e PGAPPNAME=1cf-erasure-after-management "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 >"$work/erasure-after-management.log" 2>&1 <<SQL &
delete from auth.users where id='$member';
SQL
erasure_pid=$!
wait_lock 1cf-erasure-after-management
release_gate
wait "$edit_pid"; wait "$erasure_pid"
[ "$(sql "select count(*) from auth.users where id='$member'")" = 0 ]
[ "$(sql "select count(*) from public.wedding_collaboration_memberships where member_user_id='$member' and status='active'")" = 0 ]
[ "$(sql "select count(*) from public.wedding_collaboration_invitations where invitee_user_id='$member' and status='pending'")" = 0 ]
echo 'PASS 1C-F management edit commits before account erasure; erasure leaves no active or pending access'

check_nondeadlock || { echo 'FAIL SQLSTATE 40P01 or lock timeout in 1C-F barrier races' >&2; exit 1; }
echo 'PASS 1C-F barrier races completed without deadlock or lock timeout'
