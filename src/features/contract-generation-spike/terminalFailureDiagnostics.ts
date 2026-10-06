import { safeMechanicalTelemetry, type MechanicalGateId, type MechanicalReasonCode } from './mechanicalDiagnostics.ts'
import {
  GENERATION_RESPONSE_VALIDATION_CODES,
  GENERATION_RESPONSE_VALIDATION_PATHS,
  type GenerationResponseBranch,
  type GenerationResponseValidationCode,
  type GenerationResponseValidationPath,
} from './generationProtocol.ts'

export type SafeFailureOrigin = 'EMPTY_STRUCTURED_OUTPUT' | 'STRUCTURED_OUTPUT_EXTRACTION_FAILURE' | 'GENERATION_RESPONSE_VALIDATION_FAILED' | 'GENERATION_RESPONSE_NORMALIZATION_FAILED'

export const TERMINAL_FAILURE_STAGES = [
  'generator', 'continuation', 'authority_freshness', 'source_copy', 'mechanical_validation',
  'stale_source_fact', 'reviewer', 'conflict_verifier', 'candidate_persistence', 'internal',
] as const

export type TerminalFailureStage = typeof TERMINAL_FAILURE_STAGES[number]

export const TERMINAL_FAILURE_CATEGORIES = [
  'invalid_missing_input_set', 'answered_requirement_reasked', 'duplicate_requirement_definition',
  'missing_input_persistence_failure', 'provider_failure', 'provider_configuration_failure',
  'invalid_response', 'input_validation_failure', 'mechanical_validation_failure', 'conflict_verification_failure',
  'authority_changed', 'authority_changed_before_persist', 'candidate_persistence_failure',
  'missing_requirement_history_invalid', 'context_load_failure', 'authority_context_invalid',
  'unresolved_conflict', 'internal_failure', 'internal',
] as const
type TerminalFailureCategory = typeof TERMINAL_FAILURE_CATEGORIES[number]
const terminalCategories = new Set<string>(TERMINAL_FAILURE_CATEGORIES)

const providerFailureStages = new Set(['request_build', 'timeout_setup', 'fetch_transport', 'fetch_timeout', 'http_non_ok', 'response_read', 'response_parse', 'structured_output', 'adapter_mapping', 'unknown_provider_failure'])
const providerFailureClasses = new Set(['transport_error', 'timeout', 'http_400', 'http_401', 'http_403', 'http_404', 'http_408', 'http_409', 'http_429', 'http_5xx', 'http_other'])
const failureOrigins = new Set<SafeFailureOrigin>(['EMPTY_STRUCTURED_OUTPUT', 'STRUCTURED_OUTPUT_EXTRACTION_FAILURE', 'GENERATION_RESPONSE_VALIDATION_FAILED', 'GENERATION_RESPONSE_NORMALIZATION_FAILED'])
const responseBranches = new Set<GenerationResponseBranch>(['MISSING_INPUT', 'CONFLICT_INPUT', 'READY', 'UNKNOWN'])
const schemaErrorCodes = new Set<GenerationResponseValidationCode>(GENERATION_RESPONSE_VALIDATION_CODES)
const schemaPaths = new Set<GenerationResponseValidationPath>(GENERATION_RESPONSE_VALIDATION_PATHS)

export type SafeTerminalFailure = {
  stage: TerminalFailureStage
  category?: TerminalFailureCategory
  action?: 'start' | 'continue'
  failureOrigin?: SafeFailureOrigin
  responseBranch?: GenerationResponseBranch
  schemaErrorCode?: GenerationResponseValidationCode
  schemaPath?: GenerationResponseValidationPath
  gateId?: MechanicalGateId
  reasonCode?: MechanicalReasonCode
  editIndex?: number
  editCount?: number
  operation?: 'replace' | 'insert_after' | 'other'
  sourceBlockType?: 'body' | 'table_cell' | 'header' | 'footer' | 'other'
  sourceBlockOrdinal?: number
  targetFound?: boolean
  editApplied?: boolean
  providerFailureStage?: string
  providerFailureClass?: string
  providerHttpStatus?: number
}

const stages = new Set<string>(TERMINAL_FAILURE_STAGES)

function safeIndex(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

/** Projects only closed-enum diagnostics and scalar edit metadata; never copies messages or payloads. */
export function safeTerminalFailure(input: unknown, fallbackStage: TerminalFailureStage = 'internal'): SafeTerminalFailure {
  const diagnostic = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  const hasMechanicalFailure = diagnostic.mechanicalGateId !== undefined || diagnostic.mechanicalReasonCode !== undefined
    || diagnostic.gateId !== undefined || diagnostic.reasonCode !== undefined
  const gateAndReason = hasMechanicalFailure ? safeMechanicalTelemetry({
    gateId: diagnostic.mechanicalGateId ?? diagnostic.gateId,
    reasonCode: diagnostic.mechanicalReasonCode ?? diagnostic.reasonCode,
    editIndex: diagnostic.mechanicalEditIndex ?? diagnostic.editIndex,
    editCount: diagnostic.mechanicalEditCount ?? diagnostic.editCount,
    editOperation: diagnostic.mechanicalEditOperation ?? diagnostic.operation,
    sourceBlockType: diagnostic.mechanicalSourceBlockType ?? diagnostic.sourceBlockType,
    sourceBlockOrdinal: diagnostic.mechanicalSourceBlockOrdinal ?? diagnostic.sourceBlockOrdinal,
    sourceTargetFound: diagnostic.mechanicalSourceTargetFound ?? diagnostic.targetFound,
    editorOperationReportedSuccess: diagnostic.mechanicalEditorOperationReportedSuccess ?? diagnostic.editApplied,
  }) : undefined
  const gateId = gateAndReason?.mechanicalGateId
  const reasonCode = gateAndReason?.mechanicalReasonCode
  const rawCategory = typeof diagnostic.category === 'string' ? diagnostic.category.toLowerCase() : ''
  const categoryValue = terminalCategories.has(rawCategory) ? rawCategory as TerminalFailureCategory : undefined
  let stage: TerminalFailureStage = fallbackStage
  if (gateId === 'stale_source_fact') stage = 'stale_source_fact'
  else if (gateId === 'source_copy') stage = 'source_copy'
  else if (gateId) stage = 'mechanical_validation'
  else if (categoryValue === 'authority_changed' || categoryValue === 'authority_changed_before_persist') stage = 'authority_freshness'
  else if (categoryValue === 'candidate_persistence_failure') stage = 'candidate_persistence'
  else if (categoryValue === 'missing_requirement_history_invalid' || categoryValue === 'context_load_failure') stage = 'continuation'
  else if (diagnostic.providerRole === 'Conflict Verifier') stage = 'conflict_verifier'
  else if (categoryValue === 'provider_failure' || categoryValue === 'provider_configuration_failure' || categoryValue === 'invalid_response') stage = 'generator'
  else if (categoryValue === 'conflict_verification_failure' || categoryValue === 'unresolved_conflict') stage = 'conflict_verifier'
  else if (categoryValue === 'input_validation_failure' || categoryValue === 'mechanical_validation_failure') stage = 'generator'
  else if (typeof diagnostic.providerRole === 'string' && diagnostic.providerRole === 'Reviewer' && categoryValue) stage = 'reviewer'
  else if (categoryValue === 'internal_failure' || categoryValue === 'internal') stage = 'internal'
  else if (typeof diagnostic.stage === 'string' && stages.has(diagnostic.stage)) stage = diagnostic.stage as TerminalFailureStage

  const result: SafeTerminalFailure = { stage }
  if (categoryValue) result.category = categoryValue
  if (diagnostic.action === 'start' || diagnostic.action === 'continue') result.action = diagnostic.action
  if (typeof diagnostic.failureOrigin === 'string' && failureOrigins.has(diagnostic.failureOrigin as SafeFailureOrigin)) result.failureOrigin = diagnostic.failureOrigin as SafeFailureOrigin
  if (typeof diagnostic.responseBranch === 'string' && responseBranches.has(diagnostic.responseBranch as GenerationResponseBranch)) result.responseBranch = diagnostic.responseBranch as GenerationResponseBranch
  if (typeof diagnostic.schemaErrorCode === 'string' && schemaErrorCodes.has(diagnostic.schemaErrorCode as GenerationResponseValidationCode)) result.schemaErrorCode = diagnostic.schemaErrorCode as GenerationResponseValidationCode
  if (typeof diagnostic.schemaPath === 'string' && schemaPaths.has(diagnostic.schemaPath as GenerationResponseValidationPath)) result.schemaPath = diagnostic.schemaPath as GenerationResponseValidationPath
  if (typeof diagnostic.providerFailureStage === 'string' && providerFailureStages.has(diagnostic.providerFailureStage)) result.providerFailureStage = diagnostic.providerFailureStage
  if (typeof diagnostic.providerFailureClass === 'string' && providerFailureClasses.has(diagnostic.providerFailureClass)) result.providerFailureClass = diagnostic.providerFailureClass
  if (Number.isSafeInteger(diagnostic.providerHttpStatus) && (diagnostic.providerHttpStatus as number) >= 100 && (diagnostic.providerHttpStatus as number) <= 599) result.providerHttpStatus = diagnostic.providerHttpStatus as number
  if (gateId && reasonCode) {
    result.gateId = gateId
    result.reasonCode = reasonCode
    if (safeIndex(gateAndReason?.mechanicalEditIndex)) result.editIndex = gateAndReason.mechanicalEditIndex
    if (safeIndex(gateAndReason?.mechanicalEditCount)) result.editCount = gateAndReason.mechanicalEditCount
    if (gateAndReason?.mechanicalEditOperation) result.operation = gateAndReason.mechanicalEditOperation
    if (gateAndReason?.mechanicalSourceBlockType) result.sourceBlockType = gateAndReason.mechanicalSourceBlockType
    if (safeIndex(gateAndReason?.mechanicalSourceBlockOrdinal)) result.sourceBlockOrdinal = gateAndReason.mechanicalSourceBlockOrdinal
    if (typeof gateAndReason?.mechanicalSourceTargetFound === 'boolean') result.targetFound = gateAndReason.mechanicalSourceTargetFound
    if (typeof gateAndReason?.mechanicalEditorOperationReportedSuccess === 'boolean') result.editApplied = gateAndReason.mechanicalEditorOperationReportedSuccess
  }
  return result
}
