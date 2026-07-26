/**
 * Build DocumentSemanticMap from persisted slot_map (pure — no API I/O).
 */

import type { DocumentSemanticMap } from '@/features/ai-contract-lab/aiContractLabTypes'
import type { TemplateSlotMap } from '@/features/documents/template/types'

/** Build a semantic map from persisted slot_map when analysis payload is gone. */
export function semanticMapFromSlotMap(input: {
  templateId: string
  templateVersionId?: string
  slotMap: TemplateSlotMap
}): DocumentSemanticMap {
  const slots = input.slotMap.slots.filter((slot) => slot.registryKey)
  return {
    analysisVersion: input.slotMap.analysisStatus ?? 'slot-map@1',
    documentSummary: {
      documentType: 'contract',
      language: 'pl',
      detectedPartyRoles: [],
      detectedBusinessContext: 'wedding',
    },
    semanticAnchors: slots.map((slot, index) => ({
      anchorId: `slot:${slot.registryKey}:${slot.id}:${index}`,
      semanticRole: slot.registryKey!,
      confidence: slot.confidence ?? 0.8,
      documentLabel: slot.label,
      valueSpan: {
        sourceText:
          (slot.originalText ?? slot.exampleText ?? slot.label ?? '').trim() ||
          slot.registryKey!,
      },
      reason: 'Pole odtworzone z zapisanej mapy slotów szablonu.',
    })),
    warnings: (input.slotMap.analysisWarnings ?? []).map((message, index) => ({
      code: `slot_map_warning_${index + 1}`,
      message,
      anchorIds: [],
    })),
  }
}
