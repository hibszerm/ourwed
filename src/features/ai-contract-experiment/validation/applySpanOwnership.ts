/**
 * Apply physical span ownership resolution to validated mappings.
 */

import type { IndexedDocxBlock, ValidatedAiMapping } from '../types'
import { findBlockById } from '../indexedDocx'
import { resolveSpanOwnership, type SpanCandidate } from './spanOwnership'

export function applySpanOwnershipToMappings(
  mappings: ValidatedAiMapping[],
  blocks: IndexedDocxBlock[],
): ValidatedAiMapping[] {
  const candidates: SpanCandidate[] = []
  mappings.forEach((m, index) => {
    if (m.start < 0 || m.end < 0 || m.validationStatus === 'rejected') return
    const block = findBlockById(blocks, m.blockId)
    if (!block) return
    candidates.push({
      fieldKey: m.fieldKey,
      blockId: m.blockId,
      start: m.start,
      end: m.end,
      blockText: block.text,
      exactValue: m.resolvedExactValue || m.sourceText,
      index,
    })
  })

  const resolutions = resolveSpanOwnership(candidates)
  if (resolutions.size === 0) return mappings

  const result = [...mappings]
  for (const c of candidates) {
    const key = `${c.blockId}:${c.start}:${c.end}`
    const resolution = resolutions.get(key)
    if (!resolution) continue

    if (resolution.ownerIndex !== c.index) {
      const m = result[c.index]!
      result[c.index] = {
        ...m,
        validationStatus: 'needs_review',
        fieldValidation: 'shared_value_multiple_roles',
        validationDimensions: m.validationDimensions
          ? {
              ...m.validationDimensions,
              semantic: {
                status: 'needs_review',
                reasonCode: 'shared_value_multiple_roles',
              },
            }
          : {
              source: { status: 'valid' },
              semantic: {
                status: 'needs_review',
                reasonCode: 'shared_value_multiple_roles',
              },
              replacement: { status: 'not_applicable' },
              resolvedFieldKey: m.fieldKey,
              contextScore: 0,
            },
      }
    }
  }
  return result
}
