import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AcceptanceProvider, MultiTemplateCaseDefinition } from './harness'
import { ACCEPTANCE_PROVIDER_BUDGET, formatAcceptanceReport, runMultiTemplateAcceptance } from './harness'

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
    async transform() { return { missingInputs: [], blockOperations: [] } },
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
  for (const field of ['caseId', 'sourceFilename', 'preflight', 'missingInputs', 'conflictFindings', 'transformationStatus', 'blockOperationCounts', 'candidatePath', 'candidateOpens', 'reviewResult', 'reviewFindings', 'deterministicValidation', 'pageCount', 'blankPagePresence', 'protectedLegalWording', 'packageServicePreservation', 'oldDataStatus', 'inventedFactStatus', 'visualInspection', 'providerCalls', 'overall']) assert.ok(field in parsedReport, `report contains ${field}`)
  assert.match(formatAcceptanceReport(stopped), /Provider calls: 2/)
  assert.match(await readFile(path.join(outputRoot, 'ready-case', 'review-stop', 'result.md'), 'utf8'), /offline review stub failure/)

  console.log('PASS multi-template acceptance harness mechanics')
} finally {
  await rm(root, { recursive: true, force: true })
}
