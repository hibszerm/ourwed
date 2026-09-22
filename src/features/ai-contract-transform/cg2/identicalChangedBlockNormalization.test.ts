import { applySparseBlockChanges } from '../applySparseBlockChanges'
import { normalizeIdenticalChangedBlockDuplicates } from '../blockIdIntegrity'
import { collectProtocolIntegrityViolations } from '../sparseProtocolIntegrity'
import { createLocalFullRewriteInvoke, createUsageTracker } from './localFullRewriteInvoke'

const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message) }
const response = (json: unknown) => new Response(JSON.stringify({ output_text: JSON.stringify(json), status: 'completed' }), { status: 200 })
const source = [
  { blockId: 'alpha', text: 'source-a', kind: 'paragraph', modelContext: { modelEditable: true } },
  { blockId: 'beta', text: 'source-b', kind: 'paragraph', modelContext: { modelEditable: true } },
  { blockId: 'gamma', text: 'source-c', kind: 'paragraph', modelContext: { modelEditable: true } },
]

for (const count of [2, 22]) {
  const raw = [
    { blockId: 'alpha', text: 'replacement-a' },
    { blockId: 'beta', text: 'replacement-b' },
    { blockId: 'gamma', text: 'replacement-c' },
    ...Array.from({ length: count - 1 }, () => ({ blockId: 'beta', text: 'replacement-b' })),
  ]
  const normalized = normalizeIdenticalChangedBlockDuplicates({ changedBlocks: raw, sourceBlocks: source })
  assert(normalized.changedBlocks.map((row) => row.blockId).join(',') === 'alpha,beta,gamma', `${count} identical entries coalesce with first occurrence order preserved`)
  const diagnostic = normalized.duplicateDiagnostics.find((row) => row.blockId === 'beta')!
  assert(diagnostic.duplicateClassification === 'IDENTICAL', 'duplicate classified identical using replacement values')
  assert(diagnostic.identicalNormalizationApplied === true, 'identical normalization recorded')
  assert(diagnostic.occurrenceCount === count, 'original count recorded')
  assert(diagnostic.normalizedOccurrenceCount === 1, 'normalized count recorded')
  const integrity = collectProtocolIntegrityViolations({ changedBlocks: normalized.changedBlocks, sourceBlocks: source })
  assert(!integrity.needsProtocolRetry, 'normalized valid response proceeds without protocol retry')
}

const singleton = [{ blockId: 'beta', text: 'replacement-b' }]
const normalizedSingle = normalizeIdenticalChangedBlockDuplicates({
  changedBlocks: [{ blockId: 'beta', text: 'replacement-b' }, { blockId: 'beta', text: 'replacement-b' }],
  sourceBlocks: source,
}).changedBlocks
const appliedSingle = applySparseBlockChanges(source as never, singleton)
const appliedNormalized = applySparseBlockChanges(source as never, normalizedSingle)
assert(appliedSingle.ok && appliedNormalized.ok && JSON.stringify(appliedSingle) === JSON.stringify(appliedNormalized), 'normalized result equals a single original entry')

const conflict = normalizeIdenticalChangedBlockDuplicates({
  changedBlocks: [{ blockId: 'beta', text: 'first' }, { blockId: 'beta', text: 'second' }],
  sourceBlocks: source,
})
assert(conflict.changedBlocks.length === 2 && !conflict.duplicateDiagnostics[0]?.identicalNormalizationApplied, 'conflicting entries are not selected or merged')
assert(collectProtocolIntegrityViolations({ changedBlocks: conflict.changedBlocks, sourceBlocks: source }).needsProtocolRetry, 'conflicting duplicate still triggers protocol retry')

const unknown = normalizeIdenticalChangedBlockDuplicates({
  changedBlocks: [{ blockId: 'unknown', text: 'same' }, { blockId: 'unknown', text: 'same' }],
  sourceBlocks: source,
})
assert(unknown.changedBlocks.length === 2 && collectProtocolIntegrityViolations({ changedBlocks: unknown.changedBlocks, sourceBlocks: source }).needsProtocolRetry, 'unknown identical duplicates remain invalid')

const protectedSource = [{ blockId: 'locked', text: 'protected source', modelContext: { modelEditable: false } }]
const protectedDuplicate = normalizeIdenticalChangedBlockDuplicates({
  changedBlocks: [{ blockId: 'locked', text: 'same' }, { blockId: 'locked', text: 'same' }],
  sourceBlocks: protectedSource,
})
assert(protectedDuplicate.changedBlocks.length === 2 && !protectedDuplicate.duplicateDiagnostics[0]?.identicalNormalizationApplied, 'protected duplicate is not normalized')
assert(collectProtocolIntegrityViolations({ changedBlocks: protectedDuplicate.changedBlocks, sourceBlocks: protectedSource }).needsProtocolRetry, 'protected duplicate still fails duplicate integrity')

async function invokeWith(outputs: unknown[]) {
  const originalFetch = globalThis.fetch
  let calls = 0
  let requestBody: Record<string, any> | undefined
  globalThis.fetch = (async (_url, init) => {
    calls += 1
    if (calls === 1) requestBody = JSON.parse(String(init?.body))
    return response(outputs[Math.min(calls - 1, outputs.length - 1)])
  }) as typeof fetch
  try {
    const usage = createUsageTracker()
    const invoke = createLocalFullRewriteInvoke({ apiKey: 'test-only', usage, maxPaidCalls: 2 })
    const result = await invoke('ai-contract-full-rewrite', { body: {
      documentBlocks: source,
      transformationDataset: {},
      protectedDataSummary: {},
      structuralContext: { editableBlockIds: ['alpha', 'beta'] },
    } })
    return { calls, usage, result, requestBody }
  } finally {
    globalThis.fetch = originalFetch
  }
}

const validEnvelope = (changedBlocks: unknown[]) => ({ changedBlocks, financeEvidence: null, dateEvidence: null })
const duplicated = await invokeWith([validEnvelope(Array.from({ length: 22 }, () => ({ blockId: 'beta', text: 'replacement-b' })))])
assert(duplicated.calls === 1 && duplicated.usage.retries === 0, '22 duplicates use one provider response without retry')
assert(JSON.stringify((duplicated.result.data as any).changedBlocks) === JSON.stringify(singleton), 'provider response is normalized to one occurrence')
const observed = duplicated.usage.protocolDiagnostics?.[0]?.duplicateChangedBlocks?.[0]
assert(observed?.occurrenceCount === 22 && observed.normalizedOccurrenceCount === 1 && observed.identicalNormalizationApplied, 'run diagnostics retain duplicate observation and normalization')
assert(duplicated.usage.protocolDiagnostics?.[0]?.changedBlocksCount === 22 && duplicated.usage.protocolDiagnostics?.[0]?.normalizedChangedBlocksCount === 1, 'overall original and normalized counts retained')
assert(duplicated.usage.providerRequestIdentityDiagnostics?.totalEditableTargetEntries === 3, 'pre-provider request diagnostics remain available')
assert(JSON.stringify(duplicated.requestBody?.input).includes('source-a'), 'request content and identity remain unchanged')

const conflicting = await invokeWith([
  validEnvelope([{ blockId: 'beta', text: 'first' }, { blockId: 'beta', text: 'second' }]),
  validEnvelope(singleton),
])
assert(conflicting.calls === 2 && conflicting.usage.retries === 1, 'conflicting duplicates retain existing retry behavior')
assert(conflicting.usage.protocolDiagnostics?.[0]?.duplicateChangedBlocks?.[0]?.duplicateClassification === 'CONFLICTING', 'conflicting diagnostics retained')
assert(conflicting.usage.protocolDiagnostics?.[0]?.duplicateChangedBlocks?.[0]?.identicalNormalizationApplied === false, 'conflicting normalization not applied')

console.log('PASS identical changed-block normalization')
