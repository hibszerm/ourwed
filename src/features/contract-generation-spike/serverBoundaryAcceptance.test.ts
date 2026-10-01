import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createContractGenerationBoundary, parseContractGenerationAction, type ServerBoundaryDependencies } from './serverBoundary.ts'
import type { ContractGenerationSession } from './generationSession.ts'

const future = new Date(Date.now() + 60_000).toISOString()
const startRequest = { weddingId: 'wedding-1', requestId: '00000000-0000-4000-8000-000000000001' }
const baseSession: ContractGenerationSession = {
  id: 'session-1', ownerUserId: 'owner-1', weddingId: 'wedding-1', templateId: 'template-1',
  templateVersionId: 'version-1', sourceSha256: 'a'.repeat(64), state: 'awaiting_input',
  missingInputs: [{ id: 'opaque-1', label: 'Client name', answerKind: 'text' }], answers: [],
  expiresAt: future, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}

function setup(overrides: Partial<ServerBoundaryDependencies> = {}) {
  const calls: string[] = []
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
      session = { ...baseSession, id: 'session-1', ownerUserId: input.userId, weddingId: input.weddingId, state: 'processing', missingInputs: [], answers: [], sourceSha256: input.sourceSha256 }
      return session
    },
    getSession: async () => session ?? baseSession,
    getSessionByIdempotencyKey: async () => null,
    getAuthorityFingerprint: async () => fingerprint,
    claimContinuation: async ({ userId }) => {
      if (claimed) return null
      claimed = true
      if (!session || session.ownerUserId !== userId || session.state !== 'awaiting_input') return null
      session = { ...session, state: 'processing' }
      calls.push('claim')
      return session
    },
    saveMissing: async ({ missingInputs, answers }) => {
      calls.push('saveMissing')
      if (session) session = { ...session, state: 'awaiting_input', missingInputs, answers }
      return true
    },
    persistAcceptedCandidate: async () => { calls.push('persist'); if (session) session = { ...session, state: 'completed' }; return 'candidate-1' },
    markFailure: async (_id, _execution, reason) => { calls.push(`failure:${reason}`); if (session) session = { ...session, state: 'failed' } },
    generate: async () => { calls.push('generate'); return generation },
    verifyConflict: async () => { calls.push('verifyConflict'); return 'confirmed' },
    review: async () => { calls.push('review'); return 'pass' },
    ...overrides,
  }
  return {
    boundary: createContractGenerationBoundary(deps), calls,
    setSession(value: ContractGenerationSession | null) { session = value },
    setGeneration(value: typeof generation) { generation = value },
    setFingerprint(value: string) { fingerprint = value },
    session: () => session,
    calls,
  }
}

assert.deepEqual(parseContractGenerationAction({ version: 1, action: 'start', request: { weddingId: 'w1', requestId: '00000000-0000-4000-8000-000000000001' } }), { action: 'start', request: { weddingId: 'w1', requestId: '00000000-0000-4000-8000-000000000001' } }, 'initial request contains wedding identity and idempotency metadata')
assert.equal(parseContractGenerationAction({ version: 1, action: 'start', request: { weddingId: 'w1' }, extras: [] }), null, 'envelope parser rejects undeclared envelope fields')
assert.deepEqual(parseContractGenerationAction({ version: 1, action: 'start', request: { weddingId: 'w1', contractValue: 10 } }), null, 'browser legal authority is rejected by strict request shape')
assert.deepEqual(parseContractGenerationAction({ version: 1, action: 'continue', request: { sessionId: 's1', answers: [], authority: {} } }), null)
assert.deepEqual(parseContractGenerationAction({ version: 1, action: 'recover', request: { weddingId: 'w1', sessionId: 'opaque-session' } }), { action: 'recover', request: { weddingId: 'w1', sessionId: 'opaque-session' } })
assert.deepEqual(parseContractGenerationAction({ version: 1, action: 'candidate', request: { weddingId: 'w1', candidateId: 'opaque-candidate' } }), { action: 'candidate', request: { weddingId: 'w1', candidateId: 'opaque-candidate' } })
assert.equal(parseContractGenerationAction({ version: 1, action: 'recover', request: { weddingId: 'w1', sessionId: 's1', requestId: '00000000-0000-4000-8000-000000000001' } }), null)

{
  const f = setup()
  f.setSession(baseSession)
  const recovered = await f.boundary.recover('owner-1', { weddingId: 'wedding-1', sessionId: 'session-1' })
  assert.deepEqual(recovered, { status: 'awaiting_input', sessionId: 'session-1', missingInputs: baseSession.missingInputs })
  assert.equal(f.calls.includes('generate'), false, 'recovery never invokes Generator')
}

{
  const completed = { ...baseSession, state: 'completed' as const, missingInputs: [] }
  const f = setup({ getSession: async () => completed })
  const recovered = await f.boundary.recover('owner-1', { weddingId: 'wedding-1', sessionId: 'session-1' })
  assert.deepEqual(recovered, { status: 'ready', sessionId: 'session-1', candidateId: 'session-1', templateId: 'template-1', templateVersionId: 'version-1' })
}

{
  const processing = { ...baseSession, state: 'processing' as const, missingInputs: [] }
  const f = setup({ getSession: async () => processing })
  const recovered = await f.boundary.recover('owner-1', { weddingId: 'wedding-1', sessionId: 'session-1' })
  assert.deepEqual(recovered, { status: 'processing', sessionId: 'session-1' })
  assert.deepEqual(f.calls, [], 'processing recovery only reads the session')
}

{
  const f = setup({ getAuthorityFingerprint: async () => 'c'.repeat(64) })
  f.setSession(baseSession)
  const recovered = await f.boundary.recover('owner-1', { weddingId: 'wedding-1', sessionId: 'session-1' })
  assert.deepEqual(recovered, { status: 'stale', code: 'authority_changed' })
}

{
  const f = setup()
  f.setSession(baseSession)
  const recovered = await f.boundary.recover('another-owner', { weddingId: 'wedding-1', sessionId: 'session-1' })
  assert.deepEqual(recovered, { status: 'stale', code: 'session_invalid' })
  assert.deepEqual(f.calls, [], 'foreign recovery does not load wedding authority')
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
assert.match(edge, /sha256\(canonicalAuthorityFingerprint\(authority, \{/)
assert.match(edge, /authority_fingerprint: input\.authorityFingerprint/)
assert.match(edge, /session_state: 'abandoned', generation_status: 'failed'[\s\S]*?\.lte\('expires_at'/, 'expired processing or resumable sessions release the active slot before a new run')
assert.match(edge, /storage\.from\('document-files'\)\.remove\(\[path\]\)/, 'failed DB persistence cleans up its reviewed candidate upload')
assert.match(edge, /applyOptionBGenerationResponse\(context\.sourceBytes/)
assert.match(edge, /const applied = await applyOptionBGenerationResponse[\s\S]*?if \(applied\.status !== 'READY'\)/, 'mechanics pass before a candidate reaches Reviewer')
assert.match(edge, /candidate: \{ bytes: applied\.candidateBytes, changedBlocks: applied\.changedBlocks \}/)
assert.match(edge, /execution_id: input\.executionId, idempotency_key: input\.requestId/)
assert.match(edge, /session_state', 'awaiting_input'[\s\S]*?select\('\*'\)/, 'continuation claim uses an atomic awaiting-input compare-and-set')
assert.match(edge, /\.eq\('id', parsed\.request\.candidateId\)[\s\S]*?\.eq\('wedding_id', parsed\.request\.weddingId\)[\s\S]*?\.eq\('owner_user_id', auth\.userId\)[\s\S]*?\.eq\('session_kind', 'option_b'\)[\s\S]*?\.eq\('session_state', 'completed'\)/, 'candidate reads bind opaque ID to owner, wedding, and completed Option B session')
assert.match(edge, /const candidatePath = `\$\{auth\.userId\}\/weddings\/\$\{parsed\.request\.weddingId\}\/drafts\/\$\{parsed\.request\.candidateId\}\/option-b-reviewed-candidate\.docx`/, 'private candidate path is constructed only on the server')
assert.match(edge, /getAuthorityFingerprint\(userId, sessionId\)/, 'resume compares fresh authority with the saved fingerprint')
const migration = await readFile('supabase/migrations/20261001120000_contract_generation_boundary_guards.sql', 'utf8')
assert.match(migration, /one_active_option_b_per_wedding/)
assert.match(migration, /option_b_idempotency_key/)
console.log('PASS server boundary authentication, ownership, and authoritative data wiring')
