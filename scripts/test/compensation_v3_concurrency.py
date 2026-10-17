#!/usr/bin/env python3
"""Real multi-session CAS races for the isolated V3 Compensation database."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass


CONTAINER = "ourwed-v3-notes-test-db"
DATABASE = os.environ.get(
    "OURWED_COMPENSATION_TEST_DATABASE", "ourwed_compensation_v3_runtime_20261017"
)
HOLD_SECONDS = 1.25


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def run_psql(sql: str, *, allow_error: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        [
            "docker", "exec", "-i", CONTAINER,
            "psql", "-X", "-qAt", "-U", "postgres", "-d", DATABASE,
            "-v", "ON_ERROR_STOP=1",
        ],
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode and not allow_error:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result


def result_text(result: subprocess.CompletedProcess[str]) -> str:
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return lines[-1] if lines else ""


def check_safe_target() -> None:
    inspected = subprocess.run(
        ["docker", "inspect", CONTAINER], text=True, capture_output=True, check=True
    )
    metadata = json.loads(inspected.stdout)[0]
    if metadata["Name"] != f"/{CONTAINER}":
        raise RuntimeError("unexpected container identity")
    host = metadata["HostConfig"]
    if host.get("NetworkMode") != "none" or metadata.get("Mounts") or host.get("PortBindings"):
        raise RuntimeError("refusing non-isolated Compensation database container")
    if result_text(run_psql(
        "select 1 from pg_database where datname=" + sql_literal(DATABASE) + ";"
    )) != "1":
        raise RuntimeError("the named disposable Compensation database is missing")


@dataclass
class Actors:
    owner: str
    comp_a: str
    comp_b: str
    wedding: str
    connection_a: str
    connection_b: str
    invitation_a: str
    invitation_b: str
    membership_a: str
    membership_b: str
    relationship_a: str
    relationship_b: str
    payment: str


def make_actor() -> str:
    return str(uuid.uuid4())


def auth_user_row(user_id: str, suffix: str) -> str:
    metadata = json.dumps({
        "legal_registration_accepted": True,
        "terms_version": "1.1",
        "privacy_version": "1.1",
    }, separators=(",", ":"))
    return "(" + ",".join([
        sql_literal(str(uuid.uuid4())) + "::uuid",
        sql_literal(user_id) + "::uuid",
        "'authenticated'", "'authenticated'",
        sql_literal(f"comp-race-{suffix}-{user_id[:8]}@example.test"), "'x'",
        "pg_catalog.now()", "'{}'::jsonb", sql_literal(metadata) + "::jsonb",
        "pg_catalog.now()", "pg_catalog.now()",
    ]) + ")"


def as_actor(user_id: str, statement: str, sleep_after: float = 0) -> str:
    return "\n".join([
        "begin;",
        "set local role authenticated;",
        "select pg_catalog.set_config('request.jwt.claim.sub'," + sql_literal(user_id) + ",true);",
        statement.rstrip(";") + ";",
        f"select pg_catalog.pg_sleep({sleep_after});" if sleep_after else "",
        "commit;",
    ])


def create_fixture() -> Actors:
    owner, comp_a, comp_b = make_actor(), make_actor(), make_actor()
    wedding, connection_a, connection_b = make_actor(), make_actor(), make_actor()
    payment = make_actor()
    users = ",\n".join([
        auth_user_row(owner, "owner"),
        auth_user_row(comp_a, "a"),
        auth_user_row(comp_b, "b"),
    ])
    low_a, high_a = sorted((owner, comp_a))
    low_b, high_b = sorted((owner, comp_b))
    run_psql(f"""
      insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values {users};
      insert into public.internal_qa_accounts(user_id,provisioned_by,purpose)
        values ({sql_literal(owner)}::uuid,'Compensation concurrency harness','disposable isolated owner');
      insert into public.weddings(id,user_id,bride_name,groom_name,wedding_date,status,contract_value,currency)
        values ({sql_literal(wedding)}::uuid,{sql_literal(owner)}::uuid,'Race','Owner','2027-06-01','active',10000,'PLN');
      insert into public.collaboration_connections(id,participant_low_id,participant_high_id,
        participant_low_name_snapshot,participant_high_name_snapshot,status) values
        ({sql_literal(connection_a)}::uuid,{sql_literal(low_a)}::uuid,{sql_literal(high_a)}::uuid,'Race participant','Race participant','active'),
        ({sql_literal(connection_b)}::uuid,{sql_literal(low_b)}::uuid,{sql_literal(high_b)}::uuid,'Race participant','Race participant','active');
    """)
    areas_a = '{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":2}'
    areas_b = '{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":1}'
    invitation_a = result_text(run_psql(as_actor(owner, f"""
      select public.create_wedding_collaboration_invitation_v3(
        {sql_literal(wedding)}::uuid,{sql_literal(connection_a)}::uuid,null,{sql_literal(make_actor())}::uuid,
        'system:photographer',null,'custom',{sql_literal(areas_a)}::jsonb)->>'invitation_id'
    """))).strip('"')
    invitation_b = result_text(run_psql(as_actor(owner, f"""
      select public.create_wedding_collaboration_invitation_v3(
        {sql_literal(wedding)}::uuid,{sql_literal(connection_b)}::uuid,null,{sql_literal(make_actor())}::uuid,
        'system:photographer',null,'custom',{sql_literal(areas_b)}::jsonb)->>'invitation_id'
    """))).strip('"')
    membership_a = result_text(run_psql(as_actor(comp_a, f"""
      select public.accept_wedding_collaboration_invite({sql_literal(invitation_a)}::uuid,{sql_literal(make_actor())}::uuid)->>'membership_id'
    """))).strip('"')
    membership_b = result_text(run_psql(as_actor(comp_b, f"""
      select public.accept_wedding_collaboration_invite({sql_literal(invitation_b)}::uuid,{sql_literal(make_actor())}::uuid)->>'membership_id'
    """))).strip('"')
    relationship_a = result_text(run_psql(
        "select id from collaboration_private.compensation_relationships where wedding_id_snapshot="
        + sql_literal(wedding) + "::uuid and recipient_user_id=" + sql_literal(comp_a) + "::uuid;"
    ))
    relationship_b = result_text(run_psql(
        "select id from collaboration_private.compensation_relationships where wedding_id_snapshot="
        + sql_literal(wedding) + "::uuid and recipient_user_id=" + sql_literal(comp_b) + "::uuid;"
    ))
    run_psql(as_actor(owner, f"""
      select public.mutate_owner_compensation_terms_v3({sql_literal(relationship_a)}::uuid,'0',5000,'2027-08-01',true)
    """))
    run_psql(as_actor(owner, f"""
      insert into public.payments(id,wedding_id,type,amount,payment_date,received_by_user_id,receiver_relationship_id)
      values ({sql_literal(payment)}::uuid,{sql_literal(wedding)}::uuid,'installment',3000,'2027-07-01',
        {sql_literal(comp_a)}::uuid,{sql_literal(relationship_a)}::uuid)
    """))
    return Actors(owner, comp_a, comp_b, wedding, connection_a, connection_b,
                  invitation_a, invitation_b, membership_a, membership_b,
                  relationship_a, relationship_b, payment)


def tx_sql(actor: str, statement: str, sleep_after: float = HOLD_SECONDS) -> str:
    return as_actor(actor, statement, sleep_after)


def overlapping(first_sql: str, second_sql: str) -> tuple[subprocess.CompletedProcess[str], float, subprocess.CompletedProcess[str], float]:
    first = subprocess.Popen(
        ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-qAt", "-U", "postgres", "-d", DATABASE, "-v", "ON_ERROR_STOP=1"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    first_started = time.monotonic()
    assert first.stdin is not None
    first.stdin.write(first_sql)
    first.stdin.close()
    first.stdin = None
    time.sleep(0.15)
    second_started = time.monotonic()
    second = subprocess.Popen(
        ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-qAt", "-U", "postgres", "-d", DATABASE, "-v", "ON_ERROR_STOP=1"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    assert second.stdin is not None
    second.stdin.write(second_sql)
    second.stdin.close()
    second.stdin = None
    first_out, first_err = first.communicate(timeout=20)
    second_out, second_err = second.communicate(timeout=20)
    return (
        subprocess.CompletedProcess(first.args, first.returncode, first_out, first_err),
        time.monotonic() - first_started,
        subprocess.CompletedProcess(second.args, second.returncode, second_out, second_err),
        time.monotonic() - second_started,
    )


def error_kind(result: subprocess.CompletedProcess[str]) -> str:
    text = (result.stderr or "") + (result.stdout or "")
    if "CONFLICT" in text:
        return "CONFLICT"
    if "FORBIDDEN" in text:
        return "FORBIDDEN"
    return "ERROR" if result.returncode else "SUCCESS"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def race_rpc(label: str, winner_actor: str, winner_statement: str,
             loser_actor: str, loser_statement: str,
             accepted_loser: set[str]) -> None:
    a, a_elapsed, b, b_elapsed = overlapping(
        tx_sql(winner_actor, winner_statement), tx_sql(loser_actor, loser_statement)
    )
    a_kind, b_kind = error_kind(a), error_kind(b)
    print(f"{label}: actor1={winner_actor[:8]} {a_kind} ({a_elapsed:.2f}s); actor2={loser_actor[:8]} {b_kind} ({b_elapsed:.2f}s)")
    require(a.returncode == 0 and a_kind == "SUCCESS", f"{label}: intended first writer did not succeed: {a.stderr}")
    require(b_kind in accepted_loser, f"{label}: stale concurrent writer result was {b_kind}: {b.stderr}")
    require(a_elapsed >= HOLD_SECONDS and b_elapsed >= HOLD_SECONDS * 0.65,
            f"{label}: sessions did not overlap and block during the lock-hold window")


def run_races(a: Actors) -> None:
    print(f"DB: {CONTAINER}/{DATABASE}")
    print(f"Actors: owner={a.owner[:8]}, Comp2-A={a.comp_a[:8]}, Comp1-B={a.comp_b[:8]}")
    print(f"Barrier: first transaction holds its row locks for {HOLD_SECONDS:.2f}s; second starts 0.15s later")

    race_rpc(
        "Race A owner vs Comp2 same terms revision R=1/access V=1",
        a.owner,
        f"select public.mutate_owner_compensation_terms_v3('{a.relationship_a}'::uuid,'1',6000,'2027-08-02',true)",
        a.comp_a,
        f"select public.mutate_my_shared_compensation_terms_v3('{a.wedding}'::uuid,'1','1',7000,'2027-08-03',true)",
        {"CONFLICT"},
    )
    final_terms = result_text(run_psql(
        f"select amount||':'||terms_revision from collaboration_private.compensation_terms where relationship_id='{a.relationship_a}'::uuid;"
    ))
    require(final_terms == "6000.00:2", f"Race A final amount/revision unexpected: {final_terms}")
    print(f"  final amount/revision={final_terms}; PASS")

    comp2 = '{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":2}'
    comp1 = '{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":1}'
    comp0 = '{"logistics":0,"prewedding":0,"contacts":0,"tasks":0,"notes":0,"compensation":0}'
    downgrade_1 = f"select public.update_wedding_collaboration_membership_access_v3('{a.wedding}'::uuid,'{a.membership_a}'::uuid,'1','system:photographer',null,'custom','{comp1}'::jsonb)"
    race_rpc(
        "Race B stale Comp2 write vs owner downgrade 2→1/access V=1",
        a.owner,
        downgrade_1,
        a.comp_a,
        f"select public.mutate_my_shared_compensation_terms_v3('{a.wedding}'::uuid,'1','2',8000,'2027-08-04',true)",
        {"CONFLICT", "FORBIDDEN"},
    )
    require(result_text(run_psql(f"select compensation||':'||access_version from collaboration_private.membership_area_access a join public.wedding_collaboration_memberships m on m.id=a.membership_id where m.id='{a.membership_a}'::uuid;")) == "1:2",
            "Race B downgrade final permission/version mismatch")
    require(result_text(run_psql(f"select amount||':'||terms_revision from collaboration_private.compensation_terms where relationship_id='{a.relationship_a}'::uuid;")) == "6000.00:2",
            "Race B stale write changed terms")
    print("  final Comp1/accessVersion=1:2; terms unchanged 6000/rev2; PASS")

    race_rpc(
        "Race C stale Comp2 write vs owner downgrade 2→0/access V=2",
        a.owner,
        f"select public.update_wedding_collaboration_membership_access_v3('{a.wedding}'::uuid,'{a.membership_a}'::uuid,'2','system:photographer',null,'custom','{comp0}'::jsonb)",
        a.comp_a,
        f"select public.mutate_my_shared_compensation_terms_v3('{a.wedding}'::uuid,'2','2',9000,'2027-08-05',true)",
        {"CONFLICT", "FORBIDDEN"},
    )
    require(result_text(run_psql(f"select compensation||':'||access_version from collaboration_private.membership_area_access a join public.wedding_collaboration_memberships m on m.id=a.membership_id where m.id='{a.membership_a}'::uuid;")) == "0:3",
            "Race C downgrade final permission/version mismatch")
    require(result_text(run_psql(f"select coalesce(fallback_amount::text,'NULL')||':'||revision from collaboration_private.compensation_private_settings s join collaboration_private.compensation_private_state st using(relationship_id) where s.relationship_id='{a.relationship_a}'::uuid;")) == "NULL:1",
            "Race C changed recipient-private state")
    print("  final Comp0/accessVersion=0:3; official write rejected; private state unchanged; PASS")

    run_psql(as_actor(a.owner,
        f"select public.update_wedding_collaboration_membership_access_v3('{a.wedding}'::uuid,'{a.membership_a}'::uuid,'3','system:photographer',null,'custom','{comp2}'::jsonb)"))
    race_rpc(
        "Race D private settings revision P=1",
        a.comp_a,
        f"select public.mutate_my_private_compensation_settings_v3('{a.relationship_a}'::uuid,'1',2000,'2027-09-01')",
        a.comp_a,
        f"select public.mutate_my_private_compensation_settings_v3('{a.relationship_a}'::uuid,'1',3000,'2027-09-02')",
        {"CONFLICT"},
    )
    private_final = result_text(run_psql(f"select fallback_amount||':'||revision from collaboration_private.compensation_private_settings s join collaboration_private.compensation_private_state st using(relationship_id) where s.relationship_id='{a.relationship_a}'::uuid;"))
    require(private_final == "2000.00:2", f"Race D final value/revision unexpected: {private_final}")
    print(f"  final fallback/revision={private_final}; PASS")

    updates = []
    for receiver_user, receiver_rel in ((a.comp_b, a.relationship_b), (a.owner, "")):
        rel_sql = "null" if not receiver_rel else f"'{receiver_rel}'::uuid"
        updates.append(f"with changed as (update public.payments set received_by_user_id='{receiver_user}'::uuid, receiver_relationship_id={rel_sql} where id='{a.payment}'::uuid and compensation_revision=1 returning id) select case when exists(select 1 from changed) then 'CAS_WON' else 'CAS_CONFLICT' end")
    p1, p1_elapsed, p2, p2_elapsed = overlapping(
        tx_sql(a.owner, updates[0]), tx_sql(a.owner, updates[1])
    )
    p_outcomes = [result_text(p1), result_text(p2)]
    print(f"Race E payment CAS A→B vs A→owner: {p_outcomes[0]} ({p1_elapsed:.2f}s); {p_outcomes[1]} ({p2_elapsed:.2f}s)")
    require(p1.returncode == 0 and p2.returncode == 0 and sorted(p_outcomes) == ["CAS_CONFLICT", "CAS_WON"],
            f"Race E did not produce one CAS winner: {p1.stderr} {p2.stderr}")
    require(p1_elapsed >= HOLD_SECONDS and p2_elapsed >= HOLD_SECONDS * 0.65,
            "Race E sessions did not overlap")
    final_payment = result_text(run_psql(f"select amount||':'||compensation_revision||':'||receiver_kind||':'||coalesce(receiver_relationship_id::text,'owner') from public.payments where id='{a.payment}'::uuid;"))
    paid_total = result_text(run_psql(f"select sum(amount)::numeric from public.payments where wedding_id='{a.wedding}'::uuid and payment_date is not null;"))
    require(final_payment in {f"3000.00:2:collaborator:{a.relationship_b}", "3000.00:2:owner:owner"},
            f"Race E final receiver/revision unexpected: {final_payment}")
    require(paid_total in {"3000", "3000.00"}, f"Race E changed client payment total: {paid_total}")
    a_receipts = result_text(run_psql(as_actor(a.comp_a,
        f"select (public.get_my_private_compensation_v3('{a.relationship_a}'::uuid)->>'client_received_total')::numeric")))
    b_receipts = result_text(run_psql(as_actor(a.comp_b,
        f"select (public.get_my_private_compensation_v3('{a.relationship_b}'::uuid)->>'client_received_total')::numeric")))
    expected_a = "3000.00" if f"collaborator:{a.relationship_a}" in final_payment else "0.00"
    expected_b = "3000.00" if f"collaborator:{a.relationship_b}" in final_payment else "0.00"
    require(a_receipts == expected_a and b_receipts == expected_b,
            f"Race E recipient settlements failed to converge: A={a_receipts}, B={b_receipts}, final={final_payment}")
    print(f"  final payment={final_payment}; client-paid={paid_total}; settlements A={a_receipts}, B={b_receipts}; PASS")

    # Rebase this same payment to a paid A attribution, then race paid→unpaid
    # against A→B receiver reassignment from one shared CAS revision.
    current_revision = int(result_text(run_psql(
        f"select compensation_revision from public.payments where id='{a.payment}'::uuid;"
    )))
    run_psql(as_actor(a.owner, f"""
      update public.payments set received_by_user_id='{a.comp_a}'::uuid,
        receiver_relationship_id='{a.relationship_a}'::uuid
      where id='{a.payment}'::uuid and compensation_revision={current_revision}
    """))
    paid_revision = current_revision + 1
    owner_value_before = result_text(run_psql(as_actor(a.owner, f"""
      select public.get_my_personal_compensation_values_v3(array['{a.wedding}'::uuid])->0->>'personal_value'
    """)))
    unpay_sql = f"with changed as (update public.payments set payment_date=null where id='{a.payment}'::uuid and compensation_revision={paid_revision} returning id) select case when exists(select 1 from changed) then 'CAS_WON' else 'CAS_CONFLICT' end"
    move_sql = f"with changed as (update public.payments set received_by_user_id='{a.comp_b}'::uuid, receiver_relationship_id='{a.relationship_b}'::uuid where id='{a.payment}'::uuid and compensation_revision={paid_revision} returning id) select case when exists(select 1 from changed) then 'CAS_WON' else 'CAS_CONFLICT' end"
    unpay, unpay_elapsed, move, move_elapsed = overlapping(
        tx_sql(a.owner, unpay_sql), tx_sql(a.owner, move_sql)
    )
    outcomes = [result_text(unpay), result_text(move)]
    print(f"Race F paid→unpaid vs receiver A→B at R={paid_revision}: {outcomes[0]} ({unpay_elapsed:.2f}s); {outcomes[1]} ({move_elapsed:.2f}s)")
    require(unpay.returncode == 0 and move.returncode == 0 and sorted(outcomes) == ["CAS_CONFLICT", "CAS_WON"],
            f"Race F did not produce one winner: {unpay.stderr} {move.stderr}")
    require(unpay_elapsed >= HOLD_SECONDS and move_elapsed >= HOLD_SECONDS * 0.65,
            "Race F sessions did not overlap")
    state = result_text(run_psql(f"""
      select amount||':'||coalesce(payment_date::text,'NULL')||':'||compensation_revision||':'||
        coalesce(receiver_kind,'NULL')||':'||coalesce(receiver_relationship_id::text,'NULL')
      from public.payments where id='{a.payment}'::uuid;
    """))
    allowed_states = {
        f"3000.00:NULL:{paid_revision + 1}:NULL:NULL",
        f"3000.00:2027-07-01:{paid_revision + 1}:collaborator:{a.relationship_b}",
    }
    require(state in allowed_states, f"Race F left a hybrid or unexpected payment state: {state}")
    paid_total_after_f = result_text(run_psql(
        f"select coalesce(sum(amount),0)::numeric from public.payments where wedding_id='{a.wedding}'::uuid and payment_date is not null;"
    ))
    expected_paid = "0" if ":NULL:" in state else "3000.00"
    require(paid_total_after_f in {expected_paid, expected_paid + ".00"},
            f"Race F client ledger disagrees with final payment state: {paid_total_after_f} vs {state}")
    a_receipts_after_f = result_text(run_psql(as_actor(a.comp_a,
        f"select (public.get_my_private_compensation_v3('{a.relationship_a}'::uuid)->>'client_received_total')::numeric")))
    b_receipts_after_f = result_text(run_psql(as_actor(a.comp_b,
        f"select (public.get_my_private_compensation_v3('{a.relationship_b}'::uuid)->>'client_received_total')::numeric")))
    if ":NULL:" in state:
        require(a_receipts_after_f in {"0", "0.00"} and b_receipts_after_f in {"0", "0.00"},
                f"Race F unpaid winner retained current collaborator attribution: A={a_receipts_after_f}, B={b_receipts_after_f}")
    else:
        require(a_receipts_after_f in {"0", "0.00"} and b_receipts_after_f in {"3000", "3000.00"},
                f"Race F receiver winner did not attribute only to B: A={a_receipts_after_f}, B={b_receipts_after_f}")
    owner_value_after = result_text(run_psql(as_actor(a.owner, f"""
      select public.get_my_personal_compensation_values_v3(array['{a.wedding}'::uuid])->0->>'personal_value'
    """)))
    require(owner_value_after == owner_value_before,
            f"Race F changed owner personal value: {owner_value_before} -> {owner_value_after}")
    print(f"  winner state={state}; client-paid={paid_total_after_f}; A={a_receipts_after_f}; B={b_receipts_after_f}; owner value unchanged; PASS")

    # Leave the row unpaid, then prove two overlapping edits from the same R
    # cannot merge an amount and a note into one hybrid result.
    after_f_revision = int(result_text(run_psql(
        f"select compensation_revision from public.payments where id='{a.payment}'::uuid;"
    )))
    paid_after_f = result_text(run_psql(
        f"select (payment_date is not null)::text from public.payments where id='{a.payment}'::uuid;"
    )) == "true"
    if paid_after_f:
        run_psql(as_actor(a.owner, f"""
          update public.payments set payment_date=null
          where id='{a.payment}'::uuid and compensation_revision={after_f_revision}
        """))
        after_f_revision += 1
    unpaid_amount_sql = f"with changed as (update public.payments set amount=4000 where id='{a.payment}'::uuid and compensation_revision={after_f_revision} returning id) select case when exists(select 1 from changed) then 'CAS_WON' else 'CAS_CONFLICT' end"
    unpaid_note_sql = f"with changed as (update public.payments set note='race-unpaid-note' where id='{a.payment}'::uuid and compensation_revision={after_f_revision} returning id) select case when exists(select 1 from changed) then 'CAS_WON' else 'CAS_CONFLICT' end"
    amount_edit, amount_elapsed, note_edit, note_elapsed = overlapping(
        tx_sql(a.owner, unpaid_amount_sql), tx_sql(a.owner, unpaid_note_sql)
    )
    unpaid_outcomes = [result_text(amount_edit), result_text(note_edit)]
    print(f"Race G unpaid amount vs note at R={after_f_revision}: {unpaid_outcomes[0]} ({amount_elapsed:.2f}s); {unpaid_outcomes[1]} ({note_elapsed:.2f}s)")
    require(amount_edit.returncode == 0 and note_edit.returncode == 0
            and sorted(unpaid_outcomes) == ["CAS_CONFLICT", "CAS_WON"],
            f"Race G did not produce one winner: {amount_edit.stderr} {note_edit.stderr}")
    require(amount_elapsed >= HOLD_SECONDS and note_elapsed >= HOLD_SECONDS * 0.65,
            "Race G sessions did not overlap")
    unpaid_final = result_text(run_psql(f"""
      select amount||':'||coalesce(note,'NULL')||':'||coalesce(payment_date::text,'NULL')||':'||
        compensation_revision||':'||coalesce(receiver_kind,'NULL')
      from public.payments where id='{a.payment}'::uuid;
    """))
    expected_unpaid = {
        f"4000.00:NULL:NULL:{after_f_revision + 1}:NULL",
        f"3000.00:race-unpaid-note:NULL:{after_f_revision + 1}:NULL",
    }
    require(unpaid_final in expected_unpaid, f"Race G left an unexpected unpaid state: {unpaid_final}")
    unpaid_client_total = result_text(run_psql(
        f"select coalesce(sum(amount),0)::numeric from public.payments where wedding_id='{a.wedding}'::uuid and payment_date is not null;"
    ))
    require(unpaid_client_total in {"0", "0.00"},
            f"Race G changed client paid total while payment remained unpaid: {unpaid_client_total}")
    print(f"  final unpaid state={unpaid_final}; client-paid={unpaid_client_total}; PASS")


def cleanup(a: Actors) -> None:
    run_psql(f"""
      delete from public.weddings where id='{a.wedding}'::uuid;
      delete from public.internal_qa_accounts where user_id in ('{a.owner}'::uuid,'{a.comp_a}'::uuid,'{a.comp_b}'::uuid);
      delete from auth.users where id in ('{a.owner}'::uuid,'{a.comp_a}'::uuid,'{a.comp_b}'::uuid);
    """)


def main() -> int:
    check_safe_target()
    fixture: Actors | None = None
    try:
        fixture = create_fixture()
        run_races(fixture)
        print("Compensation concurrent database races: PASS")
        return 0
    finally:
        if fixture is not None:
            cleanup(fixture)
            print("Synthetic race fixture cleanup: PASS")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # reported without dumping auth secrets (none are used)
        print(f"Compensation concurrency runner: FAIL — {exc}", file=sys.stderr)
        raise
