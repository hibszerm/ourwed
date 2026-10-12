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
let weddingId
try {
  owner = await signup('owner')
  member = await signup('member')
  const [low, high] = [owner.id, member.id].sort()
  await request('/rest/v1/collaboration_connections', {
    key: serviceKey,
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      participant_low_id: low,
      participant_high_id: high,
      participant_low_name_snapshot: 'Local owner',
      participant_high_name_snapshot: 'Local member',
      status: 'active',
    },
  })

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

  const childResources = []
  const weddingChildTables = [
    'contacts', 'notes', 'tasks', 'timeline_events', 'calendar_events',
    'wedding_places', 'travel_segments', 'wedding_operational_times', 'wedding_briefs',
    'wedding_documents', 'wedding_document_drafts', 'wedding_source_contracts',
    'wedding_contract_recoveries', 'wedding_contract_package_snapshots',
    'wedding_contract_recovery_decisions', 'wedding_contract_generation_runs',
    'wedding_document_generation_sequences', 'contracts',
  ]
  for (const table of weddingChildTables) {
    const id = await insertFixture(table, { wedding_id: weddingId, fixture_value: 'synthetic' })
    childResources.push({ label: table, table, filter: `id=eq.${id}` })
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

  const invitation = await rpc('create_wedding_collaboration_invite', owner.token, {
    p_wedding_id: weddingId,
    p_invitee_user_id: member.id,
    p_proposed_share_amount: 1500,
    p_idempotency_key: randomUUID(),
  })
  assert.equal(invitation.status, 'created')
  checkedStages.push('pending wedding invitation')
  await assertChildIsolation('pending wedding invitation')
  const accepted = await rpc('accept_wedding_collaboration_invite', member.token, {
    p_invitation_id: invitation.invitation_id,
    p_idempotency_key: randomUUID(),
  })
  assert.equal(accepted.status, 'accepted')
  checkedStages.push('accepted 1C-A membership')
  await assertChildIsolation('accepted 1C-A membership')

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
    { table: 'wedding_places', method: 'PATCH', filter: childResources.find((row) => row.table === 'wedding_places').filter, body: { fixture_value: 'member-mutated' } },
    { table: 'wedding_operational_times', method: 'PATCH', filter: childResources.find((row) => row.table === 'wedding_operational_times').filter, body: { fixture_value: 'member-mutated' } },
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
    } else {
      assert.equal(ownerRows[0].fixture_value, 'synthetic', `member ${testCase.table} UPDATE has no effect`)
    }
  }

  const ended = await rpc('end_collaboration', owner.token, {
    p_connection_id: (await request(`/rest/v1/collaboration_connections?participant_low_id=eq.${low}&participant_high_id=eq.${high}&select=id`, { key: serviceKey }))[0].id,
    p_idempotency_key: randomUUID(),
  })
  assert.equal(ended.status, 'ended')
  const membership = await request(`/rest/v1/wedding_collaboration_memberships?wedding_id=eq.${weddingId}&member_user_id=eq.${member.id}&select=status`, { key: serviceKey })
  assert.deepEqual(membership, [{ status: 'active' }], 'global connection end preserves accepted membership')
  console.log(`Auth/PostgREST integration: PASS (${childResources.length} child resources x ${checkedStages.length} stages; ${mutationCases.length} denied child writes plus wedding UPDATE/DELETE; 2 normal local users; zero Internal QA accounts)`)
} finally {
  if (weddingId) {
    await request(`/rest/v1/weddings?id=eq.${weddingId}`, { key: serviceKey, method: 'DELETE' }).catch(() => {})
  }
  for (const user of [member, owner]) {
    if (user?.id) await request(`/auth/v1/admin/users/${user.id}`, { key: serviceKey, method: 'DELETE' }).catch(() => {})
  }
}
