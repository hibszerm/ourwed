import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createContractGenerationBoundary, type ServerBoundaryDependencies } from './serverBoundary.ts'
import { safeTerminalFailure, TERMINAL_FAILURE_CATEGORIES, TERMINAL_FAILURE_STAGES, type SafeTerminalFailure } from './terminalFailureDiagnostics.ts'
import { MECHANICAL_GATE_IDS, MECHANICAL_REASON_CODES } from './mechanicalDiagnostics.ts'
import type { ContractGenerationSession } from './generationSession.ts'

const privateValues = ['89123112345', 'Private Person', 'Secret Street 9', 'private@example.test', '1234567890', 'PL00123456789012345678901234']
const runId = '00000000-0000-4000-8000-000000000001'

function harness(generate: ServerBoundaryDependencies['generate'], overrides: Partial<ServerBoundaryDependencies> = {}) {
  const terminalRows: Array<{ quality_summary_json: { terminalFailure: SafeTerminalFailure }; candidatePresent: boolean }> = []
  const context = async (userId: string, weddingId: string) => ({
    scope: { ownerUserId: userId, weddingId, templateId: 'template-1', templateVersionId: 'version-1', sourceSha256: 'a'.repeat(64) },
    sourceBytes: new ArrayBuffer(1), sourceSha256: 'a'.repeat(64), authorityFingerprint: 'b'.repeat(64), authority: {},
  })
  const deps: ServerBoundaryDependencies = {
    newId: () => 'execution-1',
    loadContext: async (userId, weddingId) => context(userId, weddingId),
    createSession: async (input) => ({
      id: runId, ownerUserId: input.userId, weddingId: input.weddingId, templateId: 'template-1', templateVersionId: 'version-1',
      sourceSha256: input.sourceSha256, state: 'processing', missingInputs: [], missingInputHistory: [], answers: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } satisfies ContractGenerationSession),
    getSession: async () => null,
    getSessionByIdempotencyKey: async () => null,
    expireSession: async () => {},
    claimContinuation: async () => null,
    saveMissing: async () => true,
    persistAcceptedCandidate: async () => runId,
    markFailure: async (_sessionId, _executionId, _code, diagnostic) => {
      terminalRows.push({ quality_summary_json: { terminalFailure: safeTerminalFailure(diagnostic) }, candidatePresent: true })
      // Simulate normal ephemeral artifact cleanup: candidate removed, safe summary retained.
      terminalRows[terminalRows.length - 1]!.candidatePresent = false
    },
    generate,
    verifyConflict: async () => 'confirmed',
    review: async () => 'pass',
    ...overrides,
  }
  return { boundary: createContractGenerationBoundary(deps), terminalRows }
}

async function runFailure(generate: ServerBoundaryDependencies['generate']) {
  const f = harness(generate)
  const result = await f.boundary.start('owner-1', { weddingId: 'wedding-1', requestId: runId })
  assert.equal(result.status, 'failure')
  assert.equal(f.terminalRows.length, 1)
  assert.equal(f.terminalRows[0]!.candidatePresent, false, 'terminal cleanup removes the temporary candidate')
  assert.ok(f.terminalRows[0]!.quality_summary_json.terminalFailure, 'terminal diagnostic survives cleanup')
  return f.terminalRows[0]!.quality_summary_json.terminalFailure
}

for (const [gateId, reasonCode, expectedStage] of [
  ['stale_source_fact', 'superseded_fact_inserted', 'stale_source_fact'],
  ['source_copy', 'application_failed', 'source_copy'],
  ['edit_application', 'requested_edit_missing', 'mechanical_validation'],
] as const) {
  const diagnostic = await runFailure(async () => ({
    status: 'FAILED', category: 'mechanical_validation_failure',
    mechanicalFailure: {
      gateId, reasonCode, editIndex: 1, editCount: 3, editOperation: 'replace', sourceBlockType: 'table_cell',
      sourceBlockOrdinal: 4, sourceTargetFound: true, editorOperationReportedSuccess: false,
      sourceText: privateValues.join(' '), replacementText: privateValues.join(' '), answer: privateValues.join(' '),
    } as never,
  }))
  assert.equal(diagnostic.stage, expectedStage)
  assert.equal(diagnostic.gateId, gateId)
  assert.equal(diagnostic.reasonCode, reasonCode)
  assert.equal(diagnostic.editIndex, 1)
  assert.equal(diagnostic.editCount, 3)
  if (gateId === 'stale_source_fact' || gateId === 'edit_application') {
    assert.equal(diagnostic.operation, 'replace')
    assert.equal(diagnostic.sourceBlockType, 'table_cell')
    assert.equal(diagnostic.sourceBlockOrdinal, 4)
    assert.equal(diagnostic.targetFound, true)
    assert.equal(diagnostic.editApplied, false)
  } else {
    assert.equal(diagnostic.operation, undefined, 'existing diagnostics sanitizer does not allow extra source-copy fields')
  }
}

const internal = await runFailure(async () => { throw new Error(privateValues.join(' ')) })
assert.equal(internal.stage, 'internal')
assert.equal(internal.category, 'internal_failure')

const emptyOutput = await runFailure(async () => ({
  status: 'FAILED', category: 'invalid_response', providerFailureStage: 'structured_output', failureOrigin: 'EMPTY_STRUCTURED_OUTPUT',
}))
assert.equal(emptyOutput.stage, 'generator')
assert.equal(emptyOutput.category, 'invalid_response')
assert.equal(emptyOutput.failureOrigin, 'EMPTY_STRUCTURED_OUTPUT')

const localValidation = await runFailure(async () => ({
  status: 'FAILED', category: 'invalid_response', providerFailureStage: 'structured_output',
  failureOrigin: 'GENERATION_RESPONSE_VALIDATION_FAILED', responseBranch: 'READY',
  schemaErrorCode: 'invalid_enum', schemaPath: 'edits[].kind',
  privateOutput: privateValues.join(' '),
}))
assert.equal(localValidation.failureOrigin, 'GENERATION_RESPONSE_VALIDATION_FAILED')
assert.equal(localValidation.responseBranch, 'READY')
assert.equal(localValidation.schemaErrorCode, 'invalid_enum')
assert.equal(localValidation.schemaPath, 'edits[].kind')

const continuationFailure = safeTerminalFailure({
  action: 'continue', providerRole: 'Generator', category: 'INVALID_RESPONSE',
  failureOrigin: 'GENERATION_RESPONSE_VALIDATION_FAILED', schemaErrorCode: 'invalid_type', schemaPath: 'missingInputs[].id',
})
assert.equal(continuationFailure.action, 'continue')
assert.equal(continuationFailure.stage, 'generator')
const continuationContextFailure = safeTerminalFailure({ action: 'continue', category: 'context_load_failure' })
assert.equal(continuationContextFailure.action, 'continue')
assert.equal(continuationContextFailure.stage, 'continuation')

const httpFailure = await runFailure(async () => ({
  status: 'FAILED', category: 'provider_failure', providerFailureStage: 'http_non_ok', providerFailureClass: 'http_5xx', providerHttpStatus: 502,
}))
assert.equal(httpFailure.providerFailureClass, 'http_5xx')
assert.equal(httpFailure.providerHttpStatus, 502)

const nonBlocking = harness(async () => ({
  status: 'FAILED', category: 'invalid_response', failureOrigin: 'EMPTY_STRUCTURED_OUTPUT',
}), { diagnose: () => { throw new Error(privateValues.join(' ')) } })
const nonBlockingResult = await nonBlocking.boundary.start('owner-1', { weddingId: 'wedding-1', requestId: runId })
assert.equal(nonBlockingResult.status, 'failure', 'diagnostic enrichment failure does not replace terminal behavior')
assert.equal(nonBlocking.terminalRows[0]?.quality_summary_json.terminalFailure.failureOrigin, 'EMPTY_STRUCTURED_OUTPUT')

const safeKeys = new Set(['stage', 'category', 'action', 'failureOrigin', 'responseBranch', 'schemaErrorCode', 'schemaPath', 'gateId', 'reasonCode', 'editIndex', 'editCount', 'operation', 'sourceBlockType', 'sourceBlockOrdinal', 'targetFound', 'editApplied', 'providerFailureStage', 'providerFailureClass', 'providerHttpStatus'])
for (const failure of [internal, safeTerminalFailure({
  stage: 'free text', category: privateValues.join(' '), message: privateValues.join(' '), stack: privateValues.join(' '),
  mechanicalGateId: 'stale_source_fact', mechanicalReasonCode: 'superseded_fact_inserted',
  mechanicalEditIndex: 0, privateData: privateValues,
  action: privateValues.join(' '), failureOrigin: privateValues.join(' '), responseBranch: privateValues.join(' '),
  schemaErrorCode: privateValues.join(' '), schemaPath: privateValues.join(' '),
}), emptyOutput, localValidation, continuationFailure, httpFailure]) {
  for (const key of Object.keys(failure)) assert.ok(safeKeys.has(key), `unexpected persisted key ${key}`)
  assert.ok((TERMINAL_FAILURE_STAGES as readonly string[]).includes(failure.stage))
  if (failure.category) assert.ok((TERMINAL_FAILURE_CATEGORIES as readonly string[]).includes(failure.category))
  if (failure.gateId) assert.ok((MECHANICAL_GATE_IDS as readonly string[]).includes(failure.gateId))
  if (failure.reasonCode) assert.ok((MECHANICAL_REASON_CODES as readonly string[]).includes(failure.reasonCode))
  if (failure.operation) assert.ok(['replace', 'insert_after', 'other'].includes(failure.operation))
  if (failure.sourceBlockType) assert.ok(['body', 'table_cell', 'header', 'footer', 'other'].includes(failure.sourceBlockType))
  if (failure.providerFailureStage) assert.ok(['request_build', 'timeout_setup', 'fetch_transport', 'fetch_timeout', 'http_non_ok', 'response_read', 'response_parse', 'structured_output', 'adapter_mapping', 'unknown_provider_failure'].includes(failure.providerFailureStage))
  if (failure.providerFailureClass) assert.ok(['transport_error', 'timeout', 'http_400', 'http_401', 'http_403', 'http_404', 'http_408', 'http_409', 'http_429', 'http_5xx', 'http_other'].includes(failure.providerFailureClass))
  for (const key of ['editIndex', 'editCount', 'sourceBlockOrdinal', 'providerHttpStatus'] as const) {
    if (failure[key] !== undefined) assert.ok(Number.isSafeInteger(failure[key]))
  }
  for (const key of ['targetFound', 'editApplied'] as const) {
    if (failure[key] !== undefined) assert.equal(typeof failure[key], 'boolean')
  }
  const json = JSON.stringify(failure)
  for (const value of privateValues) assert.equal(json.includes(value), false, 'PESEL, identity, contact, tax, bank, source, and answer fixtures never persist')
  assert.equal(json.includes('free text'), false)
}

const success = harness(async () => ({ status: 'READY', candidate: { bytes: new ArrayBuffer(1), changedBlocks: [] } }))
const successResult = await success.boundary.start('owner-1', { weddingId: 'wedding-1', requestId: runId })
assert.equal(successResult.status, 'ready')
assert.equal(success.terminalRows.length, 0, 'successful READY/Preview path stores no new terminal failure summary')

let contextLoad = 0
const freshness = harness(async () => ({ status: 'READY', candidate: { bytes: new ArrayBuffer(1), changedBlocks: [] } }), {
  loadContext: async (userId, weddingId) => {
    contextLoad += 1
    const fingerprint = contextLoad > 1 ? 'c'.repeat(64) : 'b'.repeat(64)
    return {
      scope: { ownerUserId: userId, weddingId, templateId: 'template-1', templateVersionId: 'version-1', sourceSha256: 'a'.repeat(64) },
      sourceBytes: new ArrayBuffer(1), sourceSha256: 'a'.repeat(64), authorityFingerprint: fingerprint, authority: {},
    }
  },
})
const freshnessResult = await freshness.boundary.start('owner-1', { weddingId: 'wedding-1', requestId: runId })
assert.deepEqual(freshnessResult, { status: 'stale', code: 'authority_changed' })
assert.equal(freshness.terminalRows[0]?.quality_summary_json.terminalFailure.stage, 'authority_freshness')
assert.equal(freshness.terminalRows[0]?.quality_summary_json.terminalFailure.category, 'authority_changed')

const persistenceFailure = harness(async () => ({ status: 'READY', candidate: { bytes: new ArrayBuffer(1), changedBlocks: [] } }), {
  persistAcceptedCandidate: async () => null,
})
const persistenceResult = await persistenceFailure.boundary.start('owner-1', { weddingId: 'wedding-1', requestId: runId })
assert.deepEqual(persistenceResult, { status: 'failure', code: 'temporary_failure' })
assert.equal(persistenceFailure.terminalRows[0]?.quality_summary_json.terminalFailure.stage, 'candidate_persistence')
assert.equal(persistenceFailure.terminalRows[0]?.quality_summary_json.terminalFailure.category, 'candidate_persistence_failure')

const edge = await readFile(new URL('../../../supabase/functions/contract-generation-boundary/index.ts', import.meta.url), 'utf8')
assert.match(edge, /quality_summary_json:\s*\{\s*terminalFailure:\s*safeFailure\s*\}/, 'Edge terminalization persists the allowlisted summary with the terminal state before artifact cleanup')
const cleanupBody = edge.slice(edge.indexOf('async function cleanupExpiredOptionBRuns'), edge.indexOf('async function finalizeOptionBRun'))
assert.doesNotMatch(cleanupBody, /quality_summary_json\s*:/, 'lifecycle cleanup leaves terminal diagnostics untouched')

console.log('PASS safe terminal failure diagnostics retention acceptance')
