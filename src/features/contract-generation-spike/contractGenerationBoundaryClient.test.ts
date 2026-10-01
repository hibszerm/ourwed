import assert from 'node:assert/strict'
import {
  ContractGenerationBoundaryClientError,
  createContractGenerationBoundaryClient,
} from './contractGenerationBoundaryClient'

const bodies: Record<string, unknown>[] = []
const responses: unknown[] = [
  { status: 'awaiting_input', sessionId: 'opaque-session', missingInputs: [{ id: 'opaque-requirement', label: 'Dane umowy', answerKind: 'text' }] },
  { status: 'awaiting_input', sessionId: 'opaque-session', missingInputs: [{ id: 'opaque-requirement-2', label: 'Termin', answerKind: 'date' }] },
  { status: 'ready', sessionId: 'opaque-session', candidateId: 'opaque-candidate', templateId: 'template', templateVersionId: 'version' },
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
await client.recover({ weddingId: 'wedding-1', sessionId: 'opaque-session' })
const candidateBytes = await client.candidate({ weddingId: 'wedding-1', candidateId: 'opaque-candidate' })

assert.deepEqual(bodies, [
  { version: 1, action: 'start', request: { weddingId: 'wedding-1', requestId: '00000000-0000-4000-8000-000000000001' } },
  { version: 1, action: 'continue', request: { sessionId: 'opaque-session', answers: [{ missingInputId: 'opaque-requirement', value: ' value ' }] } },
  { version: 1, action: 'recover', request: { weddingId: 'wedding-1', sessionId: 'opaque-session' } },
  { version: 1, action: 'candidate', request: { weddingId: 'wedding-1', candidateId: 'opaque-candidate' } },
])
assert.deepEqual([...new Uint8Array(candidateBytes)], [1, 2, 3])

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
