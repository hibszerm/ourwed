import assert from 'node:assert/strict'
import {
  ContractGenerationBoundaryClientError,
  createContractGenerationBoundaryClient,
} from './contractGenerationBoundaryClient'

const bodies: Record<string, unknown>[] = []
const responses: unknown[] = [
  { status: 'awaiting_input', sessionId: 'opaque-session', missingInputs: [{ id: 'opaque-requirement', label: 'Dane umowy', answerKind: 'text' }] },
  { status: 'awaiting_input', sessionId: 'opaque-session', missingInputs: [{ id: 'opaque-requirement-2', label: 'Termin', answerKind: 'date' }] },
  { status: 'ready', sessionId: 'opaque-session', candidateId: 'candidate-1', templateId: 'template-1', templateVersionId: 'version-1', reviewer: { status: 'findings', findingCount: 1, findingCategories: ['product_rule_violation'], findingRuleIds: ['crm_enrichment'] } },
  { status: 'candidate_valid' },
  { status: 'finalized' },
  new Blob([new Uint8Array([1, 2, 3])]),
]
const client = createContractGenerationBoundaryClient(async (body) => {
  bodies.push(body)
  return { data: responses.shift(), error: null }
})

await client.start({ weddingId: 'wedding-1', requestId: '00000000-0000-4000-8000-000000000001' })
await client.continue({
  sessionId: 'opaque-session',
  answers: [{ missingInputId: 'opaque-requirement', value: ' value ' }],
})
const ready = await client.start({ weddingId: 'wedding-1', requestId: '00000000-0000-4000-8000-000000000003' })
assert.equal(ready.status, 'ready')
if (ready.status === 'ready') assert.deepEqual(ready.reviewer, { status: 'findings', findingCount: 1, findingCategories: ['product_rule_violation'], findingRuleIds: ['crm_enrichment'] })
await client.validateCandidate({ weddingId: 'wedding-1', sessionId: 'opaque-session', saveToken: '00000000-0000-4000-8000-000000000002' })
await client.finalize({ weddingId: 'wedding-1', sessionId: 'opaque-session', saveToken: '00000000-0000-4000-8000-000000000002', reason: 'saved' })
const candidateBytes = await client.candidate({ weddingId: 'wedding-1', candidateId: 'opaque-candidate' })

assert.deepEqual(bodies, [
  { version: 1, action: 'start', request: { weddingId: 'wedding-1', requestId: '00000000-0000-4000-8000-000000000001' } },
  { version: 1, action: 'continue', request: { sessionId: 'opaque-session', answers: [{ missingInputId: 'opaque-requirement', value: ' value ' }] } },
  { version: 1, action: 'start', request: { weddingId: 'wedding-1', requestId: '00000000-0000-4000-8000-000000000003' } },
  { version: 1, action: 'validate_candidate', request: { weddingId: 'wedding-1', sessionId: 'opaque-session', saveToken: '00000000-0000-4000-8000-000000000002' } },
  { version: 1, action: 'finalize', request: { weddingId: 'wedding-1', sessionId: 'opaque-session', saveToken: '00000000-0000-4000-8000-000000000002', reason: 'saved' } },
  { version: 1, action: 'candidate', request: { weddingId: 'wedding-1', candidateId: 'opaque-candidate' } },
])
assert.deepEqual([...new Uint8Array(candidateBytes)], [1, 2, 3])

const unsafeReviewClient = createContractGenerationBoundaryClient(async () => ({
  data: { status: 'ready', sessionId: 's', candidateId: 'c', templateId: 't', templateVersionId: 'v', reviewer: { status: 'findings', findingCount: 1, findingCategories: ['product_rule_violation'], findingRuleIds: ['crm_enrichment'], message: 'private reviewer text' } },
  error: null,
}))
await assert.rejects(unsafeReviewClient.start({ weddingId: 'w', requestId: '00000000-0000-4000-8000-000000000001' }), (error: unknown) => error instanceof ContractGenerationBoundaryClientError && error.code === 'generation_safety', 'boundary rejects arbitrary Reviewer text')

for (const [status, expected] of [[401, 'unauthorized'], [403, 'forbidden']] as const) {
  const failingClient = createContractGenerationBoundaryClient(async () => ({
    data: null,
    error: { context: { status } },
  }))
  await assert.rejects(
    failingClient.start({ weddingId: 'wedding-1', requestId: '00000000-0000-4000-8000-000000000001' }),
    (error: unknown) => error instanceof ContractGenerationBoundaryClientError && error.code === expected,
  )
}
console.log('Contract generation boundary client payloads passed.')
