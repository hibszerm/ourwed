/**
 * Legal money pairs: numeric PLN + amount-in-words (“słownie”).
 * Each side is a separate physical slot; both must be bound when both exist.
 */

import { canonicalizeParagraphText } from './canonicalParagraph'
import { canonicalRegistryKey } from './slotClassification'
import { classifyMoneyConceptScored } from './contractMoneyClassification'
import type { TemplateSlot } from './types'

export interface MoneyPairConcept {
  concept: 'contract_value' | 'agreed_deposit' | 'remaining_after_deposit'
  numericKey: string
  wordsKey: string
  legacyNumericKeys: string[]
}

export const MONEY_PAIR_CONCEPTS: MoneyPairConcept[] = [
  {
    concept: 'contract_value',
    numericKey: 'contract_value_formatted',
    wordsKey: 'contract_value_words',
    legacyNumericKeys: ['package_price', 'contract_price', 'price'],
  },
  {
    concept: 'agreed_deposit',
    numericKey: 'agreed_deposit_formatted',
    wordsKey: 'agreed_deposit_words',
    legacyNumericKeys: ['deposit_amount', 'deposit'],
  },
  {
    concept: 'remaining_after_deposit',
    numericKey: 'remaining_after_deposit_formatted',
    wordsKey: 'remaining_after_deposit_words',
    legacyNumericKeys: ['remaining_payment'],
  },
]

/** Legacy numeric keys → canonical formatted / words keys for slot identity. */
export const MONEY_KEY_CANONICAL: Record<string, string> = {
  package_price: 'contract_value_formatted',
  contract_price: 'contract_value_formatted',
  price: 'contract_value_formatted',
  deposit_amount: 'agreed_deposit_formatted',
  deposit: 'agreed_deposit_formatted',
  remaining_payment: 'remaining_after_deposit_formatted',
}

export const MONEY_COMMERCIAL_APPLY_KEYS = new Set([
  'contract_value_formatted',
  'contract_value_words',
  'agreed_deposit_formatted',
  'agreed_deposit_words',
  'remaining_after_deposit_formatted',
  'remaining_after_deposit_words',
  ...Object.keys(MONEY_KEY_CANONICAL),
])

export interface MoneyPairReport {
  concept: MoneyPairConcept['concept']
  numericKey: string
  wordsKey: string
  numericDetected: boolean
  wordsDetected: boolean
  numericBound: boolean
  wordsBound: boolean
  sameClause: boolean
  overlapping: boolean
  missingSide: 'numeric' | 'words' | 'none' | 'both'
  staleSourceRisk: boolean
}

export interface SlownieSpan {
  /** Absolute start of words inside “(słownie: …)”. */
  start: number
  end: number
  text: string
  leftAnchor: string
  rightAnchor: string
  /** Start of “(słownie:” wrapper (for pairing distance). */
  wrapperStart: number
}

const MONEY_RE =
  /(\d{1,3}(?:[\s\u00a0]\d{3})+|\d+)(?:[.,]\d{2})?\s*(?:zł|zl|PLN)(?=[\s.,;)]|$)/gi

/**
 * Classify a PLN amount using local legal context (scored anchors).
 */
export function classifyMoneyConcept(
  text: string,
  amountStart: number,
  amountEnd: number,
): MoneyPairConcept['concept'] | 'overtime' | 'travel' | 'unknown' {
  const kind = classifyMoneyConceptScored(text, amountStart, amountEnd)
  if (kind === 'excluded_penalty' || kind === 'ambiguous') return 'unknown'
  if (
    kind === 'contract_value' ||
    kind === 'agreed_deposit' ||
    kind === 'remaining_after_deposit' ||
    kind === 'overtime' ||
    kind === 'travel' ||
    kind === 'unknown'
  ) {
    return kind
  }
  return 'unknown'
}

export function conceptToNumericKey(
  concept: MoneyPairConcept['concept'],
): string {
  return MONEY_PAIR_CONCEPTS.find((c) => c.concept === concept)!.numericKey
}

export function conceptToWordsKey(
  concept: MoneyPairConcept['concept'],
): string {
  return MONEY_PAIR_CONCEPTS.find((c) => c.concept === concept)!.wordsKey
}

/** Locate “(słownie: WORDS)” immediately after `fromOffset` (typically after PLN). */
export function findSlownieWordsAfter(
  text: string,
  fromOffset: number,
): SlownieSpan | null {
  const window = text.slice(fromOffset)
  const open = /^\s*\(\s*słownie\s*:\s*/i.exec(window)
  if (!open) return null
  const wrapperRel = open.index
  const wordsRel = open.index + open[0].length
  const afterOpen = window.slice(wordsRel)
  const closeRel = afterOpen.search(/\)/)
  if (closeRel < 0) return null
  const rawWords = afterOpen.slice(0, closeRel)
  const trimmed = rawWords.replace(/^\s+/, '').replace(/\s+$/, '')
  if (!trimmed) return null
  const lead = rawWords.length - rawWords.replace(/^\s+/, '').length
  const start = fromOffset + wordsRel + lead
  const end = start + trimmed.length
  const leftAnchor = text.slice(fromOffset + wrapperRel, start)
  return {
    start,
    end,
    text: trimmed,
    leftAnchor,
    rightAnchor: ')',
    wrapperStart: fromOffset + wrapperRel,
  }
}

export interface DetectedMoneyPair {
  concept: MoneyPairConcept['concept']
  numeric: {
    start: number
    end: number
    text: string
    key: string
  }
  words: {
    start: number
    end: number
    text: string
    key: string
    leftAnchor: string
    rightAnchor: string
  } | null
}

/** Detect money amount + optional paired słownie words in one paragraph. */
export function detectMoneyPairsInText(text: string): DetectedMoneyPair[] {
  const pairs: DetectedMoneyPair[] = []
  const re = new RegExp(MONEY_RE.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const span = m[0].replace(/\u00a0/g, ' ')
    const start = m.index
    const end = start + m[0].length
    const kind = classifyMoneyConcept(text, start, end)
    if (
      kind === 'overtime' ||
      kind === 'travel' ||
      kind === 'unknown'
    ) {
      continue
    }
    const words = findSlownieWordsAfter(text, end)
    pairs.push({
      concept: kind,
      numeric: {
        start,
        end,
        text: span,
        key: conceptToNumericKey(kind),
      },
      words: words
        ? {
            start: words.start,
            end: words.end,
            text: words.text,
            key: conceptToWordsKey(kind),
            leftAnchor: words.leftAnchor,
            rightAnchor: words.rightAnchor,
          }
        : null,
    })
  }
  return pairs
}

function slotKeySet(slot: TemplateSlot): Set<string> {
  const keys = new Set<string>()
  if (!slot.registryKey) return keys
  const canon = canonicalRegistryKey(slot.registryKey)
  keys.add(canon)
  keys.add(slot.registryKey)
  const mapped = MONEY_KEY_CANONICAL[slot.registryKey]
  if (mapped) keys.add(mapped)
  return keys
}

function findSlotForKey(
  slots: TemplateSlot[],
  key: string,
): TemplateSlot | undefined {
  return slots.find((s) => {
    if (!s.registryKey) return false
    const keys = slotKeySet(s)
    return keys.has(key) || keys.has(canonicalRegistryKey(key))
  })
}

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function isBound(slot: TemplateSlot | undefined): boolean {
  return Boolean(
    slot &&
      slot.enabled !== false &&
      slot.physicallyBound !== false &&
      slot.paragraphIndex != null &&
      (slot.originalText != null ||
        (slot.startOffset != null && slot.endOffset != null)),
  )
}

/**
 * Physical evidence that a words span exists for a concept in analyzed paragraphs.
 */
export function physicalWordsExistsForConcept(
  paragraphs: Array<{ index: number; text: string }>,
  concept: MoneyPairConcept['concept'],
): boolean {
  for (const p of paragraphs) {
    const text = canonicalizeParagraphText(p.text)
    for (const pair of detectMoneyPairsInText(text)) {
      if (pair.concept === concept && pair.words) return true
    }
  }
  return false
}

export function physicalNumericExistsForConcept(
  paragraphs: Array<{ index: number; text: string }>,
  concept: MoneyPairConcept['concept'],
): boolean {
  for (const p of paragraphs) {
    const text = canonicalizeParagraphText(p.text)
    for (const pair of detectMoneyPairsInText(text)) {
      if (pair.concept === concept) return true
    }
  }
  return false
}

export function analyzeMoneyPairs(input: {
  slots: TemplateSlot[]
  paragraphs: Array<{ index: number; text: string }>
}): MoneyPairReport[] {
  const reports: MoneyPairReport[] = []

  for (const def of MONEY_PAIR_CONCEPTS) {
    const numericSlot = findSlotForKey(input.slots, def.numericKey)
    const wordsSlot = findSlotForKey(input.slots, def.wordsKey)
    const numericDetected =
      Boolean(numericSlot) ||
      physicalNumericExistsForConcept(input.paragraphs, def.concept)
    const wordsDetected =
      Boolean(wordsSlot) ||
      physicalWordsExistsForConcept(input.paragraphs, def.concept)
    const numericBound = isBound(numericSlot)
    const wordsBound = isBound(wordsSlot)

    let sameClause = false
    let overlapping = false
    if (
      numericSlot?.paragraphIndex != null &&
      wordsSlot?.paragraphIndex != null &&
      numericSlot.paragraphIndex === wordsSlot.paragraphIndex &&
      numericSlot.startOffset != null &&
      numericSlot.endOffset != null &&
      wordsSlot.startOffset != null &&
      wordsSlot.endOffset != null
    ) {
      sameClause = true
      overlapping = rangesOverlap(
        { start: numericSlot.startOffset, end: numericSlot.endOffset },
        { start: wordsSlot.startOffset, end: wordsSlot.endOffset },
      )
    } else if (numericDetected && wordsDetected) {
      // Physical re-scan: same paragraph pair
      for (const p of input.paragraphs) {
        const pairs = detectMoneyPairsInText(
          canonicalizeParagraphText(p.text),
        ).filter((x) => x.concept === def.concept && x.words)
        if (pairs.length > 0) {
          sameClause = true
          break
        }
      }
    }

    let missingSide: MoneyPairReport['missingSide'] = 'none'
    if (numericDetected && wordsDetected) {
      if (!numericBound && !wordsBound) missingSide = 'both'
      else if (!numericBound) missingSide = 'numeric'
      else if (!wordsBound) missingSide = 'words'
    } else if (numericDetected && !wordsDetected) {
      missingSide = 'none'
    } else if (!numericDetected && wordsDetected) {
      missingSide = 'numeric'
    }

    const staleSourceRisk =
      numericBound && wordsDetected && !wordsBound

    reports.push({
      concept: def.concept,
      numericKey: def.numericKey,
      wordsKey: def.wordsKey,
      numericDetected,
      wordsDetected,
      numericBound,
      wordsBound,
      sameClause,
      overlapping,
      missingSide,
      staleSourceRisk,
    })
  }

  console.info('[contract-money-pairs]', reports)
  return reports
}

/**
 * Abort when a legal money pair is only half-bound while both physical sides exist.
 */
export function assertSafeMoneyPairsForGeneration(input: {
  slots: TemplateSlot[]
  paragraphs: Array<{ index: number; text: string }>
}): MoneyPairReport[] {
  const reports = analyzeMoneyPairs(input)
  for (const r of reports) {
    if (r.overlapping) {
      throw new Error(
        `Unsafe financial pair ${r.concept}: numeric and words slots overlap.`,
      )
    }
    const numericPhysical = physicalNumericExistsForConcept(
      input.paragraphs,
      r.concept,
    )
    const wordsPhysical = physicalWordsExistsForConcept(
      input.paragraphs,
      r.concept,
    )
    if (numericPhysical && wordsPhysical) {
      if (r.numericBound && !r.wordsBound) {
        throw new Error(
          `Unsafe financial pair ${r.concept}: numeric slot is bound but words slot is missing.`,
        )
      }
      if (r.wordsBound && !r.numericBound) {
        throw new Error(
          `Unsafe financial pair ${r.concept}: words slot is bound but numeric slot is missing.`,
        )
      }
      if (!r.numericBound || !r.wordsBound) {
        throw new Error(
          `Unsafe financial pair ${r.concept}: both physical spans exist but binding is incomplete (numericBound=${r.numericBound}, wordsBound=${r.wordsBound}).`,
        )
      }
    }
  }
  return reports
}

/**
 * Span-aware stale check: source originalText must not remain as a standalone
 * slot remnant. Allows generated values that contain the source as a suffix
 * (e.g. “tysiąc złotych” inside “jeden tysiąc złotych”).
 */
export function findStaleMoneySourcePhrases(input: {
  transformed: Array<{ index: number; text: string }>
  slots: TemplateSlot[]
  resolved: Record<string, string>
}): Array<{ registryKey: string; originalText: string; paragraphIndex: number }> {
  const stale: Array<{
    registryKey: string
    originalText: string
    paragraphIndex: number
  }> = []

  for (const def of MONEY_PAIR_CONCEPTS) {
    for (const key of [def.numericKey, def.wordsKey]) {
      const slot = findSlotForKey(input.slots, key)
      if (!isBound(slot) || !slot!.originalText?.trim()) continue
      const original = slot!.originalText.trim()
      const generated =
        input.resolved[key]?.trim() ||
        input.resolved[slot!.registryKey!]?.trim() ||
        ''
      if (!generated || generated === original) continue
      // Generated intentionally contains source as trailing phrase — not stale
      if (
        generated === original ||
        generated.endsWith(` ${original}`) ||
        generated.endsWith(original)
      ) {
        // Still flag if wrapper form remains: (słownie: ORIGINAL)
        const para = input.transformed.find(
          (p) => p.index === slot!.paragraphIndex,
        )
        if (!para) continue
        const text = canonicalizeParagraphText(para.text)
        const wrapper = new RegExp(
          `\\(\\s*słownie\\s*:\\s*${escapeRegExp(original)}\\s*\\)`,
          'i',
        )
        if (key.endsWith('_words') && wrapper.test(text)) {
          stale.push({
            registryKey: key,
            originalText: original,
            paragraphIndex: slot!.paragraphIndex!,
          })
        }
        continue
      }
      const para = input.transformed.find(
        (p) => p.index === slot!.paragraphIndex,
      )
      if (!para) continue
      const text = canonicalizeParagraphText(para.text)
      if (countStandalonePhrase(text, original) > 0) {
        stale.push({
          registryKey: key,
          originalText: original,
          paragraphIndex: slot!.paragraphIndex!,
        })
      }
    }
  }
  return stale
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Count phrase occurrences that are not a proper prefix of a longer amount-words phrase. */
export function countStandalonePhrase(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let from = 0
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from)
    if (idx < 0) break
    const before = idx === 0 ? '' : haystack[idx - 1]!
    const afterIdx = idx + needle.length
    const after = afterIdx >= haystack.length ? '' : haystack[afterIdx]!
    const boundaryBefore = idx === 0 || !/\p{L}/u.test(before)
    // Reject if followed by more letters/spaces that continue the words
    // e.g. “osiem tysięcy złotych” inside “osiem tysięcy pięćset złotych”
    // — after “złotych” ends the phrase; if next is letter without ending, skip.
    // For “osiem tysięcy złotych” vs “osiem tysięcy pięćset złotych”: needle
    // is NOT a substring of the longer phrase as contiguous text — “złotych”
    // appears only at the end. “osiem tysięcy ” WOULD be a prefix.
    // Contiguous: longer = “osiem tysięcy pięćset złotych” does NOT contain
    // “osiem tysięcy złotych” as substring. Good — indexOf won't find it.
    // For “tysiąc złotych” inside “jeden tysiąc złotych”: found; after is end
    // or non-letter → counts. Caller should use suffix exemption.
    const boundaryAfter =
      afterIdx >= haystack.length || !/\p{L}/u.test(after)
    if (boundaryBefore && boundaryAfter) count += 1
    from = idx + Math.max(1, needle.length)
  }
  return count
}

/** True when money-pair incompleteness should block template readiness. */
export function moneyPairsBlockReadiness(reports: MoneyPairReport[]): string[] {
  const keys: string[] = []
  for (const r of reports) {
    if (r.staleSourceRisk || r.missingSide === 'words' || r.missingSide === 'both') {
      if (r.numericDetected && r.wordsDetected) {
        if (!r.wordsBound) keys.push(r.wordsKey)
        if (!r.numericBound) keys.push(r.numericKey)
      }
    }
  }
  return [...new Set(keys)]
}
