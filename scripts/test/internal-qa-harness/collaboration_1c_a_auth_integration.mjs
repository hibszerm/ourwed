import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const envPath = process.argv[2]
if (!envPath) throw new Error('Usage: node collaboration_1c_a_auth_integration.mjs /private/tmp/.../local.env')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const split = line.indexOf('=')
      return [line.slice(0, split), line.slice(split + 1).replace(/^"|"$/g, '')]
    }),
)
const apiUrl = env.API_URL
const serviceKey = env.SERVICE_ROLE_KEY
const anonKey = env.ANON_KEY
assert.ok(apiUrl && serviceKey && anonKey, 'local Supabase URL and keys are required')
const origin = new URL(apiUrl)
assert.equal(origin.hostname, '127.0.0.1', 'Auth integration must target loopback')
assert.equal(origin.port, '56321', 'Auth integration must target the dedicated QA harness API')

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
  if (!response.ok) throw new Error(`${method} ${path} failed with HTTP ${response.status}: ${text}`)
  if (!text) return null
  try { return JSON.parse(text) } catch { return text }
}

async function attemptWrite(path, { token, method, body }) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let parsed = text
  try { parsed = text ? JSON.parse(text) : null } catch {}
  return { status: response.status, ok: response.ok, body: parsed }
}

async function signup(label) {
  const email = `collaboration-1c-a-${label}-${randomUUID()}@example.test`
  const password = `LocalOnly-${randomUUID()}!`
  const result = await request('/auth/v1/signup', {
    method: 'POST',
    body: {
      email,
      password,
      data: {
        first_name: label === 'owner' ? 'Local' : 'Synthetic',
        last_name: label,
        legal_registration_accepted: true,
        terms_version: '1.1',
        privacy_version: '1.1',
      },
    },
  })
  assert.ok(result.user?.id, `${label} signup returns Auth user`)
  assert.ok(result.access_token, `${label} signup returns a local JWT`)
  return { id: result.user.id, token: result.access_token }
}

async function rpc(name, token, args) {
  return request(`/rest/v1/rpc/${name}`, { method: 'POST', token, body: args })
}

async function insertFixture(table, row) {
  const result = await request(`/rest/v1/${table}?select=id`, {
    key: serviceKey,
    method: 'POST',
    prefer: 'return=representation',
    body: row,
  })
  assert.ok(result?.[0]?.id, `service role seeds local ${table} fixture`)
  return result[0].id
}

let owner
let member
let otherCollaborator
let thirdParty
let weddingId
let otherWeddingId
try {
  owner = await signup('owner')
  member = await signup('member')
  otherCollaborator = await signup('other-collaborator')
  thirdParty = await signup('third-party')
  async function connect(participantA, participantB, names) {
    const [low, high] = [participantA.id, participantB.id].sort()
    await request('/rest/v1/collaboration_connections', {
      key: serviceKey,
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        participant_low_id: low,
        participant_high_id: high,
        participant_low_name_snapshot: names[0],
        participant_high_name_snapshot: names[1],
        status: 'active',
      },
    })
    return { low, high }
  }
  const { low, high } = await connect(owner, member, ['Local owner', 'Local member'])
  await connect(owner, otherCollaborator, ['Local owner', 'Other collaborator'])
  await connect(otherCollaborator, thirdParty, ['Other collaborator', 'Local third party'])

  const created = await request('/rest/v1/weddings', {
    method: 'POST', token: owner.token, prefer: 'return=representation',
    body: {
      user_id: owner.id,
      bride_name: 'Local',
      groom_name: 'Wedding',
      wedding_date: '2027-06-01',
      contract_value: 1000,
      currency: 'PLN',
    },
  })
  weddingId = created?.[0]?.id
  assert.ok(weddingId, 'normal customer creates an owner-scoped wedding through RLS')
  const otherWedding = await request('/rest/v1/weddings', {
    method: 'POST', token: otherCollaborator.token, prefer: 'return=representation',
    body: { user_id: otherCollaborator.id, bride_name: 'Other', groom_name: 'Wedding', wedding_date: '2027-06-02', contract_value: 500, currency: 'PLN' },
  })
  otherWeddingId = otherWedding?.[0]?.id
  assert.ok(otherWeddingId, 'another connected account creates its own owner-scoped wedding through RLS')

  const childResources = []
  let weddingPlaceId
  const weddingChildTables = [
    'contacts', 'notes', 'tasks', 'timeline_events', 'calendar_events',
    'wedding_places', 'travel_segments', 'wedding_operational_times', 'wedding_briefs',
    'wedding_documents', 'wedding_document_drafts', 'wedding_source_contracts',
    'wedding_contract_recoveries', 'wedding_contract_package_snapshots',
    'wedding_contract_recovery_decisions', 'wedding_contract_generation_runs',
    'wedding_document_generation_sequences', 'contracts',
  ]
  for (const table of weddingChildTables) {
    if (table === 'wedding_places') {
      const id = await insertFixture(table, {
        wedding_id: weddingId, role: 'ceremony', formatted_address: 'Synthetic ceremony address',
      })
      weddingPlaceId = id
      childResources.push({ label: table, table, filter: `id=eq.${id}` })
    } else if (table === 'wedding_operational_times') {
      const stopKey = weddingPlaceId
      const rows = await request('/rest/v1/wedding_operational_times?select=wedding_id,stop_key', {
        key: serviceKey, method: 'POST', prefer: 'return=representation',
        body: { wedding_id: weddingId, stop_key: stopKey, operational_time: '15:30' },
      })
      assert.equal(rows?.length, 1, 'service role seeds operational-time fixture')
      childResources.push({
        label: table, table,
        filter: `wedding_id=eq.${weddingId}&stop_key=eq.${encodeURIComponent(stopKey)}`,
        select: 'wedding_id,stop_key,operational_time',
      })
    } else {
      const id = await insertFixture(table, { wedding_id: weddingId, fixture_value: 'synthetic' })
      childResources.push({ label: table, table, filter: `id=eq.${id}` })
    }
  }
  const completions = await request('/rest/v1/wedding_operational_completions?select=wedding_id,stop_key', {
    key: serviceKey, method: 'POST', prefer: 'return=representation',
    body: { wedding_id: weddingId, stop_key: 'synthetic-stop' },
  })
  assert.deepEqual(completions, [{ wedding_id: weddingId, stop_key: 'synthetic-stop' }],
    'service role seeds a synthetic operational-completion row')
  childResources.push({
    label: 'wedding_operational_completions', table: 'wedding_operational_completions',
    filter: `wedding_id=eq.${weddingId}&stop_key=eq.synthetic-stop`,
    select: 'wedding_id,stop_key',
  })
  const collaborationFixtureId = await insertFixture('collaboration_child_isolation_fixture', {
    wedding_id: weddingId, resource_kind: 'wedding projection',
  })
  childResources.push({ label: 'collaboration_child_isolation_fixture', table: 'collaboration_child_isolation_fixture', filter: `id=eq.${collaborationFixtureId}` })
  childResources.push({
    label: 'payments', table: 'payments',
    filter: `id=eq.${await insertFixture('payments', { wedding_id: weddingId, type: 'other', amount: 1 })}`,
  })
  const extraTemplates = await request('/rest/v1/extra_services?slug=eq.harness-service&select=id', { key: serviceKey })
  assert.ok(extraTemplates?.[0]?.id, 'local extra-service template exists')
  childResources.push({
    label: 'wedding_extra_services', table: 'wedding_extra_services',
    filter: `id=eq.${await insertFixture('wedding_extra_services', {
      wedding_id: weddingId, extra_service_id: extraTemplates[0].id, price_snapshot: 1,
      name_snapshot: 'Synthetic extra', quantity: 1,
    })}`,
  })
  const questionnaireId = await insertFixture('wedding_questionnaires', {
    wedding_id: weddingId, owner_id: owner.id, title: 'Synthetic questionnaire',
  })
  childResources.push({ label: 'wedding_questionnaires', table: 'wedding_questionnaires', filter: `id=eq.${questionnaireId}` })
  childResources.push({
    label: 'wedding_questionnaire_responses', table: 'wedding_questionnaire_responses',
    filter: `id=eq.${await insertFixture('wedding_questionnaire_responses', {
      questionnaire_id: questionnaireId, answers_json: { synthetic: true },
    })}`,
  })
  const sessionId = await insertFixture('sessions', { user_id: owner.id, linked_wedding_id: weddingId })
  childResources.push({ label: 'sessions', table: 'sessions', filter: `id=eq.${sessionId}` })
  childResources.push({
    label: 'session_payments', table: 'session_payments',
    filter: `id=eq.${await insertFixture('session_payments', { session_id: sessionId, amount: 1 })}`,
  })
  async function assertChildIsolation(stage) {
    for (const resource of childResources) {
      const select = resource.select ?? 'id'
      const ownerRows = await request(`/rest/v1/${resource.table}?${resource.filter}&select=${select}`, { token: owner.token })
      assert.equal(ownerRows.length, 1, `owner can read ${resource.label} fixture ${stage}`)
      const memberRows = await request(`/rest/v1/${resource.table}?${resource.filter}&select=${select}`, { token: member.token })
      assert.deepEqual(memberRows, [], `${stage}: accepted-or-pending collaborator has zero ${resource.label} rows`)
    }
  }

  const checkedStages = []
  checkedStages.push('active global connection')
  await assertChildIsolation('active global connection')

  const tamperedInvite = await attemptWrite('/rest/v1/rpc/create_wedding_collaboration_invite', {
    token: owner.token,
    method: 'POST',
    body: {
      p_wedding_id: weddingId,
      p_invitee_user_id: thirdParty.id,
      p_proposed_share_amount: null,
      p_idempotency_key: randomUUID(),
    },
  })
  assert.ok(tamperedInvite.status >= 400,
    'owner cannot turn a client-tampered, unconnected user UUID into a wedding invitation')

  const invitation = await rpc('create_wedding_collaboration_invite', owner.token, {
    p_wedding_id: weddingId,
    p_invitee_user_id: member.id,
    p_proposed_share_amount: 1500,
    p_idempotency_key: randomUUID(),
  })
  assert.equal(invitation.status, 'created')

  const otherInvitation = await rpc('create_wedding_collaboration_invite', otherCollaborator.token, {
    p_wedding_id: otherWeddingId,
    p_invitee_user_id: thirdParty.id,
    p_proposed_share_amount: null,
    p_idempotency_key: randomUUID(),
  })
  assert.equal(otherInvitation.status, 'created', 'second owner creates a separate invitation for another invitee')
  const preview = await rpc('get_wedding_collaboration_invitation_preview', member.token, {
    p_invitation_id: invitation.invitation_id,
  })
  assert.equal(preview.status, 'pending', 'invitee preview returns the pending lifecycle status')
  assert.deepEqual(Object.keys(preview).sort(), [
    'accepted_at', 'cancelled_at', 'contract_value', 'couple_first_name', 'couple_second_name',
    'created_at', 'currency', 'declined_at', 'expired_at', 'expires_at', 'invitation_id',
    'inviter_display_name', 'membership_status', 'package_label', 'proposed_share_amount', 'reason', 'status',
    'superseded_at', 'wedding_date',
  ].sort(), 'preview exposes only the approved invitation snapshot allowlist')
  assert.ok(!JSON.stringify(preview).includes('@'), 'preview does not expose an account email')
  assert.equal(await rpc('get_wedding_collaboration_invitation_preview', owner.token, {
    p_invitation_id: invitation.invitation_id,
  }), null, 'owner cannot call the invitee preview RPC for their own invitation')
  assert.equal(await rpc('get_wedding_collaboration_invitation_preview', otherCollaborator.token, {
    p_invitation_id: invitation.invitation_id,
  }), null, 'another connected collaborator cannot preview this invitation')
  assert.equal(await rpc('get_wedding_collaboration_invitation_preview', thirdParty.token, {
    p_invitation_id: invitation.invitation_id,
  }), null, 'third party cannot preview this invitation')
  assert.equal(await rpc('get_wedding_collaboration_invitation_preview', thirdParty.token, {
    p_invitation_id: randomUUID(),
  }), null, 'random invitation ID reveals no data')
  assert.equal(await rpc('get_wedding_collaboration_invitation_preview', member.token, {
    p_invitation_id: otherInvitation.invitation_id,
  }), null, 'another valid invitation ID for a different invitee reveals no data')
  assert.equal((await rpc('get_wedding_collaboration_invitation_preview', thirdParty.token, {
    p_invitation_id: otherInvitation.invitation_id,
  })).status, 'pending', 'the second invitee can read only their own invitation')
  const anonPreview = await fetch(`${apiUrl}/rest/v1/rpc/get_wedding_collaboration_invitation_preview`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_invitation_id: invitation.invitation_id }),
  })
  assert.ok(anonPreview.status >= 400, 'anonymous caller cannot execute invitation preview RPC')
  const crossArgsResponse = await fetch(`${apiUrl}/rest/v1/rpc/get_wedding_collaboration_invitation_preview`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${member.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_invitation_id: invitation.invitation_id, p_wedding_id: weddingId }),
  })
  assert.ok(crossArgsResponse.status >= 400, 'preview RPC has no caller-supplied wedding-ID overload')

  const incoming = await rpc('list_my_wedding_collaboration_invitations', member.token, {})
  assert.deepEqual(incoming.map((item) => item.invitation_id), [invitation.invitation_id],
    'incoming list returns only the authenticated invitees invitation')
  assert.equal((await rpc('list_my_wedding_collaboration_invitations', owner.token, {})).length, 0,
    'owner does not see outgoing invitations in the invitee list')
  assert.deepEqual((await rpc('list_my_wedding_collaboration_invitations', thirdParty.token, {}))
    .map((item) => item.invitation_id), [otherInvitation.invitation_id],
  'another authenticated invitee list contains only their own invitation')
  const ownerState = await rpc('get_wedding_collaboration_state', owner.token, { p_wedding_id: weddingId })
  assert.equal(ownerState.invitations.length, 1, 'owner reads the invitation state for their wedding')
  assert.equal(await rpc('get_wedding_collaboration_state', owner.token, { p_wedding_id: otherWeddingId }), null,
    'owner cannot enumerate another account wedding state')
  assert.equal((await rpc('get_wedding_collaboration_state', otherCollaborator.token, { p_wedding_id: weddingId })), null,
    'another connected collaborator cannot read owner state')
  assert.equal(await rpc('get_wedding_collaboration_state', member.token, { p_wedding_id: weddingId }), null,
    'accepted-invitation invitee cannot read owner state')
  assert.equal(await rpc('get_wedding_collaboration_state', thirdParty.token, { p_wedding_id: weddingId }), null,
    'unrelated authenticated account cannot read owner state')
  assert.equal(await rpc('get_wedding_collaboration_state', owner.token, { p_wedding_id: randomUUID() }), null,
    'random wedding ID returns no owner state')
  const inviteNotification = await request(`/rest/v1/notifications?entity_type=eq.wedding_collaboration&entity_id=eq.${invitation.invitation_id}&select=id,title`, { key: serviceKey })
  assert.equal(inviteNotification.length, 1, 'invitation creates one in-app attention item through existing notification table')

  checkedStages.push('pending wedding invitation')
  await assertChildIsolation('pending wedding invitation')
  assert.deepEqual(await rpc('list_my_collaborative_weddings', member.token, {
    p_after_wedding_date: null, p_after_wedding_id: null, p_limit: 50,
  }), [], 'pending-only invitee receives no collaborative list rows')
  assert.equal(await rpc('get_collaborative_wedding_detail', member.token, { p_wedding_id: weddingId }), null,
    'pending-only invitee receives unavailable for collaborative detail')
  const otherWeddingRows = await request(`/rest/v1/weddings?id=eq.${weddingId}&select=id`, { token: otherCollaborator.token })
  assert.deepEqual(otherWeddingRows, [], 'another active global collaborator still has zero wedding SELECT access')
  const accepted = await rpc('accept_wedding_collaboration_invite', member.token, {
    p_invitation_id: invitation.invitation_id,
    p_idempotency_key: randomUUID(),
  })
  assert.equal(accepted.status, 'accepted')
  assert.equal((await rpc('get_wedding_collaboration_invitation_preview', member.token, {
    p_invitation_id: invitation.invitation_id,
  })).status, 'accepted', 'accepted invitee retains only the terminal invitation preview')
  const ownerNotification = await request(`/rest/v1/notifications?entity_type=eq.wedding_collaboration&entity_id=eq.${invitation.invitation_id}&select=id`, { key: serviceKey })
  assert.equal(ownerNotification.length, 2, 'acceptance adds an in-app state item while preserving the invitee item')
  checkedStages.push('accepted 1C-A membership')
  await assertChildIsolation('accepted 1C-A membership')

  const collaborativeList = await rpc('list_my_collaborative_weddings', member.token, {
    p_after_wedding_date: null, p_after_wedding_id: null, p_limit: 50,
  })
  assert.deepEqual(collaborativeList.map((item) => item.wedding_id), [weddingId],
    'accepted member sees only the wedding explicitly linked by active membership')
  assert.deepEqual(Object.keys(collaborativeList[0]).sort(),
    ['wedding_id', 'couple_first_name', 'couple_second_name', 'wedding_date'].sort(),
    'list RPC returns exactly the documented fields')
  assert.deepEqual(await rpc('list_my_collaborative_weddings', owner.token, {
    p_after_wedding_date: null, p_after_wedding_id: null, p_limit: 50,
  }), [], 'owner account receives no collaborator-list row for its own wedding')
  assert.deepEqual(await rpc('list_my_collaborative_weddings', otherCollaborator.token, {
    p_after_wedding_date: null, p_after_wedding_id: null, p_limit: 50,
  }), [], 'an active global connection alone does not populate collaborator wedding reads')
  const collaborativeDetail = await rpc('get_collaborative_wedding_detail', member.token, { p_wedding_id: weddingId })
  assert.deepEqual(Object.keys(collaborativeDetail).sort(),
    ['wedding_id', 'couple_first_name', 'couple_second_name', 'wedding_date', 'places'].sort(),
    'detail RPC returns exactly the documented top-level projection')
  assert.deepEqual(Object.keys(collaborativeDetail.places[0]).sort(),
    ['role', 'formatted_address', 'operational_time'].sort(), 'detail place returns exactly its three allowed fields')
  assert.equal(collaborativeDetail.places[0].operational_time, '15:30',
    'authenticated member reads only the curated saved operational time')
  assert.equal(await rpc('get_collaborative_wedding_detail', owner.token, { p_wedding_id: weddingId }), null,
    'owner cannot use the member-only detail projection')
  assert.equal(await rpc('get_collaborative_wedding_detail', otherCollaborator.token, { p_wedding_id: weddingId }), null,
    'another connected collaborator cannot read detail without an active membership')
  assert.equal(await rpc('get_collaborative_wedding_detail', thirdParty.token, { p_wedding_id: weddingId }), null,
    'third party cannot read detail by guessing the wedding UUID')

  const memberWedding = await request(`/rest/v1/weddings?id=eq.${weddingId}&select=id`, { token: member.token })
  assert.deepEqual(memberWedding, [], 'accepted member has zero wedding SELECT rows')
  await request(`/rest/v1/weddings?id=eq.${weddingId}`, {
    method: 'PATCH', token: member.token, prefer: 'return=representation', body: { venue: 'Denied' },
  })
  await request(`/rest/v1/weddings?id=eq.${weddingId}`, {
    method: 'DELETE', token: member.token, prefer: 'return=representation',
  })
  const ownerWedding = await request(`/rest/v1/weddings?id=eq.${weddingId}&select=id,venue`, { token: owner.token })
  assert.equal(ownerWedding.length, 1, 'member update and delete leave the owner wedding intact')
  assert.equal(ownerWedding[0].venue, null, 'member update did not change the wedding')

  const mutationCases = [
    { table: 'contacts', method: 'PATCH', filter: childResources.find((row) => row.table === 'contacts').filter, body: { fixture_value: 'member-mutated' } },
    { table: 'contacts', method: 'POST', filter: `wedding_id=eq.${weddingId}`, body: { wedding_id: weddingId, fixture_value: 'member-inserted' } },
    { table: 'tasks', method: 'PATCH', filter: childResources.find((row) => row.table === 'tasks').filter, body: { fixture_value: 'member-mutated' } },
    { table: 'payments', method: 'PATCH', filter: childResources.find((row) => row.table === 'payments').filter, body: { amount: 999 } },
    { table: 'wedding_places', method: 'PATCH', filter: childResources.find((row) => row.table === 'wedding_places').filter, body: { formatted_address: 'member-mutated' } },
    { table: 'wedding_operational_times', method: 'PATCH', filter: childResources.find((row) => row.table === 'wedding_operational_times').filter, body: { operational_time: '09:00' } },
    { table: 'wedding_extra_services', method: 'PATCH', filter: childResources.find((row) => row.table === 'wedding_extra_services').filter, body: { price_snapshot: 999 } },
  ]
  for (const testCase of mutationCases) {
    const result = await attemptWrite(`/rest/v1/${testCase.table}?${testCase.filter}`, {
      token: member.token, method: testCase.method, body: testCase.body,
    })
    assert.ok(!result.ok || Array.isArray(result.body) && result.body.length === 0,
      `accepted member cannot ${testCase.method} ${testCase.table}`)
    const ownerRows = await request(`/rest/v1/${testCase.table}?${testCase.filter}&select=*`, { token: owner.token })
    if (testCase.method === 'POST') {
      assert.equal(ownerRows.length, 1, 'member contact INSERT creates no extra owner-visible row')
    } else if (testCase.table === 'payments') {
      assert.equal(ownerRows[0].amount, 1, 'member payment UPDATE has no effect')
    } else if (testCase.table === 'wedding_extra_services') {
      assert.equal(ownerRows[0].price_snapshot, 1, 'member extra-service UPDATE has no effect')
    } else if (testCase.table === 'wedding_places') {
      assert.equal(ownerRows[0].formatted_address, 'Synthetic ceremony address', 'member place UPDATE has no effect')
    } else if (testCase.table === 'wedding_operational_times') {
      assert.equal(ownerRows[0].operational_time, '15:30', 'member operational-time UPDATE has no effect')
    } else {
      assert.equal(ownerRows[0].fixture_value, 'synthetic', `member ${testCase.table} UPDATE has no effect`)
    }
  }

  const ended = await rpc('end_collaboration', owner.token, {
    p_connection_id: (await request(`/rest/v1/collaboration_connections?participant_low_id=eq.${low}&participant_high_id=eq.${high}&select=id`, { key: serviceKey }))[0].id,
    p_idempotency_key: randomUUID(),
  })
  assert.equal(ended.status, 'ended')
  const membership = await request(`/rest/v1/wedding_collaboration_memberships?wedding_id=eq.${weddingId}&member_user_id=eq.${member.id}&select=id,status`, { key: serviceKey })
  assert.equal(membership.length, 1, 'global connection end preserves accepted membership')
  assert.equal(membership[0].status, 'active', 'global connection end does not revoke wedding membership')
  assert.deepEqual((await rpc('list_my_collaborative_weddings', member.token, {
    p_after_wedding_date: null, p_after_wedding_id: null, p_limit: 50,
  })).map((item) => item.wedding_id), [weddingId],
  'active wedding membership remains visible after the global connection ends')
  const afterConnectionEnd = await rpc('get_collaborative_wedding_detail', member.token, { p_wedding_id: weddingId })
  assert.equal(afterConnectionEnd.wedding_id, weddingId,
    'active wedding membership remains readable after the global connection ends')
  assert.deepEqual(await request(`/rest/v1/weddings?id=eq.${weddingId}&select=id`, { token: member.token }), [],
    'ended global connection and active membership still grant zero direct wedding rows')
  const revoked = await rpc('revoke_wedding_collaboration_membership', owner.token, {
    p_membership_id: membership[0].id,
    p_idempotency_key: randomUUID(),
  })
  assert.equal(revoked.status, 'revoked', 'owner revokes membership through the supported lifecycle RPC')
  assert.equal(await rpc('get_collaborative_wedding_detail', member.token, { p_wedding_id: weddingId }), null,
    'revoked member receives unavailable detail through Auth/PostgREST')
  assert.deepEqual(await rpc('list_my_collaborative_weddings', member.token, {
    p_after_wedding_date: null, p_after_wedding_id: null, p_limit: 50,
  }), [], 'revoked wedding disappears from the Auth/PostgREST collaborative list')
  assert.deepEqual(await request(`/rest/v1/weddings?id=eq.${weddingId}&select=id`, { token: member.token }), [],
    'revoked member continues to have zero direct wedding rows')
  assert.deepEqual(await request(`/rest/v1/wedding_places?id=eq.${weddingPlaceId}&select=id`, { token: member.token }), [],
    'revoked member continues to have zero direct place rows')
  console.log(`Auth/PostgREST integration: PASS (${childResources.length} child resources x ${checkedStages.length} stages; ${mutationCases.length} denied child writes plus wedding UPDATE/DELETE; preview/list/owner-state IDOR matrix; 4 normal local users; zero Internal QA accounts)`)
} finally {
  if (weddingId) {
    await request(`/rest/v1/weddings?id=eq.${weddingId}`, { key: serviceKey, method: 'DELETE' }).catch(() => {})
  }
  if (otherWeddingId) {
    await request(`/rest/v1/weddings?id=eq.${otherWeddingId}`, { key: serviceKey, method: 'DELETE' }).catch(() => {})
  }
  for (const user of [thirdParty, otherCollaborator, member, owner]) {
    if (user?.id) await request(`/auth/v1/admin/users/${user.id}`, { key: serviceKey, method: 'DELETE' }).catch(() => {})
  }
}
