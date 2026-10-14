import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const envPath = process.argv[2]
if (!envPath) throw new Error('Usage: node collaboration_1c_a_concurrency.mjs /private/tmp/.../local.env')
const env = Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const split = line.indexOf('=')
    return [line.slice(0, split), line.slice(split + 1).replace(/^"|"$/g, '')]
  }))
const apiUrl = env.API_URL
const anonKey = env.ANON_KEY
const serviceKey = env.SERVICE_ROLE_KEY
assert.ok(apiUrl && anonKey && serviceKey, 'local Supabase URL and keys are required')
const apiOrigin = new URL(apiUrl)
assert.equal(apiOrigin.hostname, '127.0.0.1', 'concurrency tests must target loopback')
assert.ok(apiOrigin.port, 'concurrency tests must target an explicit loopback port')
const dbContainer = process.env.OURWED_TEST_DB_CONTAINER ?? 'supabase_db_ourwed-internal-qa-harness-20261012'

async function request(path, { key = anonKey, token, method = 'GET', body, prefer } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token ?? key}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (prefer) headers.Prefer = prefer
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${path} failed with HTTP ${response.status}`)
  if (!text) return null
  try { return JSON.parse(text) } catch { return text }
}

async function signup(label) {
  const email = `collaboration-1c-a-race-${label}-${randomUUID()}@example.test`
  const result = await request('/auth/v1/signup', {
    method: 'POST',
    body: {
      email,
      password: `LocalOnly-${randomUUID()}!`,
      data: {
        first_name: 'Local',
        last_name: label,
        legal_registration_accepted: true,
        terms_version: '1.1',
        privacy_version: '1.1',
      },
    },
  })
  assert.ok(result.user?.id && result.access_token, 'local signup returns an Auth user and token')
  return { id: result.user.id, email, token: result.access_token }
}

async function rpc(name, token, args) {
  return request(`/rest/v1/rpc/${name}`, { method: 'POST', token, body: args })
}

async function connection(owner, member) {
  const [low, high] = [owner.id, member.id].sort()
  const result = await request('/rest/v1/collaboration_connections?select=id', {
    key: serviceKey,
    method: 'POST',
    prefer: 'return=representation',
    body: {
      participant_low_id: low,
      participant_high_id: high,
      participant_low_name_snapshot: 'Local owner',
      participant_high_name_snapshot: 'Local member',
      status: 'active',
    },
  })
  assert.ok(result?.[0]?.id, 'service fixture creates an active local global connection')
  return result[0].id
}

async function wedding(owner) {
  const result = await request('/rest/v1/weddings?select=id', {
    method: 'POST',
    token: owner.token,
    prefer: 'return=representation',
    body: {
      user_id: owner.id,
      bride_name: 'Local',
      groom_name: 'Race',
      wedding_date: '2027-06-01',
      contract_value: 1000,
      currency: 'PLN',
    },
  })
  assert.ok(result?.[0]?.id, 'owner creates a local wedding through normal RLS')
  return result[0].id
}

async function invite(owner, member, weddingId) {
  const result = await rpc('create_wedding_collaboration_invite', owner.token, {
    p_wedding_id: weddingId,
    p_invitee_user_id: member.id,
    p_proposed_share_amount: 100,
    p_idempotency_key: randomUUID(),
  })
  assert.equal(result.status, 'created')
  return result.invitation_id
}

function startPsql(sql, marker) {
  const child = spawn('docker', [
    'exec', '-i', dbContainer, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1',
  ], { stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  let markerResolve
  const markerReady = marker ? new Promise((resolve) => { markerResolve = resolve }) : Promise.resolve()
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    output += chunk
    if (marker && output.includes(marker)) markerResolve()
  })
  child.stderr.on('data', (chunk) => { output += chunk })
  child.stdin.end(sql)
  const done = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => {
      if (code !== 0) reject(new Error(`local psql exited ${code}: ${output}`))
      else resolve(output)
    })
  })
  return { done, markerReady, getOutput: () => output }
}

async function concurrent(firstSql, secondSql) {
  const marker = 'RACE_FIRST_HAS_LOCKS'
  const first = startPsql(firstSql.replace('__MARKER__', marker), marker)
  let timeoutId
  await Promise.race([
    first.markerReady,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('first concurrent transaction did not reach its lock marker')), 5000)
    }),
  ])
  clearTimeout(timeoutId)
  const second = startPsql(secondSql)
  const [firstOutput, secondOutput] = await Promise.all([first.done, second.done])
  return { firstOutput, secondOutput }
}

function actorSetup(actorId, statement, delay = 1.2) {
  return `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${actorId}',true); ${statement}; select 'RACE_FIRST_HAS_LOCKS'; select pg_sleep(${delay}); commit;`
}

function capturedCommand(actorId, statement) {
  return `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${actorId}',true);
do $$ declare v_result jsonb; begin
  begin v_result := ${statement}; raise notice 'RACE_RESULT:%',v_result;
  exception when others then raise notice 'RACE_ERROR:%:%',sqlstate,sqlerrm;
  end;
end $$; commit;`
}

async function state(invitationId, weddingId, memberId) {
  const [invitation, memberships] = await Promise.all([
    request(`/rest/v1/wedding_collaboration_invitations?id=eq.${invitationId}&select=status,reason`, { key: serviceKey }),
    request(`/rest/v1/wedding_collaboration_memberships?wedding_id_snapshot=eq.${weddingId}&member_user_id=eq.${memberId}&select=id,status`, { key: serviceKey }),
  ])
  return { invitation: invitation[0] ?? null, memberships }
}

const createdUsers = []
const createdWeddings = []
let owner
let member
try {
  owner = await signup('owner')
  member = await signup('member')
  createdUsers.push(member, owner)
  let connectionId = await connection(owner, member)

  // Global connection end commits first while holding the connection/wedding/invite locks.
  let weddingId = await wedding(owner)
  createdWeddings.push(weddingId)
  let invitationId = await invite(owner, member, weddingId)
  let race = await concurrent(
    actorSetup(owner.id, `select public.end_collaboration('${connectionId}','${randomUUID()}')`),
    capturedCommand(member.id, `public.accept_wedding_collaboration_invite('${invitationId}','${randomUUID()}')`),
  )
  let final = await state(invitationId, weddingId, member.id)
  assert.deepEqual(final.invitation, { status: 'cancelled', reason: 'global_connection_ended' })
  assert.equal(final.memberships.length, 0)
  assert.match(race.secondOutput, /RACE_ERROR:.*invitation_unavailable/)

  connectionId = await connection(owner, member)

  // Owner cancel commits first; accept resumes after waiting on the invite row.
  weddingId = await wedding(owner)
  createdWeddings.push(weddingId)
  invitationId = await invite(owner, member, weddingId)
  race = await concurrent(
    actorSetup(owner.id, `select public.cancel_wedding_collaboration_invite('${invitationId}','${randomUUID()}')`),
    capturedCommand(member.id, `public.accept_wedding_collaboration_invite('${invitationId}','${randomUUID()}')`),
  )
  final = await state(invitationId, weddingId, member.id)
  assert.deepEqual(final.invitation, { status: 'cancelled', reason: 'owner_cancelled' })
  assert.equal(final.memberships.length, 0)
  assert.match(race.secondOutput, /RACE_ERROR:.*invitation_unavailable/)

  // Commercial terms mutation commits first while holding the wedding row.
  weddingId = await wedding(owner)
  createdWeddings.push(weddingId)
  invitationId = await invite(owner, member, weddingId)
  race = await concurrent(
    actorSetup(owner.id, `update public.weddings set contract_value=1100 where id='${weddingId}'`),
    capturedCommand(member.id, `public.accept_wedding_collaboration_invite('${invitationId}','${randomUUID()}')`),
  )
  final = await state(invitationId, weddingId, member.id)
  assert.deepEqual(final.invitation, { status: 'superseded', reason: 'commercial_terms_changed' })
  assert.equal(final.memberships.length, 0)
  assert.match(race.secondOutput, /RACE_ERROR:.*invitation_unavailable/)

  // Two actual concurrent accepts share the same idempotency key.
  weddingId = await wedding(owner)
  createdWeddings.push(weddingId)
  invitationId = await invite(owner, member, weddingId)
  const acceptKey = randomUUID()
  race = await concurrent(
    actorSetup(member.id, `select public.accept_wedding_collaboration_invite('${invitationId}','${acceptKey}')`),
    capturedCommand(member.id, `public.accept_wedding_collaboration_invite('${invitationId}','${acceptKey}')`),
  )
  final = await state(invitationId, weddingId, member.id)
  assert.equal(final.invitation.status, 'accepted')
  assert.equal(final.memberships.length, 1)
  assert.match(race.secondOutput, /RACE_RESULT:.*accepted.*duplicate.*true/)

  // Create another accepted membership then race owner revoke against member leave.
  weddingId = await wedding(owner)
  createdWeddings.push(weddingId)
  invitationId = await invite(owner, member, weddingId)
  const accepted = await rpc('accept_wedding_collaboration_invite', member.token, {
    p_invitation_id: invitationId,
    p_idempotency_key: randomUUID(),
  })
  assert.equal(accepted.status, 'accepted')
  const membershipId = accepted.membership_id
  race = await concurrent(
    actorSetup(owner.id, `select public.revoke_wedding_collaboration_membership('${membershipId}','${randomUUID()}')`),
    capturedCommand(member.id, `public.leave_wedding_collaboration('${membershipId}','${randomUUID()}')`),
  )
  const memberships = await request(`/rest/v1/wedding_collaboration_memberships?id=eq.${membershipId}&select=status`, { key: serviceKey })
  assert.deepEqual(memberships, [{ status: 'revoked' }])
  assert.match(race.secondOutput, /RACE_ERROR:.*membership_unavailable/)

  // Global end commits first while a concurrent invite waits on the connection row.
  weddingId = await wedding(owner)
  createdWeddings.push(weddingId)
  race = await concurrent(
    actorSetup(owner.id, `select public.end_collaboration('${connectionId}','${randomUUID()}')`),
    capturedCommand(owner.id, `public.create_wedding_collaboration_invite('${weddingId}','${member.id}',100,'${randomUUID()}')`),
  )
  const pending = await request(`/rest/v1/wedding_collaboration_invitations?wedding_id_snapshot=eq.${weddingId}&select=id`, { key: serviceKey })
  assert.deepEqual(pending, [])
  assert.match(race.secondOutput, /RACE_ERROR:.*active_connection_required/)

  // Wedding deletion commits first; the waiting acceptance must see its terminal invite state.
  connectionId = await connection(owner, member)
  weddingId = await wedding(owner)
  createdWeddings.push(weddingId)
  invitationId = await invite(owner, member, weddingId)
  race = await concurrent(
    actorSetup(owner.id, `delete from public.weddings where id='${weddingId}'`),
    capturedCommand(member.id, `public.accept_wedding_collaboration_invite('${invitationId}','${randomUUID()}')`),
  )
  final = await state(invitationId, weddingId, member.id)
  assert.deepEqual(final.invitation, { status: 'cancelled', reason: 'wedding_deleted' })
  assert.equal(final.memberships.length, 0)
  assert.deepEqual(await request(`/rest/v1/weddings?id=eq.${weddingId}&select=id`, { key: serviceKey }), [])
  assert.match(race.secondOutput, /RACE_ERROR:.*invitation_unavailable/)

  const moveOwner = await signup('opposite-move-owner')
  const moveMemberA = await signup('opposite-move-a')
  const moveMemberB = await signup('opposite-move-b')
  createdUsers.push(moveOwner, moveMemberA, moveMemberB)
  await connection(moveOwner, moveMemberA)
  await connection(moveOwner, moveMemberB)
  const moveWeddingA = await wedding(moveOwner)
  const moveWeddingB = await wedding(moveOwner)
  createdWeddings.push(moveWeddingA, moveWeddingB)
  const extraTemplates = await request('/rest/v1/extra_services?slug=eq.harness-service&select=id', { key: serviceKey })
  assert.ok(extraTemplates?.[0]?.id, 'local service template exists for opposite reparent race')
  const extraA = await request('/rest/v1/wedding_extra_services?select=id', {
    key: serviceKey, method: 'POST', prefer: 'return=representation',
    body: { wedding_id: moveWeddingA, extra_service_id: extraTemplates[0].id, price_snapshot: 1, name_snapshot: 'Move A', quantity: 1 },
  })
  const extraB = await request('/rest/v1/wedding_extra_services?select=id', {
    key: serviceKey, method: 'POST', prefer: 'return=representation',
    body: { wedding_id: moveWeddingB, extra_service_id: extraTemplates[0].id, price_snapshot: 2, name_snapshot: 'Move B', quantity: 1 },
  })
  assert.ok(extraA?.[0]?.id && extraB?.[0]?.id, 'two disposable local extras exist')
  const inviteA = await invite(moveOwner, moveMemberA, moveWeddingA)
  const inviteB = await invite(moveOwner, moveMemberB, moveWeddingB)
  const moveRace = await concurrent(
    `begin; update public.wedding_extra_services set wedding_id='${moveWeddingB}' where id='${extraA[0].id}'; select 'RACE_FIRST_HAS_LOCKS'; select pg_sleep(1.2); commit;`,
    `begin; update public.wedding_extra_services set wedding_id='${moveWeddingA}' where id='${extraB[0].id}'; commit;`,
  )
  assert.doesNotMatch(`${moveRace.firstOutput}\n${moveRace.secondOutput}`, /deadlock detected/i,
    'opposite-direction extra moves have no PostgreSQL deadlock')
  const [versions, movedInvites] = await Promise.all([
    Promise.all([moveWeddingA, moveWeddingB].map((id) => request(
      `/rest/v1/weddings?id=eq.${id}&select=collaboration_terms_version`, { key: serviceKey }))),
    Promise.all([inviteA, inviteB].map((id) => request(
      `/rest/v1/wedding_collaboration_invitations?id=eq.${id}&select=status,reason`, { key: serviceKey }))),
  ])
  assert.deepEqual(versions, [[{ collaboration_terms_version: 4 }], [{ collaboration_terms_version: 4 }]],
    'both opposite moves bump each source and destination wedding exactly once per move')
  assert.deepEqual(movedInvites, [[{ status: 'superseded', reason: 'commercial_terms_changed' }],
    [{ status: 'superseded', reason: 'commercial_terms_changed' }]],
  'both weddings supersede their pending proposals after concurrent reparenting')

  const extraTemplateRows = await request('/rest/v1/extra_services?slug=eq.harness-service&select=id', { key: serviceKey })
  assert.ok(extraTemplateRows?.[0]?.id, 'local service template exists for extra/delete overlap')
  async function runExtraWeddingDeleteRace(extraFirst) {
    const deletingOwner = await signup(`extra-delete-${extraFirst ? 'extra-first' : 'wedding-first'}`)
    createdUsers.push(deletingOwner)
    const deletingWedding = await wedding(deletingOwner)
    createdWeddings.push(deletingWedding)
    const extraRows = await request('/rest/v1/wedding_extra_services?select=id', {
      key: serviceKey, method: 'POST', prefer: 'return=representation',
      body: { wedding_id: deletingWedding, extra_service_id: extraTemplateRows[0].id,
        price_snapshot: 1, name_snapshot: 'Delete race', quantity: 1 },
    })
    assert.ok(extraRows?.[0]?.id, 'local wedding has a child extra for deletion overlap')
    const mutate = `update public.wedding_extra_services set price_snapshot=2 where id='${extraRows[0].id}'`
    const erase = `delete from public.weddings where id='${deletingWedding}'`
    const race = extraFirst
      ? await concurrent(`begin; ${mutate}; select 'RACE_FIRST_HAS_LOCKS'; select pg_sleep(1.2); commit;`,
        `begin; ${erase}; commit;`)
      : await concurrent(`begin; ${erase}; select 'RACE_FIRST_HAS_LOCKS'; select pg_sleep(1.2); commit;`,
        `begin; ${mutate}; commit;`)
    assert.doesNotMatch(`${race.firstOutput}\n${race.secondOutput}`, /deadlock detected/i,
      'extra mutation and wedding delete serialize without PostgreSQL deadlock')
    assert.deepEqual(await request(`/rest/v1/weddings?id=eq.${deletingWedding}&select=id`, { key: serviceKey }), [],
      'wedding deletion completes after overlapping extra mutation')
    assert.deepEqual(await request(`/rest/v1/wedding_extra_services?wedding_id=eq.${deletingWedding}&select=id`, { key: serviceKey }), [],
      'wedding deletion cascades its extra row')
    return extraFirst ? 'extra-first' : 'wedding-first'
  }
  const extraDeleteOrders = [await runExtraWeddingDeleteRace(true), await runExtraWeddingDeleteRace(false)]

  async function runGlobalInviteEraseRace(command, erasureFirst) {
    const globalOwner = await signup(`global-${command}-owner-${erasureFirst ? 'delete-first' : 'command-first'}`)
    const globalMember = await signup(`global-${command}-member-${erasureFirst ? 'delete-first' : 'command-first'}`)
    createdUsers.push(globalOwner, globalMember)
    const globalInvite = await rpc('create_collaboration_invite', globalOwner.token, {
      p_email: globalMember.email,
      p_idempotency_key: randomUUID(),
    })
    assert.equal(globalInvite.status, 'created', `global 1B ${command} race has a pending invitation`)
    const actor = command === 'decline' ? globalMember : globalOwner
    const name = command === 'decline' ? 'decline_collaboration_invite' : 'cancel_collaboration_invite'
    const args = `public.${name}('${globalInvite.invitation_id}','${randomUUID()}')`
    const deleteSql = `begin; delete from auth.users where id='${actor.id}'; select 'RACE_FIRST_HAS_LOCKS'; select pg_sleep(1.2); commit;`
    const race = erasureFirst
      ? await concurrent(deleteSql, capturedCommand(command === 'decline' ? globalMember.id : globalOwner.id, args))
      : await concurrent(actorSetup(actor.id, `select ${args}`),
        `begin; delete from auth.users where id='${actor.id}'; commit;`)
    assert.doesNotMatch(`${race.firstOutput}\n${race.secondOutput}`, /deadlock detected/i,
      `global 1B ${command} erasure race has no deadlock`)
    const [inviteRows, deletedRows, survivorRows] = await Promise.all([
      request(`/rest/v1/collaboration_invitations?id=eq.${globalInvite.invitation_id}&select=id,status,inviter_user_id,invitee_user_id`, { key: serviceKey }),
      request(`/rest/v1/users?id=eq.${actor.id}&select=id`, { key: serviceKey }),
      request(`/rest/v1/users?id=eq.${(command === 'decline' ? globalOwner : globalMember).id}&select=id`, { key: serviceKey }),
    ])
    assert.equal(inviteRows.length, 1, `global 1B ${command} keeps invitation history`)
    assert.equal(inviteRows[0].status, erasureFirst || command === 'cancel' ? 'cancelled' : 'declined',
      `global 1B ${command} race preserves its terminal invitation state`)
    assert.deepEqual(deletedRows, [], `global 1B ${command} erases only its actor`)
    assert.equal(survivorRows.length, 1, `global 1B ${command} keeps the other account`)
    if (erasureFirst) assert.match(race.secondOutput, /RACE_ERROR:42501:unauthorized/,
      `global 1B ${command} fails safely after actor erasure`)
    return `${command} ${erasureFirst ? 'delete-first' : 'command-first'}`
  }

  const globalInviteEraseOutcomes = []
  for (const command of ['decline', 'cancel']) {
    globalInviteEraseOutcomes.push(await runGlobalInviteEraseRace(command, false))
    globalInviteEraseOutcomes.push(await runGlobalInviteEraseRace(command, true))
  }

  async function runErasureRace(deletingSide, erasureFirst) {
    const raceOwner = await signup(`erasure-owner-${deletingSide}-${erasureFirst ? 'delete-first' : 'accept-first'}`)
    const raceMember = await signup(`erasure-member-${deletingSide}-${erasureFirst ? 'delete-first' : 'accept-first'}`)
    createdUsers.push(raceOwner, raceMember)
    const raceConnection = await connection(raceOwner, raceMember)
    const raceWedding = await wedding(raceOwner)
    createdWeddings.push(raceWedding)
    const raceInvitation = await invite(raceOwner, raceMember, raceWedding)
    const deletedUser = deletingSide === 'owner' ? raceOwner : raceMember
    const acceptSql = capturedCommand(raceMember.id,
      `public.accept_wedding_collaboration_invite('${raceInvitation}','${randomUUID()}')`)
    const deleteSql = `begin; delete from auth.users where id='${deletedUser.id}'; select 'RACE_FIRST_HAS_LOCKS'; select pg_sleep(1.2); commit;`
    const race = erasureFirst
      ? await concurrent(deleteSql, acceptSql)
      : await concurrent(actorSetup(raceMember.id,
        `select public.accept_wedding_collaboration_invite('${raceInvitation}','${randomUUID()}')`),
      `begin; delete from auth.users where id='${deletedUser.id}'; commit;`)
    assert.doesNotMatch(`${race.firstOutput}\n${race.secondOutput}`, /deadlock detected/i,
      `${deletingSide} erasure race has no PostgreSQL deadlock`)
    const [inviteRows, membershipRows, weddingRows, deletedUserRows, survivorRows] = await Promise.all([
      request(`/rest/v1/wedding_collaboration_invitations?id=eq.${raceInvitation}&select=status,reason,owner_user_id,invitee_user_id`, { key: serviceKey }),
      request(`/rest/v1/wedding_collaboration_memberships?accepted_invitation_id=eq.${raceInvitation}&select=id,status,owner_user_id,member_user_id`, { key: serviceKey }),
      request(`/rest/v1/weddings?id=eq.${raceWedding}&select=id`, { key: serviceKey }),
      request(`/rest/v1/users?id=eq.${deletedUser.id}&select=id`, { key: serviceKey }),
      request(`/rest/v1/users?id=eq.${(deletingSide === 'owner' ? raceMember : raceOwner).id}&select=id`, { key: serviceKey }),
    ])
    assert.deepEqual(deletedUserRows, [], `${deletingSide} account is erased`)
    assert.equal(survivorRows.length, 1, `${deletingSide} erasure leaves the other account intact`)
    assert.equal(inviteRows.length, 1, 'invitation history remains after erasure')
    assert.notEqual(inviteRows[0].status, 'pending', 'erasure never leaves a live pending invitation')
    if (erasureFirst) {
      assert.equal(membershipRows.length, 0, 'delete-first acceptance creates no membership')
      if (deletingSide === 'owner') assert.deepEqual(weddingRows, [], 'owner erasure deletes the owned wedding')
      assert.ok(/RACE_ERROR:.*invitation_unavailable/.test(race.secondOutput),
        'accept after deletion fails safely on the missing participant user row')
    } else {
      assert.equal(membershipRows.length, 1, 'accept-first erasure retains the closed membership history')
      assert.notEqual(membershipRows[0].status, 'active', 'erasure closes any accepted membership')
      if (deletingSide === 'owner') {
        assert.equal(membershipRows[0].status, 'revoked', 'owner erasure revokes rather than member-leaves')
        assert.equal(membershipRows[0].owner_user_id, null, 'owner membership reference is redacted')
        assert.deepEqual(weddingRows, [], 'owner erasure deletes only the owned wedding')
      } else {
        assert.equal(membershipRows[0].status, 'left', 'member erasure closes its active membership period')
        assert.equal(membershipRows[0].member_user_id, null, 'member membership reference is redacted')
        assert.equal(weddingRows.length, 1, 'member erasure leaves the owner wedding intact')
      }
      assert.equal(inviteRows[0].status, 'accepted', 'accepted invitation remains immutable after account erasure')
      assert.equal(deletingSide === 'owner' ? inviteRows[0].owner_user_id : inviteRows[0].invitee_user_id, null,
        'accepted invitation erasure redacts the deleted participant reference')
    }
    assert.ok(raceConnection, 'race began from a real active global connection')
    return `${deletingSide} ${erasureFirst ? 'delete-first' : 'accept-first'}`
  }

  const erasureOutcomes = []
  for (const side of ['invitee', 'owner']) {
    erasureOutcomes.push(await runErasureRace(side, false))
    erasureOutcomes.push(await runErasureRace(side, true))
  }
  console.log(`Concurrent database races: PASS (7 1C-A lifecycle schedules; opposite-direction reparent; extra/wedding delete orders: ${extraDeleteOrders.join(', ')}; 4 wedding erasure orders: ${erasureOutcomes.join(', ')}; 4 1B invite response erasure orders: ${globalInviteEraseOutcomes.join(', ')}; no Internal QA accounts)`)
} finally {
  for (const weddingId of createdWeddings) {
    await request(`/rest/v1/weddings?id=eq.${weddingId}`, { key: serviceKey, method: 'DELETE' }).catch(() => {})
  }
  for (const user of createdUsers) {
    await request(`/auth/v1/admin/users/${user.id}`, { key: serviceKey, method: 'DELETE' }).catch(() => {})
  }
}
