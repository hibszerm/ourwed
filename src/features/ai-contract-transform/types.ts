/**
 * AI Contract Transformation — production sparse / full-rewrite types.
 */

export const FULL_AI_PROMPT_VERSION = '2026-09-full-ai-v4'
export const FULL_AI_RESPONSE_VERSION = '2026-09-full-ai-v4'

/** Schema version for persisted sparse wedding generation artifacts. */
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

/** Production Edge invoke mode (full-rewrite only after Mode B retirement). */
export type TransformMode = 'full_ai_trusted_rewrite'

export type ContractTransformationDataset = {
  clients: {
    displayNames: string
    personCount: 1 | 2
    address?: string
    phone?: string
    /** Ordered CRM ownership slots: index 0 is partner1, index 1 is partner2. */
    customers?: Array<{
      displayName: string
      address?: string
      /** Authoritative CRM address components retained before flat rendering. */
      addressTarget?: { text: string; segments: string[] }
      phone?: string
      email?: string
    }>
  }
  dates: {
    contractExecutionDate: string
    weddingDate: string
    depositDueDate?: string
    finalPaymentDueDate?: string
    deliveryDueDate?: string
  }
  locations: {
    preparation?: {
      displayName?: string
      fullAddress?: string
      city?: string
      target?: { text: string; segments: string[] }
    }
    /** Structured bride/groom/shared preparation addresses (authoritative). */
    preparationLocations?: Array<{
      person: 'bride' | 'groom' | 'shared'
      label: string
      fullAddress: string
      target?: { text: string; segments: string[] }
    }>
    /** Deterministic Polish display fragment for preparation clauses. */
    preparationDisplayText?: string
    ceremony?: {
      displayName?: string
      fullAddress?: string
      city?: string
      target?: { text: string; segments: string[] }
    }
    reception?: {
      displayName?: string
      fullAddress?: string
      city?: string
      target?: { text: string; segments: string[] }
    }
    /**
     * Roles intentionally absent in CRM (not merely omitted from JSON).
     * Full-AI must not invent venues for these roles or copy another role's venue.
     */
    absentLocationRoles?: Array<'ceremony' | 'preparation' | 'reception'>
    /**
     * Explicit integrity policy for the rewrite model (A5 role-fact invention).
     * Present whenever any optional location role is absent.
     */
    locationRoleIntegrity?: {
      eachRoleIndependent: true
      neverInferAbsentRoleFromAnother: true
      sameVenueOnlyWhenExplicitPerRole: true
      absentMeansDoNotAssertVenue: true
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
  /** Canonical text boundaries created by ordinary OOXML line breaks. */
  breakOffsets?: readonly number[]
  tableIndex?: number
  rowIndex?: number
  cellIndex?: number
  /** Present for table cells — row-local ownership. */
  tableContext?: import('./tableRowOwnership').TableCellContext
  /** Compact structural context passed to the rewrite model; never inferred client-side. */
  modelContext?: {
    semanticRoles?: string[]
    ownership?: 'customer' | 'provider' | 'mixed' | 'unknown'
    modelEditable?: boolean
    ownershipReason?: string
    protectionReason?: string
    signatureRegion?: 'before' | 'signature' | 'after'
  }
}

export type TransformedBlock = {
  blockId: string
  text: string
  /** System-attached SOURCE identity; never inferred from transformed text. */
  originSourceBlockId?: string
}

/**
 * A narrowly-scoped semantic interpretation supplied by the rewrite model.
 * It is grounded to an immutable SOURCE block and never contains a value.
 */
export type FinanceSemanticConcept = 'total' | 'deposit' | 'remaining'

export type GroundedFinanceEvidence = {
  sourceBlockId: string
  financeConcept: FinanceSemanticConcept
}

export type GroundedFinanceEvidenceOutcome = GroundedFinanceEvidence & {
  outcome: 'accepted' | 'rejected_unknown_source' | 'rejected_contradiction' | 'rejected_invalid'
}

export type DateSemanticConcept = 'wedding_date' | 'execution_date'

export type RequiresUserInputDate = {
  /** Stable identity derived from the grounded source mapping. */
  unresolvedDateId: string
  /** Fingerprint of the complete grounded source paragraph set for stale-resume protection. */
  documentStateId: string
  sourceBlockId: string
  anchor: string
  span: { start: number; end: number }
  role?: string
  label?: string
  reason: string
}

/** Canonical ISO date supplied for a currently unresolved grounded mapping. */
export type SuppliedDateValue = {
  unresolvedDateId: string
  value: string
}

/** Resume inputs are bound to the exact source state that produced the requests. */
export type SuppliedDateValues = {
  documentStateId: string
  values: readonly SuppliedDateValue[]
}

export type GroundedDateEvidence = {
  sourceBlockId: string
  dateConcept: DateSemanticConcept
}

export type GroundedDateEvidenceOutcome = GroundedDateEvidence & {
  outcome: 'accepted' | 'rejected_unknown_source' | 'rejected_contradiction' | 'rejected_invalid' | 'rejected_ambiguous'
  rejectionReason?: string
  resolvedTransformedBlockId?: string
  evidenceSource: 'model_semantic'
  repairAttempted?: boolean
  repairApplied?: boolean
  repairSkipReason?: string
  postRepairClassification?: string
}

export type FinanceSurfaceDiagnostic = {
  canonicalRole: FinanceSemanticConcept
  originSourceBlockId?: string
  targetBlockId?: string
  applied: boolean
  reason?: string
}

export type CrossSurfaceFinanceDiagnostic = {
  canonicalRole: FinanceSemanticConcept
  semanticSourceBlockIds: string[]
  structuralCandidateSourceBlockIds: string[]
  ownershipEstablished: boolean
  reason?: string
}

export type TotalWordsDiagnostic = {
  sourceWordsBlockId?: string
  sourceFractionalSuffixDetected: boolean
  repairedWordsValue?: string
  suffixPreserved?: boolean
}

export type QualityGateEvidenceTrace = {
  party: Array<Record<string, unknown>>
  mixedPartyRepairs?: import('./quality/types').MixedPartyRepairDiagnostic[]
  dates: Array<Record<string, unknown>>
  provider: Array<Record<string, unknown>>
  violations: Array<{ code: string; blockId?: string; canonicalField?: string; dimension: string }>
}

export type ContractTransformDiagnostics = {
  groundedFinanceEvidence: GroundedFinanceEvidenceOutcome[]
  dateEvidence: GroundedDateEvidenceOutcome[]
  crossSurfaceFinance: CrossSurfaceFinanceDiagnostic[]
  financeRepairs: FinanceSurfaceDiagnostic[]
  totalWords?: TotalWordsDiagnostic
  qualityGateEvidence?: QualityGateEvidenceTrace
}
