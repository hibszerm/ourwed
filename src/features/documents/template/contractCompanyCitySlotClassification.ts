/**
 * Company city physical-slot classification.
 *
 * Does NOT introduce execution_city / signing_city business fields.
 * Opening-clause city spans map to company_city_locative (Company Settings).
 * Provider seat / client / venue cities are never bound as that dynamic slot.
 */

import { canonicalizeParagraphText } from './canonicalParagraph'
import type { IndexedParagraph } from './extractDocxParagraphs'

export type CompanyCityRole =
  | 'opening_clause_city'
  | 'provider_seat'
  | 'client_address'
  | 'venue'
  | 'unknown'

export interface CompanyCityCandidate {
  sourceText: string
  paragraphIndex: number
  startOffset: number
  endOffset: number
  paragraphText: string
  localContext: string
  detectedRole: CompanyCityRole
  confidence: number
  leftAnchor: string
  rightAnchor: string
  reviewState: 'ok' | 'needs_review' | 'excluded'
  rejectionReason: string | null
}

const CITY_TOKEN =
  '[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]*(?:-[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]*)*'

const OPENING_PATTERNS: Array<{ re: RegExp; confidence: number }> = [
  {
    // …17.06.2026 r. w Jaworznie pomiędzy / zwana / ,
    re: new RegExp(
      String.raw`\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*r\.?\s+w\s+(${CITY_TOKEN})(?=\s*[,.]|\s+zwana|\s+pomiędzy|\s+między|$)`,
      'u',
    ),
    confidence: 0.97,
  },
  {
    // Zawarta dnia 17.06.2026 w Jaworznie
    re: new RegExp(
      String.raw`zawart[ay]\s+dnia\s+\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*r?\.?\s+w\s+(${CITY_TOKEN})(?=\s*[,.]|\s+zwana|\s+pomiędzy|$)`,
      'iu',
    ),
    confidence: 0.96,
  },
  {
    // Umowa zawarta w Jaworznie dnia …
    re: new RegExp(
      String.raw`zawart[ay]\s+w\s+(?!dniu\b|dnia\b)(${CITY_TOKEN})(?=\s*[,.]|\s+dnia|\s+zwana|\s+pomiędzy|$)`,
      'iu',
    ),
    confidence: 0.95,
  },
  {
    re: new RegExp(
      String.raw`(?:umow[eę]\s+)?zawarto\s+w\s+(${CITY_TOKEN})(?=\s*[,.]|\s+dnia|\s+zwana|\s+pomiędzy|$)`,
      'iu',
    ),
    confidence: 0.94,
  },
  {
    re: new RegExp(
      String.raw`sporządzon[ay]\s+w\s+(${CITY_TOKEN})(?=\s*[,.]|\s+zwana|\s+pomiędzy|$)`,
      'iu',
    ),
    confidence: 0.93,
  },
  {
    re: new RegExp(
      String.raw`podpisan[ay]\s+w\s+(${CITY_TOKEN})(?=\s*[,.]|\s+zwana|\s+pomiędzy|$)`,
      'iu',
    ),
    confidence: 0.92,
  },
]

function roleForContext(
  paragraphText: string,
  start: number,
  end: number,
  tentative: CompanyCityRole,
): CompanyCityRole {
  const before = paragraphText.slice(Math.max(0, start - 48), start)
  const local = paragraphText.slice(
    Math.max(0, start - 80),
    Math.min(paragraphText.length, end + 40),
  )

  if (/z\s+siedzib/i.test(before) || /siedzib[aą]\s+w\s*$/i.test(before)) {
    return 'provider_seat'
  }
  if (
    /zamieszkał[ay]|adres|PESEL/i.test(before) ||
    /zamieszkał[ay]/i.test(local)
  ) {
    return 'client_address'
  }
  if (
    /przygotowa|ceremon|przyj[eę]ci|ZINNAR|CASTLE|sala\s+weseln|dom\s+weseln/i.test(
      local,
    )
  ) {
    return 'venue'
  }
  if (tentative === 'opening_clause_city') return 'opening_clause_city'
  if (/zawart|sporządzon|podpisan|zawarto/i.test(local)) {
    return 'opening_clause_city'
  }
  return tentative
}

function pushUnique(out: CompanyCityCandidate[], item: CompanyCityCandidate) {
  if (
    out.some(
      (c) =>
        c.paragraphIndex === item.paragraphIndex &&
        c.startOffset === item.startOffset &&
        c.endOffset === item.endOffset,
    )
  ) {
    return
  }
  out.push(item)
}

/**
 * Inventory city-like spans and classify role before binding.
 */
export function inventoryCompanyCityCandidates(
  paragraphs: IndexedParagraph[],
): CompanyCityCandidate[] {
  const out: CompanyCityCandidate[] = []
  const normalized = paragraphs.map((p) => ({
    index: p.index,
    text: canonicalizeParagraphText(p.text),
  }))

  for (const para of normalized) {
    if (!para.text.trim()) continue

    for (const pattern of OPENING_PATTERNS) {
      const m = pattern.re.exec(para.text)
      if (!m || m.index == null) continue
      const span = m[1]!
      const start = para.text.indexOf(span, m.index)
      if (start < 0) continue
      const end = start + span.length
      const role = roleForContext(para.text, start, end, 'opening_clause_city')
      const localContext = para.text.slice(
        Math.max(0, start - 60),
        Math.min(para.text.length, end + 40),
      )
      const ok = role === 'opening_clause_city'
      pushUnique(out, {
        sourceText: span,
        paragraphIndex: para.index,
        startOffset: start,
        endOffset: end,
        paragraphText: para.text,
        localContext,
        detectedRole: role,
        confidence: ok ? pattern.confidence : 0.4,
        leftAnchor: para.text.slice(Math.max(0, start - 12), start),
        rightAnchor: para.text.slice(end, end + 16),
        reviewState: ok ? 'ok' : 'excluded',
        rejectionReason: ok ? null : `role_${role}`,
      })
    }

    const seat =
      /z\s+siedzib[aą]\s+w\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ\-]*(?:-[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]*)*)/u.exec(
        para.text,
      )
    if (seat && seat.index != null) {
      const span = seat[1]!
      const start = para.text.indexOf(span, seat.index)
      if (start >= 0) {
        const end = start + span.length
        pushUnique(out, {
          sourceText: span,
          paragraphIndex: para.index,
          startOffset: start,
          endOffset: end,
          paragraphText: para.text,
          localContext: para.text.slice(
            Math.max(0, start - 40),
            Math.min(para.text.length, end + 30),
          ),
          detectedRole: 'provider_seat',
          confidence: 0.9,
          leftAnchor: para.text.slice(Math.max(0, start - 12), start),
          rightAnchor: para.text.slice(end, end + 16),
          reviewState: 'excluded',
          rejectionReason: 'provider_seat_immutable',
        })
      }
    }

    const client =
      /zamieszkał[ay]\s+(?:w\s+)?([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ\-]*)/u.exec(
        para.text,
      )
    if (client && client.index != null) {
      const span = client[1]!
      const start = para.text.indexOf(span, client.index)
      if (start >= 0) {
        const end = start + span.length
        pushUnique(out, {
          sourceText: span,
          paragraphIndex: para.index,
          startOffset: start,
          endOffset: end,
          paragraphText: para.text,
          localContext: para.text.slice(
            Math.max(0, start - 40),
            Math.min(para.text.length, end + 30),
          ),
          detectedRole: 'client_address',
          confidence: 0.85,
          leftAnchor: para.text.slice(Math.max(0, start - 12), start),
          rightAnchor: para.text.slice(end, end + 16),
          reviewState: 'excluded',
          rejectionReason: 'client_address',
        })
      }
    }
  }

  const openings = out
    .filter(
      (c) => c.detectedRole === 'opening_clause_city' && c.reviewState === 'ok',
    )
    .sort((a, b) => b.confidence - a.confidence)
  if (openings.length > 1) {
    const winner = openings[0]!
    for (const c of out) {
      if (
        c.detectedRole === 'opening_clause_city' &&
        c !== winner &&
        `${c.paragraphIndex}:${c.startOffset}` !==
          `${winner.paragraphIndex}:${winner.startOffset}`
      ) {
        c.reviewState = 'needs_review'
        c.rejectionReason = 'competing_opening_cities'
        c.confidence = 0.45
      }
    }
  }

  for (const c of out) {
    console.info('[contract-company-city-slot]', {
      sourceText: c.sourceText,
      paragraphIndex: c.paragraphIndex,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      localContext: c.localContext.slice(0, 120),
      detectedRole: c.detectedRole,
      confidence: c.confidence,
      reviewState: c.reviewState,
      rejectionReason: c.rejectionReason,
    })
  }

  return out
}

/** Opening-clause city selected for company_city_locative physical slot. */
export function selectOpeningClauseCitySlot(
  paragraphs: IndexedParagraph[],
): CompanyCityCandidate | null {
  const all = inventoryCompanyCityCandidates(paragraphs)
  return (
    all.find(
      (c) => c.detectedRole === 'opening_clause_city' && c.reviewState === 'ok',
    ) ?? null
  )
}
