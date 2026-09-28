import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { applyBlockOperations, type BlockOperation } from '../blockDocxEditor'
import { ContractGenerationMetrics, type GenerationMeasurements, type MetricsClock, type ProviderResponseMetadata } from '../contractGenerationMetrics'
import {
  findInputConflicts,
  makeInput,
  normalizeAuthoritativeFinancialBlocks,
  normalizeAuthoritativePlnText,
  readSource,
  validatePlannedConclusion,
  validateCandidate,
  type ConflictInput,
  type GenerationInput,
  type MissingInput,
  type ReviewResult,
  type SourceBlock,
  type WeddingFacts,
} from '../generator'

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

export type RelativePaymentTiming = {
  type: 'relative'
  relativeTo: 'contract_conclusion' | 'wedding'
  offsetDays: number
  sourceMeaning: string
}

export type CasePaymentTiming = {
  reservation?: RelativePaymentTiming
  remaining?: RelativePaymentTiming
}

export type AcceptanceProductRules = {
  preserveSourcePackageExactly?: true
  preserveSourceConclusionPlace?: string
  preserveSourceContractingPartyStructure?: true
}

export type MultiTemplateCaseDefinition = {
  id: string
  sourceDocx: 'source.docx'
  generationDate: string
  weddingFacts: DeepPartial<WeddingFacts>
  extras?: string[]
  userProvidedAnswers?: GenerationInput['userProvidedAnswers']
  paymentTiming?: CasePaymentTiming
  expectedProductRules?: AcceptanceProductRules
}

export type AcceptanceProvider = {
  transform(args: { input: GenerationInput; sourceDocx: ArrayBuffer; paymentTiming: CasePaymentTiming; productRules: AcceptanceProductRules }): Promise<{ missingInputs: MissingInput[]; blockOperations?: BlockOperation[]; providerMetadata?: ProviderResponseMetadata }>
  review(args: { source: GenerationInput['sourceDocument']; input: GenerationInput; candidate: SourceBlock[]; paymentTiming: CasePaymentTiming; productRules: AcceptanceProductRules }): Promise<ReviewResult & { providerMetadata?: ProviderResponseMetadata }>
}

export type AcceptanceResult = {
  caseId: string
  sourceFilename: string
  paymentTiming: CasePaymentTiming
  productRules: AcceptanceProductRules
  transformationRequestPrepared: boolean
  preflight: 'READY' | 'MISSING_INPUT' | 'CONFLICT_INPUT' | 'INVALID_CASE'
  missingInputs: MissingInput[]
  conflictFindings: ConflictInput[]
  transformationStatus: 'NOT_RUN_PROVIDER_DISABLED' | 'MISSING_INPUT' | 'COMPLETED' | 'FAILED'
  blockOperationCounts: { transformation: number; canonicalMoney: number }
  candidatePath: string | null
  candidateOpens: boolean | null
  reviewResult: 'NOT_RUN' | 'PASS' | 'FAIL'
  reviewFindings: string[]
  deterministicValidation: 'NOT_RUN' | 'PASS' | 'FAIL'
  deterministicFindings: string[]
  pageCount: number | null
  blankPagePresence: 'YES' | 'NO' | 'UNKNOWN' | 'NOT_RENDERED'
  protectedLegalWording: 'NOT_CHECKED' | 'PASS' | 'FAIL'
  packageServicePreservation: 'NOT_CHECKED' | 'PASS' | 'FAIL'
  oldDataStatus: 'NOT_CHECKED' | 'PASS' | 'FAIL'
  inventedFactStatus: 'MANUAL_REVIEW_REQUIRED'
  visualInspection: 'PENDING' | 'REQUIRED'
  providerCalls: { transformation: number; review: number; total: number; retries: number; repair: number }
  measurements: GenerationMeasurements | null
  overall: 'READY' | 'PASS' | 'FAIL' | 'MISSING_INPUT' | 'CONFLICT_INPUT'
}

export const ACCEPTANCE_PROVIDER_BUDGET = Object.freeze({ transformation: 1, review: 1, total: 2, retries: 0, repair: 0 })
export const REQUIRED_WEDDING_FACT_PATHS = [
  'bride.name', 'bride.phone', 'bride.email', 'groom.name', 'groom.phone', 'weddingDate', 'contractAddress',
  'contractValuePln', 'depositPln', 'remainingDueDate', 'locations.bridePreparations', 'locations.groomPreparations', 'locations.ceremony', 'locations.reception',
] as const

export type HarnessOptions = {
  casesRoot?: string
  outputRoot?: string
  provider?: AcceptanceProvider
  runId?: string
  metricsClock?: MetricsClock
}

const defaultCasesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases')

function ownedArrayBuffer(value: ArrayBufferLike): ArrayBuffer {
  const copy = new ArrayBuffer(value.byteLength)
  new Uint8Array(copy).set(new Uint8Array(value))
  return copy
}

function resultBase(caseId: string, sourceFilename = 'source.docx'): AcceptanceResult {
  return {
    caseId, sourceFilename, paymentTiming: {}, productRules: {}, transformationRequestPrepared: false, preflight: 'INVALID_CASE', missingInputs: [], conflictFindings: [],
    transformationStatus: 'NOT_RUN_PROVIDER_DISABLED', blockOperationCounts: { transformation: 0, canonicalMoney: 0 },
    candidatePath: null, candidateOpens: null, reviewResult: 'NOT_RUN', reviewFindings: [],
    deterministicValidation: 'NOT_RUN', deterministicFindings: [], pageCount: null, blankPagePresence: 'NOT_RENDERED',
    protectedLegalWording: 'NOT_CHECKED', packageServicePreservation: 'NOT_CHECKED', oldDataStatus: 'NOT_CHECKED',
    inventedFactStatus: 'MANUAL_REVIEW_REQUIRED', visualInspection: 'PENDING',
    providerCalls: { transformation: 0, review: 0, total: 0, retries: 0, repair: 0 }, measurements: null, overall: 'FAIL',
  }
}

function missingFacts(facts: DeepPartial<WeddingFacts>): MissingInput[] {
  return REQUIRED_WEDDING_FACT_PATHS.flatMap((field) => {
    const value = field.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, facts)
    if (value !== undefined && value !== null && value !== '') return []
    return [{ id: `case-fact:${field}`, label: field, explanation: `Required authoritative case fact is missing: ${field}.`, inputType: field.endsWith('Pln') ? 'number' as const : field === 'weddingDate' || field === 'remainingDueDate' ? 'date' as const : 'text' as const, required: true as const, sourceContext: 'multi-template acceptance case definition' }]
  })
}

function isCaseDefinition(value: unknown, caseId: string): value is MultiTemplateCaseDefinition {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<MultiTemplateCaseDefinition>
  const validTiming = (timing: RelativePaymentTiming | undefined) => timing === undefined || (
    timing.type === 'relative' && (timing.relativeTo === 'contract_conclusion' || timing.relativeTo === 'wedding') &&
    Number.isInteger(timing.offsetDays) && typeof timing.sourceMeaning === 'string' && timing.sourceMeaning.trim().length > 0
  )
  const paymentTiming = item.paymentTiming
  return item.id === caseId && item.sourceDocx === 'source.docx' && typeof item.generationDate === 'string' && !!item.weddingFacts && typeof item.weddingFacts === 'object' &&
    (!paymentTiming || (validTiming(paymentTiming.reservation) && validTiming(paymentTiming.remaining)))
}

async function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.once('error', reject)
    child.once('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `${command} exited ${code}`)))
  })
}

async function renderCandidate(candidatePath: string, outputDirectory: string): Promise<{ pdfPath: string; pageCount: number }> {
  await runCommand('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', outputDirectory, candidatePath])
  const pdfPath = path.join(outputDirectory, `${path.basename(candidatePath, '.docx')}.pdf`)
  const info = await runCommand('pdfinfo', [pdfPath])
  const pageCount = Number(info.match(/^Pages:\s+(\d+)/m)?.[1])
  if (!Number.isFinite(pageCount)) throw new Error('Unable to read rendered PDF page count')
  return { pdfPath, pageCount }
}

function packageStatus(source: SourceBlock[], candidate: SourceBlock[]): AcceptanceResult['packageServicePreservation'] {
  const packageBlocks = source.filter((block) => block.contentClass === 'package_service')
  return packageBlocks.every((block) => candidate.find((item) => item.blockId === block.blockId)?.text === block.text) ? 'PASS' : 'FAIL'
}

function oldDataStatus(findings: string[]): AcceptanceResult['oldDataStatus'] {
  return findings.some((item) => item.startsWith('Pozostała stara wartość:')) ? 'FAIL' : 'PASS'
}

export function formatAcceptanceReport(result: AcceptanceResult): string {
  return [
    `# Acceptance ${result.caseId}`,
    '',
    `- Overall: ${result.overall}`,
    `- Source: ${result.sourceFilename}`,
    `- Preflight: ${result.preflight}`,
    `- Reservation timing: ${result.paymentTiming.reservation?.sourceMeaning ?? 'not specified'}`,
    `- Remaining timing: ${result.paymentTiming.remaining?.sourceMeaning ?? 'not specified'}`,
    `- Product rules: package preservation ${result.productRules.preserveSourcePackageExactly ? 'required' : 'unspecified'}; source conclusion place ${result.productRules.preserveSourceConclusionPlace ?? 'unspecified'}; source party structure ${result.productRules.preserveSourceContractingPartyStructure ? 'authoritative' : 'unspecified'}`,
    `- Transformation request prepared: ${result.transformationRequestPrepared ? 'yes' : 'no'}`,
    `- Missing input fields: ${result.missingInputs.map((item) => item.label).join(', ') || 'none'}`,
    `- Conflict findings: ${result.conflictFindings.map((item) => item.id).join(', ') || 'none'}`,
    `- Transformation: ${result.transformationStatus}; operations ${result.blockOperationCounts.transformation}; canonical money blocks ${result.blockOperationCounts.canonicalMoney}`,
    `- Candidate: ${result.candidatePath ?? 'not generated'}`,
    `- Candidate opens: ${result.candidateOpens ?? 'not checked'}`,
    `- Review: ${result.reviewResult}${result.reviewFindings.length ? ` — ${result.reviewFindings.join('; ')}` : ''}`,
    `- Deterministic validation: ${result.deterministicValidation}${result.deterministicFindings.length ? ` — ${result.deterministicFindings.join('; ')}` : ''}`,
    `- Render: ${result.pageCount === null ? 'not rendered' : `${result.pageCount} pages; blank page ${result.blankPagePresence.toLowerCase()}`}`,
    `- Protected legal wording: ${result.protectedLegalWording}; package/service: ${result.packageServicePreservation}; old data: ${result.oldDataStatus}`,
    `- Invented facts: ${result.inventedFactStatus}; visual inspection: ${result.visualInspection}`,
    `- Provider calls: ${result.providerCalls.total} (transform ${result.providerCalls.transformation}, review ${result.providerCalls.review}, retries ${result.providerCalls.retries}, repair ${result.providerCalls.repair})`,
    `- Generation timing: ${result.measurements?.totalGenerationMs ?? 'not measured'} ms total; planning ${result.measurements?.stages.planningProviderMs ?? 'not run'} ms; review ${result.measurements?.stages.reviewProviderMs ?? 'not run'} ms`,
    '',
  ].join('\n')
}

async function writeReports(result: AcceptanceResult, outputDirectory: string, metrics?: ContractGenerationMetrics): Promise<void> {
  if (metrics) result.measurements = metrics.finish()
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(path.join(outputDirectory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  await writeFile(path.join(outputDirectory, 'result.md'), formatAcceptanceReport(result))
}

/** Loads and preflights one case. Provider execution is disabled unless an explicit local adapter is supplied. */
export async function runMultiTemplateAcceptance(caseId: string, options: HarnessOptions = {}): Promise<AcceptanceResult> {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(caseId)) throw new Error('Invalid case ID')
  const metrics = new ContractGenerationMetrics(options.metricsClock)
  metrics.startStage('preflight')
  const casesRoot = options.casesRoot ?? defaultCasesRoot
  const caseDirectory = path.resolve(casesRoot, caseId)
  const outputDirectory = path.resolve(options.outputRoot ?? path.join(process.cwd(), '.multi-template-acceptance-results'), caseId, options.runId ?? new Date().toISOString().replace(/[:.]/g, '-'))
  let definition: MultiTemplateCaseDefinition
  try {
    const raw = JSON.parse(await readFile(path.join(caseDirectory, 'input.json'), 'utf8')) as unknown
    if (!isCaseDefinition(raw, caseId)) throw new Error('Case definition must include matching id, source.docx, generationDate, and weddingFacts')
    definition = raw
  } catch (error) {
    const result = resultBase(caseId)
    result.deterministicFindings = [error instanceof Error ? error.message : String(error)]
    metrics.endStage('preflight')
    await writeReports(result, outputDirectory, metrics)
    return result
  }

  const result = resultBase(caseId, definition.sourceDocx)
  const sourcePath = path.resolve(caseDirectory, definition.sourceDocx)
  if (!sourcePath.startsWith(`${caseDirectory}${path.sep}`)) {
    result.deterministicFindings = ['Source DOCX must remain inside its case directory']
    metrics.endStage('preflight')
    await writeReports(result, outputDirectory, metrics)
    return result
  }
  let sourceBytes: Buffer
  try { sourceBytes = await readFile(sourcePath) } catch (error) {
    result.deterministicFindings = [error instanceof Error ? error.message : String(error)]
    metrics.endStage('preflight')
    await writeReports(result, outputDirectory, metrics)
    return result
  }
  const sourceArrayBuffer = ownedArrayBuffer(sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength))
  const sourceDocument = await readSource(sourceArrayBuffer, definition.sourceDocx)
  result.paymentTiming = definition.paymentTiming ?? {}
  result.productRules = definition.expectedProductRules ?? {}
  const caseWeddingFacts: DeepPartial<WeddingFacts> = { ...definition.weddingFacts }
  if (!caseWeddingFacts.remainingDueDate && definition.paymentTiming?.remaining) caseWeddingFacts.remainingDueDate = definition.paymentTiming.remaining.sourceMeaning
  const missing = missingFacts(caseWeddingFacts)
  if (missing.length) {
    metrics.endStage('preflight')
    result.preflight = 'MISSING_INPUT'; result.missingInputs = missing; result.transformationStatus = 'MISSING_INPUT'; result.overall = 'MISSING_INPUT'
    await writeReports(result, outputDirectory, metrics)
    return result
  }

  const wedding = caseWeddingFacts as WeddingFacts
  const input = makeInput({
    generationDate: definition.generationDate,
    sourceDocument,
    wedding,
    packagePolicy: { preserveSourcePackageExactly: true },
    extras: definition.extras ?? [],
    userProvidedAnswers: definition.userProvidedAnswers ?? [],
  })
  if (definition.expectedProductRules?.preserveSourceConclusionPlace && !input.conclusion.preservePlace) {
    input.conclusion = { ...input.conclusion, preservePlace: definition.expectedProductRules.preserveSourceConclusionPlace }
  }
  const conflicts = findInputConflicts(input)
  metrics.endStage('preflight')
  if (conflicts.length) {
    result.preflight = 'CONFLICT_INPUT'; result.conflictFindings = conflicts; result.overall = 'CONFLICT_INPUT'
    await writeReports(result, outputDirectory, metrics)
    return result
  }
  result.preflight = 'READY'
  result.transformationRequestPrepared = true
  if (!options.provider) {
    result.overall = 'READY'
    result.deterministicFindings = ['Provider execution disabled; transformation request prepared but not executed.']
    await writeReports(result, outputDirectory, metrics)
    return result
  }

  result.providerCalls.transformation = 1; result.providerCalls.total = 1
  let planned: Awaited<ReturnType<AcceptanceProvider['transform']>>
  metrics.startStage('planningProvider')
  try {
    planned = await options.provider.transform({ input, sourceDocx: sourceArrayBuffer, paymentTiming: definition.paymentTiming ?? {}, productRules: definition.expectedProductRules ?? {} })
    const latencyMs = metrics.endStage('planningProvider')
    const timestamps = metrics.snapshot().timestamps.stages.planningProvider!
    metrics.recordProviderCall('planning', latencyMs, timestamps.startedAt, timestamps.endedAt, planned.providerMetadata)
  } catch (error) {
    const latencyMs = metrics.endStage('planningProvider')
    const timestamps = metrics.snapshot().timestamps.stages.planningProvider!
    metrics.recordProviderCall('planning', latencyMs, timestamps.startedAt, timestamps.endedAt)
    result.transformationStatus = 'FAILED'; result.deterministicFindings = [error instanceof Error ? error.message : String(error)]; result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics); return result
  }
  if (planned.missingInputs.some((item) => item.required)) {
    result.transformationStatus = 'MISSING_INPUT'; result.missingInputs = planned.missingInputs; result.overall = 'MISSING_INPUT'
    await writeReports(result, outputDirectory, metrics); return result
  }
  metrics.startStage('planValidation')
  if (!planned.blockOperations) {
    metrics.endStage('planValidation')
    result.transformationStatus = 'FAILED'; result.deterministicFindings = ['Transformation result has no block operations']; result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics); return result
  }

  const conclusionPlanIssues = validatePlannedConclusion(input, planned.blockOperations)
  metrics.endStage('planValidation')
  if (conclusionPlanIssues.length) {
    result.transformationStatus = 'FAILED'; result.deterministicValidation = 'FAIL'; result.deterministicFindings = conclusionPlanIssues; result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics); return result
  }

  result.blockOperationCounts.transformation = planned.blockOperations.length
  const amounts = [input.financials.contractValuePln, input.financials.depositPln, input.financials.remainingPln]
  const operations = planned.blockOperations.map((operation) => 'finalText' in operation ? { ...operation, finalText: normalizeAuthoritativePlnText(operation.finalText, amounts) } : operation)
  const included = new Set(operations.flatMap((operation) => 'blockId' in operation ? [operation.blockId] : []))
  const canonical = normalizeAuthoritativeFinancialBlocks(sourceDocument.blocks, amounts).filter(({ block }) => !included.has(block.blockId))
  const allOperations: BlockOperation[] = [...operations, ...canonical.map(({ block, text }) => ({ blockId: block.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: text }))]
  result.blockOperationCounts.canonicalMoney = canonical.length
  let candidateBytes: ArrayBufferLike
  metrics.startStage('docxApply')
  try {
    candidateBytes = await applyBlockOperations(sourceArrayBuffer, allOperations)
    metrics.endStage('docxApply')
  } catch (error) {
    metrics.endStage('docxApply')
    result.transformationStatus = 'FAILED'; result.deterministicFindings = [error instanceof Error ? error.message : String(error)]; result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics); return result
  }
  const candidateArrayBuffer = ownedArrayBuffer(candidateBytes)
  const candidateBlocks = await readSource(candidateArrayBuffer, definition.sourceDocx)
  const candidateDirectory = path.join(outputDirectory, 'artifacts')
  await mkdir(candidateDirectory, { recursive: true })
  result.candidatePath = path.join(candidateDirectory, 'candidate.docx')
  await writeFile(result.candidatePath, Buffer.from(candidateArrayBuffer))
  result.candidateOpens = true
  result.transformationStatus = 'COMPLETED'
  try {
    const render = await renderCandidate(result.candidatePath, candidateDirectory)
    result.pageCount = render.pageCount; result.blankPagePresence = 'UNKNOWN'; result.visualInspection = 'REQUIRED'
  } catch (error) {
    result.transformationStatus = 'FAILED'; result.deterministicFindings = [error instanceof Error ? error.message : String(error)]; result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics); return result
  }

  result.providerCalls.review = 1; result.providerCalls.total = 2
  metrics.startStage('reviewProvider')
  try {
    const review = await options.provider.review({ source: sourceDocument, input, candidate: candidateBlocks.blocks, paymentTiming: definition.paymentTiming ?? {}, productRules: definition.expectedProductRules ?? {} })
    const latencyMs = metrics.endStage('reviewProvider')
    const timestamps = metrics.snapshot().timestamps.stages.reviewProvider!
    metrics.recordProviderCall('review', latencyMs, timestamps.startedAt, timestamps.endedAt, review.providerMetadata)
    result.reviewResult = review.status
    result.reviewFindings = review.status === 'FAIL' ? review.issues : []
    if (review.status === 'FAIL') { result.overall = 'FAIL'; await writeReports(result, outputDirectory, metrics); return result }
  } catch (error) {
    const latencyMs = metrics.endStage('reviewProvider')
    const timestamps = metrics.snapshot().timestamps.stages.reviewProvider!
    metrics.recordProviderCall('review', latencyMs, timestamps.startedAt, timestamps.endedAt)
    result.reviewResult = 'FAIL'; result.reviewFindings = [error instanceof Error ? error.message : String(error)]; result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics); return result
  }

  metrics.startStage('candidateValidation')
  const validation = await validateCandidate(sourceArrayBuffer, candidateArrayBuffer, input, allOperations)
  metrics.endStage('candidateValidation')
  result.deterministicFindings = validation
  result.deterministicValidation = validation.length ? 'FAIL' : 'PASS'
  result.protectedLegalWording = result.reviewResult === 'PASS' ? 'PASS' : 'FAIL'
  result.packageServicePreservation = packageStatus(sourceDocument.blocks, candidateBlocks.blocks)
  result.oldDataStatus = oldDataStatus(validation)
  result.overall = validation.length || result.protectedLegalWording === 'FAIL' || result.packageServicePreservation === 'FAIL' ? 'FAIL' : 'PASS'
  await writeReports(result, outputDirectory, metrics)
  return result
}
