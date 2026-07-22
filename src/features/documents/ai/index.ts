/**
 * AI Document Analyzer layer.
 * Production: Gemini via Supabase Edge Function (`geminiDocumentAnalyzer`).
 * Offline/dev: `mockGeminiAnalyzer`.
 */

export type {
  AiDocumentAnalysisResult,
  AiFieldStatus,
  DetectedDocumentClause,
  DetectedDocumentField,
  DetectedDocumentSection,
  DocumentAiErrorCode,
  DocumentAiErrorPayload,
} from './types'

export type { DocumentAnalyzer } from './analyzer'
export { DOCUMENT_AI_CONFIG } from './config'
export {
  GEMINI_DOCUMENT_ANALYSIS_MODEL,
  GEMINI_DOCUMENT_ANALYSIS_PROMPT_VERSION,
  buildGeminiDocumentAnalysisPrompt,
} from './GeminiDocumentAnalysisPrompt'
export { aiDocumentAnalysisResultSchema } from './analysisSchema'
export { mockGeminiAnalyzer } from './mockGeminiAnalyzer'
export { geminiDocumentAnalyzer } from './geminiDocumentAnalyzer'
export {
  aiAnalysisToDetectedFields,
  aiFieldToDetectedField,
  syncAiFieldStatus,
} from './bridgeToWizard'
export {
  DocumentAiAnalysisError,
  getDocumentAiErrorMessage,
} from './errors'
export {
  activeDocumentAnalysisCache,
  memoryDocumentAnalysisCache,
} from './cache'
export type { DocumentAnalysisCache } from './cache'

import type { DocumentAnalyzer } from './analyzer'
import { geminiDocumentAnalyzer } from './geminiDocumentAnalyzer'
import { mockGeminiAnalyzer } from './mockGeminiAnalyzer'

/**
 * Active analyzer for Mapping Wizard.
 * UI must not know whether this is mock or Gemini.
 *
 * Override for local UI work without Edge Function:
 * `VITE_DOCUMENT_AI_USE_MOCK=true`
 */
export const activeAiDocumentAnalyzer: DocumentAnalyzer =
  import.meta.env.VITE_DOCUMENT_AI_USE_MOCK === 'true'
    ? mockGeminiAnalyzer
    : geminiDocumentAnalyzer
