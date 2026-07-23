import type { DocumentStructure } from '@/features/documents/mapping/preview/documentNodes'
import type { AiDocumentAnalysisResult } from './types'

/**
 * Pluggable AI document analyzer.
 * UI never knows whether the implementation is mock or which AI provider is used.
 */
export interface DocumentAnalyzer {
  readonly id: string
  readonly version: string
  analyze(input: {
    text: string
    structure?: DocumentStructure | null
  }): Promise<AiDocumentAnalysisResult>
}
