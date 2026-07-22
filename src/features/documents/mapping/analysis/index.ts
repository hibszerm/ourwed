import type { DocumentAnalyzer } from './documentAnalyzer'
import { mockDocumentAnalyzer } from './mockDocumentAnalyzer'

export type { DocumentAnalyzer } from './documentAnalyzer'
export { mockDocumentAnalyzer } from './mockDocumentAnalyzer'

/** Active analyzer for Phase 2. Swap for a real DOCX/AI implementation later. */
export const activeDocumentAnalyzer: DocumentAnalyzer = mockDocumentAnalyzer
