import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { applyBlockOperations, type BlockOperation } from '../blockDocxEditor'
import { ContractGenerationMetrics, type GenerationMeasurements, type MetricsClock, type ProviderResponseMetadata } from '../contractGenerationMetrics'
import { buildContractGenerationInput, type ContractGenerationInput, type ContractGenerationInputOptions } from '../contractGenerationInput'
import { PLANNER_AUTHORITY_CONTEXT_DESCRIPTION, serializePlannerAuthorityContext } from '../plannerProviderBoundary'
import type { Wedding } from '@/types/wedding'
import type { WeddingPlace } from '@/types/travel'
import {
  computeChangedBlockDiff,
  applyMetadataFactChanges,
  normalizeAuthoritativeFinancialBlocks,
  normalizeAuthoritativePlnText,
  readSource,
  runSourceInventory,
  resolveInventoryOccurrences,
  sanitizePlannerOperations,
  validateAuthorityGate,
  type PlanResult,
  type SourceInventory,
  validateCandidate,
  type ConflictInput,
  type MissingInput,
  type ReviewResult,
  type ResolvedInventoryOccurrence,
  type SourceBlock,
  type SourceDocument,
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
  inventory(args: { source: SourceDocument; sourceDocx: ArrayBuffer }): Promise<SourceInventory & { providerMetadata?: ProviderResponseMetadata }>
  transform(args: { authorityContextDescription: string; authorityContext: ContractGenerationInput; inventory: SourceInventory; sourceDocx: ArrayBuffer; productRules: AcceptanceProductRules }): Promise<PlanResult & { providerMetadata?: ProviderResponseMetadata }>
  review(args: { source: SourceDocument; authorityContextDescription: string; authorityContext: ContractGenerationInput; inventory: SourceInventory; resolvedInventoryOccurrences: ResolvedInventoryOccurrence[]; factChanges: PlanResult['factChanges']; retainedLiterals: PlanResult['retainedLiterals']; candidate: SourceBlock[]; changedBlocks: ReturnType<typeof computeChangedBlockDiff>; productRules: AcceptanceProductRules }): Promise<ReviewResult & { providerMetadata?: ProviderResponseMetadata }>
}

export type AcceptanceResult = {
  caseId: string
  sourceFilename: string
  productRules: AcceptanceProductRules
  normalizedInput: ContractGenerationInput | null
  plannerAuthorityContextPath: string | null
  transformationRequestPrepared: boolean
  preflight: 'READY' | 'MISSING_INPUT' | 'CONFLICT_INPUT' | 'INVALID_CASE'
  missingInputs: MissingInput[]
  conflictFindings: ConflictInput[]
  transformationStatus: 'NOT_RUN_PROVIDER_DISABLED' | 'MISSING_INPUT' | 'COMPLETED' | 'FAILED'
  blockOperationCounts: { transformation: number; canonicalMoney: number }
  planningResultPath: string | null
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
  overall: 'READY' | 'PASS' | 'FAIL' | 'MISSING_INPUT' | 'CONFLICT_INPUT'
}

export const ACCEPTANCE_PROVIDER_BUDGET = Object.freeze({ inventory: 1, transformation: 1, review: 1, total: 3, retries: 0, repair: 0 })
export type HarnessOptions = {
  casesRoot?: string
  outputRoot?: string
  provider?: AcceptanceProvider
  runId?: string
  metricsClock?: MetricsClock
}

type PersistedPlanningResult = {
  status: 'READY' | 'MISSING_INPUT' | 'CONFLICT_INPUT' | 'FAILED'
  missingInputs: MissingInput[]
  conflicts: ConflictInput[]
  factChanges?: PlanResult['factChanges']
  retainedLiterals?: PlanResult['retainedLiterals']
  sourceInventory?: SourceInventory
  operations: BlockOperation[] | null
  operationCount: number | null
  rawOperations?: BlockOperation[]
  rawOperationCount?: number
  discardedOperationCount?: number
  rawProviderResult?: { missingInputs: MissingInput[]; conflicts: ConflictInput[]; factChanges: PlanResult['factChanges']; retainedLiterals: PlanResult['retainedLiterals']; operations: BlockOperation[] }
  model?: string
  responseModel?: string
  planValidation: 'NOT_RUN' | 'PASS' | 'FAIL'
  planValidationFindings: string[]
}

const defaultCasesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases')

function ownedArrayBuffer(value: ArrayBufferLike): ArrayBuffer {
  const copy = new ArrayBuffer(value.byteLength)
  new Uint8Array(copy).set(new Uint8Array(value))
  return copy
}

function resultBase(caseId: string, sourceFilename = 'source.docx'): AcceptanceResult {
  return {
    caseId, sourceFilename, productRules: {}, normalizedInput: null, plannerAuthorityContextPath: null, transformationRequestPrepared: false, preflight: 'INVALID_CASE', missingInputs: [], conflictFindings: [],
    transformationStatus: 'NOT_RUN_PROVIDER_DISABLED', blockOperationCounts: { transformation: 0, canonicalMoney: 0 },
    planningResultPath: null, candidatePath: null, candidateOpens: null, reviewResult: 'NOT_RUN', reviewFindings: [],
    deterministicValidation: 'NOT_RUN', deterministicFindings: [], pageCount: null, blankPagePresence: 'NOT_RENDERED',
    protectedLegalWording: 'NOT_CHECKED', packageServicePreservation: 'NOT_CHECKED', oldDataStatus: 'NOT_CHECKED',
    inventedFactStatus: 'MANUAL_REVIEW_REQUIRED', visualInspection: 'PENDING',
    providerCalls: { inventory: 0, transformation: 0, review: 0, total: 0, retries: 0, repair: 0 }, measurements: null, overall: 'FAIL',
  }
}

async function persistPlanningResult(outputDirectory: string, result: PersistedPlanningResult): Promise<string> {
  await mkdir(outputDirectory, { recursive: true })
  const artifactPath = path.join(outputDirectory, 'planning-result.json')
  await writeFile(artifactPath, `${JSON.stringify(result, null, 2)}\n`)
  return artifactPath
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

function oldDataStatus(findings: string[]): AcceptanceResult['oldDataStatus'] {
  return findings.some((item) => item.startsWith('Declared old literal remains:')) ? 'FAIL' : 'PASS'
}

export function formatAcceptanceReport(result: AcceptanceResult): string {
  return [
    `# Acceptance ${result.caseId}`,
    '',
    `- Overall: ${result.overall}`,
    `- Source: ${result.sourceFilename}`,
    `- Preflight: ${result.preflight}`,
    `- Normalized ContractGenerationInput: ${result.normalizedInput ? 'persisted in result.json' : 'not built'}`,
    `- Planner authority context: ${result.plannerAuthorityContextPath ?? 'not prepared'}`,
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
    `- Provider calls: ${result.providerCalls.total} (inventory ${result.providerCalls.inventory}, transform ${result.providerCalls.transformation}, review ${result.providerCalls.review}, retries ${result.providerCalls.retries}, repair ${result.providerCalls.repair})`,
    `- Generation timing: ${result.measurements?.totalGenerationMs ?? 'not measured'} ms total; inventory ${result.measurements?.stages.inventoryProviderMs ?? 'not run'} ms; planning ${result.measurements?.stages.planningProviderMs ?? 'not run'} ms; review ${result.measurements?.stages.reviewProviderMs ?? 'not run'} ms`,
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
  result.productRules = definition.expectedProductRules ?? {}
  const authoritativeOptions = 'authoritativeInput' in definition ? definition.authoritativeInput : legacyCaseOptions(definition)
  const normalizedInput = buildContractGenerationInput(authoritativeOptions)
  result.normalizedInput = normalizedInput
  metrics.endStage('preflight')
  result.preflight = 'READY'
  result.transformationRequestPrepared = true
  const plannerContextPath = path.join(outputDirectory, 'planner-authority-context.json')
  result.plannerAuthorityContextPath = plannerContextPath
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(plannerContextPath, `${serializePlannerAuthorityContext(normalizedInput)}\n`)
  if (!options.provider) {
    result.overall = 'READY'
    result.deterministicFindings = ['Provider execution disabled; normalized planner authority context prepared but not executed.']
    await writeReports(result, outputDirectory, metrics)
    return result
  }

  let inventory: SourceInventory
  metrics.startStage('inventoryProvider')
  try {
    result.providerCalls.inventory = 1; result.providerCalls.total = 1
    let providerMetadata: ProviderResponseMetadata | undefined
    const inventoryResponse = await runSourceInventory(sourceDocument, { async inventory(source) {
      const response = await options.provider!.inventory({ source, sourceDocx: sourceArrayBuffer })
      providerMetadata = response.providerMetadata
      return response
    } })
    inventory = { items: inventoryResponse.items }
    const latencyMs = metrics.endStage('inventoryProvider')
    const timestamps = metrics.snapshot().timestamps.stages.inventoryProvider!
    metrics.recordProviderCall('inventory', latencyMs, timestamps.startedAt, timestamps.endedAt, providerMetadata)
  } catch (error) {
    metrics.endStage('inventoryProvider')
    result.transformationStatus = 'FAILED'; result.deterministicFindings = [error instanceof Error ? error.message : String(error)]; result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics); return result
  }

  result.providerCalls.transformation = 1; result.providerCalls.total = 2
  let planned: PlanResult & { providerMetadata?: ProviderResponseMetadata }
  metrics.startStage('planningProvider')
  try {
    planned = await options.provider.transform({ authorityContextDescription: PLANNER_AUTHORITY_CONTEXT_DESCRIPTION, authorityContext: normalizedInput, inventory, sourceDocx: sourceArrayBuffer, productRules: definition.expectedProductRules ?? {} })
    const normalizedResponse = sanitizePlannerOperations(planned.status, planned.operations)
    planned = { ...planned, operations: normalizedResponse.operations }
    result.planningResultPath = await persistPlanningResult(outputDirectory, {
      status: planned.status,
      missingInputs: planned.missingInputs,
      conflicts: planned.conflicts,
      factChanges: planned.factChanges,
      retainedLiterals: planned.retainedLiterals,
      sourceInventory: inventory,
      operations: planned.operations,
      operationCount: planned.operations.length,
      rawOperations: normalizedResponse.rawOperations,
      rawOperationCount: normalizedResponse.rawOperationCount,
      discardedOperationCount: normalizedResponse.discardedOperationCount,
      rawProviderResult: { missingInputs: planned.missingInputs, conflicts: planned.conflicts, factChanges: planned.factChanges, retainedLiterals: planned.retainedLiterals, operations: normalizedResponse.rawOperations },
      ...(planned.providerMetadata?.requestedModel ? { model: planned.providerMetadata.requestedModel } : {}),
      ...(planned.providerMetadata?.responseModel ? { responseModel: planned.providerMetadata.responseModel } : {}),
      planValidation: 'NOT_RUN', planValidationFindings: [],
    })
    const latencyMs = metrics.endStage('planningProvider')
    const timestamps = metrics.snapshot().timestamps.stages.planningProvider!
    metrics.recordProviderCall('planning', latencyMs, timestamps.startedAt, timestamps.endedAt, planned.providerMetadata)
  } catch (error) {
    metrics.endStage('planningProvider')
    result.transformationStatus = 'FAILED'; result.deterministicFindings = [error instanceof Error ? error.message : String(error)]; result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics); return result
  }
  if (planned.status === 'MISSING_INPUT') {
    result.transformationStatus = 'MISSING_INPUT'; result.missingInputs = planned.missingInputs; result.overall = 'MISSING_INPUT'
    await writeReports(result, outputDirectory, metrics); return result
  }
  if (planned.status === 'CONFLICT_INPUT') {
    result.conflictFindings = planned.conflicts; result.overall = 'CONFLICT_INPUT'; await writeReports(result, outputDirectory, metrics); return result
  }
  metrics.startStage('planValidation')
  const normalizedValidationContext = { sourceDocument, productRules: { ...(definition.expectedProductRules ?? {}) } }
  const planIssues = validateAuthorityGate(normalizedInput, inventory, planned, normalizedValidationContext)
  metrics.endStage('planValidation')
  await persistPlanningResult(outputDirectory, {
    status: planIssues.length ? 'FAILED' : 'READY', missingInputs: planned.missingInputs, conflicts: [], factChanges: planned.factChanges,
    retainedLiterals: planned.retainedLiterals, sourceInventory: inventory, operations: planned.operations,
    operationCount: planned.operations.length, planValidation: planIssues.length ? 'FAIL' : 'PASS', planValidationFindings: planIssues,
  })
  if (planIssues.length) {
    result.transformationStatus = 'FAILED'; result.deterministicValidation = 'FAIL'; result.deterministicFindings = planIssues; result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics); return result
  }
  if (!planned.operations) {
    result.transformationStatus = 'FAILED'; result.deterministicFindings = ['Plan has no operations array']; result.overall = 'FAIL'
    await writeReports(result, outputDirectory, metrics); return result
  }
  result.blockOperationCounts.transformation = planned.operations.length
  const amounts = [normalizedInput.commercial.contractValue.value, normalizedInput.commercial.agreedDeposit.value, normalizedInput.commercial.remainingAfterDeposit.value]
  const operations = planned.operations.map((operation) => 'finalText' in operation ? { ...operation, finalText: normalizeAuthoritativePlnText(operation.finalText, amounts) } : operation)
  const included = new Set(operations.flatMap((operation) => 'blockId' in operation ? [operation.blockId] : []))
  const canonical = normalizeAuthoritativeFinancialBlocks(sourceDocument.blocks, amounts).filter(({ block }) => !included.has(block.blockId))
  const allOperations: BlockOperation[] = [...operations, ...canonical.map(({ block, text }) => ({ blockId: block.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: text }))]
  result.blockOperationCounts.canonicalMoney = canonical.length
  let candidateBytes: ArrayBufferLike
  metrics.startStage('docxApply')
  try {
    candidateBytes = await applyMetadataFactChanges(await applyBlockOperations(sourceArrayBuffer, allOperations), planned.factChanges, inventory, sourceDocument)
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

  metrics.startStage('candidateValidation')
  const validation = await validateCandidate(sourceArrayBuffer, candidateArrayBuffer, normalizedInput, inventory, planned, allOperations, normalizedValidationContext)
  metrics.endStage('candidateValidation')
  result.deterministicFindings = validation
  result.deterministicValidation = validation.length ? 'FAIL' : 'PASS'
  if (validation.length) {
    result.overall = 'FAIL'
    result.oldDataStatus = oldDataStatus(validation)
    await writeReports(result, outputDirectory, metrics)
    return result
  }

  result.providerCalls.review = 1; result.providerCalls.total = 3
  metrics.startStage('reviewProvider')
  try {
    const review = await options.provider.review({ source: sourceDocument, authorityContextDescription: PLANNER_AUTHORITY_CONTEXT_DESCRIPTION, authorityContext: normalizedInput, inventory, resolvedInventoryOccurrences: resolveInventoryOccurrences(sourceDocument, inventory).occurrences, factChanges: planned.factChanges, retainedLiterals: planned.retainedLiterals, candidate: candidateBlocks.blocks, changedBlocks: computeChangedBlockDiff(sourceDocument.blocks, candidateBlocks.blocks), productRules: definition.expectedProductRules ?? {} })
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

  result.protectedLegalWording = result.reviewResult === 'PASS' ? 'PASS' : 'FAIL'
  result.packageServicePreservation = result.reviewResult === 'PASS' ? 'PASS' : 'FAIL'
  result.oldDataStatus = oldDataStatus(validation)
  result.overall = validation.length || result.protectedLegalWording === 'FAIL' || result.packageServicePreservation === 'FAIL' ? 'FAIL' : 'PASS'
  await writeReports(result, outputDirectory, metrics)
  return result
}
