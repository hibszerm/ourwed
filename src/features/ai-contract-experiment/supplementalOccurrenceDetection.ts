/**
 * Supplement validated mappings with validator-detected related occurrences.
 */

import { createMappingId } from './mappingId'
import {
  classifyOccurrenceReplacementMode,
  detectRelatedLocationOccurrences,
  detectedOccurrenceToMapping,
} from './locationOccurrenceDetection'
import { findBlockById } from './indexedDocx'
import type {
  ContractGenerationInput,
  IndexedDocxBlock,
  ValidatedAiMapping,
} from './types'

function mappingSpanKey(m: ValidatedAiMapping): string {
  return `${m.fieldKey}:${m.blockId}:${m.start}:${m.end}`
}

export function supplementOccurrenceMappings(input: {
  mappings: ValidatedAiMapping[]
  blocks: IndexedDocxBlock[]
  generationInput?: ContractGenerationInput
  experimentRunId?: string
}): ValidatedAiMapping[] {
  const existingKeys = new Set(input.mappings.map(mappingSpanKey))
  const supplemented = [...input.mappings]

  const primaries = input.mappings.filter(
    (m) =>
      (m.fieldKey === 'reception_location' ||
        m.fieldKey === 'ceremony_location' ||
        m.fieldKey === 'preparation_location') &&
      m.validationStatus !== 'rejected',
  )

  for (const primary of primaries) {
    const detected = detectRelatedLocationOccurrences({
      primary,
      blocks: input.blocks,
      existingMappings: supplemented,
      generationInput: input.generationInput,
    })
    for (const d of detected) {
      const mapping = detectedOccurrenceToMapping(d, primary)
      const key = mappingSpanKey(mapping)
      if (existingKeys.has(key)) continue
      if (input.experimentRunId && mapping.start >= 0 && mapping.end >= 0) {
        mapping.id = createMappingId({
          experimentRunId: input.experimentRunId,
          fieldKey: mapping.fieldKey,
          blockId: mapping.blockId,
          start: mapping.start,
          end: mapping.end,
        })
        mapping.experimentRunId = input.experimentRunId
      }
      supplemented.push(mapping)
      existingKeys.add(key)
    }
  }

  return supplemented.map((m) => {
    if (m.occurrenceReplacementMode) return m
    const block = findBlockById(input.blocks, m.blockId)
    return {
      ...m,
      occurrenceReplacementMode: classifyOccurrenceReplacementMode(
        m,
        block,
        input.generationInput,
      ),
      occurrenceOrigin: m.occurrenceOrigin ?? (m.resolutionMethod === 'manual' ? 'manual' : 'ai_proposal'),
    }
  })
}
