/**
 * AI Document Analyzer — domain types.
 * Maps only to existing Variable Registry keys (never invents business fields).
 */

export type AiFieldStatus = 'suggested' | 'confirmed' | 'rejected'

export interface DetectedDocumentField {
  id: string
  label: string
  /** Must be a Variable Registry key, or null if unknown. */
  registryKey: string | null
  /** Extracted sample value from the contract (may be null). */
  value?: string | null
  /** @deprecated Prefer `value` — kept for bridge compatibility. */
  extractedValue?: string
  /** 0–1 */
  confidence: number
  paragraphIndex?: number | null
  location?: {
    paragraphIndex?: number
    text?: string
  }
  status: AiFieldStatus
}

export interface DetectedDocumentSection {
  title: string
  order: number
}

export interface DetectedDocumentClause {
  id: string
  type: string
  confidence: number
  title?: string
}

export interface AiDocumentAnalysisResult {
  schemaVersion: string
  model: string
  promptVersion: string
  analyzerId: string
  analyzerVersion: string
  /** Human contract title from AI (e.g. "Wedding Photography"). */
  documentType: string
  /** AI package kind hint — mapped by OurWed, never CRM package id. */
  packageSuggestion?: string | null
  /**
   * Package slots detected in the contract (canonical ids, presence only).
   * Values always come from Studio Packages — never from contract text.
   */
  packageVariables?: string[]
  /**
   * @deprecated Always empty — business values are not stored on templates.
   */
  defaults?: Array<{ id: string; value: string }>
  overallConfidence: number
  fields: DetectedDocumentField[]
  sections: DetectedDocumentSection[]
  clauses: DetectedDocumentClause[]
  warnings: string[]
  analyzedAt: string
  /** Echo of input text length for debugging (not shown to users). */
  sourceTextLength: number
  /** SHA-256 of analyzed text — used for cache keys. */
  contentHash?: string
  /** True when served from client/server cache. */
  fromCache?: boolean
}

export type DocumentAiErrorCode =
  | 'unauthorized'
  | 'bad_request'
  | 'provider_timeout'
  | 'provider_rate_limit'
  | 'provider_unavailable'
  | 'invalid_json'
  | 'validation_failed'
  | 'empty_response'
  | 'unknown'

export interface DocumentAiErrorPayload {
  code: DocumentAiErrorCode
  message: string
}
