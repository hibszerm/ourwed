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
  documentType: string
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
  | 'timeout'
  | 'invalid_json'
  | 'validation_failed'
  | 'gemini_unavailable'
  | 'rate_limit'
  | 'empty_response'
  | 'unknown'

export interface DocumentAiErrorPayload {
  code: DocumentAiErrorCode
  message: string
}
