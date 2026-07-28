/**
 * AI Contract Transformation Comparison Lab — isolated from semantic mapping.
 */

export const FULL_AI_PROMPT_VERSION = '2026-07-full-ai-v2'
export const FULL_AI_RESPONSE_VERSION = '2026-07-full-ai-v2'
export const GUARDED_AI_PROMPT_VERSION = '2026-07-guarded-ai-v2'
export const GUARDED_AI_RESPONSE_VERSION = '2026-07-guarded-ai-v2'

export const TRANSFORM_PIPELINE_SCHEMA_VERSION = '2026-07-transform-v2'

/** Safe per-mode response size / incomplete metadata (no contract text). */
export type ResponseSizeDiagnostics = {
  attemptCount?: number
  configuredMaxOutputTokens?: number
  sourceBlockCount?: number
  sourceCharacterCount?: number
  changedBlockCount?: number | null
  responseStatus?: string
  incompleteReason?: string | null
  inputTokens?: number
  outputTokens?: number
  responseId?: string | null
  outputItemCount?: number
}

export type TransformMode =
  | 'full_ai_trusted_rewrite'
  | 'guarded_ai_transform'

export type ContractTransformationDataset = {
  clients: {
    displayNames: string
    personCount: 1 | 2
    address?: string
    phone?: string
  }
  dates: {
    contractExecutionDate: string
    weddingDate: string
    depositDueDate?: string
    finalPaymentDueDate?: string
  }
  locations: {
    preparation?: {
      displayName?: string
      fullAddress?: string
      city?: string
    }
    /** Structured bride/groom/shared preparation addresses (authoritative). */
    preparationLocations?: Array<{
      person: 'bride' | 'groom' | 'shared'
      label: string
      fullAddress: string
    }>
    /** Deterministic Polish display fragment for preparation clauses. */
    preparationDisplayText?: string
    ceremony?: {
      displayName?: string
      fullAddress?: string
      city?: string
    }
    reception?: {
      displayName?: string
      fullAddress?: string
      city?: string
    }
  }
  finances: {
    contractValueFormatted: string
    contractValueWords: string
    depositFormatted?: string
    depositWords?: string
    remainingFormatted?: string
    remainingWords?: string
  }
  package: {
    name?: string
    /** When set, service/package tables are expected to update. */
    explicitServiceScope?: {
      rows: Array<{ material?: string; duration?: string; included?: string }>
    }
  }
  /** Wedding-specific additional services — names only, no price or quantity. */
  additionalServices?: Array<{ id?: string; name: string }>
  /** Deterministic newline-separated display for prompts / diagnostics. */
  additionalServicesDisplayText?: string
  /** Quality-gate expectation (derived from additionalServices). */
  additionalServicesExpectation?: import('./quality/types').AdditionalServicesExpectation
}

export type ProtectedPattern = {
  kind:
    | 'nip'
    | 'regon'
    | 'bank_account'
    | 'email'
    | 'phone'
    | 'provider_name'
    | 'other'
  patternSource: string
}

export type ProtectedContractData = {
  exactProtectedValues: string[]
  protectedPatterns: ProtectedPattern[]
}

export type TransformDocumentBlock = {
  blockId: string
  paragraphIndex: number
  text: string
  kind: 'paragraph' | 'tableCell'
  tableIndex?: number
  rowIndex?: number
  cellIndex?: number
  /** Present for table cells — row-local ownership. */
  tableContext?: import('./tableRowOwnership').TableCellContext
}

export type TransformedBlock = {
  blockId: string
  text: string
}

export type ChangeClassification =
  | 'allowed_client_data'
  | 'allowed_date'
  | 'allowed_location'
  | 'allowed_finance'
  | 'allowed_grammatical_adjustment'
  | 'protected_value_change'
  | 'unexpected_number_change'
  | 'unexpected_text_change'
  | 'sentence_structure_change'
  | 'block_structure_change'
  | 'possible_location_grammar_issue'
  | 'incomplete_location_address'

export type ChangeSeverity = 'info' | 'warning' | 'blocking'

export type ContractTextChange = {
  sourceStart: number
  sourceEnd: number
  sourceText: string
  replacementText: string
  classification: ChangeClassification
  severity: ChangeSeverity
  matchedDatasetField?: string
  exceptionApproved?: boolean
}

export type ContractBlockDiff = {
  blockId: string
  paragraphIndex: number
  sourceText: string
  transformedText: string
  changes: ContractTextChange[]
}

export type GuardedTransformationStatus =
  | 'safe_to_generate'
  | 'review_required'
  | 'blocked'

export type ModeADiagnostics = {
  blocksAdded: string[]
  blocksRemoved: string[]
  blocksReordered: boolean
  changedBlockCount: number
  unchangedBlockCount: number
  protectedValuesChanged: number
  unexpectedNumbersChanged: number
  broaderEditSentenceCount: number
  textSimilarity: number
  warnings: string[]
}

export type ModeBVerification = {
  status: GuardedTransformationStatus
  structureOk: boolean
  blockingIssues: string[]
  reviewIssues: string[]
  diffs: ContractBlockDiff[]
  expectedChangeCount: number
  unexpectedChangeCount: number
  protectedChangeCount: number
  structureChangeCount: number
}

export type TransformModeLifecycle = 'idle' | 'running' | 'success' | 'error'

export type TransformModeResult = {
  mode: TransformMode
  status: TransformModeLifecycle
  errorCode?: string
  errorMessage?: string
  /** Structured edge/provider failure detail for diagnostics. */
  edgeError?: import('./edgeFunctionError').TransformEdgeErrorDetail
  durationMs?: number
  model?: string
  promptVersion: string
  responseVersion?: string
  /** Reconstructed full document (from sparse changedBlocks). */
  transformedBlocks?: TransformedBlock[]
  /** Sparse AI payload size / incomplete metadata. */
  responseSizeDiagnostics?: ResponseSizeDiagnostics
  diffs: ContractBlockDiff[]
  modeADiagnostics?: ModeADiagnostics
  modeBVerification?: ModeBVerification
  /** Post-reconstruction quality gate (completeness, finances, locations). */
  qualityReport?: import('./quality/types').DocumentQualityReport
  outputBytes?: ArrayBuffer
  downloadAvailable: boolean
  changedBlockCount: number
  totalTextChanges: number
  expectedChanges: number
  unexpectedChanges: number
  protectedChanges: number
  structureChanges: number
}

export type TransformationEvaluation = {
  runId: string
  mode: TransformMode
  documentCorrect: true | false | null
  preservedFormatting: true | false | null
  changedOnlyExpectedData: true | false | null
  grammaticalQuality: 'good' | 'acceptable' | 'poor' | null
  manualCorrectionsCount?: number
  notes?: string
  updatedAt: string
}

export type TransformComparisonRun = {
  runId: string
  createdAt: string
  schemaVersion: string
  sourceFileName: string
  blockCount: number
  dataset: ContractTransformationDataset
  protectedSummary: { exactCount: number; patternCount: number }
  modeA: TransformModeResult
  modeB: TransformModeResult
  evaluations: TransformationEvaluation[]
  approvedExceptions: Record<string, boolean>
}

export type ComparisonScorecard = {
  successfulDocumentsPerMode: Record<TransformMode, number>
  averageUnexpectedChanges: Record<TransformMode, number>
  averageManualCorrections: Record<TransformMode, number>
  averageProcessingTimeMs: Record<TransformMode, number>
  blockedGuardedRuns: number
  preferredMode: TransformMode | null
}
