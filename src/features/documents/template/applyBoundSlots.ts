/**
 * Apply all physically bound slots onto original paragraphs (deterministic generation).
 */

import { lookupResolvedValue } from './lookupResolvedValue'
import { applySlotToParagraphText } from './slotRenderer'
import type { TemplateSlot } from './types'

export interface ApplySlotsResult {
  paragraphs: Array<{ index: number; text: string }>
  applied: Array<{
    slotId: string
    registryKey: string
    paragraphIndex: number
    resolvedValue: string
    omitted: boolean
  }>
  failures: Array<{
    slotId: string
    registryKey: string
    reason: string
  }>
}

export function applyBoundSlotsToParagraphs(input: {
  original: Array<{ index: number; text: string }>
  slots: TemplateSlot[]
  resolved: Record<string, string>
  omittedKeys?: string[]
}): ApplySlotsResult {
  const omitted = new Set(
    (input.omittedKeys ?? []).map((k) => k.trim()).filter(Boolean),
  )
  const byIndex = new Map(input.original.map((p) => [p.index, p.text]))
  const applied: ApplySlotsResult['applied'] = []
  const failures: ApplySlotsResult['failures'] = []

  const bound = input.slots
    .filter(
      (s) =>
        s.enabled &&
        s.registryKey &&
        s.physicallyBound !== false &&
        s.paragraphIndex != null,
    )
    .sort((a, b) => {
      const pa = a.paragraphIndex ?? 0
      const pb = b.paragraphIndex ?? 0
      if (pa !== pb) return pa - pb
      // Apply right-to-left within a paragraph so earlier offsets stay valid
      const ea = a.endOffset ?? a.allowedRange?.end ?? 0
      const eb = b.endOffset ?? b.allowedRange?.end ?? 0
      return eb - ea
    })

  for (const slot of bound) {
    const paraIndex = slot.paragraphIndex!
    const current = byIndex.get(paraIndex)
    if (current == null) {
      failures.push({
        slotId: slot.id,
        registryKey: slot.registryKey!,
        reason: `Paragraph ${paraIndex} missing from source document.`,
      })
      continue
    }

    const isOmitted = omitted.has(slot.registryKey!)
    const value = isOmitted
      ? ''
      : lookupResolvedValue(input.resolved, slot.registryKey!)

    console.info('[contract-resolve]', {
      registryKey: slot.registryKey,
      resolvedValue: value,
      omitted: isOmitted,
      paragraphIndex: paraIndex,
      operation: slot.operation,
    })

    const result = applySlotToParagraphText(current, slot, value, isOmitted)
    if (!result.ok) {
      failures.push({
        slotId: slot.id,
        registryKey: slot.registryKey!,
        reason: result.reason ?? 'Slot location failed.',
      })
      continue
    }
    byIndex.set(paraIndex, result.text)
    applied.push({
      slotId: slot.id,
      registryKey: slot.registryKey!,
      paragraphIndex: paraIndex,
      resolvedValue: value,
      omitted: isOmitted,
    })
  }

  const paragraphs = input.original.map((p) => ({
    index: p.index,
    text: byIndex.get(p.index) ?? p.text,
  }))

  return { paragraphs, applied, failures }
}
