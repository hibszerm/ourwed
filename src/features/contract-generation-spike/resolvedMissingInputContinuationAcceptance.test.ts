import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { appendMissingInputHistory, readMissingInputState, resolveMissingInputAnswers, storeMissingInputState, type ContractGenerationSession } from './generationSession'
import { createContractGenerationBoundary, type BoundaryDiagnostic, type ServerBoundaryDependencies } from './serverBoundary'
import { GENERATION_INSTRUCTIONS } from './generator'

const first = { id: 'mi_first', label: 'Required source fact', answerKind: 'text' as const }
const second = { id: 'mi_second', label: 'Another required source fact', answerKind: 'date' as const, subject: { participantKey: 'participant-2', displayName: 'Synthetic Participant' } }
const third = { id: 'mi_third', label: 'A later distinct fact', answerKind: 'multiline' as const }
const definitions = [first, second, third]
const answers = [
  { missingInputId: first.id, value: 'Synthetic answer A' },
  { missingInputId: second.id, value: 'Synthetic answer B' },
  { missingInputId: third.id, value: 'Synthetic answer C' },
]

assert.deepEqual(resolveMissingInputAnswers([first, second], answers.slice(0, 2)), [
  { requirement: first, answer: { value: 'Synthetic answer A' } },
  { requirement: second, answer: { value: 'Synthetic answer B' } },
], 'answers bind to their requirement by opaque ID, not array position')
assert.deepEqual(resolveMissingInputAnswers([first, second], [answers[1]!, answers[0]!]), [
  { requirement: second, answer: { value: 'Synthetic answer B' } },
  { requirement: first, answer: { value: 'Synthetic answer A' } },
], 'reversed answer order does not cross-bind requirements')
assert.deepEqual(resolveMissingInputAnswers(definitions, answers), [
  { requirement: first, answer: { value: 'Synthetic answer A' } },
  { requirement: second, answer: { value: 'Synthetic answer B' } },
  { requirement: third, answer: { value: 'Synthetic answer C' } },
], 'all resolved rounds survive as definition-answer pairs')
assert.equal(resolveMissingInputAnswers([first], [{ missingInputId: 'unknown', value: 'x' }]), null, 'unknown historical answer IDs fail closed')
assert.equal(resolveMissingInputAnswers([first], [answers[0]!, answers[0]!]), null, 'duplicate resolved answer IDs fail closed')
assert.equal(appendMissingInputHistory([first], [first]), null, 'a repeated requirement ID cannot redefine an earlier requirement')
assert.equal(resolveMissingInputAnswers([], answers.slice(0, 1)), null, 'a missing historical requirement definition is never silently dropped')

const stored = storeMissingInputState([third], definitions)
assert.deepEqual(readMissingInputState(stored), stored, 'versioned session JSON round-trips all pending and historical definitions')
assert.deepEqual(readMissingInputState([first]), { version: 1, pending: [first], history: [first] }, 'legacy array-shaped sessions remain readable')
assert.equal(readMissingInputState({ version: 1, pending: [third], history: [first, second] }), null, 'pending definitions absent from history invalidate the stored envelope')
const serializedState = JSON.parse(JSON.stringify(stored)) as unknown
assert.deepEqual(Object.keys(serializedState as object).sort(), ['history', 'pending', 'version'], 'serialized v1 state has the stable top-level envelope')
assert.deepEqual(resolveMissingInputAnswers(readMissingInputState(serializedState)!.history, answers), [
  { requirement: first, answer: { value: 'Synthetic answer A' } },
  { requirement: second, answer: { value: 'Synthetic answer B' } },
  { requirement: third, answer: { value: 'Synthetic answer C' } },
], 'serialized versioned definitions retain resolved answer binding')

const schemaMigration = await readFile(new URL('../../../supabase/migrations/20261002164421_allow_versioned_missing_input_state.sql', import.meta.url), 'utf8')
assert.match(schemaMigration, /jsonb_typeof\(missing_inputs_json\) = 'array'/i, 'database continues accepting legacy array payloads')
assert.match(schemaMigration, /jsonb_typeof\(missing_inputs_json\) = 'object'[\s\S]*?missing_inputs_json -> 'version' = '1'::jsonb[\s\S]*?jsonb_typeof\(missing_inputs_json -> 'pending'\) = 'array'[\s\S]*?jsonb_typeof\(missing_inputs_json -> 'history'\) = 'array'/i, 'database accepts the stable v1 envelope structure')
assert.match(schemaMigration, /jsonb_typeof\(user_answers_json\) = 'array'/i, 'answer storage remains array-only')
assert.match(schemaMigration, /when 'object' then coalesce\(jsonb_array_length\(missing_inputs_json -> 'pending'\) > 0, false\)/i, 'awaiting-input envelopes require a pending requirement')
assert.doesNotMatch(schemaMigration, /\b(update|delete)\s+public\.wedding_contract_generation_runs\b/i, 'migration does not rewrite historical session rows')

for (const phrase of [
  'resolved user input', 'That requirement is resolved', 'do not request the same requirement again',
  'paraphrasing its label', 'assigning a new opaque ID', 'does not authorize unrelated assumptions',
  'genuinely missing requirements',
]) assert.ok(GENERATION_INSTRUCTIONS.toLowerCase().includes(phrase.toLowerCase()), `prompt contract includes: ${phrase}`)

const now = new Date(Date.now() + 60_000).toISOString()
let session: ContractGenerationSession = {
  id: 'synthetic-session', ownerUserId: 'synthetic-owner', weddingId: 'synthetic-wedding', templateId: 'synthetic-template',
  templateVersionId: 'synthetic-version', sourceSha256: 'a'.repeat(64), state: 'processing',
  missingInputs: [], missingInputHistory: [], answers: [],
  expiresAt: now, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}
const diagnosticEvents: BoundaryDiagnostic[] = []
const generatorContexts: Array<{ answers: unknown[]; resolved: unknown[] }> = []
const calls: string[] = []
let round = 0
const scope = (userId: string, weddingId: string) => ({ ownerUserId: userId, weddingId, templateId: 'synthetic-template', templateVersionId: 'synthetic-version', sourceSha256: 'a'.repeat(64) })
const deps: ServerBoundaryDependencies = {
  newId: () => `execution-${round}`,
  loadContext: async (userId, weddingId) => ({ scope: scope(userId, weddingId), sourceBytes: new ArrayBuffer(1), sourceSha256: 'a'.repeat(64), authorityFingerprint: 'b'.repeat(64), authority: { current: true } }),
  createSession: async () => session,
  getSession: async () => session,
  getSessionByIdempotencyKey: async () => null,
  expireSession: async () => { calls.push('expired') },
  claimContinuation: async ({ answers: accepted, missingInputHistory, missingInputHistoryValid }) => {
    calls.push('claim')
    session = { ...session, state: 'processing', answers: accepted, missingInputHistory, missingInputHistoryValid }
    return session
  },
  saveMissing: async ({ missingInputs, missingInputHistory, answers: accumulated }) => {
    calls.push('saveMissing')
    session = { ...session, state: 'awaiting_input', missingInputs, missingInputHistory, answers: accumulated }
    return true
  },
  persistAcceptedCandidate: async () => { calls.push('persist'); return 'candidate' },
  markFailure: async () => { calls.push('failure'); session = { ...session, state: 'failed' } },
  generate: async (_context, accumulated, resolved) => {
    calls.push('generate')
    generatorContexts.push({ answers: accumulated, resolved })
    round++
    if (round === 1) return { status: 'MISSING_INPUT', missingInputs: [first, second] }
    if (round === 2) return { status: 'MISSING_INPUT', missingInputs: [third] }
    return { status: 'READY', candidate: { bytes: new ArrayBuffer(1), changedBlocks: [] } }
  },
  verifyConflict: async () => { calls.push('verifier'); return 'confirmed' },
  review: async () => { calls.push('reviewer'); return 'pass' },
  diagnose: (event) => diagnosticEvents.push(event),
}

const boundary = createContractGenerationBoundary(deps)
const initial = await boundary.start('synthetic-owner', { weddingId: 'synthetic-wedding', requestId: '00000000-0000-4000-8000-000000000001' })
assert.equal(initial.status, 'awaiting_input')
assert.deepEqual(generatorContexts[0]?.resolved, [], 'initial Generator call has no resolved answers')
assert.deepEqual(session.missingInputHistory, [first, second], 'the initial batch is durably represented in history')
const continuation = await boundary.continue('synthetic-owner', {
  sessionId: session.id,
  answers: [{ missingInputId: first.id, value: 'Synthetic answer A' }, { missingInputId: second.id, value: 'Synthetic answer B' }],
})
assert.equal(continuation.status, 'awaiting_input')
assert.deepEqual(generatorContexts[1]?.resolved, [
  { requirement: first, answer: { value: 'Synthetic answer A' } },
  { requirement: second, answer: { value: 'Synthetic answer B' } },
], 'continuation exposes both requirement definitions and accepted answers')
assert.deepEqual(session.missingInputHistory, [first, second, third], 'a newly discovered requirement appends without dropping earlier definitions')

const final = await boundary.continue('synthetic-owner', { sessionId: session.id, answers: [{ missingInputId: third.id, value: 'Synthetic answer C' }] })
assert.equal(final.status, 'ready')
assert.deepEqual(generatorContexts[2]?.resolved, [
  { requirement: first, answer: { value: 'Synthetic answer A' } },
  { requirement: second, answer: { value: 'Synthetic answer B' } },
  { requirement: third, answer: { value: 'Synthetic answer C' } },
], 'later continuation receives every historical definition and answer')
assert.deepEqual(calls, ['generate', 'saveMissing', 'claim', 'generate', 'saveMissing', 'claim', 'generate', 'reviewer', 'persist'], 'one Generator call per action; no retries, repairs, or Reviewer on MISSING_INPUT')
assert.equal(diagnosticEvents.some((event) => event.providerRole === 'Generator' && event.category === 'MISSING_INPUT' && event.missingInputCount === 1), true)
assert.equal(diagnosticEvents.some((event) => event.providerRole === 'Reviewer' && event.category === 'PASS' && event.mechanicalValidation === 'passed'), true)
assert.equal(JSON.stringify(diagnosticEvents).includes('Synthetic answer'), false, 'diagnostics exclude answer values')
assert.equal(JSON.stringify(diagnosticEvents).includes('Synthetic Participant'), false, 'diagnostics exclude source/participant text')
assert.equal(JSON.stringify(diagnosticEvents).includes('Synthetic source text'), false, 'diagnostics exclude source content')
assert.equal(JSON.stringify(diagnosticEvents).includes('Synthetic generated document'), false, 'diagnostics exclude candidate content')

async function runFailureDiagnostic(category: 'invalid_response' | 'provider_failure' | 'mechanical_validation_failure') {
  const events: BoundaryDiagnostic[] = []
  const generatedCalls: string[] = []
  const initialSession: ContractGenerationSession = {
    id: `failure-${category}`, ownerUserId: 'synthetic-owner', weddingId: 'synthetic-wedding', templateId: 'synthetic-template',
    templateVersionId: 'synthetic-version', sourceSha256: 'c'.repeat(64), state: 'processing', missingInputs: [],
    missingInputHistory: [], answers: [], expiresAt: now, createdAt: now, updatedAt: now,
  }
  const failureDeps: ServerBoundaryDependencies = {
    ...deps,
    createSession: async () => initialSession,
    getSessionByIdempotencyKey: async () => null,
    generate: async () => { generatedCalls.push('generate'); return { status: 'FAILED', category } },
    diagnose: (event) => events.push(event),
  }
  const result = await createContractGenerationBoundary(failureDeps).start('synthetic-owner', { weddingId: 'synthetic-wedding', requestId: '00000000-0000-4000-8000-000000000001' })
  assert.equal(result.status, 'failure')
  assert.deepEqual(generatedCalls, ['generate'], 'safe failure never retries or repairs')
  assert.equal(events.some((event) => event.providerRole === 'Generator' && event.category === category.toUpperCase()), true)
  assert.equal(events.at(-1)?.finalCode, category === 'provider_failure' ? 'temporary_failure' : 'generation_safety')
  assert.equal(JSON.stringify(events).includes('Synthetic answer'), false)
  return { events, calls: generatedCalls }
}

const invalidResponseTelemetry = await runFailureDiagnostic('invalid_response')
assert.equal(invalidResponseTelemetry.events[0]?.providerInvoked, true, 'invalid structured output identifies an attempted Generator call')
const providerFailureTelemetry = await runFailureDiagnostic('provider_failure')
assert.equal(providerFailureTelemetry.events[0]?.providerInvoked, true, 'provider failure remains distinct from invalid structured output')
const mechanicalFailureTelemetry = await runFailureDiagnostic('mechanical_validation_failure')
assert.equal(mechanicalFailureTelemetry.events[0]?.mechanicalValidation, 'failed', 'mechanical validation failure is labeled without exposing content')

{
  const events: BoundaryDiagnostic[] = []
  const failedReviewerDeps: ServerBoundaryDependencies = {
    ...deps,
    createSession: async () => ({ ...session, id: 'reviewer-failure', state: 'processing', missingInputs: [], missingInputHistory: [], answers: [] }),
    getSessionByIdempotencyKey: async () => null,
    generate: async () => ({ status: 'READY', candidate: { bytes: new ArrayBuffer(1), changedBlocks: [] } }),
    review: async () => 'fail',
    diagnose: (event) => events.push(event),
  }
  const result = await createContractGenerationBoundary(failedReviewerDeps).start('synthetic-owner', { weddingId: 'synthetic-wedding', requestId: '00000000-0000-4000-8000-000000000001' })
  assert.equal(result.status, 'failure')
  assert.equal(events.some((event) => event.providerRole === 'Reviewer' && event.category === 'FAIL'), true)
  assert.equal(events.some((event) => event.providerRole === 'orchestrator' && event.finalCode === 'generation_safety'), true)
}

{
  const corrupt: ContractGenerationSession = {
    ...session, id: 'corrupt-history', state: 'awaiting_input', missingInputs: [first], missingInputHistory: [first],
    answers: [{ missingInputId: 'missing-definition', value: 'must not be dropped' }],
  }
  const calls: string[] = []
  const corruptDeps: ServerBoundaryDependencies = {
    ...deps,
    getSession: async () => corrupt,
    claimContinuation: async (input) => ({ ...corrupt, state: 'processing', answers: input.answers, missingInputHistory: input.missingInputHistory }),
    generate: async () => { calls.push('generate'); return { status: 'READY', candidate: { bytes: new ArrayBuffer(1), changedBlocks: [] } } },
    markFailure: async () => { calls.push('failed') },
  }
  const result = await createContractGenerationBoundary(corruptDeps).continue('synthetic-owner', { sessionId: corrupt.id, answers: [{ missingInputId: first.id, value: 'Synthetic answer A' }] })
  assert.equal(result.status, 'failure', 'answer with missing historical definition fails safely')
  assert.deepEqual(calls, ['failed'], 'corrupt answer history never reaches Generator')
}

{
  const alreadyAnswered: ContractGenerationSession = {
    ...session, id: 'answered-reask', state: 'awaiting_input', missingInputs: [first], missingInputHistory: [first], answers: [],
  }
  const calls: string[] = []
  const reaskDeps: ServerBoundaryDependencies = {
    ...deps,
    getSession: async () => alreadyAnswered,
    claimContinuation: async (input) => ({ ...alreadyAnswered, state: 'processing', answers: input.answers, missingInputHistory: input.missingInputHistory }),
    generate: async () => { calls.push('generate'); return { status: 'MISSING_INPUT', missingInputs: [first] } },
    saveMissing: async () => { calls.push('saveMissing'); return true },
    markFailure: async () => { calls.push('failed') },
  }
  const result = await createContractGenerationBoundary(reaskDeps).continue('synthetic-owner', { sessionId: alreadyAnswered.id, answers: [{ missingInputId: first.id, value: 'Synthetic answer A' }] })
  assert.equal(result.status, 'failure', 'an answered opaque ID cannot be emitted again')
  assert.deepEqual(calls, ['generate', 'failed'], 're-request guard is exact-ID mechanical and never retries')
}

console.log('PASS resolved missing-input continuation binding acceptance')
