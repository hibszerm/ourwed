import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import JSZip from 'jszip'
import { extractCanonicalParagraphText } from '@/features/documents/template/canonicalParagraph'
import { buildContractTransformationDataset } from '@/features/ai-contract-transform/transformationDataset'
import {
  buildSemanticMapRequest,
  groundParsedSemanticMapResponse,
  parseSemanticMapResponse,
  SEMANTIC_MAP_PROMPT_VERSION,
  type ParsedSemanticMapResponse,
  type SemanticMapProviderRequest,
} from '@/features/ai-contract-transform/semanticMapModelContract'
import { startSemanticContractGeneration, type SemanticContractGenerationInput } from '@/features/ai-contract-transform/semanticContractGenerationService'
import { extractResponseText } from '@/features/ai-contract-transform/extractResponseText'
import { indexDocxForTransform } from '@/features/ai-contract-transform/indexDocxForTransform'
import { indexSemanticSourceTokens } from '@/features/ai-contract-transform/semanticSourceTokens'
import { buildGoldenScenarios, GOLDEN_SOURCE_FILES } from '@/features/ai-contract-transform/cg7/goldenScenarios'
import { SemanticMapTransportError } from '@/features/ai-contract-transform/semanticMapTransportTypes'
import type { TransformDocumentBlock } from '@/features/ai-contract-transform/types'

export const SEMANTIC_V7_G01_MODEL = 'gpt-6-luna'
export const SEMANTIC_V7_G01_REASONING = 'medium'
export const SEMANTIC_V7_G01_MAX_CALLS = 1
export const SEMANTIC_V7_G01_RETRIES = 0
export const SEMANTIC_V7_G01_SOURCE_SHA256 = 'd8f5b95eae9586adc5c37b681f2ba108ab2464fcc78f2ab8214a6d57a6710fee'
export const SEMANTIC_V7_G01_SOURCE_IDENTITY = 'semantic-source-identity-v2'
export const SEMANTIC_V7_G01_KEY_PATH = '/tmp/ourwed_cg2_openai_key'
export const SEMANTIC_V7_G01_EVIDENCE_ROOT = 'tmp/golden-contract-validation-run2/EVIDENCE'
export const SEMANTIC_V7_G01_SOURCE_PATH = 'tmp/golden-contract-validation-run2/SOURCE'
export const SEMANTIC_V7_G01_REPOSITORY = '/Users/marcin/Desktop/OurWed-Codex/ourwed'
export const SEMANTIC_V7_G01_ENDPOINT = 'https://api.openai.com/v1/responses'
export const SEMANTIC_V7_G01_TIMEOUT_MS = 45_000
export const SEMANTIC_V7_G01_AUTH_ACK = '--confirm-paid-g01-one-call'

type IndexedSource = { blocks: TransformDocumentBlock[]; paragraphs: Array<{ blockId: string; paragraphXml: string }> }
export type PreparedSemanticV7G01 = {
  input: SemanticContractGenerationInput
  sourceHash: string
  sourcePath: string
  sourceBlocks: TransformDocumentBlock[]
  sourceParagraphs: IndexedSource['paragraphs']
  request: SemanticMapProviderRequest
  outgoingRequest: Omit<SemanticMapProviderRequest, 'model'> & { model: typeof SEMANTIC_V7_G01_MODEL; reasoning: { effort: typeof SEMANTIC_V7_G01_REASONING } }
  runId: string
  requestSummary: Record<string, unknown>
}

export type OneCallBudget = { used: number; consume(): void }
export function createOneCallBudget(): OneCallBudget {
  let used = 0
  return {
    get used() { return used },
    consume() {
      if (used >= SEMANTIC_V7_G01_MAX_CALLS) throw new HarnessFailure('CALL_BUDGET_EXHAUSTED')
      used += 1
    },
  }
}

export class HarnessFailure extends Error {
  readonly code: string
  constructor(code: string) { super(code); this.code = code; this.name = 'HarnessFailure' }
}

export function parseHarnessArgs(args: string[]): { golden: string | null; live: boolean; confirmed: boolean } {
  let golden: string | null = null
  let live = false
  let confirmed = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (arg === '--golden') {
      if (golden !== null || !args[index + 1]) throw new HarnessFailure('INVALID_GOLDEN_SELECTOR')
      golden = args[++index]!
    } else if (arg === '--live') {
      if (live) throw new HarnessFailure('DUPLICATE_LIVE_FLAG')
      live = true
    } else if (arg === SEMANTIC_V7_G01_AUTH_ACK) {
      if (confirmed) throw new HarnessFailure('DUPLICATE_CONFIRMATION_FLAG')
      confirmed = true
    } else {
      throw new HarnessFailure('UNRECOGNIZED_ARGUMENT')
    }
  }
  if (golden !== 'G01') throw new HarnessFailure('GOLDEN_G01_SELECTOR_REQUIRED')
  if (confirmed && !live) throw new HarnessFailure('CONFIRMATION_REQUIRES_LIVE_FLAG')
  return { golden, live, confirmed }
}

function requireSemanticV7Request(request: SemanticMapProviderRequest): void {
  const format = request.text.format
  let context: Record<string, unknown>
  try { context = JSON.parse(request.input[1]!.content) as Record<string, unknown> }
  catch { throw new HarnessFailure('REQUEST_CONTEXT_INVALID') }
  if (context.promptVersion !== SEMANTIC_MAP_PROMPT_VERSION || format.type !== 'json_schema'
    || format.strict !== true || format.name !== 'contract_semantic_mappings_v5_extras_placement'
    || request.max_output_tokens !== 8192 || request.reasoning.effort !== SEMANTIC_V7_G01_REASONING) {
    throw new HarnessFailure('REQUEST_CONTRACT_MISMATCH')
  }
  const schema = format.schema
  if (schema.type !== 'object' || schema.additionalProperties !== false
    || !schema.required.includes('semanticMappings') || !schema.required.includes('extrasPlacement')) {
    throw new HarnessFailure('REQUEST_SCHEMA_MISMATCH')
  }
  if (!Array.isArray(context.sourceBlocks) || Object.hasOwn(context, 'additionalServices')
    || Object.hasOwn(context, 'replacementManifest') || !context.crmReferenceOnly
    || typeof context.crmReferenceOnly !== 'object'
    || Object.hasOwn(context.crmReferenceOnly, 'additionalServices')) throw new HarnessFailure('REQUEST_CONTEXT_SCOPE_MISMATCH')
}

function withEdgeModelConfiguration(request: SemanticMapProviderRequest): Omit<SemanticMapProviderRequest, 'model'> & { model: typeof SEMANTIC_V7_G01_MODEL; reasoning: { effort: typeof SEMANTIC_V7_G01_REASONING } } {
  // Mirrors semanticMapRequestHandler: final model/reasoning are server-owned;
  // the production builder remains authoritative for all semantic request fields.
  return {
    ...request,
    model: SEMANTIC_V7_G01_MODEL,
    reasoning: { effort: SEMANTIC_V7_G01_REASONING },
  }
}

async function indexSource(sourceBytes: ArrayBuffer): Promise<IndexedSource> {
  const blocks = await indexDocxForTransform(sourceBytes)
  const zip = await JSZip.loadAsync(sourceBytes)
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) throw new HarnessFailure('SOURCE_DOCUMENT_XML_MISSING')
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
  const byIndex = new Map(blocks.map((block) => [block.paragraphIndex, block]))
  const indexed = paragraphs.flatMap((paragraphXml, paragraphIndex) => {
    const block = byIndex.get(paragraphIndex)
    return block ? [{ blockId: block.blockId, paragraphXml }] : []
  })
  if (indexed.length !== blocks.length || indexed.some((paragraph, index) =>
    extractCanonicalParagraphText(paragraph.paragraphXml) !== blocks[index]?.text)) {
    throw new HarnessFailure('SOURCE_INDEX_MISMATCH')
  }
  return { blocks, paragraphs: indexed }
}

export async function prepareSemanticV7G01(input: {
  repositoryRoot: string
  now?: () => Date
  runId?: string
}): Promise<PreparedSemanticV7G01> {
  const repositoryRoot = resolve(input.repositoryRoot)
  if (repositoryRoot !== SEMANTIC_V7_G01_REPOSITORY) throw new HarnessFailure('UNEXPECTED_REPOSITORY_PATH')
  const sourcePath = join(repositoryRoot, SEMANTIC_V7_G01_SOURCE_PATH, GOLDEN_SOURCE_FILES.G01)
  if (!existsSync(sourcePath)) throw new HarnessFailure('G01_SOURCE_MISSING')
  const sourceBytes = readFileSync(sourcePath)
  const sourceHash = createHash('sha256').update(sourceBytes).digest('hex')
  if (sourceHash !== SEMANTIC_V7_G01_SOURCE_SHA256) throw new HarnessFailure('G01_SOURCE_HASH_MISMATCH')
  const sourceArrayBuffer = sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength) as ArrayBuffer
  const indexed = await indexSource(sourceArrayBuffer)
  if (indexed.blocks.some((block) => indexSemanticSourceTokens(block).some((token) => !/^t[0-9a-z]+_[a-f0-9]{16}$/.test(token.id)))) {
    throw new HarnessFailure('SOURCE_IDENTITY_V2_TOKEN_INVALID')
  }
  const scenario = buildGoldenScenarios().find((item) => item.caseId === 'G01')
  if (!scenario) throw new HarnessFailure('G01_SCENARIO_MISSING')
  const canonicalDataset = buildContractTransformationDataset({
    wedding: scenario.wedding,
    package: scenario.package,
    extras: scenario.extras,
    currentDate: '2026-11-05',
    weddingPlaces: scenario.structuredPlaces,
  })
  const customers = canonicalDataset.clients.customers
  if (!customers || customers.length !== canonicalDataset.clients.personCount) throw new HarnessFailure('G01_CANONICAL_CUSTOMERS_INVALID')
  const inputForService: SemanticContractGenerationInput = {
    sourceDocxBytes: sourceArrayBuffer,
    sourceIdentity: { templateId: 'golden-G01', version: 'canonical-source', fileName: GOLDEN_SOURCE_FILES.G01 },
    currentDate: '2026-11-05',
    canonicalDataset: canonicalDataset as SemanticContractGenerationInput['canonicalDataset'],
    // The existing production Edge transport overrides the candidate model with
    // its configured Luna model. The harness mirrors that final Edge request.
    modelCandidate: 'terra',
  }
  const request = buildSemanticMapRequest({ candidate: inputForService.modelCandidate, sourceBlocks: indexed.blocks, dataset: canonicalDataset })
  requireSemanticV7Request(request)
  const outgoingRequest = withEdgeModelConfiguration(request)
  const now = input.now ?? (() => new Date())
  const runId = input.runId ?? `${now().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
  const requestSummary = {
    protocol: SEMANTIC_MAP_PROMPT_VERSION,
    sourceIdentity: SEMANTIC_V7_G01_SOURCE_IDENTITY,
    golden: 'G01',
    sourceFile: GOLDEN_SOURCE_FILES.G01,
    sourceSha256: sourceHash,
    sourceBlockCount: indexed.blocks.length,
    tokenBearingBlockCount: indexed.blocks.filter((block) => indexSemanticSourceTokens(block).length > 0).length,
    semanticReferenceCustomerCount: customers.length,
    selectedExtrasPresent: (canonicalDataset.additionalServices?.length ?? 0) > 0,
    model: outgoingRequest.model,
    reasoningEffort: outgoingRequest.reasoning.effort,
    maxProviderCalls: SEMANTIC_V7_G01_MAX_CALLS,
    retries: SEMANTIC_V7_G01_RETRIES,
    runId,
    timestamp: now().toISOString(),
  }
  return { input: inputForService, sourceHash, sourcePath, sourceBlocks: indexed.blocks, sourceParagraphs: indexed.paragraphs, request, outgoingRequest, runId, requestSummary }
}

export type ProviderCallResult = {
  parsed: ParsedSemanticMapResponse
  rawBody: string
  httpStatus: number
  returnedModel: string | null
  responseId: string | null
  usage: { inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null }
}

function safeNumber(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null }

function metadataFromRawResponse(raw: string) {
  try {
    const body = JSON.parse(raw) as Record<string, unknown>
    const usage = body.usage && typeof body.usage === 'object' ? body.usage as Record<string, unknown> : {}
    const inputDetails = usage.input_tokens_details && typeof usage.input_tokens_details === 'object' ? usage.input_tokens_details as Record<string, unknown> : {}
    const outputDetails = usage.output_tokens_details && typeof usage.output_tokens_details === 'object' ? usage.output_tokens_details as Record<string, unknown> : {}
    return {
      model: typeof body.model === 'string' ? body.model : null,
      responseId: typeof body.id === 'string' ? body.id : null,
      usage: {
        inputTokens: safeNumber(usage.input_tokens),
        cachedInputTokens: safeNumber(inputDetails.cached_tokens),
        outputTokens: safeNumber(usage.output_tokens),
        reasoningTokens: safeNumber(outputDetails.reasoning_tokens),
      },
    }
  } catch {
    return { model: null, responseId: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null } }
  }
}

export async function invokeExactlyOnce(input: {
  request: ReturnType<typeof withEdgeModelConfiguration>
  apiKey: string
  budget: OneCallBudget
  fetcher?: typeof fetch
  timeoutMs?: number
  onRawResponse?: (raw: string, status: number) => void
}): Promise<ProviderCallResult> {
  if (!input.apiKey.trim()) throw new HarnessFailure('API_KEY_EMPTY')
  input.budget.consume()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? SEMANTIC_V7_G01_TIMEOUT_MS)
  let response: Response
  let rawBody: string
  try {
    response = await (input.fetcher ?? fetch)(SEMANTIC_V7_G01_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input.request),
      signal: controller.signal,
    })
    rawBody = await response.text()
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw new HarnessFailure('PROVIDER_TIMEOUT')
    throw new HarnessFailure('PROVIDER_TRANSPORT_FAILURE')
  } finally {
    clearTimeout(timer)
  }
  input.onRawResponse?.(rawBody, response.status)
  if (!response.ok) throw new HarnessFailure(`PROVIDER_HTTP_${response.status}`)
  let body: unknown
  try { body = JSON.parse(rawBody) as unknown } catch { throw new HarnessFailure('PROVIDER_RESPONSE_MALFORMED') }
  if (!body || typeof body !== 'object' || (body as Record<string, unknown>).status !== 'completed') {
    throw new HarnessFailure('PROVIDER_RESPONSE_NOT_COMPLETED')
  }
  const extraction = extractResponseText(body)
  if (extraction.refusalDetected || !extraction.text) throw new HarnessFailure('PROVIDER_OUTPUT_MISSING_OR_REFUSED')
  const parsed = parseSemanticMapResponse(extraction.text)
  if (!parsed.ok) throw new HarnessFailure(`STRICT_V7_PARSE_${parsed.code}`)
  const record = body as Record<string, unknown>
  const usage = record.usage && typeof record.usage === 'object' ? record.usage as Record<string, unknown> : {}
  const inputDetails = usage.input_tokens_details && typeof usage.input_tokens_details === 'object' ? usage.input_tokens_details as Record<string, unknown> : {}
  const outputDetails = usage.output_tokens_details && typeof usage.output_tokens_details === 'object' ? usage.output_tokens_details as Record<string, unknown> : {}
  return {
    parsed,
    rawBody,
    httpStatus: response.status,
    returnedModel: typeof record.model === 'string' ? record.model : null,
    responseId: typeof record.id === 'string' ? record.id : null,
    usage: {
      inputTokens: safeNumber(usage.input_tokens),
      cachedInputTokens: safeNumber(inputDetails.cached_tokens),
      outputTokens: safeNumber(usage.output_tokens),
      reasoningTokens: safeNumber(outputDetails.reasoning_tokens),
    },
  }
}

export function readTemporaryApiKeyAtExecutionTime(path = SEMANTIC_V7_G01_KEY_PATH): string {
  return readFileSync(path, 'utf8').trim()
}

export function prepareEvidenceDirectory(repositoryRoot: string, runId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new HarnessFailure('INVALID_RUN_ID')
  const directory = join(repositoryRoot, SEMANTIC_V7_G01_EVIDENCE_ROOT, `SEMANTIC_V7_G01_LIVE_${runId}`)
  mkdirSync(directory, { recursive: false })
  return directory
}

export function writeSafeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
}

export function currentRepositoryState(repositoryRoot: string): { head: string; clean: boolean } {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
  const status = execFileSync('git', ['status', '--porcelain=v1'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
  return { head, clean: status.length === 0 }
}

export function parsedResponseSummary(parsed: ParsedSemanticMapResponse) {
  return {
    semanticMappings: parsed.semanticMappings,
    extrasPlacement: parsed.extrasPlacement ?? null,
  }
}

export async function validatePreparedOutput(input: {
  prepared: PreparedSemanticV7G01
  parsed: ParsedSemanticMapResponse
}) {
  const grounding = groundParsedSemanticMapResponse(input.parsed, input.prepared.sourceParagraphs, input.prepared.sourceBlocks)
  if (!grounding.ok) return { grounding, generation: null }
  const generation = await startSemanticContractGeneration(input.prepared.input, async () => input.parsed)
  return { grounding, generation }
}

export type HarnessRunDependencies = {
  repositoryRoot: string
  fetcher?: typeof fetch
  readKey?: (path: string) => string
  now?: () => Date
  prepare?: typeof prepareSemanticV7G01
  createEvidenceDirectory?: typeof prepareEvidenceDirectory
  writeJson?: typeof writeSafeJson
  writeText?: (path: string, text: string) => void
  writeBinary?: (path: string, bytes: ArrayBuffer) => void
  timeoutMs?: number
}

export async function runSemanticV7G01Harness(args: string[], dependencies: HarnessRunDependencies) {
  const flags = parseHarnessArgs(args)
  const prepared = await (dependencies.prepare ?? prepareSemanticV7G01)({ repositoryRoot: dependencies.repositoryRoot, now: dependencies.now })
  if (!flags.live) {
    return {
      mode: 'DRY_RUN',
      providerCalls: 0,
      keyRead: false,
      networkCalls: 0,
      preflight: prepared.requestSummary,
    }
  }
  if (!flags.confirmed) throw new HarnessFailure('PAID_CALL_CONFIRMATION_REQUIRED')
  const state = currentRepositoryState(dependencies.repositoryRoot)
  if (!state.clean) throw new HarnessFailure('LIVE_REQUIRES_CLEAN_WORKTREE')
  const evidenceDirectory = (dependencies.createEvidenceDirectory ?? prepareEvidenceDirectory)(dependencies.repositoryRoot, prepared.runId)
  const writeJson = dependencies.writeJson ?? writeSafeJson
  const writeText = dependencies.writeText ?? ((path, text) => writeFileSync(path, text, { encoding: 'utf8', flag: 'wx' }))
  const writeBinary = dependencies.writeBinary ?? ((path, bytes) => writeFileSync(path, Buffer.from(bytes), { flag: 'wx' }))
  const requestSummaryPath = join(evidenceDirectory, 'request-summary.json')
  writeJson(requestSummaryPath, { ...prepared.requestSummary, head: state.head })
  let providerCalls = 0
  const budget = createOneCallBudget()
  let rawCapturePath: string | null = null
  let providerHttp: string = 'NOT_REACHED'
  let strictSchema: string = 'NOT_REACHED'
  let protocolStage: string = 'NOT_REACHED'
  let sourceGrounding: string = 'NOT_REACHED'
  let extrasPlacementParse: string = 'NOT_REACHED'
  let providerFailureCode: string | null = null
  try {
    const apiKey = (dependencies.readKey ?? readTemporaryApiKeyAtExecutionTime)(SEMANTIC_V7_G01_KEY_PATH)
    const provider = async (request: SemanticMapProviderRequest) => {
      requireSemanticV7Request(request)
      const outgoing = withEdgeModelConfiguration(request)
      if (outgoing.model !== SEMANTIC_V7_G01_MODEL || outgoing.reasoning.effort !== SEMANTIC_V7_G01_REASONING) {
        throw new HarnessFailure('MODEL_OR_REASONING_MISMATCH')
      }
      let result: ProviderCallResult
      try {
        result = await invokeExactlyOnce({
          request: outgoing,
          apiKey,
          budget,
          fetcher: dependencies.fetcher,
          timeoutMs: dependencies.timeoutMs,
          onRawResponse(raw, status) {
            providerCalls = budget.used
            providerHttp = status >= 200 && status < 300 ? 'PASS' : `HTTP_${status}`
            rawCapturePath = join(evidenceDirectory, 'provider-response.raw.json')
            writeText(rawCapturePath, raw)
            writeJson(join(evidenceDirectory, 'http-result.json'), { status, bodyCaptured: true })
            writeJson(join(evidenceDirectory, 'provider-metadata.json'), metadataFromRawResponse(raw))
          },
        })
      } catch (error) {
        providerCalls = budget.used
        const code = error instanceof HarnessFailure ? error.code : 'PROVIDER_FAILURE'
        providerFailureCode = code
        if (code === 'PROVIDER_TIMEOUT') providerHttp = 'TIMEOUT'
        else if (code === 'PROVIDER_TRANSPORT_FAILURE') providerHttp = 'TRANSPORT_FAILURE'
        if (code.startsWith('STRICT_V7_PARSE_') || code === 'PROVIDER_RESPONSE_MALFORMED'
          || code === 'PROVIDER_RESPONSE_NOT_COMPLETED' || code === 'PROVIDER_OUTPUT_MISSING_OR_REFUSED') {
          strictSchema = code.startsWith('STRICT_V7_PARSE_') ? 'FAIL' : 'NOT_REACHED'
          protocolStage = 'FAIL'
          throw new SemanticMapTransportError('PROTOCOL_FAILURE', code)
        }
        if (code === 'PROVIDER_TIMEOUT') throw new SemanticMapTransportError('PROVIDER_TIMEOUT', code)
        if (code === 'PROVIDER_TRANSPORT_FAILURE') throw new SemanticMapTransportError('TRANSPORT_FAILURE', code)
        throw new SemanticMapTransportError('PROVIDER_FAILURE', code)
      }
      strictSchema = 'PASS'
      protocolStage = 'PASS'
      extrasPlacementParse = result.parsed.extrasPlacement === undefined ? 'MISSING' : result.parsed.extrasPlacement === null ? 'PASS_NULL' : 'PASS'
      writeJson(join(evidenceDirectory, 'provider-response.parsed.json'), parsedResponseSummary(result.parsed))
      const grounding = groundParsedSemanticMapResponse(result.parsed, prepared.sourceParagraphs, prepared.sourceBlocks)
      sourceGrounding = grounding.ok ? 'PASS' : 'FAIL'
      const validation = {
        providerHttp,
        strictSchema,
        protocol: protocolStage,
        sourceGrounding,
        extrasPlacementParse,
        mappingsCount: result.parsed.semanticMappings.length,
        invalidSourceBlocks: grounding.ok ? 0 : ['unknown_source', 'duplicate_source_block_id', 'protected_source'].includes(grounding.code) ? 1 : 0,
        invalidTokenRanges: grounding.ok ? 0 : ['invalid_token_range', 'stale_source', 'anchor_unmappable', 'invalid_occurrence'].includes(grounding.code) ? 1 : 0,
        invalidOverlaps: grounding.ok ? 0 : ['overlapping_spans', 'span_conflict'].includes(grounding.code) ? 1 : 0,
        ungroundedMappings: grounding.ok ? 0 : 1,
        groundingFailureCode: grounding.ok ? null : grounding.code,
        extrasPlacement: result.parsed.extrasPlacement ?? null,
      }
      writeJson(join(evidenceDirectory, 'pre-execution-validation.json'), validation)
      return result.parsed
    }
    const generation = await startSemanticContractGeneration(prepared.input, provider)
    const executionResult = generation.status
    if (generation.status === 'COMPLETED') writeBinary(join(evidenceDirectory, 'G01_FINAL.docx'), generation.artifact.docxBytes)
    const validationSummary = {
      providerHttp,
      strictSchema,
      protocol: protocolStage,
      sourceGrounding,
      extrasPlacementParse,
      extrasPlacementExecution: generation.status === 'COMPLETED' ? 'PASS'
        : generation.status === 'QUALITY_FAILURE' && generation.code === 'extras_quality_failed' ? 'FAIL'
          : 'NOT_REACHED',
      deterministicExecution: executionResult,
      failureCode: providerFailureCode ?? (generation.status === 'TECHNICAL_FAILURE' || generation.status === 'QUALITY_FAILURE' || generation.status === 'PROVIDER_FAILURE' ? generation.code : null),
      requiresUserInputCount: generation.status === 'REQUIRES_USER_INPUT' ? generation.requirements.length : 0,
      providerCalls,
      retries: 0,
      evidenceDirectory,
      rawResponsePath: rawCapturePath,
    }
    writeJson(join(evidenceDirectory, 'validation-summary.json'), validationSummary)
    return { mode: 'LIVE', providerCalls, keyRead: true, networkCalls: providerCalls, evidenceDirectory, validationSummary }
  } catch (error) {
    const code = error instanceof HarnessFailure ? error.code : 'HARNESS_FAILURE'
    providerCalls = Math.max(providerCalls, budget.used)
    writeJson(join(evidenceDirectory, 'validation-summary.json'), {
      providerHttp,
      strictSchema,
      protocol: protocolStage,
      sourceGrounding,
      extrasPlacementParse,
      deterministicExecution: 'NOT_REACHED',
      failureCode: code,
      providerCalls,
      retries: 0,
      evidenceDirectory,
      rawResponsePath: rawCapturePath,
    })
    throw new HarnessFailure(code)
  }
}
