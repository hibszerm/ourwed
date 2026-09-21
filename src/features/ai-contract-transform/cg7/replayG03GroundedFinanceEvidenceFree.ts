import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildProtectedContractData } from '../protectedContractData'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { runPostReconstructionQualityGate } from '../quality/buildQualityReport'
import { discoverFilledPackageEvidence } from '../quality/packageFieldEvidence'
import { buildContractTransformationDataset } from '../transformationDataset'
import { runFullAiRewrite } from '../transformApi'
import { buildGoldenScenarios } from './goldenScenarios'

const assert = (value: boolean, message: string) => { if (!value) throw new Error(message) }

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
const semanticSourceBlockId = 'para-112'
assert(sourceBlocks.some((block) => block.blockId === semanticSourceBlockId), 'G03 semantic source exists')

const model = await runFullAiRewrite({
  runId: 'g03-grounded-finance-free-replay',
  documentBlocks: sourceBlocks,
  transformationDataset: dataset,
  protectedDataSummary: { exactCount: 0, patternCount: 0 },
  invoke: async () => ({
    data: {
      ok: true,
      changedBlocks: [],
      financeEvidence: [{ sourceBlockId: semanticSourceBlockId, financeConcept: 'deposit' }],
      model: 'simulated-no-network',
    },
    error: null,
  }),
})
assert(model.ok, 'G03 simulated sparse response accepted')
if (!model.ok) throw new Error(model.error.message)
assert(model.financeEvidence.length === 1, 'G03 semantic evidence accepted')

const protectedData = buildProtectedContractData({ blocks: sourceBlocks, blockTexts: sourceBlocks.map((block) => block.text) })
const gate = runPostReconstructionQualityGate({
  sourceBlocks,
  transformedBlocks: model.transformedBlocks,
  dataset,
  protectedData,
  mode: 'full_ai',
  financeEvidence: model.financeEvidence,
})
const deposit = gate.blocks.find((block) => block.originSourceBlockId === 'table-5-row-2-cell-2-p-0')
assert(deposit?.text.includes('4 800') === true, 'G03 deposit repaired from canonical CRM value')
assert(!gate.blocks.some((block) => /3\s*500,00\s*zł/.test(block.text)), 'G03 stale deposit removed')
assert(gate.blocks.some((block) => /21\s*400/.test(block.text)), 'G03 total preserved canonical')
assert(gate.blocks.some((block) => /16\s*600/.test(block.text)), 'G03 remaining preserved canonical')
assert(gate.blocks.some((block) => /dwadzieścia jeden tysięcy czterysta złotych 00\/100/i.test(block.text)), 'G03 total words style preserved')
assert(!gate.report.blockingIssues.some((issue) => issue.code.includes('ADDITIONAL_SERVICES')), 'G03 extras remain valid')
const packageEvidence = discoverFilledPackageEvidence(sourceBlocks)
assert(packageEvidence.every((evidence) => gate.blocks.find((block) => block.originSourceBlockId === evidence.blockId)?.text === evidence.sourceText), 'G03 template package content retained')
console.log('PASS G03 grounded finance evidence replay')
