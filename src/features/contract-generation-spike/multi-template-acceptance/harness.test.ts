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
  assert.ok(result.normalizedInput, 'legacy fixture is normalized before offline preflight')
  assert.equal(result.normalizedInput.wedding.date.value, '20.09.2027')
  assert.equal(result.normalizedInput.parties[0]?.fullName?.value, 'Ada')
  assert.deepEqual(result.providerCalls, { inventory: 0, transformation: 0, review: 0, total: 0, retries: 0, repair: 0 })
  assert.deepEqual(ACCEPTANCE_PROVIDER_BUDGET, { inventory: 1, transformation: 1, review: 1, total: 3, retries: 0, repair: 0 })
  assert.equal(result.candidatePath, null)
  assert.equal(result.reviewResult, 'NOT_RUN')
  let inventoryCalls = 0; let planningCalls = 0; let reviewCalls = 0
  const provider: AcceptanceProvider = {
    async inventory({ source }) { inventoryCalls++; assert.equal('wedding' in source, false); return { items: [] } },
    async transform({ input, inventory }) {
      planningCalls++; assert.ok(input.wedding); assert.deepEqual(inventory, { items: [] })
      return { status: 'MISSING_INPUT', missingInputs: [ { id: 'all-sweep-gaps', label: 'All gaps', explanation: 'The planner completed a full review.', inputType: 'text', required: true, sourceContext: 'source', sourceRefs: [], inventoryItemIds: [] } ], conflicts: [], factChanges: [], retainedLiterals: [], operations: [] }
    },
    async review() { reviewCalls++; return { status: 'PASS' } },
  }
  const stopped = await runMultiTemplateAcceptance('case-offline', { casesRoot: path.join(temp, 'cases'), outputRoot: path.join(temp, 'out'), runId: 'missing', provider })
  assert.equal(stopped.overall, 'MISSING_INPUT')
  assert.deepEqual(stopped.providerCalls, { inventory: 1, transformation: 1, review: 0, total: 2, retries: 0, repair: 0 })
  assert.deepEqual([inventoryCalls, planningCalls, reviewCalls], [1, 1, 0])

  const case04Id = 'case-04-realistic-wedding-photographer'
  const case04Dir = path.join(repoRoot, 'src/features/contract-generation-spike/multi-template-acceptance/cases', case04Id)
  const case04Fixture = JSON.parse(await readFile(path.join(case04Dir, 'input.json'), 'utf8'))
  assert.equal('generationDate' in case04Fixture, false)
  assert.equal('weddingFacts' in case04Fixture, false)
  const case04Result = await runMultiTemplateAcceptance(case04Id, {
    outputRoot: path.join(temp, 'out'),
    runId: 'case04-offline',
  })
  assert.equal(case04Result.preflight, 'READY')
  assert.equal(case04Result.overall, 'READY')
  assert.ok(case04Result.normalizedInput)
  assert.equal(case04Result.deterministicValidation, 'NOT_RUN')
  assert.equal(case04Result.transformationStatus, 'NOT_RUN_PROVIDER_DISABLED')
  assert.deepEqual(case04Result.providerCalls, { inventory: 0, transformation: 0, review: 0, total: 0, retries: 0, repair: 0 })
  const [case04Party1, case04Party2] = case04Result.normalizedInput.parties
  assert.equal(case04Party1?.address?.owner, 'partner1')
  assert.equal(case04Party1?.address?.value, 'ul. Francuska 18/7, 40-015 Katowice')
  assert.equal(case04Party2?.address?.owner, 'partner2')
  assert.equal(case04Party2?.address?.value, 'ul. Słoneczna 12/5, 43-300 Bielsko-Biała')
  assert.equal(case04Result.normalizedInput.unownedFacts.length, 0)
  assert.deepEqual(case04Result.normalizedInput.additionalAnswers.map(({ id, value, authority }) => [id, value, authority]), [
    ['party.partner1.pesel', '98072312346', 'user'],
    ['party.partner2.pesel', '97041112358', 'user'],
    ['agreement.identifier', '01/2028', 'user'],
  ])
  assert.equal(case04Result.normalizedInput.generationContext.generationDate.value, '2028-02-04')
  assert.equal(case04Result.normalizedInput.generationContext.generationDate.source, 'generation_start')
  assert.equal(case04Result.normalizedInput.commercial.contractValue.value, 10600)
  assert.equal(case04Result.normalizedInput.commercial.agreedDeposit.value, 2000)
  assert.equal(case04Result.normalizedInput.commercial.remainingAfterDeposit.value, 8600)
  assert.equal(case04Result.normalizedInput.commercial.remainingToPayNow.value, 10600)
  assert.notEqual(case04Result.normalizedInput.commercial.remainingAfterDeposit.value, case04Result.normalizedInput.commercial.remainingToPayNow.value)
  assert.equal(case04Result.normalizedInput.package.name.value, 'REPORTAŻ PEŁNY')
  assert.deepEqual(case04Result.normalizedInput.extras, [])
  assert.equal(case04Result.normalizedInput.commercial.travelFeeStatus.value, 'included')
  assert.equal(case04Result.normalizedInput.commercial.travelFeeAmount.value, 0)
  assert.deepEqual(case04Result.normalizedInput.locations.map(({ role }) => role.value), ['bride_preparation', 'groom_preparation', 'ceremony', 'reception'])

  const callsBeforeCase04Guard = [inventoryCalls, planningCalls, reviewCalls]
  const adapterFixtureWithMockProvider = await runMultiTemplateAcceptance(case04Id, {
    outputRoot: path.join(temp, 'out'),
    runId: 'case04-provider-still-disabled',
    provider,
  })
  assert.equal(adapterFixtureWithMockProvider.preflight, 'READY')
  assert.deepEqual(adapterFixtureWithMockProvider.providerCalls, { inventory: 0, transformation: 0, review: 0, total: 0, retries: 0, repair: 0 })
  assert.deepEqual([inventoryCalls, planningCalls, reviewCalls], callsBeforeCase04Guard)
  const persistedCase04 = JSON.parse(await readFile(path.join(temp, 'out', case04Id, 'case04-offline', 'result.json'), 'utf8'))
  assert.deepEqual(persistedCase04.normalizedInput, case04Result.normalizedInput)
  assert.match(await readFile(path.join(temp, 'out', case04Id, 'case04-offline', 'result.md'), 'utf8'), /Normalized ContractGenerationInput/)
} finally { await rm(temp, { recursive: true, force: true }) }
console.log('PASS mocked multi-template harness provider-disabled boundary')
