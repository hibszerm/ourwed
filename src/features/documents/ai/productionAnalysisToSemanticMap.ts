import type { DocumentSemanticMap } from '@/features/ai-contract-lab/aiContractLabTypes'
import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'
import { normalizeCanonicalId } from '@/features/documents/ai/canonicalVariableIds'
import { SystemVariableRegistry } from '@/lib/variables/registry'

/**
 * Deterministic bridge from the production analyzer to field configuration.
 * It consumes only registry-backed fields and does not reinterpret AI output.
 */
export function productionAnalysisToSemanticMap(
  analysis: AiDocumentAnalysisResult,
): DocumentSemanticMap {
  const fields = analysis.fields
    .filter(
      (field): field is typeof field & { registryKey: string } =>
        Boolean(field.registryKey),
    )
    .sort(
      (a, b) =>
        a.registryKey.localeCompare(b.registryKey) || a.id.localeCompare(b.id),
    )

  return {
    analysisVersion: `${analysis.analyzerId}@${analysis.analyzerVersion}`,
    documentSummary: {
      documentType: analysis.documentType,
      language: 'pl',
      detectedPartyRoles: [],
      detectedBusinessContext: analysis.documentType,
    },
    semanticAnchors: fields.map((field, index) => {
      const registry = SystemVariableRegistry.get(field.registryKey)
      return {
        anchorId: `production:${field.registryKey}:${index}`,
        semanticRole:
          registry?.id ?? normalizeCanonicalId(field.registryKey),
        confidence: field.confidence,
        documentLabel: field.label,
        valueSpan: {
          sourceText: field.value?.trim() || field.label.trim(),
        },
        reason: 'Pole wykryte przez produkcyjną analizę dokumentu.',
      }
    }),
    unresolved: analysis.fields
      .filter((field) => !field.registryKey)
      .map((_field, index) => ({
        providerIndex: index,
        anchorId: null,
        status: 'unmapped_registry_key',
        semanticRole: null,
      })),
    warnings: analysis.warnings.map((message, index) => ({
      code: `production_analysis_${index + 1}`,
      message,
      anchorIds: [],
    })),
  }
}
