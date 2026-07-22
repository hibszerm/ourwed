import type { DocumentAnalysisResult } from '../types'

/**
 * Pluggable document analysis over extracted plain text.
 * Phase 2: heuristic mock. Future: DOCX structure / AI without UI changes.
 */
export interface DocumentAnalyzer {
  readonly id: string
  readonly version: string
  analyze(input: {
    sourceText: string
    templateId: string
    templateVersionId: string | null
    sourceFileName: string | null
  }): Promise<DocumentAnalysisResult>
}
