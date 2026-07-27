/**
 * Physical span ownership — one span, one semantic owner (shape-aware).
 */

import type { ContractFieldKey } from '../types'
import { getFieldDefinition } from './fieldDefinitionRegistry'
import { classifyValueShape } from './valueShapeClassifier'
import { scoreCompatibleFieldsForContext } from './semanticContextScoring'

export type SpanCandidate = {
  fieldKey: ContractFieldKey
  blockId: string
  start: number
  end: number
  blockText: string
  exactValue: string
  index: number
}

export type SpanOwnershipResolution = {
  ownerIndex: number
  needsReviewIndices: number[]
  reason?: 'shared_value_multiple_roles'
}

function spanKey(c: Pick<SpanCandidate, 'blockId' | 'start' | 'end'>): string {
  return `${c.blockId}:${c.start}:${c.end}`
}

export function resolveSpanOwnership(candidates: SpanCandidate[]): Map<string, SpanOwnershipResolution> {
  const bySpan = new Map<string, SpanCandidate[]>()
  for (const c of candidates) {
    const key = spanKey(c)
    const list = bySpan.get(key) ?? []
    list.push(c)
    bySpan.set(key, list)
  }

  const resolutions = new Map<string, SpanOwnershipResolution>()

  for (const [key, group] of bySpan) {
    if (group.length === 1) {
      resolutions.set(key, { ownerIndex: group[0]!.index, needsReviewIndices: [] })
      continue
    }

    const blockText = group[0]!.blockText
    const start = group[0]!.start
    const end = group[0]!.end
    const exactValue = group[0]!.exactValue
    const windowStart = Math.max(0, start - 120)
    const windowEnd = Math.min(blockText.length, end + 120)
    const context = blockText.slice(windowStart, windowEnd)
    const shape = classifyValueShape(exactValue)
    const scores = scoreCompatibleFieldsForContext(context, shape)

    let bestIdx = group[0]!.index
    let bestScore = -Infinity
    for (const c of group) {
      const def = getFieldDefinition(c.fieldKey)
      if (!def.acceptedValueShapes.includes(shape.shape)) continue
      const fieldScore = scores.find((s) => s.fieldKey === c.fieldKey)?.score ?? -999
      if (fieldScore > bestScore) {
        bestScore = fieldScore
        bestIdx = c.index
      }
    }

    const tied = group.filter((c) => {
      const s = scores.find((sc) => sc.fieldKey === c.fieldKey)?.score ?? -999
      return s === bestScore
    })

    if (tied.length > 1) {
      resolutions.set(key, {
        ownerIndex: bestIdx,
        needsReviewIndices: group.map((g) => g.index).filter((i) => i !== bestIdx),
        reason: 'shared_value_multiple_roles',
      })
    } else {
      resolutions.set(key, {
        ownerIndex: bestIdx,
        needsReviewIndices: group.map((g) => g.index).filter((i) => i !== bestIdx),
      })
    }
  }

  return resolutions
}
