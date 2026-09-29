import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { AcceptanceProvider, MultiTemplateCaseDefinition } from './harness'
import { ACCEPTANCE_PROVIDER_BUDGET, formatAcceptanceReport, runMultiTemplateAcceptance } from './harness'
import { makeInput, readSource, type GenerationInput } from '../generator'

const sourceFixture = path.resolve(process.cwd(), 'src/features/contract-generation-spike/fixtures/source-video-standard.docx')
const root = await mkdtemp(path.join(os.tmpdir(), 'ourwed-multi-template-'))
const casesRoot = path.join(root, 'cases')
const outputRoot = path.join(root, 'results')
const sourceBytes = await readFile(sourceFixture)

const completeWedding = {
  bride: { name: 'Julia Kanicka', phone: '555666898', email: 'kanickaj7@wp.pl' },
  groom: { name: 'Maksymilian Ruth', phone: '675264927' },
  weddingDate: '20.09.2026', contractAddress: 'Juliusza Słowackiego 6/17, 41-800 Zabrze',
  contractValuePln: 14200, depositPln: 1000, remainingDueDate: '20.09.2026',
  locations: {
    groomPreparations: 'Wolności 110, 30-661 Kraków', bridePreparations: 'Marii Konopnickiej 6, 04-218 Kraków',
    ceremony: 'Zamek Królewski na Wawelu, Wawel 5, 31-001 Kraków', reception: 'Hotel Stary, Szczepańska 5, 31-011 Kraków',
  },
}

async function addCase(id: string, overrides: Partial<MultiTemplateCaseDefinition> = {}): Promise<void> {
  const directory = path.join(casesRoot, id)
  await mkdir(directory, { recursive: true })
  await copyFile(sourceFixture, path.join(directory, 'source.docx'))
  const definition: MultiTemplateCaseDefinition = {
    id, sourceDocx: 'source.docx', generationDate: '15.09.2026', weddingFacts: structuredClone(completeWedding), extras: ['ujęcia VHS'],
    expectedProductRules: { preserveSourcePackageExactly: true }, ...overrides,
  }
  await writeFile(path.join(directory, 'input.json'), `${JSON.stringify(definition, null, 2)}\n`)
}

try {
  await addCase('missing-case', { weddingFacts: { ...structuredClone(completeWedding), bride: { ...completeWedding.bride, email: undefined } } })
  const missingProviderCalls = { transform: 0, review: 0 }
  const spyProvider: AcceptanceProvider = {
    async transform() { missingProviderCalls.transform++; return { missingInputs: [], blockOperations: [] } },
    async review() { missingProviderCalls.review++; return { status: 'PASS' } },
  }
  const missing = await runMultiTemplateAcceptance('missing-case', { casesRoot, outputRoot, provider: spyProvider, runId: 'one' })
  assert.equal(missing.overall, 'MISSING_INPUT')
  assert.ok(missing.missingInputs.some((item) => item.id === 'case-fact:bride.email'))
  assert.deepEqual(missingProviderCalls, { transform: 0, review: 0 }, 'missing facts stop before the provider boundary')

  await addCase('conflict-case', { generationDate: '27.09.2026' })
  const conflict = await runMultiTemplateAcceptance('conflict-case', { casesRoot, outputRoot, provider: spyProvider, runId: 'one' })
  assert.equal(conflict.overall, 'CONFLICT_INPUT')
  assert.ok(conflict.conflictFindings.length > 0)
  assert.deepEqual(missingProviderCalls, { transform: 0, review: 0 }, 'conflicts stop before the provider boundary')

  await addCase('ready-case')
  const ready = await runMultiTemplateAcceptance('ready-case', { casesRoot, outputRoot, runId: 'one' })
  assert.equal(ready.preflight, 'READY')
  assert.equal(ready.transformationRequestPrepared, true)
  assert.equal(ready.transformationStatus, 'NOT_RUN_PROVIDER_DISABLED')
  assert.equal(ready.providerCalls.total, 0)

  let staleConclusionReviewCalls = 0
  const staleConclusionProvider: AcceptanceProvider = {
    async transform({ input }) {
      const opening = input.sourceDocument.blocks.find((block) => block.blockId === input.conclusion.sourceBlockId)!
      return { missingInputs: [], blockOperations: [{ blockId: opening.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: opening.text }] }
    },
    async review() { staleConclusionReviewCalls++; return { status: 'PASS' } },
  }
  const staleConclusion = await runMultiTemplateAcceptance('ready-case', { casesRoot, outputRoot, provider: staleConclusionProvider, runId: 'stale-conclusion' })
  assert.equal(staleConclusion.overall, 'FAIL')
  assert.equal(staleConclusion.deterministicValidation, 'FAIL')
  assert.equal(staleConclusion.candidatePath, null, 'invalid plan is rejected before candidate generation')
  assert.equal(staleConclusionReviewCalls, 0, 'invalid plan is rejected before review')
  assert.match(staleConclusion.deterministicFindings.join(' '), /authoritative conclusion date/i)

  await addCase('relative-timing-case', {
    weddingFacts: { ...structuredClone(completeWedding), remainingDueDate: undefined },
    paymentTiming: {
      reservation: { type: 'relative', relativeTo: 'contract_conclusion', offsetDays: 3, sourceMeaning: 'w terminie 3 dni od zawarcia umowy' },
      remaining: { type: 'relative', relativeTo: 'wedding', offsetDays: -7, sourceMeaning: 'najpóźniej 7 dni przed uroczystością' },
    },
  })
  let timingObserved: unknown
  const timingBoundaryProbe: AcceptanceProvider = {
    async transform({ input, paymentTiming }) {
      timingObserved = { inputDueRule: input.wedding.remainingDueDate, paymentTiming }
      throw new Error('offline schema probe')
    },
    async review() { throw new Error('review must not run during schema probe') },
  }
  const relativeTiming = await runMultiTemplateAcceptance('relative-timing-case', { casesRoot, outputRoot, provider: timingBoundaryProbe, runId: 'schema-probe' })
  assert.equal(relativeTiming.preflight, 'READY', 'a relative source rule satisfies case input without a derived date')
  assert.deepEqual(timingObserved, {
    inputDueRule: 'najpóźniej 7 dni przed uroczystością',
    paymentTiming: {
      reservation: { type: 'relative', relativeTo: 'contract_conclusion', offsetDays: 3, sourceMeaning: 'w terminie 3 dni od zawarcia umowy' },
      remaining: { type: 'relative', relativeTo: 'wedding', offsetDays: -7, sourceMeaning: 'najpóźniej 7 dni przed uroczystością' },
    },
  }, 'future transformation request carries both source-relative payment rules')

  assert.deepEqual(ACCEPTANCE_PROVIDER_BUDGET, { transformation: 1, review: 1, total: 2, retries: 0, repair: 0 })
  assert.deepEqual(Object.keys(spyProvider).sort(), ['review', 'transform'], 'provider contract has no repair operation')

  await addCase('case-one')
  await addCase('case-two', { weddingFacts: { ...structuredClone(completeWedding), bride: { ...completeWedding.bride, name: 'Another Client' } } })
  const observed: Array<{ name: string; originalDocx: boolean }> = []
  const stopAfterCapture: AcceptanceProvider = {
    async transform({ input, sourceDocx }) {
      observed.push({ name: input.wedding.bride.name, originalDocx: Buffer.compare(Buffer.from(sourceDocx), sourceBytes) === 0 })
      throw new Error('offline boundary probe; no provider request sent')
    },
    async review() { throw new Error('review must not run after transformation failure') },
  }
  await runMultiTemplateAcceptance('case-one', { casesRoot, outputRoot, provider: stopAfterCapture, runId: 'probe' })
  await runMultiTemplateAcceptance('case-two', { casesRoot, outputRoot, provider: stopAfterCapture, runId: 'probe' })
  assert.deepEqual(observed, [{ name: 'Julia Kanicka', originalDocx: true }, { name: 'Another Client', originalDocx: true }], 'each case independently starts from its own source DOCX and facts')

  const reviewFailureProvider: AcceptanceProvider = {
    async transform({ input }) {
      const opening = input.sourceDocument.blocks.find((block) => block.blockId === input.conclusion.sourceBlockId)
      return { missingInputs: [], blockOperations: opening && input.conclusion.replacementDate ? [{ blockId: opening.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: opening.text.replace(/\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+\d{4}|\.{3,}/i, input.conclusion.replacementDate) }] : [] }
    },
    async review() { return { status: 'FAIL', issues: ['offline review stub failure'] } },
  }
  const stopped = await runMultiTemplateAcceptance('ready-case', { casesRoot, outputRoot, provider: reviewFailureProvider, runId: 'review-stop' })
  assert.equal(stopped.reviewResult, 'FAIL')
  assert.equal(stopped.providerCalls.total, 2)
  assert.equal(stopped.providerCalls.repair, 0)
  assert.equal(stopped.candidateOpens, true)
  assert.ok(stopped.pageCount && stopped.pageCount > 0)
  assert.equal(stopped.visualInspection, 'REQUIRED')
  assert.equal(stopped.overall, 'FAIL', 'review failure stops without repair')

  const report = await readFile(path.join(outputRoot, 'ready-case', 'review-stop', 'result.json'), 'utf8')
  const parsedReport = JSON.parse(report)
  for (const field of ['caseId', 'sourceFilename', 'paymentTiming', 'preflight', 'missingInputs', 'conflictFindings', 'transformationStatus', 'blockOperationCounts', 'candidatePath', 'candidateOpens', 'reviewResult', 'reviewFindings', 'deterministicValidation', 'pageCount', 'blankPagePresence', 'protectedLegalWording', 'packageServicePreservation', 'oldDataStatus', 'inventedFactStatus', 'visualInspection', 'providerCalls', 'overall']) assert.ok(field in parsedReport, `report contains ${field}`)
  assert.match(formatAcceptanceReport(stopped), /Provider calls: 2/)
  assert.match(await readFile(path.join(outputRoot, 'ready-case', 'review-stop', 'result.md'), 'utf8'), /offline review stub failure/)

  const metricsPassProvider: AcceptanceProvider = {
    async transform({ input }) {
      const opening = input.sourceDocument.blocks.find((block) => block.blockId === input.conclusion.sourceBlockId)
      return {
        missingInputs: [],
        blockOperations: opening && input.conclusion.replacementDate ? [{ blockId: opening.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: opening.text.replace(/\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+\d{4}|\.{3,}/i, input.conclusion.replacementDate) }] : [],
        providerMetadata: { requestedModel: 'gpt-6-luna', responseModel: 'gpt-6-luna', requestedPricingMode: 'standard', serviceTier: 'default', processingRegion: 'GLOBAL', usage: { input_tokens: 20, input_tokens_details: { cached_tokens: 5 }, output_tokens: 10, output_tokens_details: { reasoning_tokens: 4 } } },
      }
    },
    async review() { return { status: 'PASS', providerMetadata: { requestedModel: 'gpt-6-luna', responseModel: 'gpt-6-luna', requestedPricingMode: 'standard', serviceTier: 'default', processingRegion: 'GLOBAL', usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 2 }, output_tokens: 5, output_tokens_details: { reasoning_tokens: 1 } } } } },
  }
  const measuredRun = await runMultiTemplateAcceptance('ready-case', { casesRoot, outputRoot, provider: metricsPassProvider, runId: 'metrics-wiring' })
  assert.equal(measuredRun.reviewResult, 'PASS')
  assert.ok(measuredRun.measurements)
  assert.ok(measuredRun.measurements.totalGenerationMs !== null)
  for (const stage of ['preflightMs', 'planningProviderMs', 'planValidationMs', 'docxApplyMs', 'candidateValidationMs', 'reviewProviderMs'] as const) assert.ok(measuredRun.measurements.stages[stage] !== null, `${stage} is measured in the harness`)
  assert.equal(measuredRun.measurements.providerCalls.length, 2)
  assert.equal(measuredRun.measurements.providerCalls[0]?.purpose, 'planning')
  assert.equal(measuredRun.measurements.providerCalls[1]?.purpose, 'review')
  assert.equal(measuredRun.measurements.providerCalls[0]?.usage?.output_tokens, 10)
  assert.equal(measuredRun.measurements.totalTokens.input, 30)
  assert.equal(measuredRun.measurements.totalTokens.cachedInput, 7)
  assert.equal(measuredRun.measurements.totalCostUsd, 0.00000987)
  assert.match(formatAcceptanceReport(measuredRun), /Generation timing:/)

  const planArtifactPath = path.join(outputRoot, 'ready-case', 'plan-persistence', 'planning-result.json')
  let planProviderReturned = false
  let providerCallsAfterPlanning = 0
  let planExistsBeforeApply = false
  let planProviderTransformCalls = 0
  let planProviderReviewCalls = 0
  const planProviderCallOrder: string[] = []
  let fakeMonotonic = 0
  let expectedPlanningOperations: Array<{ blockId: string; operation: 'REPLACE_BLOCK_TEXT'; finalText: string }> = []
  const planPersistenceProvider: AcceptanceProvider = {
    async transform({ input }) {
      planProviderTransformCalls++
      planProviderCallOrder.push('planning')
      const opening = input.sourceDocument.blocks.find((block) => block.blockId === input.conclusion.sourceBlockId)!
      expectedPlanningOperations = [{ blockId: opening.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: opening.text.replace(input.conclusion.sourceDate!, input.conclusion.replacementDate!) }]
      planProviderReturned = true
      return {
        missingInputs: [],
        blockOperations: expectedPlanningOperations,
        providerMetadata: { requestedModel: 'gpt-6-luna', responseModel: 'gpt-6-luna' },
      }
    },
    async review() {
      planProviderReviewCalls++
      planProviderCallOrder.push('review')
      const artifact = JSON.parse(await readFile(planArtifactPath, 'utf8'))
      assert.equal(artifact.status, 'READY')
      assert.equal(artifact.planValidation, 'PASS')
      assert.deepEqual(artifact.operations, expectedPlanningOperations)
      assert.equal(artifact.operationCount, 1)
      assert.equal(artifact.model, 'gpt-6-luna')
      assert.equal(artifact.responseModel, 'gpt-6-luna')
      return { status: 'PASS' }
    },
  }
  const planPersistenceRun = await runMultiTemplateAcceptance('ready-case', {
    casesRoot, outputRoot, provider: planPersistenceProvider, runId: 'plan-persistence',
    metricsClock: {
      monotonicNow() {
        if (planProviderReturned) {
          providerCallsAfterPlanning++
          if (providerCallsAfterPlanning === 4) planExistsBeforeApply = existsSync(planArtifactPath)
        }
        return fakeMonotonic++
      },
      wallNow() { return new Date(fakeMonotonic) },
    },
  })
  assert.ok(planPersistenceRun.candidatePath, 'the persisted plan proceeds to candidate application')
  assert.equal(planPersistenceRun.reviewResult, 'PASS')
  assert.equal(planExistsBeforeApply, true, 'planning result is persisted before DOCX application')
  assert.equal(planPersistenceRun.planningResultPath, planArtifactPath)
  const planPersistenceReport = JSON.parse(await readFile(path.join(outputRoot, 'ready-case', 'plan-persistence', 'result.json'), 'utf8'))
  assert.equal(planPersistenceReport.planningResultPath, planArtifactPath, 'benchmark JSON references the persisted planning artifact')
  assert.deepEqual({ planProviderTransformCalls, planProviderReviewCalls }, { planProviderTransformCalls: 1, planProviderReviewCalls: 1 }, 'provider call count/order remains one planning call then one review call')
  assert.deepEqual(planProviderCallOrder, ['planning', 'review'], 'provider order remains planning followed by review')

  const caseId = 'case-01-elegant-photographer'
  const realCasesRoot = path.resolve(process.cwd(), 'src/features/contract-generation-spike/multi-template-acceptance/cases')
  const realCaseDir = path.join(realCasesRoot, caseId)
  const realCase = JSON.parse(await readFile(path.join(realCaseDir, 'input.json'), 'utf8'))
  const caseSourceBytes = await readFile(path.join(realCaseDir, 'source.docx'))
  assert.equal(createHash('sha256').update(caseSourceBytes).digest('hex'), 'd8f5b95eae9586adc5c37b681f2ba108ab2464fcc78f2ab8214a6d57a6710fee', 'case source remains byte-identical to the supplied source fixture')
  assert.equal(realCase.weddingFacts.clientPesel, undefined, 'PESEL is absent from authoritative facts')
  assert.equal(realCase.userProvidedAnswers.some((answer: { id: string }) => /pesel/i.test(answer.id)), false, 'no PESEL answer is supplied')
  assert.equal(realCase.weddingFacts.remainingDueDate, undefined, 'case does not store a derived calendar due date')
  assert.deepEqual(realCase.paymentTiming.remaining, { type: 'relative', relativeTo: 'wedding', offsetDays: -7, sourceMeaning: 'najpóźniej 7 dni przed uroczystością' })
  assert.deepEqual(realCase.paymentTiming.reservation, { type: 'relative', relativeTo: 'contract_conclusion', offsetDays: 3, sourceMeaning: 'w terminie 3 dni od zawarcia umowy' })
  assert.deepEqual(realCase.extras, [], 'optional service catalogue entries are not selected extras')
  assert.equal(realCase.expectedProductRules.preserveSourcePackageExactly, true)
  const caseSourceBuffer = caseSourceBytes.buffer.slice(caseSourceBytes.byteOffset, caseSourceBytes.byteOffset + caseSourceBytes.byteLength) as ArrayBuffer
  const openedCaseSource = await readSource(caseSourceBuffer, 'source.docx')
  assert.ok(openedCaseSource.blocks.some((block) => block.text.includes('Klasyczny Reportaż')), 'package is present in the source DOCX')
  const caseWedding = { ...realCase.weddingFacts, remainingDueDate: realCase.paymentTiming.remaining.sourceMeaning }
  const caseInput = makeInput({ generationDate: realCase.generationDate, sourceDocument: openedCaseSource, wedding: caseWedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: realCase.extras, userProvidedAnswers: realCase.userProvidedAnswers })
  if (!caseInput.conclusion.preservePlace) caseInput.conclusion = { ...caseInput.conclusion, preservePlace: realCase.expectedProductRules.preserveSourceConclusionPlace }
  assert.equal(caseInput.conclusion.replaceDate, true)
  assert.equal(caseInput.conclusion.sourceDate, '15.02.2027')
  assert.equal(caseInput.conclusion.sourceBlockId, 'word/document.xml#p2')
  assert.equal(caseInput.conclusion.replacementDate, '10.02.2027')
  assert.equal(caseInput.conclusion.preservePlace, 'Warszawie')
  assert.equal(caseInput.wedding.weddingDate, '18.07.2027')
  assert.equal(JSON.stringify(realCase).toLowerCase().includes('pesel'), false, 'no personal identifier is present in Case 01 input')
  const actualCase = await runMultiTemplateAcceptance(caseId, { casesRoot: realCasesRoot, outputRoot, runId: 'offline-preflight' })
  assert.equal(actualCase.preflight, 'READY', 'offline preflight does not attempt arbitrary source-field discovery')
  assert.deepEqual(actualCase.conflictFindings, [])
  assert.equal(actualCase.providerCalls.total, 0)
  assert.equal(actualCase.candidatePath, null, 'preflight-only run does not generate a candidate')
  assert.equal(9600 - 1800, 7800)

  const case03Id = 'case-03-narrative-photo-video'
  const case03Dir = path.join(realCasesRoot, case03Id)
  const case03Definition = JSON.parse(await readFile(path.join(case03Dir, 'input.json'), 'utf8'))
  const case03SourceBytes = await readFile(path.join(case03Dir, 'source.docx'))
  assert.equal(case03Definition.weddingFacts.bride.name, 'Zuzanna Bielska')
  assert.equal(case03Definition.weddingFacts.bride.pesel, undefined, 'base Case 03 fixture omits the later user-provided PESEL answer')
  assert.equal(case03Definition.userProvidedAnswers.some((answer: { id: string }) => /pesel/i.test(answer.id)), false, 'base Case 03 fixture has no PESEL continuation answer')
  assert.equal(case03Definition.weddingFacts.contractValuePln, 16800)
  assert.equal(case03Definition.weddingFacts.depositPln, 2800)
  assert.equal(case03Definition.weddingFacts.contractValuePln - case03Definition.weddingFacts.depositPln, 14000)
  assert.equal(case03Definition.userProvidedAnswers.some((answer: { id: string }) => /payment\.(?:secondPaymentAmount|secondPaymentDueRule|finalPaymentAmount)/i.test(answer.id)), false, 'V1 payment input has no synthetic installment answers')
  assert.equal(JSON.stringify(case03Definition).includes('5 500 zł'), false)
  assert.equal(JSON.stringify(case03Definition).includes('8 500 zł'), false)
  assert.equal(case03Definition.paymentTiming.remaining.relativeTo, 'wedding')
  assert.deepEqual(case03Definition.extras, [], 'Case 03 catalogue options are not selected extras')
  const case03SourceBuffer = case03SourceBytes.buffer.slice(case03SourceBytes.byteOffset, case03SourceBytes.byteOffset + case03SourceBytes.byteLength) as ArrayBuffer
  const case03Source = await readSource(case03SourceBuffer, 'source.docx')
  const case03Wedding = { ...case03Definition.weddingFacts, remainingDueDate: case03Definition.paymentTiming.remaining.sourceMeaning }
  const case03Input = makeInput({ generationDate: case03Definition.generationDate, sourceDocument: case03Source, wedding: case03Wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: case03Definition.extras, userProvidedAnswers: case03Definition.userProvidedAnswers })
  assert.deepEqual(case03Input.financials, { contractValuePln: 16800, depositPln: 2800, remainingPln: 14000 }, 'the current V1 shape derives one remaining amount from total minus deposit')
  assert.ok(case03Source.blocks.some((block) => /opłata rezerwacyjna/i.test(block.text)), 'source retains its reservation-payment stage')
  assert.ok(case03Source.blocks.some((block) => /Druga płatność wynosi/i.test(block.text)), 'source retains its second-payment stage')
  assert.ok(case03Source.blocks.some((block) => /Pozostałe .* zapłaci/i.test(block.text)), 'source retains its final-payment stage')
  const case03Acceptance = await runMultiTemplateAcceptance(case03Id, { casesRoot: realCasesRoot, outputRoot, runId: 'offline-v1-payment-preflight' })
  assert.equal(case03Acceptance.preflight, 'READY')
  assert.equal(case03Acceptance.providerCalls.total, 0)
  assert.equal(case03Acceptance.candidatePath, null)

  const capturedPlanningInputs: Record<string, GenerationInput['conclusion']> = {}
  const conclusionCaptureProvider: AcceptanceProvider = {
    async transform({ input }) {
      capturedPlanningInputs[input.conclusion.sourceDate ?? 'no-source-date'] = input.conclusion
      return { missingInputs: [{ id: 'offline-stop', label: 'offline stop', explanation: 'Stop after capturing deterministic context.', inputType: 'text', required: true, sourceContext: 'test' }] }
    },
    async review() { throw new Error('review must not run in conclusion context handoff test') },
  }
  await runMultiTemplateAcceptance(caseId, { casesRoot: realCasesRoot, outputRoot, provider: conclusionCaptureProvider, runId: 'conclusion-context' })
  const case02Id = 'case-02-structured-two-client-photographer'
  const case02Dir = path.join(realCasesRoot, case02Id)
  const continuationProbeId = 'case-02-continuation-handoff-probe'
  const continuationProbeDir = path.join(casesRoot, continuationProbeId)
  const case02Definition = JSON.parse(await readFile(path.join(case02Dir, 'input.json'), 'utf8'))
  case02Definition.userProvidedAnswers.push({ id: 'wedding.groom.pesel', value: '90010112346' })
  await mkdir(continuationProbeDir, { recursive: true })
  await copyFile(path.join(case02Dir, 'source.docx'), path.join(continuationProbeDir, 'source.docx'))
  await writeFile(path.join(continuationProbeDir, 'input.json'), JSON.stringify({ ...case02Definition, id: continuationProbeId }, null, 2))
  await runMultiTemplateAcceptance(continuationProbeId, { casesRoot, outputRoot, provider: conclusionCaptureProvider, runId: 'conclusion-context' })
  const case01Conclusion = Object.values(capturedPlanningInputs).find((conclusion) => conclusion.sourceDate === '15.02.2027')
  const case02Conclusion = Object.values(capturedPlanningInputs).find((conclusion) => conclusion.sourceDate === '04.03.2027')
  assert.deepEqual(case01Conclusion, { replaceDate: true, sourceDate: '15.02.2027', sourceBlockId: 'word/document.xml#p2', replacementDate: '10.02.2027', preservePlace: 'Warszawie' }, 'initial planning receives explicit source and target conclusion date state')
  assert.deepEqual(case02Conclusion, { replaceDate: true, sourceDate: '04.03.2027', sourceBlockId: 'word/document.xml#p2', replacementDate: '22.03.2027', preservePlace: 'Mieście Próbny Brzeg' }, 'continuation planning receives the same derived conclusion state shape, distinct from wedding date')

  console.log('PASS multi-template acceptance harness mechanics')
} finally {
  await rm(root, { recursive: true, force: true })
}
