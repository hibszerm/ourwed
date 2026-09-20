/**
 * AI Contract Transformation — production sparse / full-rewrite types.
 */

export const FULL_AI_PROMPT_VERSION = '2026-09-full-ai-v3'
export const FULL_AI_RESPONSE_VERSION = '2026-09-full-ai-v3'

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
