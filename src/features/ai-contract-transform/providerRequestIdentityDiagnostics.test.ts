import { buildProviderRequestIdentityDiagnostics } from './providerRequestIdentityDiagnostics'
import { createLocalFullRewriteInvoke, createUsageTracker } from './cg2/localFullRewriteInvoke'

const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message) }
const response = (json: unknown) => new Response(JSON.stringify({ output_text: JSON.stringify(json), status: 'completed' }), { status: 200 })

const one = buildProviderRequestIdentityDiagnostics({
  sourceBlocks: [{ blockId: 'alpha', kind: 'paragraph', modelContext: { modelEditable: true } }],
  editableBlockIds: ['alpha'],
})
assert(one.sourceIdCounts.find((row) => row.blockId === 'alpha')?.sourceOccurrenceCount === 1, 'unique source occurrence is reported')
assert(one.sourceIdCounts.find((row) => row.blockId === 'alpha')?.editableTargetOccurrenceCount === 1, 'unique editable target occurrence is reported')

const duplicate = buildProviderRequestIdentityDiagnostics({
  sourceBlocks: [{ blockId: 'alpha', kind: 'paragraph' }],
  editableBlockIds: ['alpha', 'alpha'],
})
assert(duplicate.duplicateEditableIds.length === 1 && duplicate.duplicateEditableIds[0]?.occurrenceCount === 2, 'duplicate editable target is visible')

const contextual = buildProviderRequestIdentityDiagnostics({
  sourceBlocks: [
    { blockId: 'alpha', kind: 'paragraph', modelContext: { modelEditable: true } },
    { blockId: 'beta', kind: 'tableCell', modelContext: { modelEditable: false, linkedBlockId: 'alpha' } },
  ],
  editableBlockIds: ['alpha'],
  otherContext: { structuralContext: { editableBlockIds: ['alpha'], destinationBlockId: 'beta' }, evidence: [{ sourceBlockId: 'alpha' }] },
})
const alpha = contextual.sourceIdCounts.find((row) => row.blockId === 'alpha')!
assert(alpha.editableTargetOccurrenceCount === 1, 'contextual refs do not inflate editable targets')
assert(alpha.otherModelContextReferenceCount === 3, 'model-context and auxiliary references are counted separately')
assert(contextual.sourceIdCounts.find((row) => row.blockId === 'beta')?.protectedReferenceOccurrenceCount === 1, 'protected reference is counted')

const blocks = [
  { blockId: 'alpha', text: 'PRIVATE SOURCE TEXT', kind: 'paragraph', modelContext: { modelEditable: true } },
  { blockId: 'beta', text: 'PRIVATE PROTECTED TEXT', kind: 'paragraph', modelContext: { modelEditable: false } },
]
let calls = 0
let sentBody: Record<string, any> | undefined
const originalFetch = globalThis.fetch
globalThis.fetch = (async (_url, init) => {
  calls += 1
  sentBody = JSON.parse(String(init?.body))
  return response({ changedBlocks: [{ blockId: 'alpha', text: 'PRIVATE REPLACEMENT TEXT' }], financeEvidence: null, dateEvidence: null })
}) as typeof fetch
try {
  const usage = createUsageTracker()
  const invoke = createLocalFullRewriteInvoke({ apiKey: 'test-only', usage })
  const result = await invoke('ai-contract-full-rewrite', { body: {
    documentBlocks: blocks,
    transformationDataset: {},
    protectedDataSummary: {},
    structuralContext: { editableBlockIds: ['alpha'] },
  } })
  assert(calls === 1, 'diagnostics leave provider invocation count unchanged')
  assert((sentBody?.input?.[1]?.content as string).includes('PRIVATE SOURCE TEXT'), 'provider request still contains original source content')
  assert(result.data != null && (result.data as { ok?: boolean }).ok === true, 'transform response behavior remains successful')
  const safeDiagnostics = JSON.stringify(usage.providerRequestIdentityDiagnostics)
  assert(!safeDiagnostics.includes('PRIVATE SOURCE TEXT') && !safeDiagnostics.includes('PRIVATE PROTECTED TEXT') && !safeDiagnostics.includes('PRIVATE REPLACEMENT TEXT'), 'diagnostics retain no source or replacement text')
  assert(!safeDiagnostics.includes('test-only'), 'diagnostics retain no API key')
} finally {
  globalThis.fetch = originalFetch
}

console.log('PASS provider request identity diagnostics')
