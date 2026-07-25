/**
 * Apply all physically bound slots onto original paragraphs (deterministic generation).
 */

import { lookupResolvedValue } from './lookupResolvedValue'
import {
  applySlotToParagraphText,
  debugSlotLocation,
  renderSlotValue,
  type SlotLocation,
} from './slotRenderer'
import { buildParagraphRunModel } from './canonicalParagraph'
import { MONEY_COMMERCIAL_APPLY_KEYS } from './contractMoneyPairs'
import type { TemplateSlot } from './types'

export interface ApplySlotsResult {
  paragraphs: Array<{ index: number; text: string }>
  /** Per-paragraph span replacements for DOCX run-aware writes. */
  spanEdits: Array<{
    index: number
    start: number
    end: number
    replacement: string
    registryKey: string
  }>
  applied: Array<{
    slotId: string
    registryKey: string
    paragraphIndex: number
    resolvedValue: string
    omitted: boolean
    location?: SlotLocation
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
  /** Optional DOCX paragraph XML by index for run debug dumps. */
  paragraphXmlByIndex?: Map<number, string>
}): ApplySlotsResult {
  const omitted = new Set(
    (input.omittedKeys ?? []).map((k) => k.trim()).filter(Boolean),
  )
  const byIndex = new Map(input.original.map((p) => [p.index, p.text]))
  const applied: ApplySlotsResult['applied'] = []
  const failures: ApplySlotsResult['failures'] = []
  const spanEdits: ApplySlotsResult['spanEdits'] = []

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
      storedOriginalText: slot.originalText,
    })

    const result = applySlotToParagraphText(current, slot, value, isOmitted)
    if (
      slot.registryKey === 'coverage_end_time' ||
      (slot.registryKey &&
        MONEY_COMMERCIAL_APPLY_KEYS.has(slot.registryKey))
    ) {
      console.info('[contract-commercial-apply]', {
        registryKey: slot.registryKey,
        paragraphIndex: paraIndex,
        originalSpan: slot.originalText,
        generatedValue: value,
        locationMethod: result.location?.method ?? null,
        start: result.location?.start ?? null,
        end: result.location?.end ?? null,
        success: result.ok,
        reason: result.reason ?? null,
      })
    }
    if (!result.ok) {
      const xml = input.paragraphXmlByIndex?.get(paraIndex)
      if (xml) {
        const model = buildParagraphRunModel(xml)
        debugSlotLocation(current, slot, {
          paragraphPlainTextAtAnalysis: slot.sampleContext ?? null,
          docxRuns: model.runs.map((r) => ({
            runIndex: r.runIndex,
            text: r.rawText,
            canonicalText: r.canonicalText,
            cumulativeHint: r.canonicalText.length,
          })),
        })
      }
      failures.push({
        slotId: slot.id,
        registryKey: slot.registryKey!,
        reason: result.reason ?? 'Slot location failed.',
      })
      continue
    }

    // Span edit against pre-replacement text (right-to-left apply keeps offsets valid)
    if (result.location) {
      const replacement = renderSlotValue(slot, value, isOmitted)
      spanEdits.push({
        index: paraIndex,
        start: result.location.start,
        end: result.location.end,
        replacement,
        registryKey: slot.registryKey!,
      })
    }

    byIndex.set(paraIndex, result.text)
    applied.push({
      slotId: slot.id,
      registryKey: slot.registryKey!,
      paragraphIndex: paraIndex,
      resolvedValue: value,
      omitted: isOmitted,
      location: result.location,
    })
  }

  const paragraphs = input.original.map((p) => ({
    index: p.index,
    text: byIndex.get(p.index) ?? p.text,
  }))

  return { paragraphs, spanEdits, applied, failures }
}
