/**
 * Money context classification — inventory all PLN spans, score concepts,
 * assign uniquely. Arithmetic may support but never invent roles.
 */

import { canonicalizeParagraphText } from './canonicalParagraph'
import type { IndexedParagraph } from './extractDocxParagraphs'
import { validateMinimalSlotSpan } from './contractSlotSafety'
import { devInfoArgs } from '@/lib/debug/devConsole'

export type MoneyPairRole = 'contract_value' | 'agreed_deposit' | 'remaining_after_deposit'

export type MoneyRoleConcept =
  | MoneyPairRole
  | 'overtime'
  | 'travel'
  | 'excluded_penalty'
  | 'unknown'
  | 'ambiguous'

export interface MoneyCandidateInventoryItem {
  sourceText: string
  normalizedAmount: number
  currency: 'PLN'
  paragraphIndex: number
  startOffset: number
  endOffset: number
  paragraphText: string
  localSentence: string
  previousParagraph: string
  nextParagraph: string
  nearbySemanticAnchors: string[]
  sectionType: 'payment' | 'overtime' | 'penalty' | 'other'
  scoreByConcept: Record<string, number>
  selectedConcept: MoneyRoleConcept | null
  exclusionReason: string | null
  confidence: number
  physicalSpanSafety: 'safe' | 'unsafe' | 'needs_review'
  reviewState: 'ok' | 'needs_review' | 'excluded'
  registryKey: string | null
}

export const MONEY_AMOUNT_RE =
  /(\d{1,3}(?:[\s\u00a0]\d{3})+|\d+)(?:[.,]\d{2})?\s*(?:zł|zl|PLN)(?=[\s.,;)]|$)/gi

const POSITIVE: Record<
  'contract_value' | 'agreed_deposit' | 'remaining_after_deposit' | 'overtime',
  RegExp[]
> = {
  contract_value: [
    /łączn[ea]\s+wynagrodzen/i,
    /całkowit[ea]\s+wynagrodzen/i,
    /wynagrodzen\w*\s+za\s+wykonanie\s+przedmiot/i,
    /strony\s+ustalaj[aą]\s+wynagrodzen/i,
    /wynagrodzen\w*\s+wynosi/i,
    /wartość\s+umowy/i,
    /cena\s+pakietu/i,
    /cena\s+usługi/i,
    /kwota\s+wynagrodzen/i,
    /za\s+wykonanie\s+całości\s+przedmiotu/i,
    /wynagrodzen\w*\s+za\s+wykonanie\s+przedmiot/i,
    /ustalon\w+\s+przez\s+strony\s+wynagrodzen/i,
    /łącznej\s+wysokości/i,
    /wynagrodzen\w*.{0,80}wynosi/i,
    /wynagrodzen\w*\s+w\s+wysokości/i,
    /zapłaci\w*\s+wynagrodzen/i,
  ],
  agreed_deposit: [
    /pierwsz[aą]\s+rat[aą]/i,
    /\bI\s+rat[aą]/i,
    /rat[aą]\s+w\s+wysokości/i,
    /płatn[aą]\s+przy\s+podpisaniu/i,
    /płatn[aą]\s+w\s+dniu\s+zawarcia/i,
    /płatn[aą]\s+po\s+podpisaniu/i,
    /kwota\s+rezerwacyjn/i,
    /zadatku\s+w\s+wysokości/i,
    /wpłaty\s+zadatku/i,
    /\bzadatek\b/i,
    /\bzaliczk/i,
  ],
  remaining_after_deposit: [
    /pozostał[aą]\s+część\s+wynagrodzen/i,
    /pozostał[aą]\s+kwot/i,
    /pozostał[aą]\s+do\s+zapłat/i,
    /końcow[aą]\s+rat[aą]/i,
    /ostatni[aą]\s+rat[aą]/i,
    /drug[aą]\s+rat[aą]/i,
    /trzeci[aą]\s+rat[aą]/i,
    /płatn[aą]\s+najpóźniej/i,
    /płatn[aą]\s+w\s+dniu\s+ślubu/i,
    /płatn[aą]\s+przed\s+ślubem/i,
    /\bdopłat/i,
    /pomniejszon\w*\s+o\s+zadatek/i,
    /tj\.\s*kwot/i,
  ],
  overtime: [
    /każd[aą]\s+dodatkow[aą]\s+(?:rozpoczęt[aą]\s+)?godzin/i,
    /dodatkow[aą]\s+(?:rozpoczęt[aą]\s+)?godzin/i,
    /za\s+każd[aą]\s+rozpoczęt[aą]\s+godzin/i,
    /\bnadgodzin/i,
    /przedłużenie\s+czasu\s+pracy/i,
    /przekroczenie\s+ustalonego\s+czasu/i,
    /stawka\s+za\s+dodatkow[aą]\s+godzin/i,
    /dłuższy\s+czas\s+pracy\s+jest\s+płatny/i,
    /zostanie\s+doliczona\s+kwota/i,
  ],
}

const NEGATIVE: Record<
  'contract_value' | 'agreed_deposit' | 'remaining_after_deposit' | 'overtime',
  RegExp[]
> = {
  contract_value: [
    /dodatkow[aą]\s+(?:rozpoczęt[aą]\s+)?godzin/i,
    /\bnadgodzin/i,
    /za\s+godzin/i,
    /stawka\s+godzinowa/i,
    /kara\s+umowna/i,
    /odstąpienie/i,
    /rezygnacj/i,
    /odszkodowan/i,
    /50\s*%/,
    /\brata\b/i,
    /pierwsz[aą]\s+rat/i,
    /drug[aą]\s+rat/i,
    /trzeci[aą]\s+rat/i,
    /\bzadatek\b/i,
    /\bzaliczk/i,
    /pozostał[aą]\s+kwot/i,
  ],
  agreed_deposit: [
    /łączn[ea]\s+wynagrodzen/i,
    /całkowit[ea]\s+wynagrodzen/i,
    /dodatkow[aą]\s+(?:rozpoczęt[aą]\s+)?godzin/i,
    /kara\s+umowna/i,
    /pozostał[aą]/i,
    /końcow[aą]\s+rat/i,
    /trzeci[aą]\s+rat/i,
  ],
  remaining_after_deposit: [
    /łączn[ea]\s+wynagrodzen/i,
    /dodatkow[aą]\s+(?:rozpoczęt[aą]\s+)?godzin/i,
    /kara\s+umowna/i,
    /pierwsz[aą]\s+rat/i,
    /\bzadatek\b/i,
  ],
  overtime: [
    /łączn[ea]\s+wynagrodzen/i,
    /całkowit[ea]\s+wynagrodzen/i,
    /\brata\b/i,
    /\bzadatek\b/i,
    /pozostał[aą]\s+część/i,
    /kara\s+umowna/i,
  ],
}

const PENALTY_RE = [
  /kara\s+umowna/i,
  /odstąpienie/i,
  /rezygnacj/i,
  /niewykonanie\s+umowy/i,
  /rozwiązanie\s+umowy/i,
  /odszkodowan/i,
  /równowartość/i,
  /50\s*%\s*(?:ustalonego\s+)?wynagrodzen/i,
  /połowa\s+wynagrodzen/i,
]

const PAYMENT_SECTION_OPEN = [
  /^§?\s*\d*\.?\s*Wynagrodzenie/i,
  /Warunki\s+płatności/i,
  /\bPłatności\b/i,
  /Strony\s+ustalaj[aą]\s+wynagrodzen/i,
  /Zapłata\s+nastąpi/i,
  /Wynagrodzenie\s+Zleceniobiorcy/i,
  /Wynagrodzenie\s+płatne\s+jest/i,
  /Ustalone\s+przez\s+strony\s+Wynagrodzen/i,
]

function normalizeAmount(sourceText: string): number {
  const digits = sourceText
    .replace(/\s*(?:zł|zl|PLN)\s*$/i, '')
    .replace(/[\s\u00a0]/g, '')
    .replace(',', '.')
  const n = Number.parseFloat(digits)
  return Number.isFinite(n) ? n : NaN
}

function matchAnchors(text: string, patterns: RegExp[]): string[] {
  const hits: string[] = []
  for (const re of patterns) {
    if (re.test(text)) hits.push(re.source.slice(0, 40))
  }
  return hits
}

function localWindow(
  text: string,
  start: number,
  end: number,
  before = 160,
  after = 80,
): string {
  return text.slice(Math.max(0, start - before), Math.min(text.length, end + after))
}

function detectSectionType(
  paragraphText: string,
  header: string,
): MoneyCandidateInventoryItem['sectionType'] {
  const blob = `${header}\n${paragraphText}`
  if (PENALTY_RE.some((re) => re.test(paragraphText))) return 'penalty'
  if (POSITIVE.overtime.some((re) => re.test(paragraphText))) return 'overtime'
  if (
    PAYMENT_SECTION_OPEN.some((re) => re.test(paragraphText) || re.test(header)) ||
    /rat[aą]|wynagrodzen|zadatek|zaliczk/i.test(blob)
  ) {
    return 'payment'
  }
  return 'other'
}

function scoreCandidate(
  ctx: string,
  sectionType: MoneyCandidateInventoryItem['sectionType'],
): {
  scores: Record<string, number>
  positive: string[]
  negative: string[]
  penalty: boolean
} {
  const scores: Record<string, number> = {
    contract_value: 0,
    agreed_deposit: 0,
    remaining_after_deposit: 0,
    overtime: 0,
  }
  const positive: string[] = []
  const negative: string[] = []

  // Penalty only from the local clause — never from a later paragraph.
  const penalty = PENALTY_RE.some((re) => re.test(ctx))
  if (penalty) {
    for (const k of Object.keys(scores)) scores[k] = -100
    return { scores, positive, negative: ['penalty_context'], penalty: true }
  }

  for (const concept of Object.keys(POSITIVE) as Array<keyof typeof POSITIVE>) {
    const pos = matchAnchors(ctx, POSITIVE[concept])
    const neg = matchAnchors(ctx, NEGATIVE[concept])
    scores[concept] = pos.length * 3 - neg.length * 4
    positive.push(...pos.map((p) => `${concept}:${p}`))
    negative.push(...neg.map((n) => `${concept}:${n}`))
  }

  if (sectionType === 'payment') {
    scores.contract_value += 1
    scores.agreed_deposit += 1
    scores.remaining_after_deposit += 1
  }
  if (sectionType === 'overtime') {
    scores.overtime += 4
    scores.contract_value -= 5
  }
  if (sectionType === 'penalty') {
    for (const k of Object.keys(scores)) scores[k]! -= 50
  }

  // Label-priority boosts
  if (/pierwsz[aą]\s+rat/i.test(ctx) || /\bzadatek\b/i.test(ctx)) {
    scores.agreed_deposit += 5
    scores.contract_value -= 3
    scores.remaining_after_deposit -= 2
  }
  if (
    /trzeci[aą]\s+rat|ostatni[aą]\s+rat|końcow[aą]\s+rat|pozostał[aą]/i.test(
      ctx,
    )
  ) {
    scores.remaining_after_deposit += 5
    scores.contract_value -= 3
    scores.agreed_deposit -= 2
  }
  if (/dodatkow[aą].{0,40}godzin|doliczona\s+kwota/i.test(ctx)) {
    scores.overtime += 6
    scores.contract_value -= 8
  }

  return { scores, positive, negative, penalty }
}

function pickBest(
  scores: Record<string, number>,
): { concept: MoneyRoleConcept; score: number; second: number } {
  const entries = Object.entries(scores).sort((a, b) => b[1]! - a[1]!)
  const best = entries[0]
  const second = entries[1]?.[1] ?? -Infinity
  if (!best || best[1]! < 2) {
    return { concept: 'unknown', score: best?.[1] ?? 0, second }
  }
  if (best[1]! - second < 2 && second >= 2) {
    return { concept: 'ambiguous', score: best[1]!, second }
  }
  return {
    concept: best[0] as MoneyRoleConcept,
    score: best[1]!,
    second,
  }
}

function conceptToRegistryKey(concept: MoneyRoleConcept): string | null {
  switch (concept) {
    case 'contract_value':
      return 'contract_value_formatted'
    case 'agreed_deposit':
      return 'agreed_deposit_formatted'
    case 'remaining_after_deposit':
      return 'remaining_after_deposit_formatted'
    case 'overtime':
      return 'overtime_rate'
    case 'travel':
      return 'travel_fee'
    default:
      return null
  }
}

/**
 * Inventory + classify all money spans across paragraphs (global uniqueness).
 */
export function inventoryAndClassifyMoney(
  paragraphs: IndexedParagraph[],
): MoneyCandidateInventoryItem[] {
  const normalized = paragraphs.map((p) => ({
    index: p.index,
    text: canonicalizeParagraphText(p.text),
  }))

  const raw: MoneyCandidateInventoryItem[] = []

  for (let i = 0; i < normalized.length; i++) {
    const para = normalized[i]!
    if (!para.text.trim()) continue
    const prev = normalized[i - 1]?.text ?? ''
    const next = normalized[i + 1]?.text ?? ''
    const re = new RegExp(MONEY_AMOUNT_RE.source, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(para.text)) !== null) {
      // Skip IBAN-like digit runs that look like money only if not near zł —
      // regex already requires zł/PLN.
      const sourceText = m[0]!.replace(/\u00a0/g, ' ')
      const start = m.index
      const end = start + m[0]!.length
      const amount = normalizeAmount(sourceText)
      // Bank account lines often have "1000" as IBAN segment — skip if no zł nearby
      // (already required). Extra: skip amounts that are part of long digit account strings
      if (
        /ING|Bank|rachunek|konta/i.test(para.text) &&
        !/zł|PLN/i.test(localWindow(para.text, start, end, 8, 4))
      ) {
        continue
      }

      const ctx = localWindow(para.text, start, end)
      // Only a short money-free header from the previous paragraph (e.g. “Wynagrodzenie płatne…”).
      const header =
        prev.length > 0 &&
        prev.length < 140 &&
        !new RegExp(MONEY_AMOUNT_RE.source, 'i').test(prev)
          ? prev
          : ''
      const scoreCtx = header ? `${header}\n${ctx}` : ctx
      const sectionType = detectSectionType(para.text, header)
      const scored = scoreCandidate(scoreCtx, sectionType)
      const best = pickBest(scored.scores)

      const spanCheck = validateMinimalSlotSpan({
        registryKey: 'contract_value_formatted',
        text: sourceText,
        paragraphText: para.text,
        operation: 'replace',
      })

      let selected: MoneyRoleConcept | null = best.concept
      let exclusionReason: string | null = null
      let reviewState: MoneyCandidateInventoryItem['reviewState'] = 'ok'
      let confidence = Math.min(0.96, 0.55 + best.score * 0.05)

      if (scored.penalty) {
        selected = 'excluded_penalty'
        exclusionReason = 'penalty_context'
        reviewState = 'excluded'
        confidence = 0.9
      } else if (best.concept === 'ambiguous') {
        selected = 'ambiguous'
        reviewState = 'needs_review'
        confidence = 0.5
      } else if (best.concept === 'unknown') {
        selected = 'unknown'
        reviewState = 'needs_review'
        confidence = 0.4
      }

      const item: MoneyCandidateInventoryItem = {
        sourceText,
        normalizedAmount: amount,
        currency: 'PLN',
        paragraphIndex: para.index,
        startOffset: start,
        endOffset: end,
        paragraphText: para.text,
        localSentence: ctx.trim(),
        previousParagraph: prev.slice(0, 160),
        nextParagraph: next.slice(0, 160),
        nearbySemanticAnchors: [...scored.positive, ...scored.negative].slice(
          0,
          12,
        ),
        sectionType,
        scoreByConcept: scored.scores,
        selectedConcept: selected,
        exclusionReason,
        confidence,
        physicalSpanSafety: spanCheck.ok ? 'safe' : 'unsafe',
        reviewState,
        registryKey:
          selected &&
          selected !== 'ambiguous' &&
          selected !== 'unknown' &&
          selected !== 'excluded_penalty'
            ? conceptToRegistryKey(selected)
            : null,
      }
      raw.push(item)
    }
  }

  // Arithmetic support: total ≈ deposit + remaining (boost only, after semantic)
  applyArithmeticSupport(raw)

  // Global unique assignment — one winner per commercial concept
  const assigned = assignUniqueConcepts(raw)

  for (const c of assigned) {
    devInfoArgs('[contract-money-classification]', {
      sourceText: c.sourceText,
      normalizedAmount: c.normalizedAmount,
      paragraphIndex: c.paragraphIndex,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      localContext: c.localSentence.slice(0, 120),
      positiveAnchors: c.nearbySemanticAnchors.filter((a) =>
        a.includes(':'),
      ),
      negativeAnchors: c.exclusionReason ? [c.exclusionReason] : [],
      sectionType: c.sectionType,
      scoreByConcept: c.scoreByConcept,
      selectedConcept: c.selectedConcept,
      exclusionReason: c.exclusionReason,
      confidence: c.confidence,
      physicalSpanSafety: c.physicalSpanSafety,
      reviewState: c.reviewState,
      registryKey: c.registryKey,
    })
  }

  return assigned
}

function applyArithmeticSupport(items: MoneyCandidateInventoryItem[]) {
  const totals = items.filter(
    (c) =>
      (c.scoreByConcept.contract_value ?? 0) >= 2 &&
      c.selectedConcept !== 'excluded_penalty',
  )
  const deposits = items.filter(
    (c) => (c.scoreByConcept.agreed_deposit ?? 0) >= 2,
  )
  const remainings = items.filter(
    (c) => (c.scoreByConcept.remaining_after_deposit ?? 0) >= 2,
  )
  for (const t of totals) {
    for (const d of deposits) {
      for (const r of remainings) {
        if (
          Number.isFinite(t.normalizedAmount) &&
          Math.abs(
            d.normalizedAmount + r.normalizedAmount - t.normalizedAmount,
          ) < 0.02
        ) {
          t.scoreByConcept.contract_value =
            (t.scoreByConcept.contract_value ?? 0) + 2
          d.scoreByConcept.agreed_deposit =
            (d.scoreByConcept.agreed_deposit ?? 0) + 2
          r.scoreByConcept.remaining_after_deposit =
            (r.scoreByConcept.remaining_after_deposit ?? 0) + 2
          // Re-pick after boost
          for (const c of [t, d, r]) {
            if (c.selectedConcept === 'excluded_penalty') continue
            const best = pickBest(c.scoreByConcept)
            if (best.concept !== 'ambiguous' && best.concept !== 'unknown') {
              c.selectedConcept = best.concept
              c.registryKey = conceptToRegistryKey(best.concept)
              c.confidence = Math.min(0.96, 0.55 + best.score * 0.05)
              c.reviewState = 'ok'
            }
          }
        }
      }
    }
  }
}

function assignUniqueConcepts(
  items: MoneyCandidateInventoryItem[],
): MoneyCandidateInventoryItem[] {
  const commercial: Array<MoneyPairRole | 'overtime' | 'travel'> = [
    'contract_value',
    'overtime',
    'agreed_deposit',
    'remaining_after_deposit',
    'travel',
  ]

  type Edge = {
    concept: MoneyPairRole | 'overtime' | 'travel'
    item: MoneyCandidateInventoryItem
    score: number
  }
  const edges: Edge[] = []
  for (const item of items) {
    if (item.selectedConcept === 'excluded_penalty') continue
    if (item.physicalSpanSafety !== 'safe') continue
    for (const concept of commercial) {
      const score = item.scoreByConcept[concept] ?? 0
      if (score < 2) continue
      edges.push({ concept, item, score })
    }
  }
  edges.sort((a, b) => b.score - a.score)

  const usedConcepts = new Set<string>()
  const usedSpans = new Set<string>()
  const spanWinner = new Map<string, (typeof commercial)[number]>()

  for (const e of edges) {
    const spanId = `${e.item.paragraphIndex}:${e.item.startOffset}`
    if (usedConcepts.has(e.concept) || usedSpans.has(spanId)) continue
    usedConcepts.add(e.concept)
    usedSpans.add(spanId)
    spanWinner.set(spanId, e.concept)
  }

  return items.map((c) => {
    if (c.selectedConcept === 'excluded_penalty') return c
    const spanId = `${c.paragraphIndex}:${c.startOffset}`
    const won = spanWinner.get(spanId)
    if (won) {
      return {
        ...c,
        selectedConcept: won,
        registryKey: conceptToRegistryKey(won),
        reviewState: 'ok' as const,
        confidence: Math.max(c.confidence, 0.9),
        exclusionReason: null,
      }
    }
    if (
      c.selectedConcept &&
      commercial.includes(c.selectedConcept as (typeof commercial)[number])
    ) {
      return {
        ...c,
        selectedConcept: 'unknown' as const,
        registryKey: null,
        reviewState: 'needs_review' as const,
        exclusionReason: c.exclusionReason ?? 'superseded_by_better_candidate',
        confidence: 0.35,
      }
    }
    return c
  })
}

/**
 * Single-paragraph classifier for money-pair helpers (backward compatible API).
 */
export function classifyMoneyConceptScored(
  text: string,
  amountStart: number,
  amountEnd: number,
): MoneyRoleConcept {
  const ctx = localWindow(text, amountStart, amountEnd)
  const sectionType = detectSectionType(text, '')
  const scored = scoreCandidate(ctx, sectionType)
  if (scored.penalty) return 'excluded_penalty'
  const best = pickBest(scored.scores)
  if (best.concept === 'ambiguous') return 'unknown'
  return best.concept
}
