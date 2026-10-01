import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ContractGenerationMetrics, type GenerationMeasurements, type MetricsClock, type ProviderResponseMetadata } from '../contractGenerationMetrics'
import { buildContractGenerationInput, type ContractGenerationInput, type ContractGenerationInputOptions } from '../contractGenerationInput'
import type { Wedding } from '@/types/wedding'
import type { WeddingPlace } from '@/types/travel'
import { isReviewResponse, type GenerationResponse, type ReviewResponse } from '../generationProtocol'
import {
  applyOptionBGenerationResponse,
  createGenerationSourceView,
  GENERATION_INSTRUCTIONS,
  GENERIC_CONTRACT_PRODUCT_RULES,
  REVIEW_INSTRUCTIONS,
  CONFLICT_REVIEW_INSTRUCTIONS,
  readSource,
  validateOptionBInput,
  type ChangedBlock,
  type GenerationSourceBlock,
} from '../generator'

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }
type LegacyFixtureWeddingFacts = {
  bride: { name: string; phone: string; email: string }
  groom: { name: string; phone: string }
  weddingDate: string
  contractAddress: string
  contractValuePln: number
  depositPln: number
  remainingDueDate: string
  locations: { bridePreparations: string; groomPreparations: string; ceremony: string; reception: string }
}

export type AcceptanceProductRules = {
  preserveSourcePackageExactly?: true
  preserveSourceConclusionPlace?: string
  preserveSourceContractingPartyStructure?: true
}

export type LegacyMultiTemplateCaseDefinition = {
  id: string
  sourceDocx: 'source.docx'
  generationDate: string
  weddingFacts: DeepPartial<LegacyFixtureWeddingFacts>
  extras?: string[]
  userProvidedAnswers?: ContractGenerationInputOptions['userProvidedAnswers']
  expectedProductRules?: AcceptanceProductRules
}

export type ContractGenerationInputCaseDefinition = {
  id: string
  sourceDocx: 'source.docx'
  authoritativeInput: ContractGenerationInputOptions
  expectedProductRules?: AcceptanceProductRules
}

export type MultiTemplateCaseDefinition = LegacyMultiTemplateCaseDefinition | ContractGenerationInputCaseDefinition

type ReviewerVisibleBlock = Pick<GenerationSourceBlock, 'kind' | 'text'>

export type AcceptanceProvider = {
  generate(args: { instructions: string; sourceBlocks: ReturnType<typeof createGenerationSourceView>['blocks']; authorityContext: ContractGenerationInput; productRules: readonly string[] }): Promise<GenerationResponse & { providerMetadata?: ProviderResponseMetadata }>
  review(args: { instructions: string; source: ReviewerVisibleBlock[]; authorityContext: ContractGenerationInput; productRules: readonly string[]; candidate: ReviewerVisibleBlock[]; mechanicalDiff: ChangedBlock[] }): Promise<ReviewResponse & { providerMetadata?: ProviderResponseMetadata }>
  reviewConflict(args: { instructions: string; source: ReviewerVisibleBlock[]; authorityContext: ContractGenerationInput; productRules: readonly string[]; generationOutcome: Extract<GenerationResponse, { status: 'CONFLICT_INPUT' }> }): Promise<ReviewResponse & { providerMetadata?: ProviderResponseMetadata }>
}

export type AcceptanceResult = {
  caseId: string
  sourceFilename: string
  productRules: readonly string[]
  normalizedInput: ContractGenerationInput | null
  generationInputPath: string | null
  transformationRequestPrepared: boolean
  preflight: 'READY' | 'MISSING_INPUT' | 'CONFLICT_INPUT' | 'INVALID_CASE'
  missingInputs: string[]
  conflictFindings: string[]
  generationStatus: 'NOT_RUN_PROVIDER_DISABLED' | 'MISSING_INPUT' | 'CONFLICT_INPUT' | 'COMPLETED' | 'FAILED'
  blockOperationCounts: { generation: number }
  generationResultPath: string | null
  semanticReviewRequestPath: string | null
  mechanicalDiffPath: string | null
  candidatePath: string | null
  candidateAccepted: boolean
  acceptedCandidatePath: string | null
  candidateOpens: boolean | null
  reviewResult: 'NOT_RUN' | 'PASS' | 'FAIL'
  reviewFindings: string[]
  reviewResultPath: string | null
  deterministicValidation: 'NOT_RUN' | 'PASS' | 'FAIL'
  deterministicFindings: string[]
  pageCount: number | null
  blankPagePresence: 'YES' | 'NO' | 'UNKNOWN' | 'NOT_RENDERED'
  renderFindings: string[]
  visualInspection: 'PENDING' | 'REQUIRED'
  providerCalls: { generator: number; reviewer: number; total: number }
  measurements: GenerationMeasurements | null
  overall: 'READY' | 'PASS' | 'FAIL' | 'MISSING_INPUT' | 'CONFLICT_INPUT'
}

export const ACCEPTANCE_PROVIDER_BUDGET = Object.freeze({ generator: 1, reviewer: 1, total: 2 })
export type HarnessOptions = {
  casesRoot?: string
  outputRoot?: string
  provider?: AcceptanceProvider
  runId?: string
  metricsClock?: MetricsClock
  render?: (candidatePath: string, outputDirectory: string) => Promise<{ pdfPath: string; pageCount: number }>
}

const defaultCasesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases')

function ownedArrayBuffer(value: ArrayBufferLike): ArrayBuffer {
  const copy = new ArrayBuffer(value.byteLength)
  new Uint8Array(copy).set(new Uint8Array(value))
  return copy
}

function resultBase(caseId: string, sourceFilename = 'source.docx'): AcceptanceResult {
  return {
    caseId, sourceFilename, productRules: GENERIC_CONTRACT_PRODUCT_RULES, normalizedInput: null, generationInputPath: null, transformationRequestPrepared: false, preflight: 'INVALID_CASE', missingInputs: [], conflictFindings: [],
    generationStatus: 'NOT_RUN_PROVIDER_DISABLED', blockOperationCounts: { generation: 0 },
    generationResultPath: null, semanticReviewRequestPath: null, mechanicalDiffPath: null, candidatePath: null, candidateAccepted: false, acceptedCandidatePath: null, candidateOpens: null,
    reviewResult: 'NOT_RUN', reviewFindings: [], reviewResultPath: null,
    deterministicValidation: 'NOT_RUN', deterministicFindings: [], pageCount: null, blankPagePresence: 'NOT_RENDERED', renderFindings: [], visualInspection: 'PENDING',
    providerCalls: { generator: 0, reviewer: 0, total: 0 }, measurements: null, overall: 'FAIL',
  }
}

function materializeWeddingFacts(facts: DeepPartial<LegacyFixtureWeddingFacts>): LegacyFixtureWeddingFacts {
  return {
    bride: { name: facts.bride?.name ?? '', phone: facts.bride?.phone ?? '', email: facts.bride?.email ?? '' },
    groom: { name: facts.groom?.name ?? '', phone: facts.groom?.phone ?? '' },
    weddingDate: facts.weddingDate ?? '',
    contractAddress: facts.contractAddress ?? '',
    contractValuePln: facts.contractValuePln ?? 0,
    depositPln: facts.depositPln ?? 0,
    remainingDueDate: facts.remainingDueDate ?? '',
    locations: {
      bridePreparations: facts.locations?.bridePreparations ?? '',
      groomPreparations: facts.locations?.groomPreparations ?? '',
      ceremony: facts.locations?.ceremony ?? '',
      reception: facts.locations?.reception ?? '',
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isCaseDefinition(value: unknown, caseId: string): value is MultiTemplateCaseDefinition {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.id !== caseId || item.sourceDocx !== 'source.docx') return false
  if (isRecord(item.authoritativeInput)) {
    return typeof item.authoritativeInput.generationDate === 'string'
      && isRecord(item.authoritativeInput.wedding)
      && Array.isArray(item.authoritativeInput.weddingPlaces)
      && Array.isArray(item.authoritativeInput.extras)
  }
  return typeof item.generationDate === 'string' && isRecord(item.weddingFacts)
}

function legacyDateToIso(value: string): string | undefined {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const localized = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed)
  return localized ? `${localized[3]}-${localized[2]}-${localized[1]}` : undefined
}

function legacyCaseOptions(definition: LegacyMultiTemplateCaseDefinition): ContractGenerationInputOptions {
  const facts = materializeWeddingFacts(definition.weddingFacts)
  if ((definition.extras ?? []).length) throw new Error('Legacy fixture extras need structured wedding extra-service snapshots before adapter normalization.')
  const weddingId = `legacy-${definition.id}`
  const timestamp = '1970-01-01T00:00:00.000Z'
  const wedding: Wedding = {
    id: weddingId,
    couple: {
      partner1: facts.bride.name,
      partner2: facts.groom.name,
      partner1Phone: facts.bride.phone,
      partner1Email: facts.bride.email,
      partner2Phone: facts.groom.phone,
      email: facts.bride.email,
      phone: facts.bride.phone,
      venue: '',
      city: '',
    },
    date: facts.weddingDate,
    status: 'active',
    workflowStage: 'contract',
    packageName: '',
    price: facts.contractValuePln,
    depositAmount: facts.depositPln,
    currency: 'PLN',
    packageItems: [],
    travelFeeStatus: 'unresolved',
    travelFeeAmount: 0,
    finalPaymentDueDate: legacyDateToIso(facts.remainingDueDate),
    finalPaymentTerms: null,
    payments: [],
    finances: [],
    questionnaires: { contractData: { status: 'completed' }, weddingQuestionnaire: { status: 'not_sent' } },
    contract: { status: 'none' },
    checklist: [],
    schedule: [],
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '',
    createdAt: timestamp,
  }
  const placeValues: Array<[WeddingPlace['role'], string]> = [
    ['bride_preparation', facts.locations.bridePreparations],
    ['groom_preparation', facts.locations.groomPreparations],
    ['ceremony', facts.locations.ceremony],
    ['reception', facts.locations.reception],
  ]
  const weddingPlaces: WeddingPlace[] = placeValues.flatMap(([role, formattedAddress], sortOrder) => formattedAddress.trim() ? [{
    id: `${weddingId}-place-${role}`,
    weddingId,
    role,
    label: formattedAddress,
    placeId: null,
    formattedAddress,
    latitude: null,
    longitude: null,
    sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp,
  }] : [])
  return {
    wedding,
    weddingPlaces,
    extras: [],
    generationDate: definition.generationDate,
    userProvidedAnswers: definition.userProvidedAnswers ?? [],
    genericContractAddress: facts.contractAddress,
    participantAssociations: [
      ...(facts.bride.name.trim() ? [{ participant: 'partner1' as const, association: { value: 'bride', source: 'case input weddingFacts.bride' } }] : []),
      ...(facts.groom.name.trim() ? [{ participant: 'partner2' as const, association: { value: 'groom', source: 'case input weddingFacts.groom' } }] : []),
    ],
  }
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

export function formatAcceptanceReport(result: AcceptanceResult): string {
  return [
    `# Acceptance ${result.caseId}`,
    '',
    `- Overall: ${result.overall}`,
    `- Source: ${result.sourceFilename}`,
    `- Preflight: ${result.preflight}`,
    `- Normalized ContractGenerationInput: ${result.normalizedInput ? 'persisted in result.json' : 'not built'}`,
    `- Generation input: ${result.generationInputPath ?? 'not prepared'}`,
    `- Product rules: ${result.productRules.join('; ')}`,
    `- Generation request prepared: ${result.transformationRequestPrepared ? 'yes' : 'no'}`,
    `- Missing inputs: ${result.missingInputs.join('; ') || 'none'}`,
    `- Conflict findings: ${result.conflictFindings.join('; ') || 'none'}`,
    `- Generation: ${result.generationStatus}; block edits ${result.blockOperationCounts.generation}`,
    `- Non-READY semantic review request: ${result.semanticReviewRequestPath ?? 'not prepared'}`,
    `- Candidate: ${result.candidatePath ?? 'not generated'}`,
    `- Accepted candidate: ${result.acceptedCandidatePath ?? 'none'}`,
    `- Candidate opens: ${result.candidateOpens ?? 'not checked'}`,
    `- Review: ${result.reviewResult}${result.reviewFindings.length ? ` — ${result.reviewFindings.join('; ')}` : ''}`,
    `- Deterministic validation: ${result.deterministicValidation}${result.deterministicFindings.length ? ` — ${result.deterministicFindings.join('; ')}` : ''}`,
    `- Render: ${result.pageCount === null ? 'not rendered' : `${result.pageCount} pages; blank page ${result.blankPagePresence.toLowerCase()}`}`,
    `- Render findings: ${result.renderFindings.join('; ') || 'none'}; visual inspection: ${result.visualInspection}`,
    `- Provider calls: ${result.providerCalls.total} (generator ${result.providerCalls.generator}, reviewer ${result.providerCalls.reviewer})`,
    `- Generation timing: ${result.measurements?.totalGenerationMs ?? 'not measured'} ms total; generation call ${result.measurements?.stages.generationProviderMs ?? 'not run'} ms; review ${result.measurements?.stages.reviewProviderMs ?? 'not run'} ms`,
    ...(result.normalizedInput ? ['', '```json', JSON.stringify(result.normalizedInput, null, 2), '```'] : []),
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
    if (!isCaseDefinition(raw, caseId)) throw new Error('Case definition must include matching id and source.docx, plus authoritativeInput or the temporary legacy generationDate/weddingFacts fields')
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
  result.productRules = GENERIC_CONTRACT_PRODUCT_RULES
  const authoritativeOptions = 'authoritativeInput' in definition ? definition.authoritativeInput : legacyCaseOptions(definition)
  const normalizedInput = buildContractGenerationInput(authoritativeOptions)
  result.normalizedInput = normalizedInput
  metrics.endStage('preflight')
  result.preflight = 'READY'
  result.transformationRequestPrepared = true
  const generationInputPath = path.join(outputDirectory, 'generation-input.json')
  result.generationInputPath = generationInputPath
  await mkdir(outputDirectory, { recursive: true })
  const inputIssues = validateOptionBInput(normalizedInput)
  if (inputIssues.length) {
    result.deterministicValidation = 'FAIL'
    result.deterministicFindings = inputIssues
    result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics)
    return result
  }
  const sourceView = createGenerationSourceView(sourceDocument)
  await writeFile(generationInputPath, `${JSON.stringify({ sourceBlocks: sourceView.blocks, authorityContext: normalizedInput, productRules: GENERIC_CONTRACT_PRODUCT_RULES }, null, 2)}\n`)
  if (!options.provider) {
    result.overall = 'READY'
    result.deterministicFindings = ['Provider execution disabled; normalized generation input prepared but not executed.']
    await writeReports(result, outputDirectory, metrics)
    return result
  }

  result.providerCalls.generator = 1
  result.providerCalls.total = 1
  metrics.startStage('generationProvider')
  let generated: GenerationResponse & { providerMetadata?: ProviderResponseMetadata }
  try {
    generated = await options.provider.generate({
      instructions: GENERATION_INSTRUCTIONS,
      sourceBlocks: sourceView.blocks,
      authorityContext: normalizedInput,
      productRules: GENERIC_CONTRACT_PRODUCT_RULES,
    })
  } catch (error) {
    const latencyMs = metrics.endStage('generationProvider')
    const timestamps = metrics.snapshot().timestamps.stages.generationProvider!
    metrics.recordProviderCall('generation', latencyMs, timestamps.startedAt, timestamps.endedAt)
    result.generationStatus = 'FAILED'
    result.deterministicFindings = [error instanceof Error ? error.message : String(error)]
    result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics)
    return result
  }
  const latencyMs = metrics.endStage('generationProvider')
  const timestamps = metrics.snapshot().timestamps.stages.generationProvider!
  const { providerMetadata, ...response } = generated
  metrics.recordProviderCall('generation', latencyMs, timestamps.startedAt, timestamps.endedAt, providerMetadata)
  result.generationResultPath = path.join(outputDirectory, 'generation-result.json')
  await writeFile(result.generationResultPath, `${JSON.stringify(response, null, 2)}\n`)

  const generatedResult = await applyOptionBGenerationResponse(sourceArrayBuffer, sourceDocument, normalizedInput, sourceView.sourceBlockIds, response)
  if (generatedResult.status === 'MISSING_INPUT') {
    result.missingInputs = generatedResult.missingInputs
    result.generationStatus = 'MISSING_INPUT'
    result.overall = 'MISSING_INPUT'
    await writeReports(result, outputDirectory, metrics)
    return result
  }
  if (generatedResult.status === 'CONFLICT_INPUT') {
    result.conflictFindings = generatedResult.conflicts
  }
  if (generatedResult.status === 'CONFLICT_INPUT') {
    const reviewRequest = {
      instructions: CONFLICT_REVIEW_INSTRUCTIONS,
      source: sourceDocument.blocks.map(({ kind, text }) => ({ kind, text })),
      authorityContext: normalizedInput,
      productRules: GENERIC_CONTRACT_PRODUCT_RULES,
      generationOutcome: generatedResult,
    }
    result.semanticReviewRequestPath = path.join(outputDirectory, 'semantic-review-request.json')
    await writeFile(result.semanticReviewRequestPath, `${JSON.stringify(reviewRequest, null, 2)}\n`)
    result.providerCalls.reviewer = 1
    result.providerCalls.total = 2
    metrics.startStage('reviewProvider')
    let semanticReview: ReviewResponse & { providerMetadata?: ProviderResponseMetadata }
    try {
      semanticReview = await options.provider.reviewConflict(reviewRequest)
    } catch (error) {
      const reviewMs = metrics.endStage('reviewProvider')
      const reviewTimestamps = metrics.snapshot().timestamps.stages.reviewProvider!
      metrics.recordProviderCall('review', reviewMs, reviewTimestamps.startedAt, reviewTimestamps.endedAt)
      result.reviewResult = 'FAIL'
      result.reviewFindings = [error instanceof Error ? error.message : String(error)]
      result.reviewResultPath = path.join(outputDirectory, 'review-result.json')
      await writeFile(result.reviewResultPath, `${JSON.stringify({ status: 'FAIL', findings: result.reviewFindings }, null, 2)}\n`)
      result.generationStatus = 'FAILED'
      result.overall = 'FAIL'
      await writeReports(result, outputDirectory, metrics)
      return result
    }
    const reviewMs = metrics.endStage('reviewProvider')
    const reviewTimestamps = metrics.snapshot().timestamps.stages.reviewProvider!
    const { providerMetadata: reviewMetadata, ...semanticReviewResponse } = semanticReview
    metrics.recordProviderCall('review', reviewMs, reviewTimestamps.startedAt, reviewTimestamps.endedAt, reviewMetadata)
    result.reviewResultPath = path.join(outputDirectory, 'review-result.json')
    if (!isReviewResponse(semanticReviewResponse)) {
      result.reviewResult = 'FAIL'
      result.reviewFindings = ['Semantic reviewer response does not match the strict ReviewResponse protocol.']
      await writeFile(result.reviewResultPath, `${JSON.stringify({ status: 'FAIL', findings: result.reviewFindings }, null, 2)}\n`)
      result.generationStatus = 'FAILED'
      result.overall = 'FAIL'
      await writeReports(result, outputDirectory, metrics)
      return result
    }
    await writeFile(result.reviewResultPath, `${JSON.stringify(semanticReviewResponse, null, 2)}\n`)
    if (semanticReviewResponse.status === 'FAIL') {
      result.reviewResult = 'FAIL'
      result.reviewFindings = semanticReviewResponse.findings
      result.generationStatus = 'FAILED'
      result.overall = 'FAIL'
      await writeReports(result, outputDirectory, metrics)
      return result
    }
    result.reviewResult = 'PASS'
    result.generationStatus = generatedResult.status
    result.overall = generatedResult.status
    await writeReports(result, outputDirectory, metrics)
    return result
  }
  if (generatedResult.status === 'FAILED') {
    result.generationStatus = 'FAILED'
    result.deterministicValidation = 'FAIL'
    result.deterministicFindings = generatedResult.issues
    result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics)
    return result
  }

  result.blockOperationCounts.generation = generatedResult.edits.length
  result.generationStatus = 'COMPLETED'
  result.deterministicValidation = 'PASS'
  result.candidateOpens = true
  result.mechanicalDiffPath = path.join(outputDirectory, 'mechanical-diff.json')
  await writeFile(result.mechanicalDiffPath, `${JSON.stringify(generatedResult.changedBlocks, null, 2)}\n`)
  const candidateDirectory = path.join(outputDirectory, 'artifacts')
  await mkdir(candidateDirectory, { recursive: true })
  result.candidatePath = path.join(candidateDirectory, 'candidate.docx')
  await writeFile(result.candidatePath, Buffer.from(generatedResult.candidateBytes))
  result.providerCalls.reviewer = 1
  result.providerCalls.total = 2
  metrics.startStage('reviewProvider')
  let reviewed: ReviewResponse & { providerMetadata?: ProviderResponseMetadata }
  try {
    reviewed = await options.provider.review({
      instructions: REVIEW_INSTRUCTIONS,
      source: sourceDocument.blocks.map(({ kind, text }) => ({ kind, text })),
      authorityContext: normalizedInput,
      productRules: GENERIC_CONTRACT_PRODUCT_RULES,
      candidate: generatedResult.candidate.blocks.map(({ kind, text }) => ({ kind, text })),
      mechanicalDiff: generatedResult.changedBlocks,
    })
  } catch (error) {
    const reviewMs = metrics.endStage('reviewProvider')
    const reviewTimestamps = metrics.snapshot().timestamps.stages.reviewProvider!
    metrics.recordProviderCall('review', reviewMs, reviewTimestamps.startedAt, reviewTimestamps.endedAt)
    result.reviewResult = 'FAIL'
    result.reviewFindings = [error instanceof Error ? error.message : String(error)]
    result.reviewResultPath = path.join(outputDirectory, 'review-result.json')
    await writeFile(result.reviewResultPath, `${JSON.stringify({ status: 'FAIL', findings: result.reviewFindings }, null, 2)}\n`)
    result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics)
    return result
  }
  const reviewMs = metrics.endStage('reviewProvider')
  const reviewTimestamps = metrics.snapshot().timestamps.stages.reviewProvider!
  const { providerMetadata: reviewMetadata, ...reviewResponse } = reviewed
  metrics.recordProviderCall('review', reviewMs, reviewTimestamps.startedAt, reviewTimestamps.endedAt, reviewMetadata)
  result.reviewResultPath = path.join(outputDirectory, 'review-result.json')
  if (!isReviewResponse(reviewResponse)) {
    result.reviewResult = 'FAIL'
    result.reviewFindings = ['Reviewer response does not match the strict ReviewResponse protocol.']
    await writeFile(result.reviewResultPath, `${JSON.stringify({ status: 'FAIL', findings: result.reviewFindings }, null, 2)}\n`)
    result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics)
    return result
  }
  await writeFile(result.reviewResultPath, `${JSON.stringify(reviewResponse, null, 2)}\n`)
  if (reviewResponse.status === 'FAIL') {
    result.reviewResult = 'FAIL'
    result.reviewFindings = reviewResponse.findings
    result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics)
    return result
  }
  result.reviewResult = 'PASS'
  result.candidateAccepted = true
  result.acceptedCandidatePath = result.candidatePath
  result.overall = 'PASS'
  try {
    const render = await (options.render ?? renderCandidate)(result.candidatePath, candidateDirectory)
    result.pageCount = render.pageCount
    result.blankPagePresence = 'UNKNOWN'
    result.visualInspection = 'REQUIRED'
  } catch (error) {
    result.renderFindings = [error instanceof Error ? error.message : String(error)]
    result.visualInspection = 'REQUIRED'
  }
  await writeReports(result, outputDirectory, metrics)
  return result
}
