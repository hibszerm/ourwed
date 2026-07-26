/**
 * Apply all physically bound slots onto original paragraphs (deterministic generation).
 *
 * Within each paragraph:
 * 1. locate every slot against the unchanged original text
 * 2. validate locations (fail overlaps that would corrupt offsets)
 * 3. apply replacements right-to-left (highest startOffset first)
 *
 * Never locate a later slot against text already mutated by an earlier replace.
 */

import { lookupResolvedValue } from './lookupResolvedValue'
import {
  applySlotToParagraphText,
  debugSlotLocation,
  locateSlotInParagraph,
  renderSlotValue,
  type SlotLocation,
} from './slotRenderer'
import { buildParagraphRunModel } from './canonicalParagraph'
import { MONEY_COMMERCIAL_APPLY_KEYS } from './contractMoneyPairs'
import type { TemplateSlot } from './types'
import {
  isMaterialPackageRegistryKey,
  isPlaceholderOnlyValue,
} from './placeholderValue'
import { isOvertimeRegistryKey } from './numericSemanticFamily'
import { prepareSlotReplacementValue } from './slotReplacementValue'
import { stripClockTimeFromDuration } from './polishDuration'

export { prepareSlotReplacementValue } from './slotReplacementValue'

export interface SlotReplacementTrace {
  bindingId: string
  key: string
  paragraphIndex: number
  originalStart: number
  originalEnd: number
  generatedStart: number
  generatedEnd: number
  originalValue: string
  replacementValue: string
}

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
  /** Ownership map: paragraphIndex → claimed [start,end) spans. */
  claimedSpans: Array<{
    paragraphIndex: number
    start: number
    end: number
    registryKey: string
  }>
  /**
   * Authoritative original→generated ranges from the apply pass.
   * Quality must mask with these — never rediscover by searching replacement text.
   */
  replacementTraces: SlotReplacementTrace[]
}

function spansOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

type PreparedSlot = {
  slot: TemplateSlot
  value: string
  isOmitted: boolean
  skip: boolean
}

function prepareSlot(
  slot: TemplateSlot,
  resolved: Record<string, string>,
  omitted: Set<string>,
): PreparedSlot {
  const isOmitted = omitted.has(slot.registryKey!)
  let value = isOmitted
    ? ''
    : lookupResolvedValue(resolved, slot.registryKey!)

  // Proven non-placeholder template material must not be wiped when CRM/package
  // has no value — keep the source span (resolution order: template value).
  if (
    !isOmitted &&
    !value &&
    isMaterialPackageRegistryKey(slot.registryKey!) &&
    !isPlaceholderOnlyValue(slot.originalText)
  ) {
    return { slot, value: '', isOmitted, skip: true }
  }

  // Material package placeholders are not safe preserved values.
  if (
    !isOmitted &&
    isMaterialPackageRegistryKey(slot.registryKey!) &&
    isPlaceholderOnlyValue(value) &&
    isPlaceholderOnlyValue(slot.originalText)
  ) {
    return {
      slot,
      value: '',
      isOmitted,
      skip: false,
    }
  }

  if (!isOmitted && value) {
    value = prepareSlotReplacementValue({
      registryKey: slot.registryKey!,
      value,
      originalText: slot.originalText,
      resolved,
    })
  }

  // Coverage duration must never carry a clock time; end time must be clock-only.
  if (
    !isOmitted &&
    (slot.registryKey === 'coverage_hours' ||
      slot.registryKey === 'working_hours') &&
    /\d{1,2}[.:]\d{2}/.test(value)
  ) {
    value = stripClockTimeFromDuration(value)
  }

  return { slot, value, isOmitted, skip: false }
}

function isMaterialPlaceholderFailure(prepared: PreparedSlot): boolean {
  const { slot, value, isOmitted } = prepared
  if (isOmitted || prepared.skip) return false
  return (
    isMaterialPackageRegistryKey(slot.registryKey!) &&
    isPlaceholderOnlyValue(value) &&
    isPlaceholderOnlyValue(slot.originalText)
  )
}

function isDurationEndTimeConflict(a: string, b: string): boolean {
  return (
    (a === 'coverage_hours' && b === 'coverage_end_time') ||
    (a === 'coverage_end_time' && b === 'coverage_hours') ||
    (a === 'working_hours' && b === 'coverage_end_time') ||
    (a === 'coverage_end_time' && b === 'working_hours')
  )
}

export function applyBoundSlotsToParagraphs(input: {
  original: Array<{ index: number; text: string }>
  slots: TemplateSlot[]
  resolved: Record<string, string>
  omittedKeys?: string[]
  /** Optional DOCX paragraph XML by index for run debug dumps. */
  paragraphXmlByIndex?: Map<number, string>
  /** When false, unproven overtime values are omitted (preserve template). */
  allowUnprovenOvertime?: boolean
}): ApplySlotsResult {
  const omitted = new Set(
    (input.omittedKeys ?? []).map((k) => k.trim()).filter(Boolean),
  )
  const byIndex = new Map(input.original.map((p) => [p.index, p.text]))
  const applied: ApplySlotsResult['applied'] = []
  const failures: ApplySlotsResult['failures'] = []
  const spanEdits: ApplySlotsResult['spanEdits'] = []
  const claimedSpans: ApplySlotsResult['claimedSpans'] = []
  const replacementTraces: SlotReplacementTrace[] = []

  const bound = input.slots.filter(
    (s) =>
      s.enabled &&
      s.registryKey &&
      s.physicallyBound !== false &&
      s.paragraphIndex != null,
  )

  // Group by paragraph so we can locate-all against the unchanged original,
  // then replace right-to-left.
  const byParagraph = new Map<number, TemplateSlot[]>()
  for (const slot of bound) {
    const paraIndex = slot.paragraphIndex!
    const list = byParagraph.get(paraIndex) ?? []
    list.push(slot)
    byParagraph.set(paraIndex, list)
  }

  const paragraphIndexes = [...byParagraph.keys()].sort((a, b) => a - b)

  for (const paraIndex of paragraphIndexes) {
    const originalText = byIndex.get(paraIndex)
    if (originalText == null) {
      for (const slot of byParagraph.get(paraIndex)!) {
        failures.push({
          slotId: slot.id,
          registryKey: slot.registryKey!,
          reason: `Paragraph ${paraIndex} missing from source document.`,
        })
      }
      continue
    }

    const slotsInPara = byParagraph.get(paraIndex)!
    type LocatedWork = {
      prepared: PreparedSlot
      location: SlotLocation
      replacement: string
    }
    const located: LocatedWork[] = []
    const beforeSort = slotsInPara.map((s) => ({
      id: s.id,
      registryKey: s.registryKey,
      startOffset: s.startOffset ?? s.allowedRange?.start ?? null,
      endOffset: s.endOffset ?? s.allowedRange?.end ?? null,
      originalSpan: s.originalText ?? null,
    }))

    for (const slot of slotsInPara) {
      const prepared = prepareSlot(slot, input.resolved, omitted)
      if (prepared.skip) continue

      if (isMaterialPlaceholderFailure(prepared)) {
        failures.push({
          slotId: slot.id,
          registryKey: slot.registryKey!,
          reason:
            'Package material field has only a placeholder — requires a concrete value before generation.',
        })
        continue
      }

      console.info('[contract-resolve]', {
        registryKey: slot.registryKey,
        resolvedValue: prepared.value,
        omitted: prepared.isOmitted,
        paragraphIndex: paraIndex,
        operation: slot.operation,
        storedOriginalText: slot.originalText,
      })

      // Locate against the unchanged original paragraph — never against
      // text already mutated by another slot in this paragraph.
      const location = locateSlotInParagraph(originalText, slot)
      if (
        slot.registryKey === 'coverage_end_time' ||
        slot.registryKey === 'coverage_hours' ||
        isOvertimeRegistryKey(slot.registryKey!) ||
        (slot.registryKey &&
          MONEY_COMMERCIAL_APPLY_KEYS.has(slot.registryKey))
      ) {
        console.info('[contract-commercial-apply]', {
          registryKey: slot.registryKey,
          paragraphIndex: paraIndex,
          originalSpan: slot.originalText,
          generatedValue: prepared.value,
          locationMethod: location?.method ?? null,
          start: location?.start ?? null,
          end: location?.end ?? null,
          success: Boolean(location),
          reason: location
            ? null
            : `Cannot safely locate slot ${slot.registryKey} in paragraph ${paraIndex}.`,
        })
      }

      if (!location) {
        const xml = input.paragraphXmlByIndex?.get(paraIndex)
        if (xml) {
          const model = buildParagraphRunModel(xml)
          debugSlotLocation(originalText, slot, {
            paragraphPlainTextAtAnalysis: slot.sampleContext ?? null,
            docxRuns: model.runs.map((r) => ({
              runIndex: r.runIndex,
              text: r.rawText,
              canonicalText: r.canonicalText,
              cumulativeHint: r.canonicalText.length,
            })),
          })
        } else {
          debugSlotLocation(originalText, slot, {
            paragraphPlainTextAtAnalysis: slot.sampleContext ?? null,
          })
        }
        failures.push({
          slotId: slot.id,
          registryKey: slot.registryKey!,
          reason: `Cannot safely locate slot ${slot.registryKey} in paragraph ${paraIndex}.`,
        })
        continue
      }

      located.push({
        prepared,
        location,
        replacement: renderSlotValue(
          slot,
          prepared.value,
          prepared.isOmitted,
        ),
      })
    }

    // Reject overlapping located spans (same or different keys) before mutate.
    const rejected = new Set<string>()
    for (let i = 0; i < located.length; i++) {
      const a = located[i]!
      if (rejected.has(a.prepared.slot.id)) continue
      for (let j = i + 1; j < located.length; j++) {
        const b = located[j]!
        if (rejected.has(b.prepared.slot.id)) continue
        if (!spansOverlap(a.location, b.location)) continue
        const aKey = a.prepared.slot.registryKey!
        const bKey = b.prepared.slot.registryKey!
        // Duration/end-time still use the dedicated ownership failure message.
        if (isDurationEndTimeConflict(aKey, bKey)) {
          failures.push({
            slotId: b.prepared.slot.id,
            registryKey: bKey,
            reason: `Span ownership conflict with ${aKey} — duration and end time must not share one replacement.`,
          })
          rejected.add(b.prepared.slot.id)
          continue
        }
        failures.push({
          slotId: b.prepared.slot.id,
          registryKey: bKey,
          reason: `Overlapping physical span with ${aKey} in paragraph ${paraIndex} — locate-all rejected before replace.`,
        })
        rejected.add(b.prepared.slot.id)
      }
    }

    const accepted = located.filter((w) => !rejected.has(w.prepared.slot.id))

    // Deterministic generated ranges: walk left-to-right, accumulate length delta.
    // These ranges are authoritative for quality masking — never rediscovered later.
    const byOriginalStart = [...accepted].sort(
      (a, b) => a.location.start - b.location.start,
    )
    let shift = 0
    const tracesForPara: SlotReplacementTrace[] = []
    for (const work of byOriginalStart) {
      const originalStart = work.location.start
      const originalEnd = work.location.end
      const generatedStart = originalStart + shift
      const generatedEnd = generatedStart + work.replacement.length
      shift += work.replacement.length - (originalEnd - originalStart)
      const trace: SlotReplacementTrace = {
        bindingId: work.prepared.slot.id,
        key: work.prepared.slot.registryKey!,
        paragraphIndex: paraIndex,
        originalStart,
        originalEnd,
        generatedStart,
        generatedEnd,
        originalValue: originalText.slice(originalStart, originalEnd),
        replacementValue: work.replacement,
      }
      tracesForPara.push(trace)
      replacementTraces.push(trace)
      console.info('[contract-replacement-trace]', {
        bindingId: trace.bindingId,
        key: trace.key,
        paragraphIndex: paraIndex,
        originalStart,
        originalEnd,
        locatedOriginalSpan: trace.originalValue,
        generatedReplacementValue: trace.replacementValue,
        generatedStart,
        generatedEnd,
        maskingStrategy: 'apply_pass_trace',
      })
    }

    // Right-to-left: highest startOffset first so earlier offsets stay valid
    // in the mutated string (and spanEdits stay on original coordinates).
    const afterSort = [...accepted].sort(
      (a, b) => b.location.start - a.location.start,
    )

    console.info('[contract-apply-order]', {
      paragraphIndex: paraIndex,
      beforeSort,
      afterSort: afterSort.map((w) => ({
        id: w.prepared.slot.id,
        registryKey: w.prepared.slot.registryKey,
        start: w.location.start,
        end: w.location.end,
        ownedSpan: originalText.slice(w.location.start, w.location.end),
        replacement: w.replacement,
      })),
      applyOrder: afterSort.map((w) => w.prepared.slot.registryKey),
      replacementTraces: tracesForPara,
    })

    let text = originalText
    for (const work of afterSort) {
      const { prepared, location, replacement } = work
      const { slot, value, isOmitted } = prepared

      // Apply on the evolving string using original coordinates that remain
      // valid because we walk right-to-left.
      text =
        text.slice(0, location.start) + replacement + text.slice(location.end)

      claimedSpans.push({
        paragraphIndex: paraIndex,
        start: location.start,
        end: location.end,
        registryKey: slot.registryKey!,
      })
      spanEdits.push({
        index: paraIndex,
        start: location.start,
        end: location.end,
        replacement,
        registryKey: slot.registryKey!,
      })
      applied.push({
        slotId: slot.id,
        registryKey: slot.registryKey!,
        paragraphIndex: paraIndex,
        resolvedValue: value,
        omitted: isOmitted,
        location,
      })
    }

    byIndex.set(paraIndex, text)
  }

  const paragraphs = input.original.map((p) => ({
    index: p.index,
    text: byIndex.get(p.index) ?? p.text,
  }))

  return {
    paragraphs,
    spanEdits,
    applied,
    failures,
    claimedSpans,
    replacementTraces,
  }
}

/** Re-export single-slot helper for callers that still need it. */
export { applySlotToParagraphText }
