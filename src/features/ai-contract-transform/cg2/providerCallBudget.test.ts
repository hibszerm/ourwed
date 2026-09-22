import { createLocalFullRewriteInvoke, createUsageTracker } from './localFullRewriteInvoke'

const assert = (value: boolean, message: string) => { if (!value) throw new Error(message) }
const response = (json: unknown) => new Response(JSON.stringify({ output_text: JSON.stringify(json), status: 'completed' }), { status: 200, headers: { 'content-type': 'application/json' } })
const body = { documentBlocks: [{ blockId: 'source', text: 'Original', kind: 'paragraph', paragraphIndex: 0 }], transformationDataset: {}, protectedDataSummary: {} }

async function run(maxPaidCalls: number | undefined, outputs: unknown[]) {
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = (async () => { calls += 1; return response(outputs[Math.min(calls - 1, outputs.length - 1)] ?? { changedBlocks: [], financeEvidence: null, dateEvidence: null }) }) as typeof fetch
  try {
    const usage = createUsageTracker()
    const invoke = createLocalFullRewriteInvoke({ apiKey: 'test', usage, ...(maxPaidCalls === undefined ? {} : { maxPaidCalls }) })
    const result = await invoke('ai-contract-full-rewrite', { body })
    return { calls, usage, result }
  } finally { globalThis.fetch = original }
}

const valid = { changedBlocks: [], financeEvidence: null, dateEvidence: null }
const invalidId = { changedBlocks: [{ blockId: 'not-source', text: 'x' }], financeEvidence: null, dateEvidence: null }

{
  const r = await run(1, [valid]); assert(r.calls === 1 && r.usage.calls === 1, 'budget 1 valid uses one call')
  const blocked = await run(1, [invalidId, valid]); assert(blocked.calls === 1 && blocked.usage.calls === 1, 'budget 1 blocks protocol retry'); assert(blocked.usage.protocolDiagnostics?.[0]?.violationKinds.includes('INVALID_BLOCK_ID') === true, 'first protocol violation retained'); assert(blocked.usage.protocolDiagnostics?.[0]?.financeEvidence.length === 0, 'safe finance diagnostics retained')
  const recovered = await run(2, [invalidId, valid]); assert(recovered.calls === 2 && recovered.usage.calls === 2, 'budget 2 permits protocol recovery')
  const unchanged = await run(undefined, [invalidId, valid]); assert(unchanged.calls === 2 && unchanged.usage.calls === 2, 'default retry behavior unchanged')
  console.log('PASS provider call budget regressions')
}
