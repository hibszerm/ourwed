/**
 * Deterministic slot renderer — spacing/punctuation come from the slot, never AI.
 */

import type { OmissionMode, TemplateSlot } from './types'

export function renderSlotValue(
  slot: Pick<TemplateSlot, 'prefix' | 'suffix' | 'omissionMode' | 'originalText'>,
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
        // Only when template explicitly defined a removable clause range —
        // without that metadata, fall back to empty.
        return ''
      case 'empty':
      default:
        return `${prefix}${suffix}`.replace(/  +/g, ' ')
    }
  }

  return `${prefix}${String(value).trim()}${suffix}`
}

/**
 * Locate a persisted slot inside a paragraph.
 * Preference: offsets → verify anchors → recover by anchors → fail.
 */
export function locateSlotInParagraph(
  paragraphText: string,
  slot: TemplateSlot,
): { start: number; end: number } | null {
  const left = slot.leftAnchor ?? ''
  const right = slot.rightAnchor ?? ''

  if (
    slot.startOffset != null &&
    slot.endOffset != null &&
    slot.startOffset >= 0 &&
    slot.endOffset >= slot.startOffset &&
    slot.endOffset <= paragraphText.length
  ) {
    const start = slot.startOffset
    const end = slot.endOffset
    const leftOk = !left || paragraphText.slice(Math.max(0, start - left.length), start) === left ||
      paragraphText.includes(left)
    const rightOk =
      !right ||
      paragraphText.slice(end, end + right.length) === right ||
      paragraphText.includes(right)
    if (leftOk && rightOk) {
      // Prefer exact offset when anchors still match at boundaries
      if (
        (!left || paragraphText.slice(start - left.length, start) === left) &&
        (!right || paragraphText.slice(end, end + right.length) === right)
      ) {
        return { start, end }
      }
    }
  }

  if (left || right) {
    const leftEnd = left ? (() => {
      const i = paragraphText.indexOf(left)
      return i < 0 ? -1 : i + left.length
    })() : 0
    if (left && leftEnd < 0) return null
    const rightStart = right
      ? paragraphText.indexOf(right, Math.max(0, leftEnd))
      : paragraphText.length
    if (right && rightStart < 0) return null
    return {
      start: Math.max(0, leftEnd),
      end: Math.max(Math.max(0, leftEnd), rightStart),
    }
  }

  if (slot.originalText != null && slot.originalText.length > 0) {
    const idx = paragraphText.indexOf(slot.originalText)
    if (idx >= 0) {
      return { start: idx, end: idx + slot.originalText.length }
    }
  }

  return null
}

/**
 * Apply one slot's rendered value into paragraph text.
 */
export function applySlotToParagraphText(
  paragraphText: string,
  slot: TemplateSlot,
  value: string | null | undefined,
  omitted = false,
): { text: string; ok: boolean; reason?: string } {
  const loc = locateSlotInParagraph(paragraphText, slot)
  if (!loc) {
    return {
      text: paragraphText,
      ok: false,
      reason: `Cannot safely locate slot ${slot.registryKey} in paragraph ${slot.paragraphIndex}.`,
    }
  }
  const rendered = renderSlotValue(slot, value, omitted)
  const next =
    paragraphText.slice(0, loc.start) + rendered + paragraphText.slice(loc.end)
  return { text: next, ok: true }
}
