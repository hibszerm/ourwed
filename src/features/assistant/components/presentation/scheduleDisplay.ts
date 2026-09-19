/**
 * Phase 2E/2F — display-only schedule row detection.
 * Renders trusted HH:MM schedule evidence as a product UI time/title list.
 * Does not invent schedule from arbitrary prose.
 *
 * Trusted patterns (all items in a block must match):
 * - "12:30 Przygotowania pana młodego"
 * - "przygotowania pana młodego: 12:30"
 */

import type { SafeInline } from './parseSafeMarkdown'

const TIME_PREFIX = /^(\d{1,2}:\d{2})\b(?:\s*[–—-]?\s*|\s+)(.+)$/u
const TIME_SUFFIX = /^(.+?)\s*:\s*(\d{1,2}:\d{2})\s*$/u

export type ScheduleRow = {
  time: string
  titleInlines: SafeInline[]
}

export function plainTextFromInlines(nodes: SafeInline[]): string {
  return nodes
    .map((n) => (n.type === 'text' ? n.value : plainTextFromInlines(n.children)))
    .join('')
}

export function tryParseScheduleRow(plain: string): { time: string; rest: string } | null {
  const trimmed = plain.trim()
  if (!trimmed) return null

  const prefix = TIME_PREFIX.exec(trimmed)
  if (prefix) {
    const time = prefix[1] ?? ''
    const rest = (prefix[2] ?? '').trim()
    if (time && rest) return { time, rest }
  }

  const suffix = TIME_SUFFIX.exec(trimmed)
  if (suffix) {
    const rest = (suffix[1] ?? '').trim()
    const time = suffix[2] ?? ''
    // Reject bare times / empty titles; avoid treating prose "Status: 12:30" alone — callers require ≥2 rows
    if (time && rest && rest.length >= 3) return { time, rest }
  }

  return null
}

/** True when every non-empty item is a trusted schedule row. */
export function allItemsAreScheduleRows(plains: string[]): boolean {
  if (plains.length < 2) return false
  return plains.every((p) => tryParseScheduleRow(p) !== null)
}

/**
 * Split soft-broken paragraph lines into schedule rows when every line matches.
 * Returns null if evidence is insufficient (keep SafeText paragraph).
 */
export function scheduleRowsFromParagraphLines(
  paragraphPlainWithBreaks: string,
): ScheduleRow[] | null {
  const lines = paragraphPlainWithBreaks
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (!allItemsAreScheduleRows(lines)) return null
  return lines.map((line) => {
    const parsed = tryParseScheduleRow(line)!
    return {
      time: parsed.time,
      titleInlines: [{ type: 'text', value: parsed.rest }],
    }
  })
}

export function scheduleRowsFromListItems(
  items: SafeInline[][],
): ScheduleRow[] | null {
  const plains = items.map((item) => plainTextFromInlines(item).trim())
  if (!allItemsAreScheduleRows(plains)) return null
  return items.map((item) => {
    const plain = plainTextFromInlines(item)
    const parsed = tryParseScheduleRow(plain)!
    return {
      time: parsed.time,
      titleInlines: [{ type: 'text', value: parsed.rest }],
    }
  })
}
