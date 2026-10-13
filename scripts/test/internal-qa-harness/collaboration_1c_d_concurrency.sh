#!/bin/sh
set -eu

db_container=supabase_db_ourwed-internal-qa-harness-20261012
owner_id=1cd00000-0000-4000-8000-000000000001
member_id=1cd00000-0000-4000-8000-000000000002
wedding_id=1cd00000-0000-4000-8000-000000000101
invite_id=1cd00000-0000-4000-8000-000000000201
place_id=1cd00000-0000-4000-8000-000000000301
work_dir=$(mktemp -d /private/tmp/ourwed-1cd-concurrency.XXXXXX)

cleanup() {
  docker exec "$db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
    "delete from public.wedding_collaboration_memberships where wedding_id_snapshot='$wedding_id'; delete from public.wedding_collaboration_invitations where wedding_id_snapshot='$wedding_id'; delete from public.weddings where id='$wedding_id'; delete from auth.users where id in ('$owner_id','$member_id');" \
    >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT HUP INT TERM

# Older interrupted runs may have left lifecycle rows behind because invitation
# history is intentionally retained when a wedding is deleted. Remove only this
# runner's fixed synthetic IDs before checking for collisions.
docker exec "$db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "delete from public.wedding_collaboration_memberships where wedding_id_snapshot='$wedding_id'; delete from public.wedding_collaboration_invitations where wedding_id_snapshot='$wedding_id'; delete from public.weddings where id='$wedding_id'; delete from auth.users where id in ('$owner_id','$member_id');" \
  >/dev/null

docker exec "$db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc \
  "select case when exists(select 1 from auth.users where id in ('$owner_id','$member_id')) or exists(select 1 from public.weddings where id='$wedding_id') or exists(select 1 from public.wedding_collaboration_invitations where id='$invite_id') then 'COLLISION' else 'CLEAR' end" |
  grep -qx CLEAR

docker exec -i "$db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','$owner_id','authenticated','authenticated','1cd-owner@example.test','x',now(),
  '{"provider":"email","providers":["email"]}',
  '{"first_name":"Local","last_name":"Owner","profession":"photographer","legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','$member_id','authenticated','authenticated','1cd-member@example.test','x',now(),
  '{"provider":"email","providers":["email"]}',
  '{"first_name":"Local","last_name":"Member","profession":"photographer","legal_registration_accepted":"true","terms_version":"1.1","privacy_version":"1.1"}',now(),now());
insert into public.weddings(id,user_id,bride_name,groom_name,status)
values('$wedding_id','$owner_id','Local','Fixture','active');
insert into public.wedding_collaboration_invitations(
  id,wedding_id,wedding_id_snapshot,owner_user_id,invitee_user_id,status,terms_version,
  currency_snapshot,terms_snapshot,idempotency_key,accepted_at)
values('$invite_id','$wedding_id','$wedding_id','$owner_id','$member_id','accepted',1,
  'PLN','{}'::jsonb,extensions.gen_random_uuid(),now());
insert into public.wedding_collaboration_memberships(
  wedding_id,wedding_id_snapshot,owner_user_id,member_user_id,accepted_invitation_id,status,accepted_at)
values('$wedding_id','$wedding_id','$owner_id','$member_id','$invite_id','active',now());
insert into public.wedding_places(id,wedding_id,role,formatted_address,sort_order,place_id,latitude,longitude)
values('$place_id','$wedding_id','ceremony','Original address',30,'fixture-place',1,2);
commit;
SQL

run_write() {
  token=$1
  value=$2
  wait_after=$3
  docker exec -i "$db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 >"$work_dir/$token.log" 2>&1 <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','$member_id',true);
select public.update_collaborative_wedding_place('$wedding_id','ceremony','$value','1');
select pg_catalog.pg_sleep($wait_after);
commit;
SQL
}

run_write first 'Race winner A' 1 &
first_pid=$!
sleep 0.2
run_write second 'Race winner B' 0 &
second_pid=$!
first_status=0
second_status=0
wait "$first_pid" || first_status=$?
wait "$second_pid" || second_status=$?

if [ "$first_status" -eq 0 ] && [ "$second_status" -ne 0 ] && grep -q 'CONFLICT' "$work_dir/second.log"; then
  winner=first
elif [ "$second_status" -eq 0 ] && [ "$first_status" -ne 0 ] && grep -q 'CONFLICT' "$work_dir/first.log"; then
  winner=second
else
  cat "$work_dir/first.log" "$work_dir/second.log"
  echo 'FAIL concurrent optimistic write did not produce exactly one winner and one conflict' >&2
  exit 1
fi

state=$(docker exec "$db_container" psql -X -U postgres -d postgres -Atc \
  "select p.formatted_address||'|'||v.version::text from public.wedding_places p join collaboration_private.wedding_operational_versions v on v.wedding_id=p.wedding_id and v.resource_type='place_address' and v.role=p.role where p.wedding_id='$wedding_id' and p.role='ceremony'")
case "$state" in
  'Race winner A|2'|'Race winner B|2') ;;
  *) echo "FAIL unexpected committed concurrent state: $state" >&2; exit 1 ;;
esac

printf 'PASS 1C-D concurrent optimistic write race (one commit, one CONFLICT; winner=%s; final generation=2)\n' "$winner"
