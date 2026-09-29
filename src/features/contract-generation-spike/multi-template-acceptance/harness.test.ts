import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCEPTANCE_PROVIDER_BUDGET, runMultiTemplateAcceptance, type AcceptanceProvider } from './harness'
const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))
const sourceFixture = path.join(repoRoot, 'src/features/contract-generation-spike/fixtures/source-video-standard.docx')
const temp = await mkdtemp(path.join(os.tmpdir(), 'ourwed-harness-boundary-'))
try {
  const caseDir = path.join(temp, 'cases', 'case-offline')
  await mkdir(caseDir, { recursive: true })
  await writeFile(path.join(caseDir, 'source.docx'), await readFile(sourceFixture))
  await writeFile(path.join(caseDir, 'input.json'), JSON.stringify({ id: 'case-offline', sourceDocx: 'source.docx', generationDate: '25.09.2026', weddingFacts: { bride: { name: 'Ada', phone: '', email: '' }, groom: { name: 'Bar', phone: '' }, weddingDate: '20.09.2027', contractAddress: '', contractValuePln: 10000, depositPln: 1000 }, expectedProductRules: { preserveSourcePackageExactly: true } }))
  const result = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out') })
  assert.equal(result.overall, 'READY')
  assert.deepEqual(result.providerCalls, { inventory: 0, transformation: 0, review: 0, total: 0, retries: 0, repair: 0 })
  assert.deepEqual(ACCEPTANCE_PROVIDER_BUDGET, { inventory: 1, transformation: 1, review: 1, total: 3, retries: 0, repair: 0 })
  assert.equal(result.candidatePath, null)
  assert.equal(result.reviewResult, 'NOT_RUN')
  let inventoryCalls = 0; let planningCalls = 0; let reviewCalls = 0
  const provider: AcceptanceProvider = {
    async inventory({ source }) { inventoryCalls++; assert.equal('wedding' in source, false); return { items: [] } },
    async transform({ input, inventory }) {
      planningCalls++; assert.ok(input.wedding); assert.deepEqual(inventory, { items: [] })
      return { status: 'MISSING_INPUT', missingInputs: [ { id: 'all-sweep-gaps', label: 'All gaps', explanation: 'The planner completed a full review.', inputType: 'text', required: true, sourceContext: 'source', sourceRefs: [] } ], conflicts: [], factChanges: [], retainedLiterals: [], operations: [] }
    },
    async review() { reviewCalls++; return { status: 'PASS' } },
  }
  const stopped = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'missing', provider })
  assert.equal(stopped.overall, 'MISSING_INPUT')
  assert.deepEqual(stopped.providerCalls, { inventory: 1, transformation: 1, review: 0, total: 2, retries: 0, repair: 0 })
  assert.deepEqual([inventoryCalls, planningCalls, reviewCalls], [1, 1, 0])
} finally { await rm(temp, { recursive: true, force: true }) }
console.log('PASS mocked multi-template harness provider-disabled boundary')
