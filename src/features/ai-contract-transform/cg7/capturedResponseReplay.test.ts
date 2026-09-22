import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { buildContractTransformationDataset } from '../transformationDataset'
import { runSparseProductTransform } from '../transformService'
import { buildGoldenScenarios } from './goldenScenarios'
import { replayCapturedResponse } from './capturedResponseReplay'

const scenario = buildGoldenScenarios().find((item) => item.caseId === 'G03')!
const sourcePath = join(process.cwd(), 'tmp/golden-contract-validation-run2/SOURCE', scenario.sourceFile)
const raw = readFileSync(sourcePath)
const sourceBytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
const sourceBlocks = await indexDocxForTransform(sourceBytes)
const dataset = buildContractTransformationDataset({
  wedding: scenario.wedding,
  package: scenario.package,
  extras: scenario.extras,
  currentDate: '2026-11-05',
})
const paragraph = sourceBlocks.find((block) => block.blockId === 'para-96')!
const response = {
  changedBlocks: [
    { blockId: paragraph.blockId, text: paragraph.text },
    { blockId: paragraph.blockId, text: paragraph.text },
  ],
  financeEvidence: [{ sourceBlockId: 'para-112', financeConcept: 'deposit' as const }],
  dateEvidence: [
    { sourceBlockId: 'table-0-row-1-cell-1-p-0', dateConcept: 'wedding_date' as const },
    { sourceBlockId: 'table-0-row-1-cell-0-p-0', dateConcept: 'execution_date' as const },
  ],
}

let providerCalls = 0
const originalFetch = globalThis.fetch
globalThis.fetch = (async () => {
  providerCalls += 1
  throw new Error('provider access forbidden in replay test')
}) as typeof fetch
try {
  const replay = await replayCapturedResponse({ sourceBytes, sourceBlocks, dataset, response })
  assert.equal(providerCalls, 0, 'replay makes no provider calls')
  assert.equal(replay.report.protocol.status, 'accepted')
  assert.equal(replay.report.protocol.normalizationApplied, true, 'identical duplicates use existing normalization')
  assert.equal(replay.report.transform.started, true)
  assert.equal(replay.report.semanticEvidence.finance.some((item) => item.outcome === 'accepted'), true, 'finance grounding ran')
  assert.equal(replay.report.semanticEvidence.date.some((item) => item.outcome === 'accepted'), true, 'date grounding ran')
  assert.equal(replay.report.repairs.attempted.length > 0, true, 'deterministic repairs ran')
  assert.equal(replay.report.quality.status !== 'not_reached', true, 'quality gate ran')
  assert.equal(typeof replay.report.quality.blockerReasons[0] === 'string' || replay.report.quality.status === 'passed', true, 'blocker report is separate')

  const conflict = await replayCapturedResponse({
    sourceBytes,
    sourceBlocks,
    dataset,
    response: { ...response, changedBlocks: [
      { blockId: paragraph.blockId, text: `${paragraph.text} A` },
      { blockId: paragraph.blockId, text: `${paragraph.text} B` },
    ] },
  })
  assert.equal(providerCalls, 0)
  assert.equal(conflict.report.protocol.status, 'rejected', 'conflicting duplicates fail closed')
  assert.equal(conflict.report.transform.started, false)

  const direct = await runSparseProductTransform({
    sourceBytes,
    sourceBlocks,
    dataset,
    invoke: async () => ({ data: { ok: true, changedBlocks: [response.changedBlocks[0]], financeEvidence: response.financeEvidence, dateEvidence: response.dateEvidence }, error: null }),
  })
  assert.equal(providerCalls, 0)
  assert.equal(replay.report.quality.status, direct.ok ? 'passed' : direct.reason === 'blocked' ? 'failed' : 'not_reached', 'replay reaches the same product outcome as a single normalized response')
  assert.deepEqual(replay.report.quality.blockerReasons, direct.blockingIssues)
} finally {
  globalThis.fetch = originalFetch
}

console.log('PASS G03 captured parsed-response replay (no provider calls)')
