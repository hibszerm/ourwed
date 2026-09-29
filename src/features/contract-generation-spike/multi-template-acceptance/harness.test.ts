import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCEPTANCE_PROVIDER_BUDGET, runMultiTemplateAcceptance, type AcceptanceProvider } from './harness'
import { serializePlannerAuthorityContext } from '../plannerProviderBoundary'
import type { ContractGenerationInput } from '../contractGenerationInput'
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
    async transform({ authorityContext, inventory }) {
      planningCalls++; assert.ok(authorityContext.wedding); assert.deepEqual(inventory, { items: [] })
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
  assert.ok(case04Result.plannerAuthorityContextPath)
  const case04ContextText = await readFile(case04Result.plannerAuthorityContextPath, 'utf8')
  const persistedPlannerContext = JSON.parse(case04ContextText)
  assert.deepEqual(persistedPlannerContext.authorityContext, case04Result.normalizedInput)
  assert.match(persistedPlannerContext.description, /owner appears only where OurWed establishes/i)
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

  let case04InventoryCalls = 0
  let case04PlanningCalls = 0
  let capturedCase04Authority: unknown
  let capturedCase04Description = ''
  const case04MockProvider: AcceptanceProvider = {
    async inventory({ source }) {
      case04InventoryCalls++
      assert.equal('wedding' in source, false, 'inventory gets source only, never CRM authority')
      return { items: [] }
    },
    async transform({ authorityContext, authorityContextDescription, inventory }) {
      case04PlanningCalls++
      capturedCase04Authority = authorityContext
      capturedCase04Description = authorityContextDescription
      assert.deepEqual(inventory, { items: [] })
      return { status: 'MISSING_INPUT', missingInputs: [], conflicts: [], factChanges: [], retainedLiterals: [], operations: [] }
    },
    async review() { throw new Error('review must not run after MISSING_INPUT') },
  }
  const adapterFixtureWithMockProvider = await runMultiTemplateAcceptance(case04Id, {
    outputRoot: path.join(temp, 'out'),
    runId: 'case04-provider-boundary-offline',
    provider: case04MockProvider,
  })
  assert.equal(adapterFixtureWithMockProvider.preflight, 'READY')
  assert.equal(adapterFixtureWithMockProvider.overall, 'MISSING_INPUT')
  assert.deepEqual(adapterFixtureWithMockProvider.providerCalls, { inventory: 1, transformation: 1, review: 0, total: 2, retries: 0, repair: 0 })
  assert.deepEqual([case04InventoryCalls, case04PlanningCalls], [1, 1])
  assert.deepEqual(capturedCase04Authority, case04Result.normalizedInput)
  assert.match(capturedCase04Description, /remainingAfterDeposit and remainingToPayNow/)
  const plannerWirePayload = JSON.parse(serializePlannerAuthorityContext(capturedCase04Authority as ContractGenerationInput)) as { description: string; authorityContext: ContractGenerationInput }
  assert.equal(plannerWirePayload.description, capturedCase04Description)
  const plannerPayload = plannerWirePayload.authorityContext
  assert.equal(plannerPayload.parties[0]?.fullName?.value, 'Klaudia Majewska')
  assert.equal(plannerPayload.parties[0]?.address?.owner, 'partner1')
  assert.equal(plannerPayload.parties[0]?.phone?.owner, 'partner1')
  assert.equal(plannerPayload.parties[0]?.email?.owner, 'partner1')
  assert.equal(plannerPayload.parties[1]?.fullName?.value, 'Tomasz Domański')
  assert.equal(plannerPayload.parties[1]?.address?.owner, 'partner2')
  assert.equal(plannerPayload.parties[1]?.phone?.owner, 'partner2')
  assert.equal(plannerPayload.parties[1]?.email?.owner, 'partner2')
  assert.deepEqual(plannerPayload.additionalAnswers.map(({ id, value, authority }) => [id, value, authority]), [
    ['party.partner1.pesel', '98072312346', 'user'],
    ['party.partner2.pesel', '97041112358', 'user'],
    ['agreement.identifier', '01/2028', 'user'],
  ])
  assert.equal(plannerPayload.generationContext.generationDate.value, '2028-02-04')
  assert.equal(plannerPayload.generationContext.contractRecordId, undefined)
  assert.equal(plannerPayload.commercial.contractValue.value, 10600)
  assert.equal(plannerPayload.commercial.agreedDeposit.value, 2000)
  assert.equal(plannerPayload.commercial.remainingAfterDeposit.value, 8600)
  assert.equal(plannerPayload.commercial.remainingToPayNow.value, 10600)
  assert.equal(plannerPayload.package.name.value, 'REPORTAŻ PEŁNY')
  assert.deepEqual(plannerPayload.extras, [])
  assert.equal(plannerPayload.commercial.travelFeeStatus.value, 'included')
  assert.equal(plannerPayload.commercial.travelFeeAmount.value, 0)
  assert.deepEqual(plannerPayload.locations.map(({ role }) => role.value), ['bride_preparation', 'groom_preparation', 'ceremony', 'reception'])
  assert.equal('weddingFacts' in (plannerPayload as unknown as Record<string, unknown>), false)
  assert.equal('generationDate' in (plannerPayload as unknown as Record<string, unknown>), false)
  assert.equal('clients' in (plannerPayload as unknown as Record<string, unknown>), false)
  assert.equal('remaining' in (plannerPayload.commercial as unknown as Record<string, unknown>), false)
  const persistedCase04 = JSON.parse(await readFile(path.join(temp, 'out', case04Id, 'case04-offline', 'result.json'), 'utf8'))
  assert.deepEqual(persistedCase04.normalizedInput, case04Result.normalizedInput)
  assert.match(await readFile(path.join(temp, 'out', case04Id, 'case04-offline', 'result.md'), 'utf8'), /Normalized ContractGenerationInput/)
} finally { await rm(temp, { recursive: true, force: true }) }
console.log('PASS mocked multi-template harness normalized provider boundary')
