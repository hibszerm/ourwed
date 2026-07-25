/**
 * Deterministic slot renderer — spacing/punctuation come from the slot, never AI.
 */

import {
  canonicalizeParagraphText,
  countOccurrences,
  normalizeForMatch,
} from './canonicalParagraph'
import type { OmissionMode, TemplateSlot } from './types'

export function renderSlotValue(
  slot: Pick<
    TemplateSlot,
    'prefix' | 'suffix' | 'omissionMode' | 'originalText'
  >,
  value: string | null | undefined,
  omitted = false,
): string {
  const prefix = slot.prefix ?? ''
  const suffix = slot.suffix ?? ''
  const mode: OmissionMode = slot.omissionMode ?? 'empty'

  if (omitted || value == null || !String(value).trim()) {
    switch (mode) {
      case 'underscore':
        return `${prefix}__________${suffix}`
      case 'keep_original':
        return `${prefix}${slot.originalText ?? ''}${suffix}`
      case 'remove_clause':
        return ''
      case 'empty':
      default:
        return `${prefix}${suffix}`.replace(/  +/g, ' ')
    }
  }

  return `${prefix}${String(value).trim()}${suffix}`
}

export interface SlotLocation {
  start: number
  end: number
  method:
    | 'stored_offsets'
    | 'exact_original'
    | 'normalized_original'
    | 'anchors'
    | 'unique_semantic'
}

function uniqueIndexOf(haystack: string, needle: string): number | null {
  if (!needle) return null
  const first = haystack.indexOf(needle)
  if (first < 0) return null
  const second = haystack.indexOf(needle, first + needle.length)
  if (second >= 0) return null
  return first
}

/**
 * Clock-time separator variants for LOCATION ONLY.
 * "00.30" ↔ "00:30" are treated as equivalent, but the returned span always
 * uses the characters present in the haystack (source template).
 */
function uniqueClockTimeMatch(
  haystack: string,
  needle: string,
): { start: number; end: number } | null {
  const trimmed = needle.trim()
  const m = /^(\d{1,2})([.:])(\d{2})$/.exec(trimmed)
  if (!m) return null
  const hour = m[1]!
  const minute = m[3]!
  const variants = [`${hour}.${minute}`, `${hour}:${minute}`]
  const hits: Array<{ start: number; end: number }> = []
  for (const variant of variants) {
    const idx = uniqueIndexOf(haystack, variant)
    if (idx != null) {
      hits.push({ start: idx, end: idx + variant.length })
    }
  }
  if (hits.length === 1) return hits[0]!
  return null
}

function uniqueNormalizedMatch(
  haystack: string,
  needle: string,
): { start: number; end: number } | null {
  const normNeedle = normalizeForMatch(needle)
  if (!normNeedle) return null

  const candidates: Array<{ start: number; end: number }> = []
  const exact = uniqueIndexOf(haystack, needle)
  if (exact != null) {
    return { start: exact, end: exact + needle.length }
  }

  const clock = uniqueClockTimeMatch(haystack, needle)
  if (clock) return clock

  // Fallback: find the unique substring whose normalized form equals normNeedle
  // by scanning for the first character of needle.
  const firstChar = normNeedle[0]!
  for (let i = 0; i < haystack.length; i++) {
    if (canonicalizeParagraphText(haystack[i]!).replace(/\s+/g, ' ') !== firstChar) {
      // cheap skip — also allow space-equivalent
      if (haystack[i] !== needle[0] && haystack[i] !== firstChar) continue
    }
    for (
      let j = i + Math.max(1, needle.length - 2);
      j <= Math.min(haystack.length, i + needle.length + 8);
      j++
    ) {
      const slice = haystack.slice(i, j)
      if (normalizeForMatch(slice) === normNeedle) {
        candidates.push({ start: i, end: j })
      }
    }
  }
  if (candidates.length === 1) return candidates[0]!
  return null
}

/**
 * Locate a persisted slot inside a CANONICAL paragraph string.
 *
 * Order:
 * 1. stored offsets (if range equals storedOriginalText)
 * 2. exact storedOriginalText (unique)
 * 3. normalized storedOriginalText (unique)
 * 4. unique leftAnchor + rightAnchor
 * 5. unique semantic originalText already covered — fail
 *
 * Never searches for the resolved replacement value.
 * Never does global fuzzy replace.
 */
export function locateSlotInParagraph(
  paragraphText: string,
  slot: TemplateSlot,
): SlotLocation | null {
  const text = canonicalizeParagraphText(paragraphText)
  const original = slot.originalText
    ? canonicalizeParagraphText(slot.originalText)
    : ''
  const left = slot.leftAnchor ? canonicalizeParagraphText(slot.leftAnchor) : ''
  const right = slot.rightAnchor
    ? canonicalizeParagraphText(slot.rightAnchor)
    : ''

  // 1. Stored offsets — only if the slice equals storedOriginalText (when known)
  //    For clock times, also accept separator-equivalent source slices.
  if (
    slot.startOffset != null &&
    slot.endOffset != null &&
    slot.startOffset >= 0 &&
    slot.endOffset >= slot.startOffset &&
    slot.endOffset <= text.length
  ) {
    const start = slot.startOffset
    const end = slot.endOffset
    const slice = text.slice(start, end)
    if (!original || slice === original) {
      return { start, end, method: 'stored_offsets' }
    }
    if (
      /^(\d{1,2})[.:](\d{2})$/.test(original.trim()) &&
      /^(\d{1,2})[.:](\d{2})$/.test(slice.trim())
    ) {
      const o = original.trim().replace(':', '.')
      const s = slice.trim().replace(':', '.')
      if (o === s) {
        return { start, end, method: 'stored_offsets' }
      }
    }
  }

  // 2. Exact storedOriginalText (must be unique) — skip whitespace-only
  if (original && !/^\s*$/.test(original)) {
    const exactCount = countOccurrences(text, original)
    if (exactCount === 1) {
      const idx = text.indexOf(original)
      return {
        start: idx,
        end: idx + original.length,
        method: 'exact_original',
      }
    }
    // Clock-time separator equivalence → source characters
    const clock = uniqueClockTimeMatch(text, original)
    if (clock) {
      return { ...clock, method: 'exact_original' }
    }
  }

  // 3. Normalized originalText (unique) — skip whitespace-only
  if (original && !/^\s*$/.test(original)) {
    const norm = uniqueNormalizedMatch(text, original)
    if (norm) {
      return { ...norm, method: 'normalized_original' }
    }
  }

  // 4. Unique leftAnchor + rightAnchor
  if (left || right) {
    const leftIdx = left ? uniqueIndexOf(text, left) : 0
    if (left && leftIdx == null) {
      // anchors not uniquely found — fall through to fail (do not fuzzy)
    } else {
      const afterLeft = left ? (leftIdx as number) + left.length : 0
      if (right) {
        const rightIdx = uniqueIndexOf(text.slice(afterLeft), right)
        if (rightIdx != null) {
          const start = afterLeft
          const end = afterLeft + rightIdx
          // For insert / whitespace-only originals, the anchor window IS the slot
          // (mid grows after generation). Do not shrink to a generic space match.
          const whitespaceOnly = !original || /^\s*$/.test(original)
          if (original && !whitespaceOnly) {
            const window = text.slice(start, end)
            const inner = uniqueIndexOf(window, original)
            if (inner != null) {
              return {
                start: start + inner,
                end: start + inner + original.length,
                method: 'anchors',
              }
            }
            const clockInner = uniqueClockTimeMatch(window, original)
            if (clockInner) {
              return {
                start: start + clockInner.start,
                end: start + clockInner.end,
                method: 'anchors',
              }
            }
          }
          return { start, end, method: 'anchors' }
        }
      } else if (original) {
        const window = text.slice(afterLeft)
        const inner = uniqueIndexOf(window, original)
        if (inner != null) {
          return {
            start: afterLeft + inner,
            end: afterLeft + inner + original.length,
            method: 'anchors',
          }
        }
      }
    }
  }

  // 5. Unique semantic: original already attempted; optional fingerprint window unused
  return null
}

/**
 * Debug dump for failed / inspected slots.
 */
export function debugSlotLocation(
  paragraphText: string,
  slot: TemplateSlot,
  extra?: Record<string, unknown>,
): void {
  const text = canonicalizeParagraphText(paragraphText)
  const original = slot.originalText
    ? canonicalizeParagraphText(slot.originalText)
    : ''
  const left = slot.leftAnchor ? canonicalizeParagraphText(slot.leftAnchor) : ''
  const right = slot.rightAnchor
    ? canonicalizeParagraphText(slot.rightAnchor)
    : ''
  const loc = locateSlotInParagraph(text, slot)
  if (slot.registryKey === 'coverage_end_time') {
    console.info('[coverage-end-time-location]', {
      phase: 'locate',
      paragraphIndex: slot.paragraphIndex,
      storedOriginalText: slot.originalText,
      storedStartOffset: slot.startOffset,
      storedEndOffset: slot.endOffset,
      leftAnchor: slot.leftAnchor,
      rightAnchor: slot.rightAnchor,
      operation: slot.operation,
      located: loc,
      sourceSliceAtOffsets:
        slot.startOffset != null && slot.endOffset != null
          ? text.slice(slot.startOffset, slot.endOffset)
          : null,
      paragraphEscaped: JSON.stringify(text),
      rawLength: text.length,
      nfcLength: text.normalize('NFC').length,
      occurrences00dot30: countOccurrences(text, '00.30'),
      occurrences00colon30: countOccurrences(text, '00:30'),
      occurrencesDoGodziny: countOccurrences(text, 'do godziny'),
      index00dot30: text.indexOf('00.30'),
      index00colon30: text.indexOf('00:30'),
      indexDoGodziny: text.indexOf('do godziny'),
      ...extra,
    })
  }
  console.info('[contract-slot-location-debug]', {
    registryKey: slot.registryKey,
    paragraphIndex: slot.paragraphIndex,
    storedOriginalText: slot.originalText,
    storedStartOffset: slot.startOffset,
    storedEndOffset: slot.endOffset,
    leftAnchor: slot.leftAnchor,
    rightAnchor: slot.rightAnchor,
    operation: slot.operation,
    paragraphPlainTextAtGeneration: text,
    exactMatchCount: original ? countOccurrences(text, original) : 0,
    normalizedMatchCount: original
      ? normalizeForMatch(text).includes(normalizeForMatch(original))
        ? 1
        : 0
      : 0,
    anchorMatchCount:
      (left ? countOccurrences(text, left) : 0) +
      (right ? countOccurrences(text, right) : 0),
    located: loc,
    ...extra,
  })
}

/**
 * Apply one slot's rendered value into paragraph text.
 * Locates using storedOriginalText — never the resolved replacement.
 */
export function applySlotToParagraphText(
  paragraphText: string,
  slot: TemplateSlot,
  value: string | null | undefined,
  omitted = false,
): { text: string; ok: boolean; reason?: string; location?: SlotLocation } {
  const canonical = canonicalizeParagraphText(paragraphText)
  const loc = locateSlotInParagraph(canonical, slot)
  if (!loc) {
    debugSlotLocation(canonical, slot, {
      paragraphPlainTextAtAnalysis: slot.sampleContext ?? null,
    })
    return {
      text: paragraphText,
      ok: false,
      reason: `Cannot safely locate slot ${slot.registryKey} in paragraph ${slot.paragraphIndex}.`,
    }
  }
  const rendered = renderSlotValue(slot, value, omitted)
  const beforeText = canonical.slice(0, loc.start)
  const slotText = canonical.slice(loc.start, loc.end)
  const afterText = canonical.slice(loc.end)
  const rebuiltParagraph = beforeText + rendered + afterText
  console.info('[contract-paragraph-rebuild]', {
    registryKey: slot.registryKey,
    paragraphIndex: slot.paragraphIndex,
    method: loc.method,
    beforeText,
    slotText,
    afterText,
    rebuiltParagraph,
  })
  return { text: rebuiltParagraph, ok: true, location: loc }
}
