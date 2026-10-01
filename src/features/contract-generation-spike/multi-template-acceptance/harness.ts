import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ContractGenerationMetrics, type GenerationMeasurements, type MetricsClock, type ProviderResponseMetadata } from '../contractGenerationMetrics'
import { buildContractGenerationInput, type ContractGenerationInput, type ContractGenerationInputOptions } from '../contractGenerationInput'
import type { Wedding } from '@/types/wedding'
import type { WeddingPlace } from '@/types/travel'
import type { GenerationResponse } from '../generationProtocol'
import {
  applyOptionBGenerationResponse,
  createGenerationSourceView,
  GENERATION_INSTRUCTIONS,
  GENERIC_CONTRACT_PRODUCT_RULES,
  readSource,
  validateOptionBInput,
  type WeddingFacts,
} from '../generator'

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

export type AcceptanceProductRules = {
  preserveSourcePackageExactly?: true
  preserveSourceConclusionPlace?: string
  preserveSourceContractingPartyStructure?: true
}

export type LegacyMultiTemplateCaseDefinition = {
  id: string
  sourceDocx: 'source.docx'
  generationDate: string
  weddingFacts: DeepPartial<WeddingFacts>
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

export type AcceptanceProvider = {
  generate(args: { instructions: string; sourceBlocks: ReturnType<typeof createGenerationSourceView>['blocks']; authorityContext: ContractGenerationInput; productRules: readonly string[] }): Promise<GenerationResponse & { providerMetadata?: ProviderResponseMetadata }>
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
  transformationStatus: 'NOT_RUN_PROVIDER_DISABLED' | 'MISSING_INPUT' | 'CONFLICT_INPUT' | 'COMPLETED' | 'FAILED'
  blockOperationCounts: { transformation: number; canonicalMoney: number }
  generationResultPath: string | null
  mechanicalDiffPath: string | null
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
  providerCalls: { inventory: number; transformation: number; review: number; total: number; retries: number; repair: number }
  measurements: GenerationMeasurements | null
  overall: 'READY' | 'READY_FOR_REVIEW' | 'PASS' | 'FAIL' | 'MISSING_INPUT' | 'CONFLICT_INPUT'
}

export const ACCEPTANCE_PROVIDER_BUDGET = Object.freeze({ inventory: 0, transformation: 1, review: 0, total: 1, retries: 0, repair: 0 })
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
    caseId, sourceFilename, productRules: GENERIC_CONTRACT_PRODUCT_RULES, normalizedInput: null, generationInputPath: null, transformationRequestPrepared: false, preflight: 'INVALID_CASE', missingInputs: [], conflictFindings: [],
    transformationStatus: 'NOT_RUN_PROVIDER_DISABLED', blockOperationCounts: { transformation: 0, canonicalMoney: 0 },
    generationResultPath: null, mechanicalDiffPath: null, candidatePath: null, candidateOpens: null, reviewResult: 'NOT_RUN', reviewFindings: [],
    deterministicValidation: 'NOT_RUN', deterministicFindings: [], pageCount: null, blankPagePresence: 'NOT_RENDERED',
    protectedLegalWording: 'NOT_CHECKED', packageServicePreservation: 'NOT_CHECKED', oldDataStatus: 'NOT_CHECKED',
    inventedFactStatus: 'MANUAL_REVIEW_REQUIRED', visualInspection: 'PENDING',
    providerCalls: { inventory: 0, transformation: 0, review: 0, total: 0, retries: 0, repair: 0 }, measurements: null, overall: 'FAIL',
  }
}

function materializeWeddingFacts(facts: DeepPartial<WeddingFacts>): WeddingFacts {
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
    `- Transformation request prepared: ${result.transformationRequestPrepared ? 'yes' : 'no'}`,
    `- Missing inputs: ${result.missingInputs.join('; ') || 'none'}`,
    `- Conflict findings: ${result.conflictFindings.join('; ') || 'none'}`,
    `- Transformation: ${result.transformationStatus}; operations ${result.blockOperationCounts.transformation}; canonical money blocks ${result.blockOperationCounts.canonicalMoney}`,
    `- Candidate: ${result.candidatePath ?? 'not generated'}`,
    `- Candidate opens: ${result.candidateOpens ?? 'not checked'}`,
    `- Review: ${result.reviewResult}${result.reviewFindings.length ? ` — ${result.reviewFindings.join('; ')}` : ''}`,
    `- Deterministic validation: ${result.deterministicValidation}${result.deterministicFindings.length ? ` — ${result.deterministicFindings.join('; ')}` : ''}`,
    `- Render: ${result.pageCount === null ? 'not rendered' : `${result.pageCount} pages; blank page ${result.blankPagePresence.toLowerCase()}`}`,
    `- Protected legal wording: ${result.protectedLegalWording}; package/service: ${result.packageServicePreservation}; old data: ${result.oldDataStatus}`,
    `- Invented facts: ${result.inventedFactStatus}; visual inspection: ${result.visualInspection}`,
    `- Provider calls: ${result.providerCalls.total} (inventory ${result.providerCalls.inventory}, transform ${result.providerCalls.transformation}, review ${result.providerCalls.review}, retries ${result.providerCalls.retries}, repair ${result.providerCalls.repair})`,
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

  result.providerCalls.transformation = 1
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
    result.transformationStatus = 'FAILED'
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
    result.transformationStatus = 'MISSING_INPUT'
    result.missingInputs = generatedResult.missingInputs
    result.overall = 'MISSING_INPUT'
    await writeReports(result, outputDirectory, metrics)
    return result
  }
  if (generatedResult.status === 'CONFLICT_INPUT') {
    result.transformationStatus = 'CONFLICT_INPUT'
    result.conflictFindings = generatedResult.conflicts
    result.overall = 'CONFLICT_INPUT'
    await writeReports(result, outputDirectory, metrics)
    return result
  }
  if (generatedResult.status === 'FAILED') {
    result.transformationStatus = 'FAILED'
    result.deterministicValidation = 'FAIL'
    result.deterministicFindings = generatedResult.issues
    result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics)
    return result
  }

  result.blockOperationCounts.transformation = generatedResult.edits.length
  result.transformationStatus = 'COMPLETED'
  result.deterministicValidation = 'PASS'
  result.candidateOpens = true
  result.mechanicalDiffPath = path.join(outputDirectory, 'mechanical-diff.json')
  await writeFile(result.mechanicalDiffPath, `${JSON.stringify(generatedResult.changedBlocks, null, 2)}\n`)
  const candidateDirectory = path.join(outputDirectory, 'artifacts')
  await mkdir(candidateDirectory, { recursive: true })
  result.candidatePath = path.join(candidateDirectory, 'candidate.docx')
  await writeFile(result.candidatePath, Buffer.from(generatedResult.candidateBytes))
  try {
    const render = await renderCandidate(result.candidatePath, candidateDirectory)
    result.pageCount = render.pageCount
    result.blankPagePresence = 'UNKNOWN'
    result.visualInspection = 'REQUIRED'
  } catch (error) {
    result.transformationStatus = 'FAILED'
    result.deterministicValidation = 'FAIL'
    result.deterministicFindings = [error instanceof Error ? error.message : String(error)]
    result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics)
    return result
  }
  result.overall = 'READY_FOR_REVIEW'
  await writeReports(result, outputDirectory, metrics)
  return result
}
