/**
 * Infer / normalize validation slots for a paragraph.
 * Supports replace, insert, and composite without requiring perfect stored metadata.
 */

import { SystemVariableRegistry } from '@/lib/variables/registry'
import { lookupResolvedValue } from './lookupResolvedValue'
import type {
  ContractSlotOperation,
  TemplateSlot,
} from './types'

export interface BoundSlotSpan {
  slotId: string
  registryKey: string
  operation: ContractSlotOperation
  /** Inclusive start / exclusive end in the ORIGINAL paragraph. */
  originalStart: number
  originalEnd: number
  /** Inclusive start / exclusive end in the GENERATED paragraph. */
  generatedStart: number
  generatedEnd: number
  resolvedValue: string
  leftAnchor?: string
  rightAnchor?: string
  componentKeys?: string[]
  separator?: string
}

const DEFAULT_COUPLE_SEPARATOR = ' i '

/** Canonical keys that should win over overlapping component aliases. */
const COMPOSITE_PREFERENCE = new Set([
  'couple_full_names',
  'bride_full_name',
  'groom_full_name',
  'partner1_full_name',
  'partner2_full_name',
  'company_name',
  'package_name',
])

const COMPONENT_OF: Record<string, string> = {
  bride_first_name: 'bride_full_name',
  bride_last_name: 'bride_full_name',
  groom_first_name: 'groom_full_name',
  groom_last_name: 'groom_full_name',
  'bride.name': 'bride_full_name',
  'groom.name': 'groom_full_name',
  'couple.partner1': 'partner1_full_name',
  'couple.partner2': 'partner2_full_name',
}

function normalizeQuotes(text: string): string {
  return text
    .replace(/[„”«»]/g, '"')
    .replace(/\u00a0/g, ' ')
}

function findAnchorEnd(haystack: string, anchor: string, from = 0): number {
  if (!anchor) return -1
  const idx = haystack.indexOf(anchor, from)
  return idx < 0 ? -1 : idx + anchor.length
}

function findAnchorStart(haystack: string, anchor: string, from = 0): number {
  if (!anchor) return -1
  return haystack.indexOf(anchor, from)
}

/**
 * Resolve the final string a slot contributes to the generated document.
 */
export function resolveSlotValue(
  slot: TemplateSlot,
  resolved: Record<string, string>,
): string {
  if (slot.operation === 'composite' || slot.componentKeys?.length) {
    const keys =
      slot.componentKeys && slot.componentKeys.length > 0
        ? slot.componentKeys
        : slot.registryKey
          ? [slot.registryKey]
          : []
    const sep = slot.separator ?? DEFAULT_COUPLE_SEPARATOR
    const parts = keys
      .map((k) => lookupResolvedValue(resolved, k))
      .filter(Boolean)
    if (parts.length > 0) return parts.join(sep)
  }

  if (slot.registryKey === 'couple_full_names') {
    return lookupResolvedValue(resolved, 'couple_full_names')
  }

  if (!slot.registryKey) return ''
  return lookupResolvedValue(resolved, slot.registryKey)
}

function inferOperation(slot: TemplateSlot, originalParagraph: string): ContractSlotOperation {
  if (slot.operation) return slot.operation
  if (slot.componentKeys?.length || slot.registryKey === 'couple_full_names') {
    return 'composite'
  }
  const original =
    slot.originalText?.trim() ||
    slot.exampleText?.trim() ||
    ''
  if (original && originalParagraph.includes(original)) return 'replace'
  return 'insert'
}

function spansOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function slotSpecificity(slot: TemplateSlot): number {
  let score = 0
  if (slot.operation === 'composite') score += 40
  if (slot.registryKey && COMPOSITE_PREFERENCE.has(slot.registryKey)) score += 30
  if (slot.componentKeys?.length) score += 20
  if (slot.leftAnchor && slot.rightAnchor) score += 15
  if (slot.originalText || slot.exampleText) score += 10
  if (slot.allowedRange) score += 10
  // Prefer fuller keys over components
  if (slot.registryKey && COMPONENT_OF[slot.registryKey]) score -= 25
  return score
}

/**
 * Deduplicate overlapping slots — one physical span per character range.
 */
export function dedupeOverlappingSlots(slots: TemplateSlot[]): TemplateSlot[] {
  const sorted = [...slots].sort(
    (a, b) => slotSpecificity(b) - slotSpecificity(a),
  )
  const kept: TemplateSlot[] = []
  const claimedKeys = new Set<string>()

  for (const slot of sorted) {
    if (!slot.registryKey) continue
    const canonical =
      SystemVariableRegistry.get(slot.registryKey)?.id ?? slot.registryKey
    const parent = COMPONENT_OF[canonical]
    if (parent && claimedKeys.has(parent)) continue
    if (claimedKeys.has(canonical)) continue

    // Drop component slots when composite already kept
    if (
      slot.componentKeys?.some((k) => claimedKeys.has(k)) &&
      slot.operation !== 'composite' &&
      slot.registryKey !== 'couple_full_names'
    ) {
      continue
    }

    kept.push(slot)
    claimedKeys.add(canonical)
    for (const k of slot.componentKeys ?? []) claimedKeys.add(k)
    // Claiming a full name also claims its parts
    if (canonical === 'bride_full_name') {
      claimedKeys.add('bride_first_name')
      claimedKeys.add('bride_last_name')
    }
    if (canonical === 'groom_full_name') {
      claimedKeys.add('groom_first_name')
      claimedKeys.add('groom_last_name')
    }
    if (canonical === 'couple_full_names') {
      claimedKeys.add('bride_full_name')
      claimedKeys.add('groom_full_name')
      claimedKeys.add('partner1_full_name')
      claimedKeys.add('partner2_full_name')
      claimedKeys.add('bride_first_name')
      claimedKeys.add('bride_last_name')
      claimedKeys.add('groom_first_name')
      claimedKeys.add('groom_last_name')
    }
  }
  return kept
}

function bindReplace(
  slot: TemplateSlot,
  original: string,
  generated: string,
  value: string,
): BoundSlotSpan | null {
  if (!slot.registryKey || !value) return null
  const needle =
    slot.originalText?.trim() ||
    slot.exampleText?.trim() ||
    ''
  if (!needle) return null
  const oStart = original.indexOf(needle)
  if (oStart < 0) return null
  const gStart = generated.indexOf(value)
  if (gStart < 0) {
    // Value may include leading/trailing space variants
    const trimmed = value.trim()
    const g2 = generated.indexOf(trimmed)
    if (g2 < 0) return null
    return {
      slotId: slot.id,
      registryKey: slot.registryKey,
      operation: 'replace',
      originalStart: oStart,
      originalEnd: oStart + needle.length,
      generatedStart: g2,
      generatedEnd: g2 + trimmed.length,
      resolvedValue: trimmed,
    }
  }
  return {
    slotId: slot.id,
    registryKey: slot.registryKey,
    operation: 'replace',
    originalStart: oStart,
    originalEnd: oStart + needle.length,
    generatedStart: gStart,
    generatedEnd: gStart + value.length,
    resolvedValue: value,
  }
}

function bindInsertOrComposite(
  slot: TemplateSlot,
  original: string,
  generated: string,
  value: string,
  operation: ContractSlotOperation,
): BoundSlotSpan | null {
  if (!slot.registryKey || !value) return null

  let left = slot.leftAnchor?.trim() || ''
  let right = slot.rightAnchor?.trim() || ''

  // Infer anchors when missing: value sits before a stable right suffix that
  // exists in both original and generated.
  if (!left && !right) {
    // Try: generated = value + suffix that equals original (pure leading insert)
    if (generated.endsWith(original) && generated.length > original.length) {
      const prefix = generated.slice(0, generated.length - original.length)
      if (prefix.trim() === value.trim() || prefix.includes(value.trim())) {
        return {
          slotId: slot.id,
          registryKey: slot.registryKey,
          operation,
          originalStart: 0,
          originalEnd: 0,
          generatedStart: 0,
          generatedEnd: prefix.length,
          resolvedValue: prefix,
          rightAnchor: original.slice(0, Math.min(40, original.length)),
        }
      }
    }
    // Try: generated = prefix_original_start + value + rest matching original end
    // Generic: find longest suffix of original that is also suffix of generated
    let suffixLen = 0
    const max = Math.min(original.length, generated.length)
    for (let n = max; n >= Math.min(8, max); n--) {
      if (original.slice(-n) === generated.slice(-n)) {
        suffixLen = n
        break
      }
    }
    if (suffixLen > 0) {
      right = original.slice(-suffixLen)
      const oBefore = original.slice(0, original.length - suffixLen)
      const gBefore = generated.slice(0, generated.length - suffixLen)
      // Also match shared prefix as left anchor
      let prefixLen = 0
      const maxP = Math.min(oBefore.length, gBefore.length)
      for (let n = 0; n < maxP; n++) {
        if (oBefore[n] === gBefore[n]) prefixLen = n + 1
        else break
      }
      left = oBefore.slice(0, prefixLen)
      const oMid = oBefore.slice(prefixLen)
      const gMid = gBefore.slice(prefixLen)
      // Mid in original should be empty or whitespace-only for insert
      if (operation === 'insert' && oMid.trim() !== '') {
        // Might still be replace of oMid
        if (gMid.includes(value) || normalizeQuotes(gMid).includes(normalizeQuotes(value))) {
          // treat as replace of middle
          return {
            slotId: slot.id,
            registryKey: slot.registryKey,
            operation: 'replace',
            originalStart: prefixLen,
            originalEnd: prefixLen + oMid.length,
            generatedStart: prefixLen,
            generatedEnd: prefixLen + gMid.length,
            resolvedValue: gMid,
            leftAnchor: left || undefined,
            rightAnchor: right || undefined,
          }
        }
        return null
      }
      return {
        slotId: slot.id,
        registryKey: slot.registryKey,
        operation,
        originalStart: prefixLen,
        originalEnd: prefixLen + oMid.length,
        generatedStart: prefixLen,
        generatedEnd: prefixLen + gMid.length,
        resolvedValue: gMid,
        leftAnchor: left || undefined,
        rightAnchor: right || undefined,
        componentKeys: slot.componentKeys,
        separator: slot.separator ?? undefined,
      }
    }
  }

  if (left || right) {
    const oLeftEnd = left ? findAnchorEnd(original, left) : 0
    const gLeftEnd = left ? findAnchorEnd(generated, left) : 0
    if (left && (oLeftEnd < 0 || gLeftEnd < 0)) return null

    const oRightStart = right
      ? findAnchorStart(original, right, Math.max(0, oLeftEnd))
      : original.length
    const gRightStart = right
      ? findAnchorStart(generated, right, Math.max(0, gLeftEnd))
      : generated.length
    if (right && (oRightStart < 0 || gRightStart < 0)) return null

    const oStart = Math.max(0, oLeftEnd)
    const oEnd = Math.max(oStart, oRightStart)
    const gStart = Math.max(0, gLeftEnd)
    const gEnd = Math.max(gStart, gRightStart)
    const gMid = generated.slice(gStart, gEnd)

    // Inserted mid must contain the resolved value (allow surrounding spaces)
    if (
      value.trim() &&
      !gMid.includes(value.trim()) &&
      normalizeQuotes(gMid).indexOf(normalizeQuotes(value.trim())) < 0
    ) {
      // Still allow if mid is exactly the value with spaces
      if (gMid.trim() !== value.trim()) return null
    }

    return {
      slotId: slot.id,
      registryKey: slot.registryKey,
      operation,
      originalStart: oStart,
      originalEnd: oEnd,
      generatedStart: gStart,
      generatedEnd: gEnd,
      resolvedValue: gMid,
      leftAnchor: left || undefined,
      rightAnchor: right || undefined,
      componentKeys: slot.componentKeys,
      separator: slot.separator ?? undefined,
    }
  }

  return null
}

const COUPLE_SEPARATORS = [' i ', ' oraz ', ', ', ' & ', '\n'] as const

function coupleValueCandidates(resolved: Record<string, string>): Array<{
  value: string
  separator: string
}> {
  const p1 =
    lookupResolvedValue(resolved, 'partner1_full_name') ||
    lookupResolvedValue(resolved, 'bride_full_name')
  const p2 =
    lookupResolvedValue(resolved, 'partner2_full_name') ||
    lookupResolvedValue(resolved, 'groom_full_name')
  const out: Array<{ value: string; separator: string }> = []
  const seen = new Set<string>()
  const push = (value: string, separator: string) => {
    const v = value.trim()
    if (!v || seen.has(v)) return
    seen.add(v)
    out.push({ value: v, separator })
  }

  const canonical = lookupResolvedValue(resolved, 'couple_full_names')
  if (canonical) push(canonical, DEFAULT_COUPLE_SEPARATOR)

  if (p1 && p2) {
    for (const sep of COUPLE_SEPARATORS) {
      push(`${p1}${sep}${p2}`, sep)
    }
  }
  return out
}

function tryAutoCoupleSpan(
  paragraphIndex: number,
  original: string,
  generated: string,
  resolved: Record<string, string>,
): BoundSlotSpan | null {
  for (const candidate of coupleValueCandidates(resolved)) {
    if (!generated.includes(candidate.value)) continue
    const auto: TemplateSlot = {
      id: 'auto-couple_full_names',
      registryKey: 'couple_full_names',
      label: 'Para młoda',
      sourceHint: 'couple',
      occurrences: 1,
      enabled: true,
      operation: 'composite',
      componentKeys: ['partner1_full_name', 'partner2_full_name'],
      separator: candidate.separator,
      paragraphIndex,
    }
    const span = bindInsertOrComposite(
      auto,
      original,
      generated,
      candidate.value,
      'composite',
    )
    if (span) return span
  }
  return null
}

function tryAutoCompanySpan(
  paragraphIndex: number,
  original: string,
  generated: string,
  resolved: Record<string, string>,
): BoundSlotSpan | null {
  const company = lookupResolvedValue(resolved, 'company_name')
  if (!company || !generated.includes(company)) return null

  const anchorPairs: Array<{ left: string; right: string }> = [
    { left: 'firmą', right: 'zwanego dalej „Filmowcem”.' },
    { left: 'firmą', right: 'zwanego dalej' },
    { left: 'firmą', right: 'zwanego' },
  ]

  for (const anchors of anchorPairs) {
    const auto: TemplateSlot = {
      id: 'auto-company_name',
      registryKey: 'company_name',
      label: 'Nazwa firmy',
      sourceHint: 'company',
      occurrences: 1,
      enabled: true,
      operation: 'insert',
      leftAnchor: anchors.left,
      rightAnchor: anchors.right,
      paragraphIndex,
    }
    const span = bindInsertOrComposite(
      auto,
      original,
      generated,
      company,
      'insert',
    )
    if (span) return span
  }

  // Fall back to shared prefix/suffix inference without fixed anchors
  return bindInsertOrComposite(
    {
      id: 'auto-company_name',
      registryKey: 'company_name',
      label: 'Nazwa firmy',
      sourceHint: 'company',
      occurrences: 1,
      enabled: true,
      operation: 'insert',
      paragraphIndex,
    },
    original,
    generated,
    company,
    'insert',
  )
}

/**
 * Bind template slots to concrete character spans in a paragraph pair.
 * Composite / insert auto-spans bind first so component aliases cannot
 * fragment a single physical value (e.g. couple names + " i ").
 */
export function bindSlotsToParagraph(input: {
  paragraphIndex: number
  original: string
  generated: string
  slots: TemplateSlot[]
  resolved: Record<string, string>
}): BoundSlotSpan[] {
  const { paragraphIndex, original, generated, slots, resolved } = input
  const bound: BoundSlotSpan[] = []

  const pushIfFree = (span: BoundSlotSpan | null) => {
    if (!span) return
    const range = { start: span.originalStart, end: span.originalEnd }
    const genRange = { start: span.generatedStart, end: span.generatedEnd }
    if (
      bound.some(
        (b) =>
          spansOverlap(range, {
            start: b.originalStart,
            end: b.originalEnd,
          }) ||
          spansOverlap(genRange, {
            start: b.generatedStart,
            end: b.generatedEnd,
          }),
      )
    ) {
      return
    }
    bound.push(span)
  }

  // Prefer full-value auto spans before component slot fragmentation
  pushIfFree(tryAutoCoupleSpan(paragraphIndex, original, generated, resolved))
  pushIfFree(tryAutoCompanySpan(paragraphIndex, original, generated, resolved))

  const candidates = slots.filter((s) => {
    if (!s.enabled || !s.registryKey) return false
    if (s.paragraphIndex != null && s.paragraphIndex !== paragraphIndex) {
      return false
    }
    // Skip components already owned by a bound composite/full-value span
    if (
      bound.some((b) => {
        if (b.registryKey === 'couple_full_names') {
          return (
            s.registryKey === 'couple_full_names' ||
            s.registryKey === 'bride_full_name' ||
            s.registryKey === 'groom_full_name' ||
            s.registryKey === 'partner1_full_name' ||
            s.registryKey === 'partner2_full_name' ||
            Boolean(COMPONENT_OF[s.registryKey!]) ||
            s.registryKey?.startsWith('bride_') ||
            s.registryKey?.startsWith('groom_')
          )
        }
        if (b.registryKey === 'company_name') {
          return s.registryKey === 'company_name'
        }
        return b.registryKey === s.registryKey
      })
    ) {
      return false
    }
    return true
  })

  const deduped = dedupeOverlappingSlots(candidates)

  for (const slot of deduped) {
    const value = resolveSlotValue(slot, resolved)
    const op = inferOperation(slot, original)

    let span: BoundSlotSpan | null = null
    if (op === 'replace') {
      span = bindReplace(slot, original, generated, value)
      if (!span) {
        span = bindInsertOrComposite(slot, original, generated, value, 'insert')
      }
    } else {
      span = bindInsertOrComposite(slot, original, generated, value || ' ', op)
      if (!span && value) {
        span = bindReplace(slot, original, generated, value)
      }
    }

    pushIfFree(span)
  }

  return bound.sort((a, b) => a.originalStart - b.originalStart)
}

/**
 * Replace bound spans with opaque tokens so only immutable text remains.
 */
export function protectParagraphText(
  text: string,
  spans: Array<{ start: number; end: number; slotId: string }>,
): string {
  if (spans.length === 0) return text
  const sorted = [...spans].sort((a, b) => b.start - a.start)
  let out = text
  for (const span of sorted) {
    const token = `⟦VAR:${span.slotId}⟧`
    out = out.slice(0, span.start) + token + out.slice(span.end)
  }
  return out
}
