/**
 * Mock document analyzer — package-aware presence IDs (no values).
 */

import type { DocumentAnalyzer } from './analyzer'
import { DOCUMENT_AI_CONFIG } from './config'
import { normalizeAnalysisPayload } from './normalizeAnalysisResult'
import type { AiDocumentAnalysisResult } from './types'

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export const mockDocumentAiAnalyzer: DocumentAnalyzer = {
  id: 'mock-document-ai',
  version: 'mock-2.4.0',

  async analyze(input): Promise<AiDocumentAnalysisResult> {
    void input.structure
    await delay(200)

    const text = input.text ?? ''
    const semantic = {
      contractName: 'Umowa',
      packageSuggestion: 'Photography',
      coupleVariables: [
        'bride_first_name',
        'bride_last_name',
        'bride_phone',
        'groom_first_name',
        'groom_last_name',
        'wedding_date',
        'ceremony_location',
        'reception_location',
        'package',
        'additional_notes',
      ],
      studioVariables: ['company_name', 'company_tax_id'],
      packageVariables: [
        'package_price',
        'deposit_amount',
        'remaining_payment',
        'payment_deadline',
        'delivery_time',
        ...(text.toLowerCase().includes('album') ? ['album_included'] : []),
      ],
      possibleVariables: ['photographer_name'],
      schemaVersion: DOCUMENT_AI_CONFIG.schemaVersion,
      promptVersion: DOCUMENT_AI_CONFIG.promptVersion,
      model: 'mock-document-ai',
      analyzerId: 'mock-document-ai',
      analyzerVersion: 'mock-2.4.0',
    }

    return normalizeAnalysisPayload(semantic, {
      sourceTextLength: text.length,
      fromCache: false,
    })
  },
}
