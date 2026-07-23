/**
 * Template readiness — ready only when required variables have physical bindings.
 */

import { SLOT_PATTERNS } from './slotBinder'
import {
  isSlotPhysicallyBound,
  type TemplateSlot,
  type TemplateSlotMap,
} from './types'

export interface UnresolvedSlotIssue {
  registryKey: string
  slotId?: string
  reason: string
}

export interface TemplateReadinessReport {
  ready: boolean
  boundCount: number
  unboundCount: number
  issues: UnresolvedSlotIssue[]
  unresolvedKeys: string[]
}

const PATTERN_KEYS = new Set(
  SLOT_PATTERNS.flatMap((p) => [p.registryKey, ...(p.aliases ?? [])]),
)

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function isBlockingKey(registryKey: string, slotMap: TemplateSlotMap): boolean {
  if (PATTERN_KEYS.has(registryKey)) return true
  if (slotMap.unboundRegistryKeys?.includes(registryKey)) return true
  return false
}

export function validateTemplateSlotBindings(
  slotMap: TemplateSlotMap,
): TemplateReadinessReport {
  const issues: UnresolvedSlotIssue[] = []
  const enabled = slotMap.slots.filter((s) => s.enabled && s.registryKey)
  const bound: TemplateSlot[] = []
  const unresolvedKeys: string[] = []

  for (const slot of enabled) {
    if (isSlotPhysicallyBound(slot)) {
      bound.push(slot)
      continue
    }

    // Presence-only AI fields without a bindable pattern do not block readiness
    if (!isBlockingKey(slot.registryKey!, slotMap)) {
      continue
    }

    unresolvedKeys.push(slot.registryKey!)
    issues.push({
      registryKey: slot.registryKey!,
      slotId: slot.id,
      reason:
        slot.paragraphIndex == null
          ? 'Missing paragraph index.'
          : slot.operation === 'insert' &&
              !(slot.leftAnchor && slot.rightAnchor) &&
              slot.startOffset == null
            ? 'Insert slot missing anchors or character offsets.'
            : slot.operation === 'replace' &&
                !slot.originalText &&
                !(slot.leftAnchor && slot.rightAnchor) &&
                slot.startOffset == null
              ? 'Replace slot does not point to original text.'
              : 'No persisted physical binding.',
    })
  }

  for (const key of slotMap.unboundRegistryKeys ?? []) {
    if (!PATTERN_KEYS.has(key)) continue
    if (
      !unresolvedKeys.includes(key) &&
      !bound.some((b) => b.registryKey === key)
    ) {
      unresolvedKeys.push(key)
      issues.push({
        registryKey: key,
        reason: 'Semantically detected but no physical slot was bound.',
      })
    }
  }

  const byPara = new Map<number, TemplateSlot[]>()
  for (const slot of bound) {
    const i = slot.paragraphIndex!
    const list = byPara.get(i) ?? []
    list.push(slot)
    byPara.set(i, list)
  }
  for (const [para, list] of byPara) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!
        const b = list[j]!
        const ar =
          a.allowedRange ??
          (a.startOffset != null && a.endOffset != null
            ? { start: a.startOffset, end: a.endOffset }
            : null)
        const br =
          b.allowedRange ??
          (b.startOffset != null && b.endOffset != null
            ? { start: b.startOffset, end: b.endOffset }
            : null)
        if (ar && br && rangesOverlap(ar, br)) {
          issues.push({
            registryKey: a.registryKey!,
            slotId: a.id,
            reason: `Overlaps ${b.registryKey} in paragraph ${para}.`,
          })
        }
      }
    }
  }

  const overlapIssues = issues.some((i) => i.reason.startsWith('Overlaps'))
  const ready =
    unresolvedKeys.length === 0 && !overlapIssues && bound.length > 0

  return {
    ready,
    boundCount: bound.length,
    unboundCount: unresolvedKeys.length,
    issues,
    unresolvedKeys: [...new Set(unresolvedKeys)],
  }
}
