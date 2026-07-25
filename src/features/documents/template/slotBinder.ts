/**
 * SlotBinder — locate physical insert/replace spans for semantically detected variables.
 * Persists paragraphIndex + anchors + offsets. Never guesses with single-word search.
 */

import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'
import { countOccurrences } from './canonicalParagraph'
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
    leftAnchors: [
      'reportaż ślubny obejmuje czas maksymalnie do godziny',
      'reportaz slubny obejmuje czas maksymalnie do godziny',
      'obejmuje czas maksymalnie do godziny',
      'maksymalnie do godziny',
      'reportaż do godziny',
      'reportaz do godziny',
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
    registryKey: 'coverage_hours',
    aliases: ['working_hours'],
    leftAnchors: [
      'maksymalnie',
      'czas pracy kamerzysty',
      'czas pracy filmowca',
      'Czas pracy kamerzysty',
      'Czas pracy filmowca',
    ],
    rightAnchors: [' godzin', 'godzin', ' h.'],
    preferInsertWhenBlank: true,
    prefix: ' ',
    suffix: '',
    sourceHint: 'package',
  },
  {
    registryKey: 'overtime_rate',
    aliases: ['overtime_price', 'overtime_rate_formatted'],
    leftAnchors: [
      'Każda dodatkowa godzina to koszt w wysokości',
      'każda dodatkowa godzina to koszt w wysokości',
      'dodatkowa godzina to koszt w wysokości',
      'koszt dodatkowej godziny',
      'stawka za nadgodzinę',
      'koszt w wysokości',
    ],
    rightAnchors: ['.'],
    preferInsertWhenBlank: true,
    prefix: ' ',
    suffix: '',
    sourceHint: 'package',
  },
  {
    registryKey: 'delivery_term_text',
    aliases: ['delivery_time', 'delivery_months'],
    leftAnchors: [
      'w terminie',
      'termin oddania',
      'czas realizacji',
      'oddania materiałów w terminie',
    ],
    rightAnchors: ['.', ',', ';'],
    preferInsertWhenBlank: true,
    prefix: ' ',
    suffix: '',
    sourceHint: 'package',
  },
  {
    registryKey: 'final_payment_due_date',
    aliases: ['final_payment_due_date_long', 'payment_deadline'],
    leftAnchors: [
      'najpóźniej w dniu',
      'pozostałą część wynagrodzenia',
      'termin płatności końcowej',
      'Termin płatności końcowej',
    ],
    rightAnchors: ['.', ',', ';'],
    preferInsertWhenBlank: true,
    prefix: ' ',
    suffix: '',
    sourceHint: 'package',
  },
  {
    registryKey: 'included_services_text',
    aliases: ['included_services'],
    leftAnchors: [
      'Pakiet obejmuje',
      'pakiet obejmuje',
      'W ramach pakietu',
      'w ramach pakietu',
      'Zawartość pakietu',
    ],
    rightAnchors: [],
    preferInsertWhenBlank: true,
    prefix: ' ',
    suffix: '',
    sourceHint: 'package',
  },
  {
    registryKey: 'company_name',
    leftAnchors: ['firmą', 'Firmą', 'firmą', 'Firmą', 'pod firmą', 'pod firmą '],
    rightAnchors: [
      'zwanego dalej „Filmowcem”.',
      'zwanego dalej "Filmowcem".',
      'zwanym dalej „Filmowcem”',
      'zwanego dalej',
      'zwanym dalej',
      'zwanego',
      'zwaną dalej „Kamerzystami”',
      'zwaną dalej „Kamerzystami”',
      'zwana dalej „Kamerzystami”',
      'zwanym dalej „Kamerzystą”',
      'zwanego dalej „Kamerzystą”',
      'zwanym dalej „Wykonawcą”',
      'zwanego dalej „Wykonawcą”',
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
      ', zwanymi dalej „Parą Młodą”',
      ', zwanymi dalej "Parą Młodą"',
      ', zwaną dalej „Parą Młodą”,',
      ' zwaną dalej „Parą Młodą”',
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
  // couple_full_names / right-anchor-only: find name span before role cue.
  // Do NOT reject filled names — those are replace/composite slots.
  if (pattern.leftAnchors.length === 0 && pattern.rightAnchors.length > 0) {
    const right = findRight(text, pattern.rightAnchors, searchFrom)
    if (!right) return null
    const before = text.slice(0, right.start)
    const nameToken =
      "[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżąćęłńóśźżĄĆĘŁŃÓŚŹŻ'\\-]{1,30}"
    const fullName = `${nameToken}(?:\\s+${nameToken}){1,3}`
    const coupleRe = new RegExp(
      `(${fullName})\\s+(?:i|oraz)\\s+(${fullName})\\s*$`,
      'u',
    )
    const couple = coupleRe.exec(before.trimEnd())
    let start = 0
    let end = right.start
    let mid = text.slice(start, end)
    let operation: ContractSlotOperation = mid.trim() ? 'replace' : 'insert'

    if (couple) {
      const full = `${couple[1]} i ${couple[2]}`
      const idx = before.lastIndexOf(couple[1]!)
      if (idx >= 0) {
        start = idx
        end = idx + full.length
        mid = text.slice(start, end)
        operation = 'composite'
      }
    } else {
      // Single name — stop before address/phone clauses
      const cut = before.split(/,\s*(?:zam\.?|zamieszkał|ul\.|tel\.|adres)/i)[0]
      const singleRe = new RegExp(`(${fullName})\\s*$`, 'u')
      const single = singleRe.exec((cut ?? before).trimEnd())
      if (single) {
        const name = single[1]!
        const idx = before.lastIndexOf(name)
        if (idx >= 0) {
          start = idx
          end = idx + name.length
          mid = text.slice(start, end)
          operation = 'replace'
        }
      } else if (mid.trim().length > 120) {
        // No recognizable name span — avoid claiming the whole preamble
        return null
      }
    }

    const range = { start, end }
    if (claimed.some((c) => rangesOverlap(c, range))) return null
    return {
      paragraphIndex,
      start,
      end,
      leftAnchor: '',
      rightAnchor: right.anchor,
      originalText: mid,
      operation:
        pattern.registryKey === 'couple_full_names' && operation === 'composite'
          ? 'composite'
          : operation === 'insert'
            ? 'insert'
            : 'replace',
      prefix: pattern.prefix ?? '',
      suffix: pattern.suffix ?? '',
      paragraphText: text,
    }
  }

  const left = findLeft(text, pattern.leftAnchors, searchFrom)
  if (!left) return null

  // coverage_end_time: bind the clock-time value immediately after the left cue.
  // Do not require ". Czas …" so short clauses ("do godziny 00.30.") still bind,
  // and do not use a bare "." right-anchor (would hit the separator inside 00.30).
  if (pattern.registryKey === 'coverage_end_time') {
    const afterLeft = text.slice(left.end)
    const tm = /^\s*(\d{1,2}[.:]\d{2})/.exec(afterLeft)
    if (tm) {
      const value = tm[1]!
      const rel = afterLeft.indexOf(value)
      const start = left.end + rel
      const end = start + value.length
      const range = { start, end }
      if (claimed.some((c) => rangesOverlap(c, range))) return null
      const right =
        findRight(text, pattern.rightAnchors, end) ?? {
          anchor: text.slice(end, Math.min(text.length, end + 8)),
          start: end,
        }
      console.info('[coverage-end-time-location]', {
        phase: 'bind-direct-time',
        paragraphIndex,
        originalText: value,
        startOffset: start,
        endOffset: end,
        leftAnchor: left.anchor,
        rightAnchor: right.anchor,
        operation: 'replace',
        sourceSlice: text.slice(start, end),
        paragraphEscaped: JSON.stringify(text),
        rawLength: text.length,
        nfcLength: text.normalize('NFC').length,
        occurrences00dot30: countOccurrences(text, '00.30'),
        occurrences00colon30: countOccurrences(text, '00:30'),
        occurrencesDoGodziny: countOccurrences(text, 'do godziny'),
      })
      return {
        paragraphIndex,
        start,
        end,
        leftAnchor: left.anchor,
        rightAnchor: right.anchor,
        originalText: value,
        operation: 'replace',
        prefix: '',
        suffix: pattern.suffix ?? '',
        paragraphText: text,
      }
    }
  }

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

  // coverage_end_time: shrink mid to the smallest clock-time source span
  // (e.g. " 00.30" → "00.30"). Classification cues stay on anchors; the
  // persisted replacement span must be the value only.
  if (
    pattern.registryKey === 'coverage_end_time' &&
    operation === 'replace'
  ) {
    const timeRe = /(\d{1,2}[.:]\d{2})/
    const tm = timeRe.exec(mid)
    if (tm && tm.index != null) {
      const value = tm[1]!
      const rel = tm.index
      start = start + rel
      end = start + value.length
      mid = value
      prefix = ''
    }
  }

  // Expand replace range for ".;" glued cases where right is ";" but period is mid
  if (operation === 'replace' && midTrim === '.' && text[end] === ';') {
    // keep end at right.start (before ;)
  }

  // For ceremony: original "w.;" — left ends at "w", mid=".", right=";"
  // Render with prefix " " → "w Address;"

  const range = { start, end }
  if (claimed.some((c) => rangesOverlap(c, range))) return null

  if (pattern.registryKey === 'coverage_end_time') {
    console.info('[coverage-end-time-location]', {
      phase: 'bind',
      paragraphIndex,
      originalText: mid,
      startOffset: start,
      endOffset: end,
      leftAnchor: left.anchor,
      rightAnchor: right.anchor,
      operation,
      midBeforeShrink: normalizeMid(text.slice(left.end, right.start)),
      sourceSlice: text.slice(start, end),
      paragraphEscaped: JSON.stringify(text),
      rawLength: text.length,
      nfcLength: text.normalize('NFC').length,
      occurrences00dot30: countOccurrences(text, '00.30'),
      occurrences00colon30: countOccurrences(text, '00:30'),
      occurrencesDoGodziny: countOccurrences(text, 'do godziny'),
    })
  }

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
          registryKey:
            canonical === 'couple_full_names' && hit.operation !== 'composite'
              ? 'partner1_full_name'
              : canonical,
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
          componentKeys:
            hit.operation === 'composite'
              ? ['partner1_full_name', 'partner2_full_name']
              : undefined,
          separator: hit.operation === 'composite' ? ' i ' : undefined,
          confidence: 0.9,
          evidenceType:
            hit.operation === 'composite' ? 'composite_context' : 'legal_context',
          detectionReason: 'Bound via structural SLOT_PATTERNS anchors',
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
    'coverage_hours',
    'overtime_rate',
    'overtime_rate_formatted',
    'overtime_price',
    'working_hours',
    'delivery_term_text',
    'final_payment_due_date',
    'included_services_text',
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
