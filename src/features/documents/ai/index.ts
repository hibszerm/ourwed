/**
 * AI Document Analyzer layer.
 * Production: Supabase Edge Function (`edgeDocumentAnalyzer`).
 * Offline/dev: `mockDocumentAiAnalyzer`.
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
  DOCUMENT_ANALYSIS_MODEL,
  DOCUMENT_ANALYSIS_PROMPT_VERSION,
  buildDocumentAnalysisPrompt,
} from './DocumentAnalysisPrompt'
export { aiDocumentAnalysisResultSchema } from './analysisSchema'
export {
  expandSemanticExtraction,
  isSemanticExtractionPayload,
} from './expandSemanticExtraction'
export {
  CANONICAL_VARIABLE_IDS,
  CANONICAL_DEFAULT_IDS,
  resolveToRegistryKey,
  resolvePackageVariableId,
  resolveTemplateDefaultId,
  registryPolishLabel,
  isCoupleFacingRegistryKey,
  isStudioFacingRegistryKey,
  isPackageFacingRegistryKey,
  isTemplateDefaultRegistryKey,
} from './canonicalVariableIds'
export { matchLabelToRegistryKey } from './matchVariableLabel'
export { mockDocumentAiAnalyzer } from './mockDocumentAiAnalyzer'
export { edgeDocumentAnalyzer } from './edgeDocumentAnalyzer'
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
import { edgeDocumentAnalyzer } from './edgeDocumentAnalyzer'
import { mockDocumentAiAnalyzer } from './mockDocumentAiAnalyzer'

/**
 * Active analyzer for document import / Mapping Wizard.
 * UI must not know which AI provider runs behind the Edge Function.
 *
 * Override for local UI work without Edge Function:
 * `VITE_DOCUMENT_AI_USE_MOCK=true`
 */
export const activeAiDocumentAnalyzer: DocumentAnalyzer =
  import.meta.env.VITE_DOCUMENT_AI_USE_MOCK === 'true'
    ? mockDocumentAiAnalyzer
    : edgeDocumentAnalyzer
