/**
 * Isolated AI Contract Experiment types (Phase 1).
 * Never shared with production package-contract generation.
 */

import type { ExperimentalRenderEligibility } from './experimentalRenderEligibility'
import type { OccurrenceValidationDimensions } from './validation/types'

/** Bumped when stored experiment review state shape changes. */
export const EXPERIMENT_PIPELINE_SCHEMA_VERSION = '2026-07-v3'

export type AiContractExperimentMode = 'full_ai' | 'structured_mapping'

export type AiContractExperimentTemplate = {
  id: string
  packageId: string
  sourceDocumentId: string
  sourceFileName: string
  uploadedAt: string
  analysisStatus: 'not_started' | 'running' | 'completed' | 'failed'
  /** True when source DOCX bytes are stored for experiment rendering. */
  hasSourceDocx?: boolean
}

export type MappingGenerationContext = {
  expectedClientCount: number
  availableWeddingFields: ContractFieldKey[]
  universallyRequiredTemplateFields: ContractFieldKey[]
  sourceConditionalFields: ContractFieldKey[]
}

export type AiContractExperimentRun = {
  id: string
  templateId: string
  packageId: string
  weddingId: string
  mode: AiContractExperimentMode
  startedAt: string
  completedAt?: string
  status:
    | 'queued'
    | 'analyzing'
    | 'generating'
    | 'auditing'
    | 'completed'
    | 'failed'
  timing: {
    analysisMs?: number
    generationMs?: number
    auditMs?: number
    totalMs?: number
  }
  usage?: {
    requestCount: number
    inputTokens?: number
    outputTokens?: number
    estimatedCostPln?: number
  }
  errorMessage?: string
}

export type ContractGenerationInput = {
  currentDate: string
  weddingDate: string
  clients: Array<{
    id: string
    firstName: string
    lastName: string
    fullName: string
    address?: string
    phone?: string
  }>
  locations: {
    preparation?: string
    ceremony?: string
    reception?: string
  }
  finances: {
    contractValue: number
    contractValueFormatted: string
    contractValueWords: string
    depositAmount: number
    depositAmountFormatted: string
    depositAmountWords: string
    remainingAmount: number
    remainingAmountFormatted: string
    remainingAmountWords: string
    payments: Array<{
      id: string
      label: string
      amount: number
      amountFormatted: string
      dueDate?: string
      type: string
      paid: boolean
    }>
  }
  package: {
    id: string
    name: string
  }
}

export type IndexedDocxRun = {
  runIndex: number
  text: string
}

export type IndexedDocxBlock =
  | {
      id: string
      kind: 'paragraph'
      paragraphIndex: number
      text: string
      runs: IndexedDocxRun[]
    }
  | {
      id: string
      kind: 'tableCell'
      paragraphIndex: number
      tableIndex: number
      rowIndex: number
      cellIndex: number
      text: string
      rowTexts: string[]
      headerTexts: string[]
      runs: IndexedDocxRun[]
    }

/** Lab allowlist keys — authoritative names where they differ. */
export type ContractFieldKey =
  | 'couple_full_names'
  | 'client_address'
  | 'client_phone'
  | 'contract_execution_date'
  | 'wedding_date'
  | 'preparation_location'
  | 'ceremony_location'
  | 'reception_location'
  | 'contract_value_formatted'
  | 'contract_value_words'
  | 'agreed_deposit_formatted'
  | 'agreed_deposit_words'
  | 'remaining_after_deposit_formatted'
  | 'remaining_after_deposit_words'
  | 'deposit_due_date'
  | 'payment_due_date'
  | 'final_payment_due_date'

export type FullAiDocumentAnalysis = {
  documentType: string
  clientPartyMode:
    | 'single'
    | 'composite_two_person'
    | 'separate_persons'
    | 'unknown'
  detectedFields: Array<{
    fieldKey: ContractFieldKey
    blockId: string
    sourceText: string
    semanticMeaning: string
    confidence: number
  }>
  immutableSections: Array<{
    blockId: string
    sourceText: string
    classification: string
  }>
  warnings: Array<{ code: string; message: string }>
}

export type StructuredAiFieldProposal = {
  fieldKey: ContractFieldKey
  blockId: string
  /** Minimal replaceable value — authoritative physical binding source. */
  exactValue: string
  /** Diagnostic evidence fragment — never replaced. */
  evidenceText: string
  contextBefore: string
  contextAfter: string
  semanticRole: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  pairedFieldGroup: string | null
}

export const AI_CONTRACT_MAPPING_RESPONSE_VERSION_V2 = '2026-07-v2' as const
export const AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3 = '2026-07-v3' as const
export const AI_CONTRACT_MAPPING_RESPONSE_VERSION =
  AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3

export const SUPPORTED_AI_MAPPING_RESPONSE_VERSIONS = [
  AI_CONTRACT_MAPPING_RESPONSE_VERSION_V2,
  AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3,
] as const

export type AiMappingResponseVersion =
  (typeof SUPPORTED_AI_MAPPING_RESPONSE_VERSIONS)[number]

export type StructuredAiMappingResponse = {
  responseVersion: AiMappingResponseVersion
  documentAssessment: {
    documentType:
      | 'wedding_photography_contract'
      | 'wedding_video_contract'
      | 'wedding_service_contract'
      | 'unknown'
    clientPartyCapability: {
      physicalMode:
        | 'composite'
        | 'separate_persons'
        | 'single_person'
        | 'unknown'
      expectedPersonCount: 0 | 1 | 2
    }
  }
  fields: StructuredAiFieldProposal[]
  unsupportedValues: Array<{
    blockId: string
    sourceText: string
    semanticRole: string
    reason: string
  }>
  immutableFindings: Array<{
    blockId: string
    sourceText: string
    classification:
      | 'provider_data'
      | 'bank_account'
      | 'package_fact'
      | 'legal_clause'
      | 'coverage_fact'
      | 'delivery_fact'
      | 'other_immutable'
    reason: string
  }>
  warnings: Array<{
    code:
      | 'ambiguous_identity'
      | 'ambiguous_date'
      | 'ambiguous_money'
      | 'missing_required_field'
      | 'duplicate_candidate'
      | 'unsupported_payment_structure'
      | 'possible_provider_confusion'
      | 'other'
    message: string
    blockId: string | null
  }>
}

export type AiMappingConfidenceLevel = 'high' | 'medium' | 'low'

export type MappingApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected_by_user'
  | 'manually_mapped'
  | 'ignored_immutable'
  /** @deprecated validation failure legacy — use validationStatus rejected */
  | 'rejected'

export type OccurrenceGraphOrigin = 'ai' | 'validator' | 'supplement' | 'manual'

export type ReplacementStrategy =
  | 'AUTO_REPLACE'
  | 'CONFIRM_ONLY'
  | 'CUSTOM_TEXT_REQUIRED'
  | 'IGNORE_OCCURRENCE'

export type OccurrencePhysicalRange = {
  start: number
  end: number
  tableIndex?: number
  rowIndex?: number
  cellIndex?: number
}

/** Canonical dynamic occurrence — single source of mapping state (Phase 3). */
export type ContractOccurrence = {
  id: string
  fieldKey: ContractFieldKey
  blockId: string
  paragraphIndex: number
  physicalRange: OccurrencePhysicalRange
  replacementStrategy: ReplacementStrategy
  sourceValue: string
  /** Wedding/package target value for replacement — distinct from sourceValue. */
  targetValue: string
  /** @deprecated Use targetValue */
  replacementValue: string
  customReplacement?: string
  approvalStatus: MappingApprovalStatus
  validationStatus: 'valid' | 'needs_review' | 'rejected'
  origin: OccurrenceGraphOrigin
  confidence: AiMappingConfidenceLevel
  confidenceScore: number
  pairedFieldGroup?: string | null
  relatedPrimaryOccurrenceId?: string
  rejectionReason?: string
  grammaticalForm?: string
  validationDimensions?: OccurrenceValidationDimensions
  diagnostics?: Record<string, unknown>
}

export type ContractOccurrenceGraph = {
  experimentRunId: string
  occurrences: ContractOccurrence[]
}

export type RenderOperationStatus = 'READY' | 'BLOCKED' | 'SKIPPED'

export type RenderPlanOperation = {
  operationId: string
  occurrenceId: string
  fieldKey: ContractFieldKey
  blockId: string
  paragraphIndex: number
  tableIndex?: number
  rowIndex?: number
  cellIndex?: number
  sourceRange: { start: number; end: number; sourceText: string }
  replacementText: string
  strategy: ReplacementStrategy
  status: RenderOperationStatus
}

export type RenderPlan = {
  experimentRunId: string
  operations: RenderPlanOperation[]
}

export type PhysicalOccurrenceReplacementMode =
  | 'direct_value'
  | 'location_name_inflected'
  | 'manual_review_required'

export type OccurrenceOrigin = 'ai_proposal' | 'validator_detected' | 'manual'

export type LogicalFieldMappingGroup = {
  fieldKey: ContractFieldKey
  logicalValueRole: string
  replacementPreview: string
  physicalMappings: ValidatedAiMapping[]
}

export type LocationReplacementCapability = {
  fullLocationValue?: string
  venueName?: string
  address?: string
}

export type MappingReadinessStatus =
  | 'ready'
  | 'needs_review'
  | 'incomplete'
  | 'invalid'

export type ExactSpanResolution = {
  status: 'resolved' | 'not_found' | 'ambiguous'
  occurrenceCount: number
  start?: number
  end?: number
}

export type MappingBoundaryResolution = {
  originalExactValue: string
  resolvedExactValue: string
  resolutionMethod: 'ai_exact' | 'refined_by_validator' | 'manual'
}

export type ValidatedAiMapping = {
  /** Stable ID for review decisions — assigned at validation time. */
  id?: string
  experimentRunId?: string
  fieldKey: ContractFieldKey
  blockId: string
  paragraphIndex: number
  tableIndex?: number
  rowIndex?: number
  cellIndex?: number
  start: number
  end: number
  /** Resolved exact replaceable span (physical binding). */
  sourceText: string
  aiExactValue: string
  evidenceText: string
  resolvedExactValue: string
  resolutionMethod: MappingBoundaryResolution['resolutionMethod']
  occurrenceCount: number
  contextBefore?: string
  contextAfter?: string
  semanticRole?: string
  reasoning?: string
  confidence: AiMappingConfidenceLevel
  confidenceScore: number
  validationStatus: 'valid' | 'needs_review' | 'rejected'
  approvalStatus: MappingApprovalStatus
  rejectionReason?: string
  pairedFieldGroup?: string | null
  fieldValidation?: string
  overlapValidation?: string
  /** Preview target from wedding data (not sent to OpenAI). */
  targetValue?: string
  /** @deprecated Use targetValue */
  replacementValue?: string
  occurrenceReplacementMode?: PhysicalOccurrenceReplacementMode
  occurrenceOrigin?: OccurrenceOrigin
  relatedPrimaryMappingId?: string
  customReplacementValue?: string
  grammaticalForm?: string
  validationDimensions?: OccurrenceValidationDimensions
  sourceValueComparisonForm?: string
  /** @deprecated Diagnostic only — use validationDimensions.aiProposedFieldKey */
  aiProposedFieldKey?: ContractFieldKey
}

/** Canonical reviewed mapping — authoritative for readiness, metrics, render. */
export type ReviewedExperimentalMapping = ValidatedAiMapping & {
  id: string
  experimentRunId: string
  replacementValue: string
}

export type ProposalDiagnostic = {
  fieldKey: ContractFieldKey
  blockId: string
  aiExactValue: string
  evidenceText: string
  resolvedExactValue: string
  occurrenceCount: number
  start: number
  end: number
  resolutionMethod: MappingBoundaryResolution['resolutionMethod']
  fieldValidation?: string
  overlapValidation?: string
  finalStatus: ValidatedAiMapping['validationStatus']
  rejectionReason?: string
}

export type MappingDiagnosticsSummary = {
  aiProposalCount: number
  exactAcceptedCount: number
  refinedCount: number
  needsReviewCount: number
  rejectedCount: number
  requiredReadyCount: number
  requiredMissingCount: number
}

export type StructuredMappingMetadata = {
  model: string
  requestCount: number
  inputTokens?: number
  outputTokens?: number
  durationMs: number
  responseId: string | null
  promptVersion: string
}

export type StructuredMappingDiagnostics = {
  promptVersion: string
  responseVersion?: string
  systemPrompt: string
  taskPayload: unknown
  sanitizedRequest: unknown
}

export type AiMappingApiErrorCode =
  | 'not_configured'
  | 'authentication_failed'
  | 'model_unavailable'
  | 'rate_limited'
  | 'timeout'
  | 'invalid_structured_output'
  | 'missing_structured_output'
  | 'incomplete_response'
  | 'refused'
  | 'document_too_large'
  | 'request_failed'

export type AiContractChange = {
  sourceBlockId: string
  before: string
  after: string
  classification:
    | 'allowed_dynamic_change'
    | 'formatting_change'
    | 'unauthorized_text_change'
    | 'removed_content'
    | 'added_content'
    | 'unmapped_change'
}

export type FullAiSafetyResult = {
  status: 'safe' | 'warning' | 'critical'
  allowedChangeCount: number
  unauthorizedChangeCount: number
  removedBlockCount: number
  addedBlockCount: number
  issues: Array<{ code: string; message: string; blockId?: string }>
}

export type FullAiGeneratedDocument = {
  blocks: Array<{ id: string; text: string }>
}

export type ExperimentalPhysicalBinding = {
  id: string
  experimentRunId: string
  fieldKey: ContractFieldKey
  blockId: string
  paragraphIndex: number
  tableIndex?: number
  rowIndex?: number
  cellIndex?: number
  start: number
  end: number
  sourceText: string
  replacementValue: string
  origin: 'ai_exact' | 'refined_by_validator' | 'manual'
}

export type ExperimentalReplacementCheck = {
  fieldKey: ContractFieldKey
  paragraphIndex: number
  expectedSourceText: string
  expectedReplacementText: string
  sourceStart: number
  sourceEnd: number
  replacementApplied: boolean
  sourceTextMatchedBeforeReplace: boolean
  resultingParagraphText: string
  traceFound?: boolean
}

export type ExperimentalImmutableCheck = {
  paragraphIndex: number
  blockId: string
  sourceOutsideText: string
  outputOutsideText: string
  unchanged: boolean
}

export type ExperimentalRenderAudit = {
  status: 'safe' | 'warning' | 'critical'
  replacementChecks?: ExperimentalReplacementCheck[]
  immutableChecks: ExperimentalImmutableCheck[]
  immutableBlocksChecked: number
  issues: Array<{
    severity: 'warning' | 'critical'
    code: string
    message: string
    paragraphIndex?: number
    blockId?: string
  }>
}

export type ExperimentalRenderChange = {
  fieldKey: ContractFieldKey
  blockId: string
  paragraphIndex: number
  sourceValue: string
  replacementValue: string
  applied: boolean
}

export type ExperimentComparisonMetrics = {
  requiredFieldsDetected: number
  optionalFieldsDetected: number
  invalidMappings: number
  unauthorizedChanges: number
  fieldsManuallyCorrected: number
  generationSuccess: boolean
  auditStatus: string
  requestCount: number | null
  totalDurationMs: number | null
  estimatedCostPln: number | null | 'Brak danych'
  changedSourceBlocks: number
  rendererOperations: number
  approvedMappings?: number
  plannedRendererOperations?: number
  validMappings?: number
  pendingMappings?: number
  rejectedMappings?: number
  manualMappings?: number
  replacedParagraphs?: number
  immutableBlocksChecked?: number
  auditIssues?: number
}

export type ExperimentRunResult = {
  run: AiContractExperimentRun
  mode: AiContractExperimentMode
  indexedBlocks: IndexedDocxBlock[]
  generationInput: ContractGenerationInput
  fullAiAnalysis?: FullAiDocumentAnalysis
  fullAiGenerated?: FullAiGeneratedDocument
  fullAiSafety?: FullAiSafetyResult
  structuredMapping?: StructuredAiMappingResponse
  /** @deprecated Derived from occurrenceGraph — use graph selectors. */
  validatedMappings?: ValidatedAiMapping[]
  /** Canonical mapping state (Phase 3). */
  occurrenceGraph?: ContractOccurrenceGraph
  /** Last computed render plan (set at render time). */
  renderPlan?: RenderPlan
  mappingMetadata?: StructuredMappingMetadata
  mappingDiagnostics?: StructuredMappingDiagnostics
  mappingReadiness?: MappingReadinessStatus
  proposalDiagnostics?: ProposalDiagnostic[]
  diagnosticsSummary?: MappingDiagnosticsSummary
  mappingPhase?: 'review' | 'rendered'
  /** @deprecated Derived from renderPlan execution — debug snapshot only. */
  experimentalBindings?: ExperimentalPhysicalBinding[]
  renderAudit?: ExperimentalRenderAudit
  renderChanges?: ExperimentalRenderChange[]
  renderedDocxAvailable?: boolean
  renderDurationMs?: number
  metrics: ExperimentComparisonMetrics
  rawResponse?: unknown
  renderEligibility?: ExperimentalRenderEligibility
}

export type ExperimentStoreState = {
  templates: AiContractExperimentTemplate[]
  runs: AiContractExperimentRun[]
  results: Record<string, ExperimentRunResult>
}
