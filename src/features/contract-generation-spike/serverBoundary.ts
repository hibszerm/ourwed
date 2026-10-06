import {
  acceptSessionAnswers,
  canResumeContractGenerationSession,
  appendMissingInputHistory,
  resolveMissingInputAnswers,
  type ChoiceBindingMap,
  sessionMatchesScope,
  type ContractGenerationSession,
  type ContractGenerationSessionScope,
  type ResolvedMissingInput,
} from './generationSession.ts'
import { REVIEWER_FINDING_CATEGORIES, REVIEWER_FINDING_RULE_IDS, type ContractGenerationAnswer, type GenerationResponseBranch, type GenerationResponseValidationCode, type GenerationResponseValidationPath, type MissingInput, type ReviewerFindingCategory, type ReviewerFindingRuleId } from './generationProtocol.ts'
import { safeMechanicalTelemetry, type MechanicalAuthorityType, type MechanicalEditOperation, type MechanicalFailureDiagnostic, type MechanicalGateId, type MechanicalReasonCode, type MechanicalSourceBlockType } from './mechanicalDiagnostics.ts'
import { safeTerminalFailure, type SafeFailureOrigin, type SafeTerminalFailure } from './terminalFailureDiagnostics.ts'
import type { OptionBProgressStage } from './generationProgress.ts'

export type ContractGenerationStartRequest = { weddingId: string; requestId: string }
export type ContractGenerationContinueRequest = {
  sessionId: string
  answers: ContractGenerationAnswer[]
}
export type ContractGenerationCandidateRequest = {
  weddingId: string
  candidateId: string
}
export type ContractGenerationFinalizeRequest = {
  weddingId: string
  sessionId?: string
  requestId?: string
  saveToken?: string
  reason: 'saved' | 'discarded' | 'abandoned'
}
export type ContractGenerationValidateCandidateRequest = {
  weddingId: string
  sessionId: string
  saveToken: string
}

export type ContractGenerationBoundaryResponse =
  | { status: 'awaiting_input'; sessionId: string; missingInputs: MissingInput[] }
  | { status: 'ready'; sessionId: string; candidateId: string; templateId: string; templateVersionId: string; reviewer: BoundaryReviewerState }
  | { status: 'processing'; sessionId: string }
  | { status: 'unresolved_conflict'; sessionId: string; message: string }
  | { status: 'precondition'; code: 'setup_required' }
  | { status: 'error'; code: 'unauthorized' | 'forbidden' }
  | { status: 'stale'; code: 'authority_changed' | 'session_invalid' }
  | { status: 'failure'; code: 'generation_safety' | 'temporary_failure' }
  | { status: 'candidate_valid' }
  | { status: 'finalized' }

export type BoundaryCandidate = { bytes: ArrayBuffer; changedBlocks: unknown[] }
export type SafeProviderFailureStage = 'request_build' | 'timeout_setup' | 'fetch_transport' | 'fetch_timeout' | 'http_non_ok' | 'response_read' | 'response_parse' | 'structured_output' | 'adapter_mapping' | 'unknown_provider_failure'
export type BoundaryRunResult =
  | { status: 'MISSING_INPUT'; missingInputs: MissingInput[]; choiceBindings?: ChoiceBindingMap }
  | { status: 'CONFLICT_INPUT'; conflicts: string[] }
  | { status: 'FAILED'; category?: 'provider_failure' | 'provider_configuration_failure' | 'invalid_response' | 'mechanical_validation_failure' | 'input_validation_failure'; mechanicalFailure?: MechanicalFailureDiagnostic; providerFailureStage?: SafeProviderFailureStage; providerFailureClass?: SafeProviderFailureClass; providerHttpStatus?: number; failureOrigin?: SafeFailureOrigin; responseBranch?: GenerationResponseBranch; schemaErrorCode?: GenerationResponseValidationCode; schemaPath?: GenerationResponseValidationPath }
  | { status: 'READY'; candidate: BoundaryCandidate }

export type SafeProviderFailureClass = 'transport_error' | 'timeout' | 'http_400' | 'http_401' | 'http_403' | 'http_404' | 'http_408' | 'http_409' | 'http_429' | 'http_5xx' | 'http_other'

export function safeProviderFailureDetails(input: { httpStatus?: number; timeoutAborted?: boolean }): { providerFailureClass: SafeProviderFailureClass; providerHttpStatus?: number } {
  if (Number.isInteger(input.httpStatus)) {
    const status = input.httpStatus as number
    const providerFailureClass: SafeProviderFailureClass = status === 400 ? 'http_400'
      : status === 401 ? 'http_401'
        : status === 403 ? 'http_403'
          : status === 404 ? 'http_404'
            : status === 408 ? 'http_408'
              : status === 409 ? 'http_409'
                : status === 429 ? 'http_429'
                  : status >= 500 && status <= 599 ? 'http_5xx' : 'http_other'
    return { providerFailureClass, providerHttpStatus: status }
  }
  return { providerFailureClass: input.timeoutAborted ? 'timeout' : 'transport_error' }
}

export async function fetchProviderResponse(
  url: string,
  init: RequestInit,
  timeoutSignal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  let response: Response
  try {
    response = await fetcher(url, { ...init, signal: timeoutSignal })
  } catch {
    throw new ProviderOperationError('provider_failure', {
      ...safeProviderFailureDetails({ timeoutAborted: timeoutSignal.aborted }),
      providerFailureStage: timeoutSignal.aborted ? 'fetch_timeout' : 'fetch_transport',
    })
  }
  if (!response.ok) {
    throw new ProviderOperationError('provider_failure', {
      ...safeProviderFailureDetails({ httpStatus: response.status }),
      providerFailureStage: 'http_non_ok',
    })
  }
  return response
}

export type BoundaryDiagnostic = {
  action: 'start' | 'continue'
  providerRole: 'Generator' | 'Conflict Verifier' | 'Reviewer' | 'orchestrator'
  category: string
  providerInvoked?: boolean
  missingInputCount?: number
  editCount?: number
  conflictCount?: number
  findingCount?: number
  findingCategories?: ReviewerFindingCategory[]
  findingRuleIds?: ReviewerFindingRuleId[]
  mechanicalGateId?: MechanicalGateId
  mechanicalReasonCode?: MechanicalReasonCode
  mechanicalEditIndex?: number
  mechanicalEditCount?: number
  mechanicalAuthorityType?: MechanicalAuthorityType
  mechanicalEditOperation?: MechanicalEditOperation
  mechanicalSourceBlockType?: MechanicalSourceBlockType
  mechanicalSourceBlockOrdinal?: number
  mechanicalSourceOccurrence?: number
  mechanicalSourceCanonicalLength?: number
  mechanicalRequestedCanonicalLength?: number
  mechanicalCandidateCanonicalLength?: number
  mechanicalSourceTargetFound?: boolean
  mechanicalEditorOperationReportedSuccess?: boolean
  mechanicalCandidateBlockOrdinal?: number | null
  mechanicalExpectedAtCandidateBlock?: boolean
  mechanicalExactRequestedCanonicalFoundElsewhere?: boolean
  mechanicalValidation?: 'passed' | 'failed' | 'not_reached'
  providerFailureClass?: SafeProviderFailureClass
  providerFailureStage?: SafeProviderFailureStage
  providerHttpStatus?: number
  failureOrigin?: SafeFailureOrigin
  responseBranch?: GenerationResponseBranch
  schemaErrorCode?: GenerationResponseValidationCode
  schemaPath?: GenerationResponseValidationPath
  finalCode?: 'generation_safety' | 'temporary_failure' | 'stale'
}

export type BoundaryReviewerState =
  | { status: 'passed' }
  | { status: 'unavailable' }
  | {
      status: 'findings'
      findingCount: number
      findingCategories: ReviewerFindingCategory[]
      findingRuleIds: ReviewerFindingRuleId[]
    }

export type BoundaryReviewerResult = 'pass' | 'fail' | {
  status: 'fail'
  findingCount: number
  findingCategories: ReviewerFindingCategory[]
  findingRuleIds: ReviewerFindingRuleId[]
}

const reviewerFindingCategorySet = new Set<string>(REVIEWER_FINDING_CATEGORIES)
const reviewerFindingRuleIdSet = new Set<string>(REVIEWER_FINDING_RULE_IDS)

function safeReviewerSummary(result: BoundaryReviewerResult): Pick<BoundaryDiagnostic, 'findingCount' | 'findingCategories' | 'findingRuleIds'> {
  if (typeof result === 'string' || result.status !== 'fail') return {}
  const categories = [...new Set(result.findingCategories.filter((category) => reviewerFindingCategorySet.has(category)))].sort()
  if (!Number.isInteger(result.findingCount) || result.findingCount < 1 || categories.length === 0
    || result.findingRuleIds.length !== result.findingCount
    || !result.findingRuleIds.every((ruleId) => reviewerFindingRuleIdSet.has(ruleId))) return {}
  return {
    findingCount: result.findingCount,
    findingCategories: categories,
    findingRuleIds: [...result.findingRuleIds].sort(),
  }
}

function reviewerState(result: BoundaryReviewerResult): BoundaryReviewerState {
  if (result === 'pass') return { status: 'passed' }
  if (result === 'fail') return { status: 'unavailable' }
  const summary = safeReviewerSummary(result)
  if (!summary.findingCount || !summary.findingCategories?.length || !summary.findingRuleIds?.length) {
    return { status: 'unavailable' }
  }
  return {
    status: 'findings',
    findingCount: summary.findingCount,
    findingCategories: summary.findingCategories,
    findingRuleIds: summary.findingRuleIds,
  }
}

export class ProviderOperationError extends Error {
  readonly category: 'provider_failure' | 'provider_configuration_failure' | 'invalid_response'
  readonly providerFailureStage?: SafeProviderFailureStage
  readonly providerFailureClass?: SafeProviderFailureClass
  readonly providerHttpStatus?: number
  readonly failureOrigin?: SafeFailureOrigin
  constructor(category: 'provider_failure' | 'provider_configuration_failure' | 'invalid_response', details?: { providerFailureStage?: SafeProviderFailureStage; providerFailureClass?: SafeProviderFailureClass; providerHttpStatus?: number; failureOrigin?: SafeFailureOrigin }) {
    super(category)
    this.name = 'ProviderOperationError'
    this.category = category
    this.providerFailureStage = details?.providerFailureStage
    this.providerFailureClass = details?.providerFailureClass
    this.providerHttpStatus = details?.providerHttpStatus
    this.failureOrigin = details?.failureOrigin
  }
}

const providerFailureStages = new Set<SafeProviderFailureStage>(['request_build', 'timeout_setup', 'fetch_transport', 'fetch_timeout', 'http_non_ok', 'response_read', 'response_parse', 'structured_output', 'adapter_mapping', 'unknown_provider_failure'])

const safeFailureOrigins = new Set<SafeFailureOrigin>(['EMPTY_STRUCTURED_OUTPUT', 'STRUCTURED_OUTPUT_EXTRACTION_FAILURE', 'GENERATION_RESPONSE_VALIDATION_FAILED', 'GENERATION_RESPONSE_NORMALIZATION_FAILED'])

export function providerFailureTelemetry(error: unknown, fallbackStage?: SafeProviderFailureStage): Pick<BoundaryDiagnostic, 'providerFailureStage' | 'providerFailureClass' | 'providerHttpStatus' | 'failureOrigin'> {
  if (!error || typeof error !== 'object') return fallbackStage ? { providerFailureStage: fallbackStage } : {}
  const details = error as { providerFailureStage?: unknown; providerFailureClass?: unknown; providerHttpStatus?: unknown; failureOrigin?: unknown }
  const stage = typeof details.providerFailureStage === 'string' && providerFailureStages.has(details.providerFailureStage as SafeProviderFailureStage)
    ? details.providerFailureStage as SafeProviderFailureStage
    : fallbackStage
  const failureClass = typeof details.providerFailureClass === 'string' && ['transport_error', 'timeout', 'http_400', 'http_401', 'http_403', 'http_404', 'http_408', 'http_409', 'http_429', 'http_5xx', 'http_other'].includes(details.providerFailureClass)
    ? details.providerFailureClass as SafeProviderFailureClass
    : undefined
  const httpStatus = stage === 'http_non_ok' && failureClass?.startsWith('http_') && Number.isInteger(details.providerHttpStatus)
    ? details.providerHttpStatus as number
    : undefined
  const failureOrigin = typeof details.failureOrigin === 'string' && safeFailureOrigins.has(details.failureOrigin as SafeFailureOrigin)
    ? details.failureOrigin as SafeFailureOrigin
    : undefined
  return {
    ...(stage ? { providerFailureStage: stage } : {}),
    ...(failureClass ? { providerFailureClass: failureClass } : {}),
    ...(httpStatus !== undefined ? { providerHttpStatus: httpStatus } : {}),
    ...(failureOrigin ? { failureOrigin } : {}),
  }
}

function providerInvoked(error: unknown): boolean {
  return !(error instanceof ProviderOperationError && error.category === 'provider_configuration_failure')
}

export type ServerBoundaryContext = {
  scope: ContractGenerationSessionScope
  sourceBytes: ArrayBuffer
  sourceSha256: string
  authorityFingerprint: string
  /** Built afresh from current server records for this single Generator invocation. */
  authority: unknown
}

export type ServerBoundaryDependencies = {
  now?: () => Date
  loadContext: (userId: string, weddingId: string, answers: ContractGenerationAnswer[], selectedEntities?: Array<{ requirementId: string; optionId: string; partyKey: string }>) => Promise<ServerBoundaryContext | null>
  createSession: (input: {
    userId: string
    weddingId: string
    requestId: string
    scope: ContractGenerationSessionScope
    sourceSha256: string
    authorityFingerprint: string
    executionId: string
  }) => Promise<ContractGenerationSession | null>
  getSession: (sessionId: string) => Promise<ContractGenerationSession | null>
  getSessionByIdempotencyKey: (userId: string, requestId: string) => Promise<ContractGenerationSession | null>
  expireSession: (sessionId: string, userId: string) => Promise<void>
  claimContinuation: (input: { sessionId: string; userId: string; executionId: string; answers: ContractGenerationAnswer[]; missingInputHistory: MissingInput[]; missingInputHistoryValid: boolean }) => Promise<ContractGenerationSession | null>
  saveMissing: (input: { sessionId: string; executionId: string; missingInputs: MissingInput[]; missingInputHistory: MissingInput[]; answers: ContractGenerationAnswer[]; choiceBindings: ChoiceBindingMap; authorityFingerprint: string }) => Promise<boolean>
  persistAcceptedCandidate: (input: { sessionId: string; executionId: string; candidate: BoundaryCandidate; authorityFingerprint: string }) => Promise<string | null>
  setProgressStage?: (input: { sessionId: string; executionId: string; stage: OptionBProgressStage }) => Promise<void>
  markFailure: (sessionId: string, executionId: string, code: 'failed' | 'stale', terminalFailure?: SafeTerminalFailure) => Promise<void>
  generate: (context: ServerBoundaryContext, answers: ContractGenerationAnswer[], resolvedInputs: ResolvedMissingInput[], reportStage?: (stage: OptionBProgressStage) => Promise<void>) => Promise<BoundaryRunResult>
  verifyConflict: (context: ServerBoundaryContext, answers: ContractGenerationAnswer[], conflicts: string[]) => Promise<'confirmed' | 'rejected'>
  review: (context: ServerBoundaryContext, answers: ContractGenerationAnswer[], candidate: BoundaryCandidate) => Promise<BoundaryReviewerResult>
  diagnose?: (diagnostic: BoundaryDiagnostic) => void
  newId: () => string
}

function validStartRequest(value: unknown): value is ContractGenerationStartRequest {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2 && typeof (value as Record<string, unknown>).weddingId === 'string'
    && typeof (value as Record<string, unknown>).requestId === 'string'
    && (value as Record<string, string>).weddingId.trim()
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test((value as Record<string, string>).requestId))
}

function validContinueRequest(value: unknown): value is ContractGenerationContinueRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return Object.keys(item).length === 2 && typeof item.sessionId === 'string' && item.sessionId.trim().length > 0
    && Array.isArray(item.answers) && item.answers.every((answer) => {
      if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false
      const row = answer as Record<string, unknown>
      return Object.keys(row).length === 2 && typeof row.missingInputId === 'string'
        && ((typeof row.value === 'string' && !('optionId' in row))
          || (typeof row.optionId === 'string' && !('value' in row)))
    })
}

function validCandidateRequest(value: unknown): value is ContractGenerationCandidateRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return Object.keys(item).length === 2
    && typeof item.weddingId === 'string' && item.weddingId.trim().length > 0
    && typeof item.candidateId === 'string' && item.candidateId.trim().length > 0
}

function isEmptyObject(value: unknown): value is Record<string, never> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
}

function validFinalizeRequest(value: unknown): value is ContractGenerationFinalizeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  const hasSessionId = typeof item.sessionId === 'string' && item.sessionId.trim().length > 0
  const hasRequestId = typeof item.requestId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.requestId)
  const hasSaveToken = typeof item.saveToken === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.saveToken)
  return typeof item.weddingId === 'string' && item.weddingId.trim().length > 0
    && hasSessionId !== hasRequestId
    && ['saved', 'discarded', 'abandoned'].includes(String(item.reason))
    && (item.reason !== 'saved' || hasSaveToken)
    && (!('saveToken' in item) || hasSaveToken)
    && Object.keys(item).length === (hasSaveToken ? 4 : 3)
}

function validValidateCandidateRequest(value: unknown): value is ContractGenerationValidateCandidateRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return Object.keys(item).length === 3
    && typeof item.weddingId === 'string' && item.weddingId.trim().length > 0
    && typeof item.sessionId === 'string' && item.sessionId.trim().length > 0
    && typeof item.saveToken === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.saveToken)
}

/** One Generator call per generation request, plus at most one result-specific review or conflict-verification call. */
export function createContractGenerationBoundary(deps: ServerBoundaryDependencies) {
  const now = deps.now ?? (() => new Date())

  async function execute(
    session: ContractGenerationSession,
    context: ServerBoundaryContext,
    answers: ContractGenerationAnswer[],
    executionId: string,
    action: 'start' | 'continue',
    resolvedInputs: ResolvedMissingInput[],
  ): Promise<ContractGenerationBoundaryResponse> {
    let latestDiagnostic: BoundaryDiagnostic | undefined
    const diagnose = (diagnostic: Omit<BoundaryDiagnostic, 'action'>) => {
      latestDiagnostic = { action, ...diagnostic }
      try { deps.diagnose?.(latestDiagnostic) } catch { /* diagnostics must not affect generation */ }
    }
    const markFailure = async (code: 'failed' | 'stale') => {
      await deps.markFailure(session.id, executionId, code, safeTerminalFailure(latestDiagnostic))
    }
    let progressWrite = Promise.resolve()
    const reportStage = (stage: OptionBProgressStage) => {
      progressWrite = progressWrite
        .then(() => deps.setProgressStage?.({ sessionId: session.id, executionId, stage }))
        .then(() => undefined)
        .catch(() => undefined) // progress is observational and cannot delay generation
      return Promise.resolve()
    }
    try {
      await reportStage('analyzing')
      const generated = await deps.generate(context, answers, resolvedInputs, reportStage)
      if (generated.status === 'MISSING_INPUT') {
        diagnose({ providerRole: 'Generator', category: 'MISSING_INPUT', providerInvoked: true, missingInputCount: generated.missingInputs.length, mechanicalValidation: 'not_reached' })
        if (!generated.missingInputs.length || new Set(generated.missingInputs.map((item) => item.id)).size !== generated.missingInputs.length) {
          diagnose({ providerRole: 'orchestrator', category: 'invalid_missing_input_set', finalCode: 'generation_safety' })
          await markFailure('failed')
          return { status: 'failure', code: 'generation_safety' }
        }
        const answeredIds = new Set(answers.map((answer) => answer.missingInputId))
        if (generated.missingInputs.some((item) => answeredIds.has(item.id))) {
          diagnose({ providerRole: 'orchestrator', category: 'answered_requirement_reasked', finalCode: 'generation_safety' })
          await markFailure('failed')
          return { status: 'failure', code: 'generation_safety' }
        }
        const history = appendMissingInputHistory(session.missingInputHistory, generated.missingInputs)
        if (!history) {
          diagnose({ providerRole: 'orchestrator', category: 'duplicate_requirement_definition', finalCode: 'generation_safety' })
          await markFailure('failed')
          return { status: 'failure', code: 'generation_safety' }
        }
        const choiceBindings: ChoiceBindingMap = {
          ...(session.choiceBindings ?? {}),
          ...(generated.choiceBindings ?? {}),
        }
        const saved = await deps.saveMissing({
          sessionId: session.id,
          executionId,
          missingInputs: generated.missingInputs,
          missingInputHistory: history,
          answers,
          choiceBindings,
          authorityFingerprint: context.authorityFingerprint,
        })
        if (!saved) {
          diagnose({ providerRole: 'orchestrator', category: 'missing_input_persistence_failure', finalCode: 'temporary_failure' })
          await markFailure('failed')
        }
        return saved
          ? { status: 'awaiting_input', sessionId: session.id, missingInputs: generated.missingInputs }
          : { status: 'failure', code: 'temporary_failure' }
      }
      if (generated.status === 'CONFLICT_INPUT') diagnose({ providerRole: 'Generator', category: 'CONFLICT_INPUT', providerInvoked: true, conflictCount: generated.conflicts.length, mechanicalValidation: 'not_reached' })
      if (generated.status === 'READY') diagnose({ providerRole: 'Generator', category: 'READY', providerInvoked: true, editCount: generated.candidate.changedBlocks.length, mechanicalValidation: 'passed' })
      if (generated.status === 'FAILED') {
        const category = generated.category ?? 'invalid_response'
        const failureCode = category === 'provider_failure' || category === 'provider_configuration_failure' ? 'temporary_failure' : 'generation_safety'
        const mechanical = category === 'mechanical_validation_failure'
          ? safeMechanicalTelemetry(generated.mechanicalFailure ?? { gateId: 'internal', reasonCode: 'internal_validation_failure' })
          : undefined
        diagnose({ providerRole: 'Generator', category: category.toUpperCase(), providerInvoked: category !== 'input_validation_failure' && category !== 'provider_configuration_failure', mechanicalValidation: category === 'mechanical_validation_failure' ? 'failed' : 'not_reached', finalCode: failureCode, ...(generated.responseBranch ? { responseBranch: generated.responseBranch } : {}), ...(generated.schemaErrorCode ? { schemaErrorCode: generated.schemaErrorCode } : {}), ...(generated.schemaPath ? { schemaPath: generated.schemaPath } : {}), ...providerFailureTelemetry(generated, category === 'provider_failure' ? 'unknown_provider_failure' : undefined), ...mechanical })
        await markFailure('failed')
        return { status: 'failure', code: failureCode }
      }
      if (generated.status === 'CONFLICT_INPUT') {
        let verification: 'confirmed' | 'rejected'
        try {
          await reportStage('verifying')
          verification = await deps.verifyConflict(context, answers, generated.conflicts)
          diagnose({ providerRole: 'Conflict Verifier', category: verification === 'confirmed' ? 'PASS' : 'FAIL', providerInvoked: true, conflictCount: generated.conflicts.length })
        } catch (error) {
          diagnose({ providerRole: 'Conflict Verifier', category: error instanceof ProviderOperationError ? error.category.toUpperCase() : 'INTERNAL_FAILURE', providerInvoked: providerInvoked(error), conflictCount: generated.conflicts.length, finalCode: 'temporary_failure', ...providerFailureTelemetry(error, providerInvoked(error) ? 'unknown_provider_failure' : undefined) })
          await markFailure('failed')
          return { status: 'failure', code: 'temporary_failure' }
        }
        diagnose({ providerRole: 'orchestrator', category: verification === 'confirmed' ? 'unresolved_conflict' : 'conflict_verification_failure', finalCode: verification === 'confirmed' ? 'generation_safety' : 'temporary_failure' })
        await markFailure('failed')
        return verification === 'confirmed'
          ? { status: 'unresolved_conflict', sessionId: session.id, message: 'The contract contains an unresolved conflict. Review the source details before generating again.' }
          : { status: 'failure', code: 'generation_safety' }
      }
      // The current state is reloaded after Generator execution. Never accept a
      // candidate if any relevant authority or the source has changed.
      const latest = await deps.loadContext(session.ownerUserId, session.weddingId, answers)
      if (!latest || !sessionMatchesScope(session, latest.scope)
        || latest.sourceSha256 !== session.sourceSha256
        || latest.authorityFingerprint !== context.authorityFingerprint) {
        diagnose({ providerRole: 'orchestrator', category: 'authority_changed', finalCode: 'stale' })
        await markFailure('stale')
        return { status: 'stale', code: 'authority_changed' }
      }
      let review: BoundaryReviewerState
      try {
        await reportStage('verifying')
        const reviewResult = await deps.review(latest, answers, {
          bytes: generated.candidate.bytes.slice(0),
          changedBlocks: structuredClone(generated.candidate.changedBlocks),
        })
        review = reviewerState(reviewResult)
        diagnose({ providerRole: 'Reviewer', category: review.status === 'passed' ? 'PASS' : review.status === 'findings' ? 'FAIL' : 'UNAVAILABLE', providerInvoked: true, editCount: generated.candidate.changedBlocks.length, mechanicalValidation: 'passed', ...(review.status === 'findings' ? {
          findingCount: review.findingCount,
          findingCategories: review.findingCategories,
          findingRuleIds: review.findingRuleIds,
        } : {}) })
      } catch (error) {
        diagnose({ providerRole: 'Reviewer', category: error instanceof ProviderOperationError ? error.category.toUpperCase() : 'INTERNAL_FAILURE', providerInvoked: providerInvoked(error), editCount: generated.candidate.changedBlocks.length, mechanicalValidation: 'passed', ...providerFailureTelemetry(error, providerInvoked(error) ? 'unknown_provider_failure' : undefined) })
        review = { status: 'unavailable' }
      }
      const beforePersist = await deps.loadContext(session.ownerUserId, session.weddingId, answers)
      if (!beforePersist || !sessionMatchesScope(session, beforePersist.scope)
        || beforePersist.sourceSha256 !== session.sourceSha256
        || beforePersist.authorityFingerprint !== context.authorityFingerprint) {
        diagnose({ providerRole: 'orchestrator', category: 'authority_changed_before_persist', finalCode: 'stale' })
        await markFailure('stale')
        return { status: 'stale', code: 'authority_changed' }
      }
      const candidateId = await deps.persistAcceptedCandidate({
        sessionId: session.id,
        executionId,
        candidate: generated.candidate,
        authorityFingerprint: context.authorityFingerprint,
      })
      diagnose({ providerRole: 'orchestrator', category: candidateId ? 'candidate_persisted' : 'candidate_persistence_failure', editCount: generated.candidate.changedBlocks.length, mechanicalValidation: 'passed', finalCode: candidateId ? undefined : 'temporary_failure' })
      if (!candidateId) await markFailure('failed')
      return candidateId
        ? { status: 'ready', sessionId: session.id, candidateId, templateId: session.templateId, templateVersionId: session.templateVersionId, reviewer: review }
        : { status: 'failure', code: 'temporary_failure' }
    } catch (error) {
      diagnose({
        providerRole: 'orchestrator',
        category: error instanceof ProviderOperationError ? error.category.toUpperCase() : 'INTERNAL_FAILURE',
        finalCode: 'temporary_failure',
        ...providerFailureTelemetry(error, error instanceof ProviderOperationError && error.category === 'provider_failure' ? 'unknown_provider_failure' : undefined),
      })
      await markFailure('failed').catch(() => undefined)
      return { status: 'failure', code: 'temporary_failure' }
    }
  }

  return {
    async start(userId: string, request: unknown): Promise<ContractGenerationBoundaryResponse> {
      if (!validStartRequest(request)) return { status: 'failure', code: 'generation_safety' }
      const context = await deps.loadContext(userId, request.weddingId.trim(), [])
      if (!context) return { status: 'precondition', code: 'setup_required' }
      if (context.scope.ownerUserId !== userId || context.scope.weddingId !== request.weddingId.trim()
        || context.scope.sourceSha256 !== context.sourceSha256) return { status: 'stale', code: 'session_invalid' }
      const existing = await deps.getSessionByIdempotencyKey(userId, request.requestId)
      if (existing) return existingStartResult(existing, userId, request.weddingId.trim(), context.scope, now())
      const executionId = deps.newId()
      const session = await deps.createSession({
        userId,
        weddingId: request.weddingId.trim(),
        requestId: request.requestId,
        scope: context.scope,
        sourceSha256: context.sourceSha256,
        authorityFingerprint: context.authorityFingerprint,
        executionId,
      })
      if (!session) {
        const replay = await deps.getSessionByIdempotencyKey(userId, request.requestId)
        return replay
          ? existingStartResult(replay, userId, request.weddingId.trim(), context.scope, now())
          : { status: 'stale', code: 'session_invalid' }
      }
      return execute(session, context, [], executionId, 'start', [])
    },

    async continue(userId: string, request: unknown): Promise<ContractGenerationBoundaryResponse> {
      if (!validContinueRequest(request)) return { status: 'failure', code: 'generation_safety' }
      const current = await deps.getSession(request.sessionId)
      if (!current || current.ownerUserId !== userId) return { status: 'stale', code: 'session_invalid' }
      if (!canResumeContractGenerationSession(current, current, now())) {
        if (current.state === 'awaiting_input' && Date.parse(current.expiresAt) <= now().getTime()) {
          await deps.expireSession(current.id, userId)
        }
        return { status: 'stale', code: 'session_invalid' }
      }
      const accepted = acceptSessionAnswers(current, request.answers, now())
      if (!accepted.ok) return { status: 'stale', code: 'session_invalid' }
      const executionId = deps.newId()
      const session = await deps.claimContinuation({
        sessionId: request.sessionId, userId, executionId, answers: accepted.answers,
        missingInputHistory: current.missingInputHistory, missingInputHistoryValid: current.missingInputHistoryValid !== false,
      })
      if (!session) return { status: 'stale', code: 'session_invalid' }
      const resolvedInputs = session.missingInputHistoryValid === false
        ? null
        : resolveMissingInputAnswers(session.missingInputHistory, session.answers, session.choiceBindings ?? {})
      if (!resolvedInputs) {
        try { deps.diagnose?.({ action: 'continue', providerRole: 'orchestrator', category: 'missing_requirement_history_invalid', finalCode: 'generation_safety' }) } catch { /* diagnostics are best effort */ }
        await deps.markFailure(session.id, executionId, 'failed', safeTerminalFailure({ action: 'continue', category: 'missing_requirement_history_invalid' }))
        return { status: 'failure', code: 'generation_safety' }
      }
      let context: ServerBoundaryContext | null
      try {
        context = await deps.loadContext(userId, current.weddingId, accepted.answers, resolvedInputs.flatMap((item) =>
          item.selectedEntity && 'optionId' in item.answer ? [{ requirementId: item.requirement.id, optionId: item.answer.optionId, partyKey: item.selectedEntity.partyKey }] : []))
      } catch {
        await deps.markFailure(current.id, executionId, 'failed', safeTerminalFailure({ action: 'continue', category: 'context_load_failure' }))
        return { status: 'failure', code: 'temporary_failure' }
      }
      if (!context || !sessionMatchesScope(current, context.scope)
        || context.sourceSha256 !== current.sourceSha256) {
        await deps.markFailure(current.id, executionId, 'stale', safeTerminalFailure({ action: 'continue', category: 'authority_changed' }))
        return { status: 'stale', code: 'session_invalid' }
      }
      return execute(session, context, accepted.answers, executionId, 'continue', resolvedInputs)
    },

  }
}

function existingStartResult(
  session: ContractGenerationSession,
  userId: string,
  weddingId: string,
  scope: ContractGenerationSessionScope,
  now: Date,
): ContractGenerationBoundaryResponse {
  if (session.ownerUserId !== userId || session.weddingId !== weddingId || !sessionMatchesScope(session, scope)) {
    return { status: 'stale', code: 'session_invalid' }
  }
  if (session.state === 'awaiting_input' && canResumeContractGenerationSession(session, scope, now)) {
    return { status: 'awaiting_input', sessionId: session.id, missingInputs: session.missingInputs }
  }
  if (session.state === 'completed') {
    if (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= now.getTime()) {
      return { status: 'stale', code: 'session_invalid' }
    }
    return { status: 'ready', sessionId: session.id, candidateId: session.id, templateId: session.templateId, templateVersionId: session.templateVersionId, reviewer: { status: 'unavailable' } }
  }
  return { status: 'failure', code: 'temporary_failure' }
}

export function parseContractGenerationAction(value: unknown):
  | { action: 'start'; request: ContractGenerationStartRequest }
  | { action: 'continue'; request: ContractGenerationContinueRequest }
  | { action: 'candidate'; request: ContractGenerationCandidateRequest }
  | { action: 'finalize'; request: ContractGenerationFinalizeRequest }
  | { action: 'validate_candidate'; request: ContractGenerationValidateCandidateRequest }
  | { action: 'cleanup_expired'; request: Record<string, never> }
  | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const envelope = value as Record<string, unknown>
  if (Object.keys(envelope).length !== 3 || envelope.version !== 1) return null
  if (envelope.action === 'start' && validStartRequest(envelope.request)) return { action: 'start', request: envelope.request }
  if (envelope.action === 'continue' && validContinueRequest(envelope.request)) return { action: 'continue', request: envelope.request }
  if (envelope.action === 'candidate' && validCandidateRequest(envelope.request)) return { action: 'candidate', request: envelope.request }
  if (envelope.action === 'finalize' && validFinalizeRequest(envelope.request)) return { action: 'finalize', request: envelope.request }
  if (envelope.action === 'validate_candidate' && validValidateCandidateRequest(envelope.request)) return { action: 'validate_candidate', request: envelope.request }
  if (envelope.action === 'cleanup_expired' && isEmptyObject(envelope.request)) return { action: 'cleanup_expired', request: {} }
  return null
}
