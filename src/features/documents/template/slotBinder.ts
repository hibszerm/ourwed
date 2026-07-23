/**
 * SlotBinder — locate physical insert/replace spans for semantically detected variables.
 * Persists paragraphIndex + anchors + offsets. Never guesses with single-word search.
 */

import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'
import {
  paragraphFingerprint,
  type IndexedParagraph,
} from './extractDocxParagraphs'
import type {
  ContractSlotOperation,
  TemplateSlot,
  TemplateSlotSourceHint,
} from './types'

export interface SlotPattern {
  registryKey: string
  aliases?: string[]
  leftAnchors: string[]
  rightAnchors: string[]
  /** Prefer replace when mid matches these exact strings (e.g. malformed ".") */
  replaceMidExact?: string[]
  /** Mid is whitespace-only → insert */
  preferInsertWhenBlank?: boolean
  prefix?: string
  suffix?: string
  sourceHint?: TemplateSlotSourceHint
}

/**
 * Stable multi-character anchors for Polish wedding contracts.
 * Keep anchors long enough to be unique within a paragraph.
 */
export const SLOT_PATTERNS: SlotPattern[] = [
  {
    registryKey: 'preparation_location',
    leftAnchors: [
      'Przygotowań ślubnych, które odbędą się w',
      'przygotowań ślubnych, które odbędą się w',
      'Przygotowania ślubne, które odbędą się w',
      'przygotowania ślubne, które odbędą się w',
    ],
    rightAnchors: [';'],
    preferInsertWhenBlank: true,
    prefix: ' ',
    suffix: '',
    sourceHint: 'wedding',
  },
  {
    registryKey: 'ceremony_location',
    leftAnchors: [
      'ceremonii ślubu, która odbędzie się w',
      'ceremonia ślubu, która odbędzie się w',
      'Ceremonii ślubu, która odbędzie się w',
    ],
    rightAnchors: [';'],
    replaceMidExact: ['.', '.;', ' .', '.'],
    preferInsertWhenBlank: true,
    prefix: ' ',
    suffix: '',
    sourceHint: 'wedding',
  },
  {
    registryKey: 'reception_location',
    leftAnchors: [
      'przyjęcia weselnego, które odbędzie się w',
      'Przyjęcia weselnego, które odbędzie się w',
      'przyjęcie weselne, które odbędzie się w',
    ],
    rightAnchors: ['– z czego', '–z czego', '- z czego', '– '],
    preferInsertWhenBlank: true,
    prefix: ' ',
    suffix: ' ',
    sourceHint: 'wedding',
  },
  {
    registryKey: 'coverage_end_time',
    aliases: ['working_hours', 'coverage_hours'],
    leftAnchors: [
      'reportaż ślubny obejmuje czas maksymalnie do godziny',
      'reportaz slubny obejmuje czas maksymalnie do godziny',
      'obejmuje czas maksymalnie do godziny',
      'maksymalnie do godziny',
    ],
    rightAnchors: [
      '. Czas pracy filmowca',
      '. Czas pracy',
      '. Czas',
    ],
    preferInsertWhenBlank: true,
    replaceMidExact: ['.', ' .', ''],
    prefix: ' ',
    suffix: '',
    sourceHint: 'package',
  },
  {
    registryKey: 'overtime_rate',
    aliases: ['overtime_price'],
    leftAnchors: [
      'Każda dodatkowa godzina to koszt w wysokości',
      'każda dodatkowa godzina to koszt w wysokości',
      'dodatkowa godzina to koszt w wysokości',
      'koszt w wysokości',
    ],
    rightAnchors: ['.'],
    preferInsertWhenBlank: true,
    prefix: ' ',
    suffix: '',
    sourceHint: 'package',
  },
  {
    registryKey: 'company_name',
    leftAnchors: ['firmą', 'Firmą'],
    rightAnchors: [
      'zwanego dalej „Filmowcem”.',
      'zwanego dalej "Filmowcem".',
      'zwanego dalej',
      'zwanego',
    ],
    preferInsertWhenBlank: true,
    prefix: ' ',
    suffix: ' ',
    sourceHint: 'company',
  },
  {
    registryKey: 'couple_full_names',
    leftAnchors: [],
    rightAnchors: [
      ', zwaną dalej „Parą Młodą”',
      ', zwaną dalej "Parą Młodą"',
      ', zwaną dalej „Parą Młodą”,',
    ],
    preferInsertWhenBlank: true,
    prefix: '',
    suffix: '',
    sourceHint: 'couple',
  },
]

function findLeft(haystack: string, anchors: string[], from = 0): {
  anchor: string
  end: number
} | null {
  let best: { anchor: string; end: number } | null = null
  for (const a of anchors) {
    if (!a) continue
    const idx = haystack.indexOf(a, from)
    if (idx < 0) continue
    const end = idx + a.length
    if (!best || idx < best.end - best.anchor.length) {
      best = { anchor: a, end }
    }
  }
  return best
}

function findRight(
  haystack: string,
  anchors: string[],
  from: number,
): { anchor: string; start: number } | null {
  let best: { anchor: string; start: number } | null = null
  for (const a of anchors) {
    if (!a) continue
    const idx = haystack.indexOf(a, from)
    if (idx < 0) continue
    // Prefer the earliest start; on ties prefer the longer anchor so
    // ";" wins over matching only part of a longer token, and " ;"
    // does not steal the leading space from an empty insert mid.
    if (
      !best ||
      idx < best.start ||
      (idx === best.start && a.length > best.anchor.length)
    ) {
      best = { anchor: a, start: idx }
    }
  }
  return best
}

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function normalizeMid(mid: string): string {
  return mid.replace(/\u00a0/g, ' ')
}

export interface BindHit {
  paragraphIndex: number
  start: number
  end: number
  leftAnchor: string
  rightAnchor: string
  originalText: string
  operation: ContractSlotOperation
  prefix: string
  suffix: string
  paragraphText: string
}

/**
 * Bind a single pattern inside one paragraph, avoiding claimed ranges.
 */
export function bindPatternInParagraph(
  pattern: SlotPattern,
  paragraphIndex: number,
  text: string,
  claimed: Array<{ start: number; end: number }>,
  searchFrom = 0,
): BindHit | null {
  // couple_full_names: right-anchor only (leading insert)
  if (pattern.leftAnchors.length === 0 && pattern.rightAnchors.length > 0) {
    const right = findRight(text, pattern.rightAnchors, searchFrom)
    if (!right) return null
    const start = 0
    const end = right.start
    const mid = text.slice(start, end)
    if (mid.trim().length > 40) return null // already filled / not empty slot
    const range = { start, end }
    if (claimed.some((c) => rangesOverlap(c, range))) return null
    return {
      paragraphIndex,
      start,
      end,
      leftAnchor: '',
      rightAnchor: right.anchor,
      originalText: mid,
      operation: mid.trim() ? 'replace' : 'insert',
      prefix: pattern.prefix ?? '',
      suffix: pattern.suffix ?? '',
      paragraphText: text,
    }
  }

  const left = findLeft(text, pattern.leftAnchors, searchFrom)
  if (!left) return null
  const right = findRight(text, pattern.rightAnchors, left.end)
  if (!right) return null

  let start = left.end
  let end = right.start
  if (end < start) return null

  let mid = normalizeMid(text.slice(start, end))
  let operation: ContractSlotOperation = 'insert'
  let prefix = pattern.prefix ?? ''
  const suffix = pattern.suffix ?? ''

  const midTrim = mid.trim()
  const replaceExact = pattern.replaceMidExact ?? []

  // Ceremony malformed: "w.;" → mid is "." between left and ";"
  if (
    replaceExact.some((x) => mid === x || midTrim === x.trim()) ||
    midTrim === '.' ||
    mid === '.'
  ) {
    operation = 'replace'
    // Keep replacing the period so we don't get "w.Address"
    if (!mid.includes('.')) {
      // blank — insert
      operation = 'insert'
    }
  } else if (!midTrim || /^\s+$/.test(mid)) {
    operation = 'insert'
  } else if (pattern.preferInsertWhenBlank === false) {
    operation = 'replace'
  } else {
    // Non-empty mid that looks like a placeholder value → replace
    operation = 'replace'
    prefix = prefix || (mid.startsWith(' ') ? '' : ' ')
  }

  // Expand replace range for ".;" glued cases where right is ";" but period is mid
  if (operation === 'replace' && midTrim === '.' && text[end] === ';') {
    // keep end at right.start (before ;)
  }

  // For ceremony: original "w.;" — left ends at "w", mid=".", right=";"
  // Render with prefix " " → "w Address;"

  const range = { start, end }
  if (claimed.some((c) => rangesOverlap(c, range))) return null

  return {
    paragraphIndex,
    start,
    end,
    leftAnchor: left.anchor,
    rightAnchor: right.anchor,
    originalText: mid,
    operation,
    prefix: operation === 'insert' ? prefix || ' ' : prefix,
    suffix,
    paragraphText: text,
  }
}

function patternMatchesKey(pattern: SlotPattern, key: string): boolean {
  if (pattern.registryKey === key) return true
  return Boolean(pattern.aliases?.includes(key))
}

export interface SlotBinderResult {
  slots: TemplateSlot[]
  unboundRegistryKeys: string[]
}

/**
 * Bind semantic keys to physical paragraph locations.
 */
export function bindSlotsToDocument(input: {
  registryKeys: string[]
  paragraphs: IndexedParagraph[]
  baseSlots?: TemplateSlot[]
  sourceHints?: Record<string, TemplateSlotSourceHint>
}): SlotBinderResult {
  const {
    registryKeys,
    paragraphs,
    baseSlots = [],
    sourceHints = {},
  } = input

  const claimedByPara = new Map<number, Array<{ start: number; end: number }>>()
  const bound: TemplateSlot[] = []
  const boundKeys = new Set<string>()

  const tryBindKey = (registryKey: string, label?: string, hint?: TemplateSlotSourceHint) => {
    if (boundKeys.has(registryKey)) return
    const patterns = SLOT_PATTERNS.filter((p) => patternMatchesKey(p, registryKey))
    // Also try pattern where registryKey is the pattern's canonical key via alias
    const extra = SLOT_PATTERNS.filter(
      (p) => p.aliases?.includes(registryKey) || p.registryKey === registryKey,
    )
    const list = patterns.length > 0 ? patterns : extra

    for (const pattern of list) {
      const canonical = pattern.registryKey
      if (boundKeys.has(canonical) && canonical !== registryKey) {
        // Already bound under canonical — map alias as same
        boundKeys.add(registryKey)
        return
      }

      for (const para of paragraphs) {
        const claimed = claimedByPara.get(para.index) ?? []
        const hit = bindPatternInParagraph(pattern, para.index, para.text, claimed)
        if (!hit) continue

        claimed.push({ start: hit.start, end: hit.end })
        claimedByPara.set(para.index, claimed)
        boundKeys.add(canonical)
        boundKeys.add(registryKey)
        for (const a of pattern.aliases ?? []) boundKeys.add(a)

        bound.push({
          id: `slot-${canonical}-${para.index}-${hit.start}`,
          registryKey: canonical,
          label: label ?? canonical.replace(/_/g, ' '),
          sourceHint: hint ?? pattern.sourceHint ?? sourceHints[canonical] ?? 'unknown',
          occurrences: 1,
          exampleText: hit.originalText.trim() || null,
          enabled: true,
          placeholderInserted: false,
          operation: hit.operation,
          paragraphIndex: hit.paragraphIndex,
          originalText: hit.originalText,
          leftAnchor: hit.leftAnchor || null,
          rightAnchor: hit.rightAnchor || null,
          allowedRange: { start: hit.start, end: hit.end },
          startOffset: hit.start,
          endOffset: hit.end,
          prefix: hit.prefix,
          suffix: hit.suffix,
          omissionMode: 'empty',
          paragraphFingerprint: paragraphFingerprint(para.text),
          physicallyBound: true,
        })
        return
      }
    }
  }

  // Prefer known patterns for detected keys first
  for (const key of registryKeys) {
    tryBindKey(key)
  }

  // Always attempt location/package patterns even if AI missed the key —
  // but only when AI or base listed them OR pattern keys are in registryKeys
  for (const pattern of SLOT_PATTERNS) {
    if (boundKeys.has(pattern.registryKey)) continue
    if (
      registryKeys.includes(pattern.registryKey) ||
      pattern.aliases?.some((a) => registryKeys.includes(a))
    ) {
      tryBindKey(pattern.registryKey)
    }
  }

  // Scan all paragraphs for location patterns when keys were requested
  const mustScan = new Set(
    registryKeys.filter((k) =>
      SLOT_PATTERNS.some((p) => patternMatchesKey(p, k)),
    ),
  )
  for (const key of mustScan) {
    tryBindKey(key)
  }

  // Merge with base semantic slots that remain unbound (presence-only)
  const unboundRegistryKeys: string[] = []
  for (const key of registryKeys) {
    const canonical =
      SLOT_PATTERNS.find((p) => patternMatchesKey(p, key))?.registryKey ?? key
    if (!boundKeys.has(canonical) && !boundKeys.has(key)) {
      unboundRegistryKeys.push(canonical)
    }
  }

  for (const base of baseSlots) {
    if (!base.registryKey) continue
    if (boundKeys.has(base.registryKey)) continue
    if (bound.some((b) => b.registryKey === base.registryKey)) continue
    // Keep semantic-only slot marked unbound
    bound.push({
      ...base,
      physicallyBound: false,
      operation: base.operation,
    })
    if (!unboundRegistryKeys.includes(base.registryKey)) {
      unboundRegistryKeys.push(base.registryKey)
    }
  }

  return { slots: bound, unboundRegistryKeys: [...new Set(unboundRegistryKeys)] }
}

/**
 * Run binder from AI analysis + indexed paragraphs.
 */
export function bindSlotsFromAnalysis(input: {
  ai: AiDocumentAnalysisResult
  paragraphs: IndexedParagraph[]
  semanticSlots: TemplateSlot[]
}): SlotBinderResult {
  const keys = new Set<string>()
  for (const s of input.semanticSlots) {
    if (s.registryKey) keys.add(s.registryKey)
  }
  for (const f of input.ai.fields) {
    if (f.registryKey) keys.add(f.registryKey)
  }
  for (const p of input.ai.packageVariables ?? []) keys.add(p)

  // Ensure location/package keys we care about are attempted when present in text cues
  const cues = [
    'preparation_location',
    'ceremony_location',
    'reception_location',
    'coverage_end_time',
    'overtime_rate',
    'overtime_price',
    'working_hours',
    'company_name',
    'couple_full_names',
  ]
  const joined = input.paragraphs.map((p) => p.text).join('\n')
  for (const cue of cues) {
    const pattern = SLOT_PATTERNS.find((p) => patternMatchesKey(p, cue))
    if (!pattern) continue
    const hitLeft = pattern.leftAnchors.some((a) => a && joined.includes(a))
    const hitRight = pattern.rightAnchors.some((a) => a && joined.includes(a))
    if (hitLeft || hitRight) keys.add(pattern.registryKey)
  }

  const hints: Record<string, TemplateSlotSourceHint> = {}
  for (const s of input.semanticSlots) {
    if (s.registryKey) hints[s.registryKey] = s.sourceHint
  }

  return bindSlotsToDocument({
    registryKeys: [...keys],
    paragraphs: input.paragraphs,
    baseSlots: input.semanticSlots,
    sourceHints: hints,
  })
}
