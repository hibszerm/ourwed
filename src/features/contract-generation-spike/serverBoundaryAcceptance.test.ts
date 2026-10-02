import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createContractGenerationBoundary, parseContractGenerationAction, ProviderOperationError, type ServerBoundaryDependencies } from './serverBoundary.ts'
import type { ContractGenerationSession } from './generationSession.ts'

const future = new Date(Date.now() + 60_000).toISOString()
const startRequest = { weddingId: 'wedding-1', requestId: '00000000-0000-4000-8000-000000000001' }
const baseSession: ContractGenerationSession = {
  id: 'session-1', ownerUserId: 'owner-1', weddingId: 'wedding-1', templateId: 'template-1',
  templateVersionId: 'version-1', sourceSha256: 'a'.repeat(64), state: 'awaiting_input',
  missingInputs: [{ id: 'opaque-1', label: 'Client name', answerKind: 'text' }],
  missingInputHistory: [{ id: 'opaque-1', label: 'Client name', answerKind: 'text' }], answers: [],
  expiresAt: future, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}

function setup(overrides: Partial<ServerBoundaryDependencies> = {}) {
  const calls: string[] = []
  const diagnostics: import('./serverBoundary.ts').BoundaryDiagnostic[] = []
  let session: ContractGenerationSession | null = null
  let claimed = false
  let contextLoads = 0
  let fingerprint = 'b'.repeat(64)
  let generation: Awaited<ReturnType<NonNullable<ServerBoundaryDependencies['generate']>>> = {
    status: 'MISSING_INPUT', missingInputs: [{ id: 'opaque-1', label: 'Client name', answerKind: 'text' }],
  }
  const context = async (userId: string, weddingId: string) => ({
    scope: { ownerUserId: userId, weddingId, templateId: 'template-1', templateVersionId: 'version-1', sourceSha256: 'a'.repeat(64) },
    sourceBytes: new ArrayBuffer(1), sourceSha256: 'a'.repeat(64), authorityFingerprint: fingerprint,
    authority: { serverBuilt: true, count: ++contextLoads },
  })
  const deps: ServerBoundaryDependencies = {
    newId: () => 'execution-1',
    loadContext: async (userId, weddingId) => context(userId, weddingId),
    createSession: async (input) => {
      calls.push('createSession')
      session = { ...baseSession, id: 'session-1', ownerUserId: input.userId, weddingId: input.weddingId, state: 'processing', missingInputs: [], missingInputHistory: [], answers: [], sourceSha256: input.sourceSha256 }
      return session
    },
    getSession: async () => session ?? baseSession,
    getSessionByIdempotencyKey: async () => null,
    expireSession: async () => { calls.push('expire') },
    claimContinuation: async ({ userId, answers, missingInputHistory, missingInputHistoryValid }) => {
      if (claimed) return null
      claimed = true
      if (!session || session.ownerUserId !== userId || session.state !== 'awaiting_input') return null
      session = { ...session, state: 'processing', answers, missingInputHistory, missingInputHistoryValid }
      calls.push('claim')
      return session
    },
    saveMissing: async ({ missingInputs, missingInputHistory, answers }) => {
      calls.push('saveMissing')
      if (session) session = { ...session, state: 'awaiting_input', missingInputs, missingInputHistory, answers }
      return true
    },
    persistAcceptedCandidate: async () => { calls.push('persist'); if (session) session = { ...session, state: 'completed' }; return 'candidate-1' },
    markFailure: async (_id, _execution, reason) => { calls.push(`failure:${reason}`); if (session) session = { ...session, state: 'failed' } },
    generate: async () => { calls.push('generate'); return generation },
    verifyConflict: async () => { calls.push('verifyConflict'); return 'confirmed' },
    review: async () => { calls.push('review'); return 'pass' },
    diagnose: (diagnostic) => { diagnostics.push(diagnostic) },
    ...overrides,
  }
  return {
    boundary: createContractGenerationBoundary(deps), calls, diagnostics,
    setSession(value: ContractGenerationSession | null) { session = value },
    setGeneration(value: typeof generation) { generation = value },
    setFingerprint(value: string) { fingerprint = value },
    session: () => session,
  }
}

assert.deepEqual(parseContractGenerationAction({ version: 1, action: 'start', request: { weddingId: 'w1', requestId: '00000000-0000-4000-8000-000000000001' } }), { action: 'start', request: { weddingId: 'w1', requestId: '00000000-0000-4000-8000-000000000001' } }, 'initial request contains wedding identity and idempotency metadata')
assert.equal(parseContractGenerationAction({ version: 1, action: 'start', request: { weddingId: 'w1' }, extras: [] }), null, 'envelope parser rejects undeclared envelope fields')
assert.deepEqual(parseContractGenerationAction({ version: 1, action: 'start', request: { weddingId: 'w1', contractValue: 10 } }), null, 'browser legal authority is rejected by strict request shape')
assert.deepEqual(parseContractGenerationAction({ version: 1, action: 'continue', request: { sessionId: 's1', answers: [], authority: {} } }), null)
assert.deepEqual(parseContractGenerationAction({ version: 1, action: 'candidate', request: { weddingId: 'w1', candidateId: 'opaque-candidate' } }), { action: 'candidate', request: { weddingId: 'w1', candidateId: 'opaque-candidate' } })
assert.equal(parseContractGenerationAction({ version: 1, action: 'recover', request: { weddingId: 'w1', sessionId: 's1' } }), null, 'old durable-session recovery action is removed')

{
  const expired = { ...baseSession, expiresAt: new Date(Date.now() - 1).toISOString() }
  const f = setup()
  f.setSession(expired)
  const result = await f.boundary.continue('owner-1', { sessionId: expired.id, answers: [{ missingInputId: 'opaque-1', value: 'answer' }] })
  assert.deepEqual(result, { status: 'stale', code: 'session_invalid' })
  assert.deepEqual(f.calls, ['expire'], 'expired continuation clears the ephemeral transaction without a provider call')
}

{
  const f = setup()
  const result = await f.boundary.start('owner-1', startRequest)
  assert.equal(result.status, 'awaiting_input')
  assert.deepEqual(f.calls, ['createSession', 'generate', 'saveMissing'])
  assert.equal(f.session()?.state, 'awaiting_input')
  assert.equal(f.calls.includes('review'), false, 'MISSING_INPUT skips Reviewer')
  assert.equal(f.calls.includes('persist'), false, 'MISSING_INPUT stores no candidate')
}

{
  const f = setup({
    getSessionByIdempotencyKey: async () => ({ ...baseSession, state: 'completed' }),
  })
  const replay = await f.boundary.start('owner-1', startRequest)
  assert.deepEqual(replay, { status: 'ready', sessionId: 'session-1', candidateId: 'session-1', templateId: 'template-1', templateVersionId: 'version-1' })
  assert.deepEqual(f.calls, [], 'initial request replay returns the existing candidate without another execution')
}

{
  const f = setup({
    getSessionByIdempotencyKey: async () => ({ ...baseSession, state: 'completed', expiresAt: new Date(Date.now() - 1).toISOString() }),
  })
  const replay = await f.boundary.start('owner-1', startRequest)
  assert.deepEqual(replay, { status: 'stale', code: 'session_invalid' }, 'expired completed preview cannot be replayed as usable')
  assert.deepEqual(f.calls, [], 'expired preview replay is rejected without another execution or provider call')
}

{
  const f = setup()
  f.setSession(baseSession)
  f.setGeneration({ status: 'MISSING_INPUT', missingInputs: [{ id: 'opaque-2', label: 'Wedding date', answerKind: 'date' }] })
  const first = await f.boundary.continue('owner-1', { sessionId: 'session-1', answers: [{ missingInputId: 'opaque-1', value: 'Ada Example' }] })
  assert.equal(first.status, 'awaiting_input', 'a second MissingInput batch is returned without looping')
  assert.deepEqual(f.calls, ['claim', 'generate', 'saveMissing'])
  assert.equal(f.session()?.answers[0]?.value, 'Ada Example', 'accepted answers remain scoped to the session')
  assert.equal(f.calls.filter((call) => call === 'generate').length, 1)
}

{
  const f = setup()
  f.setSession(baseSession)
  const mismatch = await f.boundary.continue('another-owner', { sessionId: 'session-1', answers: [{ missingInputId: 'opaque-1', value: 'Ada' }] })
  assert.deepEqual(mismatch, { status: 'stale', code: 'session_invalid' })
  assert.deepEqual(f.calls, [], 'foreign session rejected before data loads or provider calls')
}

{
  const f = setup()
  f.setSession(baseSession)
  const unknown = await f.boundary.continue('owner-1', { sessionId: 'session-1', answers: [{ missingInputId: 'unknown', value: 'Ada' }] })
  assert.equal(unknown.status, 'stale')
  assert.deepEqual(f.calls, [], 'unknown answers do not claim or execute a session')
}

{
  const f = setup()
  f.setSession(baseSession)
  const duplicate = await f.boundary.continue('owner-1', { sessionId: 'session-1', answers: [
    { missingInputId: 'opaque-1', value: 'Ada' }, { missingInputId: 'opaque-1', value: 'Ada again' },
  ] })
  assert.equal(duplicate.status, 'stale', 'duplicate answers are rejected by session rules')
  assert.deepEqual(f.calls, [])
}

{
  const f = setup()
  f.setGeneration({ status: 'CONFLICT_INPUT', conflicts: ['conflicting date'] })
  const result = await f.boundary.start('owner-1', startRequest)
  assert.equal(result.status, 'unresolved_conflict')
  assert.deepEqual(f.calls, ['createSession', 'generate', 'verifyConflict', 'failure:failed'])
  assert.equal(f.calls.includes('review'), false)
  assert.equal(f.calls.includes('persist'), false)
}

{
  const f = setup({
    generate: async () => { f.calls.push('generate'); return { status: 'READY', candidate: { bytes: new ArrayBuffer(2), changedBlocks: [] } } },
  })
  const result = await f.boundary.start('owner-1', startRequest)
  assert.equal(result.status, 'ready')
  assert.deepEqual(f.calls, ['createSession', 'generate', 'review', 'persist'])
  assert.equal(f.session()?.state, 'completed')
}

{
  const f = setup({
    generate: async () => { f.calls.push('generate'); return { status: 'READY', candidate: { bytes: new ArrayBuffer(2), changedBlocks: [] } } },
    review: async () => { f.calls.push('review'); return 'fail' },
  })
  const result = await f.boundary.start('owner-1', startRequest)
  assert.equal(result.status, 'failure')
  assert.equal(f.calls.includes('persist'), false, 'Reviewer failure cannot persist candidate')
}

{
  const f = setup({
    generate: async () => { f.calls.push('generate'); return { status: 'READY', candidate: { bytes: new ArrayBuffer(2), changedBlocks: [] } } },
    review: async () => {
      f.calls.push('review')
      return {
        status: 'fail',
        findingCount: 2,
        findingCategories: ['unsupported_addition', 'authoritative_fact_mismatch', 'unsupported_addition'],
        findingRuleIds: ['unsupported_invention', 'payment_amounts'],
      }
    },
  })
  const result = await f.boundary.start('owner-1', startRequest)
  const reviewer = f.diagnostics.find(({ providerRole }) => providerRole === 'Reviewer')
  assert.equal(result.status, 'failure')
  assert.deepEqual(reviewer && { category: reviewer.category, findingCount: reviewer.findingCount, findingCategories: reviewer.findingCategories, findingRuleIds: reviewer.findingRuleIds }, {
    category: 'FAIL', findingCount: 2, findingCategories: ['authoritative_fact_mismatch', 'unsupported_addition'], findingRuleIds: ['payment_amounts', 'unsupported_invention'],
  })
  assert.deepEqual(f.calls, ['createSession', 'generate', 'review', 'failure:failed'], 'semantic FAIL has no retry, repair, or persistence')
  assert.equal(JSON.stringify(f.diagnostics).includes('private-message'), false)
}

for (const [errorCategory, diagnosticCategory] of [
  ['provider_failure', 'PROVIDER_FAILURE'],
  ['invalid_response', 'INVALID_RESPONSE'],
] as const) {
  const f = setup({
    generate: async () => { f.calls.push('generate'); return { status: 'READY', candidate: { bytes: new ArrayBuffer(2), changedBlocks: [] } } },
    review: async () => { f.calls.push('review'); throw new ProviderOperationError(errorCategory) },
  })
  const result = await f.boundary.start('owner-1', startRequest)
  assert.deepEqual(result, { status: 'failure', code: 'temporary_failure' })
  assert.equal(f.diagnostics.find(({ providerRole }) => providerRole === 'Reviewer')?.category, diagnosticCategory)
  assert.deepEqual(f.calls, ['createSession', 'generate', 'review', 'failure:failed'], 'Reviewer provider/protocol failure does not retry, repair, or persist')
}

{
  const f = setup({
    generate: async () => { f.calls.push('generate'); return { status: 'READY', candidate: { bytes: new ArrayBuffer(2), changedBlocks: [] } } },
  })
  const result = await f.boundary.start('owner-1', startRequest)
  const reviewer = f.diagnostics.find(({ providerRole }) => providerRole === 'Reviewer')
  assert.equal(result.status, 'ready', 'PASS keeps candidate persistence behavior')
  assert.equal(reviewer?.category, 'PASS')
  assert.equal(reviewer?.findingCount, undefined)
  assert.equal(reviewer?.findingCategories, undefined)
  assert.equal(reviewer?.findingRuleIds, undefined)
}

{
  let loads = 0
  const f = setup({
    generate: async () => { f.calls.push('generate'); return { status: 'READY', candidate: { bytes: new ArrayBuffer(2), changedBlocks: [] } } },
    loadContext: async (userId, weddingId) => {
      loads++
      return {
        scope: { ownerUserId: userId, weddingId, templateId: 'template-1', templateVersionId: 'version-1', sourceSha256: 'a'.repeat(64) },
        sourceBytes: new ArrayBuffer(1), sourceSha256: 'a'.repeat(64), authorityFingerprint: loads === 1 ? 'b'.repeat(64) : 'c'.repeat(64),
        authority: { current: true },
      }
    },
  })
  const result = await f.boundary.start('owner-1', startRequest)
  assert.deepEqual(result, { status: 'stale', code: 'authority_changed' })
  assert.equal(f.calls.includes('persist'), false)
  assert.equal(f.calls.filter((call) => call === 'generate').length, 1, 'stale result does not retry')
}

{
  let release!: () => void
  let reached!: () => void
  const reachedPromise = new Promise<void>((resolve) => { reached = resolve })
  const gate = new Promise<void>((resolve) => { release = resolve })
  const f = setup({
    generate: async () => { f.calls.push('generate'); reached(); await gate; return { status: 'MISSING_INPUT', missingInputs: [{ id: 'opaque-1', label: 'Client name', answerKind: 'text' }] } },
  })
  f.setSession(baseSession)
  const first = f.boundary.continue('owner-1', { sessionId: 'session-1', answers: [{ missingInputId: 'opaque-1', value: 'Ada' }] })
  await reachedPromise
  const second = await f.boundary.continue('owner-1', { sessionId: 'session-1', answers: [{ missingInputId: 'opaque-1', value: 'Ada' }] })
  assert.deepEqual(second, { status: 'stale', code: 'session_invalid' }, 'CAS continuation lock prevents duplicate execution')
  release()
  await first
  assert.equal(f.calls.filter((call) => call === 'generate').length, 1)
}

console.log('PASS authenticated server contract-generation boundary orchestration')

const edge = await readFile('supabase/functions/contract-generation-boundary/index.ts', 'utf8')
const handlerStart = edge.indexOf('async function handleRequest')
const authPosition = edge.indexOf('await requireAuthenticatedUser(request)', handlerStart)
const weddingLoadPosition = edge.indexOf("from('weddings').select('id')", handlerStart)
assert.ok(authPosition >= 0 && authPosition < weddingLoadPosition, 'authentication precedes contract data loading')
assert.match(edge, /\.from\('weddings'\)[\s\S]*?\.eq\('user_id', userId\)/, 'wedding reads are owner-filtered server-side')
assert.match(edge, /\.from\('packages'\)[\s\S]*?\.eq\('user_id', userId\)/, 'package reads are owner-filtered server-side')
assert.match(edge, /\.from\('document_templates'\)[\s\S]*?\.eq\('user_id', userId\)/, 'template reads are owner-filtered server-side')
assert.match(edge, /\.from\('document_template_versions'\)[\s\S]*?\.eq\('template_id', template\.id\)/, 'version is scoped to the assigned template')
assert.match(edge, /pkg\.active_contract_template_version_id \|\| template\.current_version_id/, 'pinned version takes precedence with current-version fallback')
assert.match(edge, /storage\.from\('document-files'\)\.download\(version\.source_docx_path\)/, 'source DOCX is loaded from private server-side storage')
assert.match(edge, /sourcePathIsOwned\(version\.source_docx_path, userId, template\.id, Number\(version\.version_number\)\)/, 'source object path is verified against owner, template, and version')
assert.match(edge, /wedding_extra_services/)
assert.match(edge, /extras: weddingExtras/)
assert.match(edge, /isTravelFeeResolved\(wedding\)/)
assert.match(edge, /payments\.map\(mapPayment\)/)
assert.match(edge, /wedding_places/)
assert.match(edge, /form_instances/)
assert.match(edge, /userProvidedAnswers: answers\.map/)
assert.match(edge, /sha256\(canonicalAuthorityFingerprint\(freshnessAuthority, \{/)
assert.match(edge, /authority_fingerprint: input\.authorityFingerprint/)
assert.match(edge, /OPTION_B_ACTIVE_TTL_MS = 30 \* 60 \* 1000/)
assert.match(edge, /storage\.from\('document-files'\)\.remove\(\[path\]\)/, 'failed DB persistence cleans up its reviewed candidate upload')
assert.match(edge, /applyOptionBGenerationResponse\(context\.sourceBytes/)
assert.match(edge, /let applied:[\s\S]*?applied = await applyOptionBGenerationResponse[\s\S]*?if \(applied\.status !== 'READY'\)/, 'mechanics pass before a candidate reaches Reviewer')
assert.match(edge, /candidate: \{ bytes: applied\.candidateBytes, changedBlocks: applied\.changedBlocks \}/)
assert.match(edge, /rpc\('begin_option_b_generation'/, 'new flow creation uses a serialized server-side transition')
assert.match(edge, /session_state', 'awaiting_input'[\s\S]*?select\('\*'\)/, 'continuation claim uses an atomic awaiting-input compare-and-set')
assert.match(edge, /\.eq\('id', parsed\.request\.candidateId\)[\s\S]*?\.eq\('wedding_id', parsed\.request\.weddingId\)[\s\S]*?\.eq\('owner_user_id', auth\.userId\)[\s\S]*?\.eq\('session_kind', 'option_b'\)[\s\S]*?\.eq\('session_state', 'completed'\)/, 'candidate reads bind opaque ID to owner, wedding, and completed Option B session')
assert.match(edge, /temporaryCandidatePath\(auth\.userId, parsed\.request\.weddingId, parsed\.request\.candidateId\)/, 'private candidate path is constructed only on the server')
assert.match(edge, /session_state: 'abandoned'[\s\S]*?missing_inputs_json: \[\], user_answers_json: \[\]/, 'terminalization clears sensitive working state')
const migration = await readFile('supabase/migrations/20261001120000_contract_generation_boundary_guards.sql', 'utf8')
assert.match(migration, /one_active_option_b_per_wedding/)
assert.match(migration, /option_b_idempotency_key/)
const ephemeralMigration = await readFile('supabase/migrations/20261002180000_option_b_ephemeral_lifecycle.sql', 'utf8')
assert.match(ephemeralMigration, /pg_advisory_xact_lock/)
assert.match(ephemeralMigration, /interval '30 minutes'/)
assert.match(ephemeralMigration, /session_kind = 'option_b'[\s\S]*?session_state in \('processing', 'awaiting_input', 'completed'\)/)
assert.match(ephemeralMigration, /missing_inputs_json = '\[\]'::jsonb, user_answers_json = '\[\]'::jsonb/)
assert.match(ephemeralMigration, /option-b-ephemeral-cleanup/)
assert.doesNotMatch(ephemeralMigration, /delete from public\.wedding_contract_generation_runs/i, 'forward migration does not delete historical rows')
console.log('PASS server boundary authentication, ownership, and authoritative data wiring')
