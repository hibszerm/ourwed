/**
 * Two-pass contract candidate detection.
 * Pass 1 — structural spans (names, dates, money, IDs, addresses, phones…).
 * Pass 2 — legal-context classification → registry keys + confidence.
 *
 * Never invents registry fields without a concrete source span.
 */

import {
  paragraphFingerprint,
  type IndexedParagraph,
} from './extractDocxParagraphs'
import { canonicalizeParagraphText } from './canonicalParagraph'
import {
  conceptToNumericKey,
  findSlownieWordsAfter,
} from './contractMoneyPairs'
import {
  inventoryAndClassifyMoney,
} from './contractMoneyClassification'
import {
  inventoryAndClassifyVenueTime,
} from './contractVenueTimeClassification'
import {
  segmentCompanyPartyClause,
} from './segmentCompanyClause'
import {
  validateMinimalSlotSpan,
} from './contractSlotSafety'
import { detectClientPartyLabelForms } from './clientPartyLabelDetection'
import type {
  ContractSlotOperation,
  TemplateSlot,
  TemplateSlotSourceHint,
} from './types'

export type CandidateEvidenceType =
  | 'explicit_label'
  | 'legal_context'
  | 'format_pattern'
  | 'blank_between_anchors'
  | 'existing_value'
  | 'composite_context'

export interface ContractCandidate {
  paragraphIndex: number
  paragraphText: string
  startOffset: number
  endOffset: number
  text: string
  proposedKey: string
  confidence: number
  evidenceType: CandidateEvidenceType
  evidenceText: string
  operation: ContractSlotOperation
  componentKeys?: string[]
  separator?: string
  sourceHint: TemplateSlotSourceHint
  leftAnchor?: string
  rightAnchor?: string
  /** Decision after thresholding. */
  decision: 'accepted' | 'needs_confirmation' | 'rejected'
  reason: string
  /**
   * Provider party detections default to template_constant (immutable).
   * Client / wedding / money stay dynamic_candidate.
   */
  variableClassification?:
    | 'template_constant'
    | 'dynamic_candidate'
    | 'ignored_non_variable'
}

const NAME_TOKEN =
  "[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżąćęłńóśźżĄĆĘŁŃÓŚŹŻ'\\-]{1,30}"
const FULL_NAME = `${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){1,3}`
const COUPLE_JOIN = `(?:\\s+(?:i|oraz)\\s+)`

const COUPLE_RIGHT_ANCHORS = [
  ', zwaną dalej „Parą Młodą”',
  ', zwaną dalej "Parą Młodą"',
  ', zwanymi dalej „Parą Młodą”',
  ', zwanymi dalej "Parą Młodą"',
  ', zwaną dalej „Parą Młodą”,',
  ' zwaną dalej „Parą Młodą”',
  ' zwanymi dalej „Parą Młodą”',
]

const COMPANY_RIGHT_ANCHORS = [
  'zwanym dalej „Filmowcem”',
  'zwanego dalej „Filmowcem”',
  'zwaną dalej „Filmowcem”',
  'zwanym dalej "Filmowcem"',
  'zwanego dalej "Filmowcem"',
  'zwany dalej „Filmowcem”',
  'zwaną dalej „Kamerzystami”',
  'zwaną dalej „Kamerzystami”',
  'zwana dalej „Kamerzystami”',
  'zwanym dalej „Kamerzystą”',
  'zwanego dalej „Kamerzystą”',
  'zwany dalej „Kamerzystą”',
  'zwanym dalej „Wykonawcą”',
  'zwanego dalej „Wykonawcą”',
  'zwanym dalej „Usługodawcą”',
  'zwanego dalej „Usługodawcą”',
]

function logCandidate(c: ContractCandidate) {
  console.info('[contract-candidate-detection]', {
    paragraphIndex: c.paragraphIndex,
    text: c.paragraphText.slice(0, 120),
    candidateSpan: c.text,
    proposedKey: c.proposedKey,
    confidence: c.confidence,
    evidence: { type: c.evidenceType, text: c.evidenceText },
    acceptedOrRejected: c.decision,
    reason: c.reason,
  })
}

function decide(confidence: number): ContractCandidate['decision'] {
  if (confidence >= 0.85) return 'accepted'
  if (confidence >= 0.6) return 'needs_confirmation'
  return 'rejected'
}

function findFirstAnchor(
  haystack: string,
  anchors: string[],
): { anchor: string; start: number } | null {
  const h = canonicalizeParagraphText(haystack)
  let best: { anchor: string; start: number } | null = null
  for (const a of anchors) {
    const idx = h.indexOf(canonicalizeParagraphText(a))
    if (idx < 0) continue
    if (!best || idx < best.start) best = { anchor: a, start: idx }
  }
  return best
}

function overlaps(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function pushCandidate(
  out: ContractCandidate[],
  claimed: Map<number, Array<{ start: number; end: number }>>,
  raw: Omit<ContractCandidate, 'decision' | 'reason'> & {
    reason: string
  },
) {
  const withClass: typeof raw = {
    ...raw,
    variableClassification:
      raw.variableClassification ??
      (raw.sourceHint === 'company'
        ? 'template_constant'
        : 'dynamic_candidate'),
  }
  const decision = decide(withClass.confidence)
  const c: ContractCandidate = {
    ...withClass,
    decision,
    reason:
      decision === 'rejected'
        ? `${withClass.reason} (confidence ${withClass.confidence.toFixed(2)} < 0.60)`
        : withClass.reason,
  }

  if (decision === 'rejected') {
    logCandidate(c)
    return
  }

  const range = { start: c.startOffset, end: c.endOffset }
  const existing = claimed.get(c.paragraphIndex) ?? []
  if (existing.some((r) => overlaps(r, range))) {
    c.decision = 'rejected'
    c.reason = `Overlaps another candidate in paragraph ${c.paragraphIndex}`
    logCandidate(c)
    return
  }

  // Prefer higher confidence for same key
  const sameKey = out.findIndex(
    (x) =>
      x.proposedKey === c.proposedKey &&
      (x.decision === 'accepted' || x.decision === 'needs_confirmation'),
  )
  if (sameKey >= 0) {
    const prev = out[sameKey]!
    if (prev.confidence >= c.confidence) {
      c.decision = 'rejected'
      c.reason = `Duplicate of higher-confidence ${c.proposedKey}`
      logCandidate(c)
      return
    }
    prev.decision = 'rejected'
    prev.reason = `Superseded by higher-confidence span "${c.text}"`
    logCandidate(prev)
  }

  existing.push(range)
  claimed.set(c.paragraphIndex, existing)
  out.push(c)
  logCandidate(c)
}

/** Pass 1+2: couple / party identity */
function detectCoupleParty(
  para: IndexedParagraph,
  out: ContractCandidate[],
  claimed: Map<number, Array<{ start: number; end: number }>>,
) {
  const text = canonicalizeParagraphText(para.text)
  const right = findFirstAnchor(text, COUPLE_RIGHT_ANCHORS)
  if (!right) return

  const before = text.slice(0, right.start).trimEnd()
  // Prefer "Name i Name" composite
  const coupleRe = new RegExp(
    `(${FULL_NAME})${COUPLE_JOIN}(${FULL_NAME})\\s*$`,
    'u',
  )
  const couple = coupleRe.exec(before)
  if (couple) {
    const full = `${couple[1]} i ${couple[2]}`
    const start = before.lastIndexOf(couple[1]!)
    if (start < 0) return
    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: start + full.length,
      text: full,
      proposedKey: 'couple_full_names',
      confidence: 0.95,
      evidenceType: 'composite_context',
      evidenceText: right.anchor,
      operation: 'composite',
      componentKeys: ['partner1_full_name', 'partner2_full_name'],
      separator: ' i ',
      sourceHint: 'couple',
      leftAnchor: '',
      rightAnchor: right.anchor,
      reason: 'Two personal names before „zwaną/zwanymi dalej Parą Młodą”',
    })
    return
  }

  // Single name before address/contact: "Aleksandrą Biłas, zam. …"
  const singleCut = before.split(/,\s*(?:zam\.?|zamieszkał|ul\.|tel\.|adres)/i)[0]?.trim()
  const singleRe = new RegExp(`^(${FULL_NAME})$`, 'u')
  const single = singleCut ? singleRe.exec(singleCut) : null
  if (single) {
    const name = single[1]!
    const start = before.indexOf(name)
    if (start < 0) return
    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: start + name.length,
      text: name,
      proposedKey: 'partner1_full_name',
      confidence: 0.9,
      evidenceType: 'legal_context',
      evidenceText: right.anchor,
      operation: 'replace',
      sourceHint: 'couple',
      leftAnchor: '',
      rightAnchor: before.slice(start + name.length, right.start) + right.anchor,
      reason:
        'Personal name before „Parą Młodą” role (single-party / first partner)',
    })
  } else {
    // Fallback: take leading name tokens
    const lead = new RegExp(`^(${FULL_NAME})`, 'u').exec(before)
    if (lead) {
      const name = lead[1]!
      pushCandidate(out, claimed, {
        paragraphIndex: para.index,
        paragraphText: text,
        startOffset: 0,
        endOffset: name.length,
        text: name,
        proposedKey: 'partner1_full_name',
        confidence: 0.8,
        evidenceType: 'legal_context',
        evidenceText: right.anchor,
        operation: 'replace',
        sourceHint: 'couple',
        reason: 'Leading name tokens before Para Młoda role phrase',
      })
    }
  }

  // Address after zam.
  const addr = /zam\.?\s*((?:ul\.|al\.|aleja|plac|os\.)[^,;]{5,80})/i.exec(text)
  if (addr && addr.index != null) {
    const span = addr[1]!.trim()
    const start = text.indexOf(span, addr.index)
    if (start >= 0) {
      pushCandidate(out, claimed, {
        paragraphIndex: para.index,
        paragraphText: text,
        startOffset: start,
        endOffset: start + span.length,
        text: span,
        proposedKey: 'bride_address',
        confidence: 0.82,
        evidenceType: 'legal_context',
        evidenceText: 'zam. … near Para Młoda',
        operation: 'replace',
        sourceHint: 'couple',
        reason: 'Address after zam. in couple party clause',
      })
    }
  }

  // Phone in same party clause
  const phone = /tel\.?\s*([+\d][\d\s\u00a0-]{7,18}\d)/i.exec(text)
  if (phone && phone.index != null) {
    const span = phone[1]!.replace(/\u00a0/g, ' ').trim()
    const start = text.indexOf(phone[1]!, phone.index)
    if (start >= 0) {
      pushCandidate(out, claimed, {
        paragraphIndex: para.index,
        paragraphText: text,
        startOffset: start,
        endOffset: start + phone[1]!.length,
        text: span,
        proposedKey: 'bride_phone',
        confidence: 0.85,
        evidenceType: 'legal_context',
        evidenceText: 'tel. in Para Młoda clause',
        operation: 'replace',
        sourceHint: 'couple',
        reason: 'Phone number in couple party introduction',
      })
    }
  }
}

/** Company party introduction — minimal spans only (never whole-clause). */
function detectCompanyParty(
  para: IndexedParagraph,
  out: ContractCandidate[],
  claimed: Map<number, Array<{ start: number; end: number }>>,
) {
  const text = canonicalizeParagraphText(para.text)
  const right = findFirstAnchor(text, COMPANY_RIGHT_ANCHORS)
  const firmMatch =
    /(?:pod\s+)?firm[aą]\s+/iu.exec(text) ??
    /działalność(?:\s+gospodarcz[aą])?\s+pod\s+firm[aą]\s+/iu.exec(text)

  if (!firmMatch || firmMatch.index == null) return

  const segmented = segmentCompanyPartyClause(
    text,
    firmMatch.index,
    firmMatch[0].length,
  )
  const baseStart = firmMatch.index + firmMatch[0].length

  if (segmented.companyName) {
    const name = segmented.companyName.text
    const start = baseStart + segmented.companyName.startRel
    const end = baseStart + segmented.companyName.endRel
    const spanCheck = validateMinimalSlotSpan({
      registryKey: 'company_name',
      text: name,
      paragraphText: text,
      leftAnchor: firmMatch[0],
      operation: 'replace',
    })
    const confidence = spanCheck.ok ? (right ? 0.94 : 0.82) : 0.72
    console.info('[contract-slot-safety]', {
      phase: 'detect-company_name',
      sourceText: name,
      sourceLength: name.length,
      paragraphIndex: para.index,
      startOffset: start,
      endOffset: end,
      physicalSpanSafety: spanCheck.physicalSpanSafety,
      blockingReasons: spanCheck.blockingReasons,
      detectedEntityTypes: spanCheck.detectedEntityTypes,
    })
    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: end,
      text: name,
      proposedKey: 'company_name',
      confidence,
      evidenceType: 'legal_context',
      evidenceText: right?.anchor ?? firmMatch[0],
      operation: 'replace',
      sourceHint: 'company',
      leftAnchor: firmMatch[0].trim(),
      rightAnchor: right?.anchor,
      reason: spanCheck.ok
        ? 'Provider trade name (immutable template text by default)'
        : `Zakres jest zbyt szeroki — ${spanCheck.userMessage ?? spanCheck.blockingReasons[0]}`,
      variableClassification: spanCheck.ok
        ? 'template_constant'
        : 'ignored_non_variable',
    })
  }

  // First inline partner — immutable provider text by default
  if (segmented.representatives[0]) {
    const rep = segmented.representatives[0]!
    const start = baseStart + rep.startRel
    const end = baseStart + rep.endRel
    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: end,
      text: rep.text,
      proposedKey: 'company_representative',
      confidence: 0.78,
      evidenceType: 'legal_context',
      evidenceText: 'partner name in company party clause after firm name',
      operation: 'replace',
      sourceHint: 'company',
      reason:
        segmented.representatives.length > 1
          ? `Partner/representative in immutable provider clause (${segmented.representatives.length} people)`
          : 'Partner/representative in immutable provider clause',
      variableClassification: 'template_constant',
    })
  }

  if (segmented.cityLocative) {
    const city = segmented.cityLocative.text
    const start = text.indexOf(city)
    if (start >= 0) {
      pushCandidate(out, claimed, {
        paragraphIndex: para.index,
        paragraphText: text,
        startOffset: start,
        endOffset: start + city.length,
        text: city,
        proposedKey: 'company_city_locative',
        confidence: 0.9,
        evidenceType: 'legal_context',
        evidenceText: 'z siedzibą w',
        operation: 'replace',
        sourceHint: 'company',
        reason: 'Company seat city (locative) after z siedzibą w',
      })
    }
  }

  const nip = /\bNIP\s*([0-9\s-]{10,14})/i.exec(text)
  if (nip && nip.index != null) {
    const raw = nip[1]!
    const span = raw.replace(/\s+/g, '')
    const start = text.indexOf(raw, nip.index)
    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: start + raw.length,
      text: span,
      proposedKey: 'company_nip',
      confidence: 0.96,
      evidenceType: 'explicit_label',
      evidenceText: 'NIP',
      operation: 'replace',
      sourceHint: 'company',
      reason: 'NIP label in company party clause',
    })
  }

  const regon = /\bREGON\s*([0-9]{9,14})/i.exec(text)
  if (regon && regon.index != null) {
    const span = regon[1]!
    const start = text.indexOf(span, regon.index)
    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: start + span.length,
      text: span,
      proposedKey: 'company_regon',
      confidence: 0.96,
      evidenceType: 'explicit_label',
      evidenceText: 'REGON',
      operation: 'replace',
      sourceHint: 'company',
      reason: 'REGON label in company party clause',
    })
  }

  if (segmented.address) {
    const span = segmented.address.text
    const start = text.indexOf(span)
    if (start >= 0) {
      pushCandidate(out, claimed, {
        paragraphIndex: para.index,
        paragraphText: text,
        startOffset: start,
        endOffset: start + span.length,
        text: span,
        proposedKey: 'company_address',
        confidence: 0.88,
        evidenceType: 'legal_context',
        evidenceText: 'company seat / place of business',
        operation: 'replace',
        sourceHint: 'company',
        reason: 'Company address in provider introduction',
      })
    }
  } else {
    const addr =
      /(?:stałe miejsce[^:]*:|z siedzib[aą]\s+(?:przy\s+)?)((?:ul\.|al\.|aleja)[^,]{5,60}(?:,\s*\d{2}-\d{3}\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż\-]+)?)/iu.exec(
        text,
      )
    if (addr && addr.index != null) {
      const span = addr[1]!.trim()
      const start = text.indexOf(span, addr.index)
      if (start >= 0) {
        pushCandidate(out, claimed, {
          paragraphIndex: para.index,
          paragraphText: text,
          startOffset: start,
          endOffset: start + span.length,
          text: span,
          proposedKey: 'company_address',
          confidence: 0.88,
          evidenceType: 'legal_context',
          evidenceText: 'company seat / place of business',
          operation: 'replace',
          sourceHint: 'company',
          reason: 'Company address in provider introduction',
        })
      }
    }
  }

  const phones = [...text.matchAll(/tel\.?\s*([+\d][\d\s\u00a0-]{7,18}\d)/gi)]
  if (phones[0] && phones[0].index != null) {
    const raw = phones[0][1]!
    const start = text.indexOf(raw, phones[0].index)
    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: start + raw.length,
      text: raw.replace(/\u00a0/g, ' ').trim(),
      proposedKey: 'company_phone',
      confidence: 0.84,
      evidenceType: 'legal_context',
      evidenceText: 'tel. in company clause',
      operation: 'replace',
      sourceHint: 'company',
      reason: 'Phone in company party introduction',
    })
  }

  const repr =
    /reprezentowan[ya]\s+przez\s+((?:[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż\-]+\s*){2,4})/u.exec(
      text,
    )
  if (repr && repr.index != null) {
    const span = repr[1]!.trim()
    const start = text.indexOf(span, repr.index)
    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: start + span.length,
      text: span,
      proposedKey: 'company_representative',
      confidence: 0.9,
      evidenceType: 'legal_context',
      evidenceText: 'reprezentowanym przez',
      operation: 'replace',
      sourceHint: 'company',
      reason: 'Representative name after reprezentowanym przez',
    })
  }
}

function detectDates(
  para: IndexedParagraph,
  out: ContractCandidate[],
  claimed: Map<number, Array<{ start: number; end: number }>>,
) {
  const text = canonicalizeParagraphText(para.text)
  // Allow "19.06.2025r." (no boundary between year and r)
  const re = /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})(?=\s*r\.?|\b)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const span = m[1]!
    const start = m.index
    const ctx = text.slice(Math.max(0, start - 50), start + span.length + 50)
    const lower = ctx.toLowerCase()
    let confidence = 0.7
    let reason = 'Date format in contract'
    let key = 'wedding_date'

    // Order: payment → execution → wedding event (never classify by equality alone)
    if (
      /najpóźniej|pozostał[aą]\s+część|płatności\s+końcow|wynagrodzenia/i.test(
        lower,
      )
    ) {
      confidence = 0.9
      reason = 'Final payment due date context'
      key = 'final_payment_due_date'
    } else if (
      /zawart[ay]\s+w\s+dniu|zawart[ay]\s+dnia|umowa\s+zawart[ay]|sporządzon[ay]\s+dnia|sporządzon[ay]\s+w\s+dniu/i.test(
        lower,
      )
    ) {
      confidence = 0.95
      reason = 'Contract execution / signing date clause'
      key = 'contract_execution_date'
    } else if (
      /wydarze|ślub|slub|ceremon|wesel|odbęd|składającego|w dniu\s+\d/i.test(
        lower,
      )
    ) {
      confidence = 0.93
      reason = 'Event/wedding date context'
      key = 'wedding_date'
    }

    console.info('[contract-date-context]', {
      paragraphIndex: para.index,
      sourceText: span,
      localContext: ctx.trim(),
      classifiedKey: key,
      confidence,
      reason,
    })

    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: start + span.length,
      text: span,
      proposedKey: key,
      confidence,
      evidenceType: 'existing_value',
      evidenceText: ctx.trim(),
      operation: 'replace',
      sourceHint:
        key === 'final_payment_due_date'
          ? 'package'
          : key === 'contract_execution_date'
            ? 'unknown'
            : 'wedding',
      reason,
    })
  }

  detectExecutionCity(para, out, claimed)
}

const CITY_TOKEN =
  '[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]*(?:-[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]*)*'

function detectExecutionCity(
  para: IndexedParagraph,
  out: ContractCandidate[],
  claimed: Map<number, Array<{ start: number; end: number }>>,
) {
  const text = canonicalizeParagraphText(para.text)
  const patterns: Array<{ re: RegExp; confidence: number; reason: string }> = [
    {
      // …30.10.2024 r. w Zabrzu, zwana dalej
      re: new RegExp(
        String.raw`\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*r\.?\s+w\s+(${CITY_TOKEN})\s*,\s*zwana`,
        'u',
      ),
      confidence: 0.96,
      reason: 'Execution city after date before „zwana dalej”',
    },
    {
      re: new RegExp(
        String.raw`zawart[ay]\s+w\s+(?!dniu\b|dnia\b)(${CITY_TOKEN})(?=\s*[,.]|\s+zwana|\s+pomiędzy|$)`,
        'iu',
      ),
      confidence: 0.92,
      reason: 'Execution city after „zawarta w”',
    },
    {
      re: new RegExp(
        String.raw`sporządzon[ay]\s+w\s+(${CITY_TOKEN})(?=\s*[,.]|\s+zwana|$)`,
        'iu',
      ),
      confidence: 0.9,
      reason: 'Execution city after „sporządzona w”',
    },
  ]

  for (const pattern of patterns) {
    const m = pattern.re.exec(text)
    if (!m || m.index == null) continue
    const span = m[1]!
    const start = text.indexOf(span, m.index)
    if (start < 0) continue
    const ctx = text.slice(Math.max(0, start - 40), start + span.length + 40)

    // Reject event / company-street contexts
    if (
      /przygotowa|ceremon|przyj[eę]cia|ul\.|ulica|osiedle|partner|panny|pana młode/i.test(
        ctx,
      )
    ) {
      console.info('[contract-city-context]', {
        paragraphIndex: para.index,
        sourceText: span,
        localContext: ctx.trim(),
        classifiedKey: null,
        confidence: 0,
        reason: 'Rejected — event or street context',
      })
      continue
    }

    console.info('[contract-city-context]', {
      paragraphIndex: para.index,
      sourceText: span,
      localContext: ctx.trim(),
      classifiedKey: 'company_city_locative',
      confidence: pattern.confidence,
      reason: pattern.reason,
    })

    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: start + span.length,
      text: span,
      proposedKey: 'company_city_locative',
      confidence: pattern.confidence,
      evidenceType: 'legal_context',
      evidenceText: ctx.trim(),
      operation: 'replace',
      sourceHint: 'company',
      reason: pattern.reason,
      leftAnchor: text.slice(Math.max(0, start - 8), start),
      rightAnchor: text.slice(start + span.length, start + span.length + 12),
      // Execution place city is dynamic (studio profile) — not provider party text
      variableClassification: 'dynamic_candidate',
    })
    break
  }
}

function detectMoneyAndPackage(
  para: IndexedParagraph,
  out: ContractCandidate[],
  claimed: Map<number, Array<{ start: number; end: number }>>,
) {
  const text = canonicalizeParagraphText(para.text)
  const lower = text.toLowerCase()

  const pkg =
    /(?:Pakiecie|Pakiet|pakiecie|pakiet)\s+([A-ZĄĆĘŁŃÓŚŹŻ][A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9 \-]{2,40})/u.exec(
      text,
    )
  if (pkg && pkg.index != null) {
    const span = pkg[1]!.trim().replace(/[,.]$/, '')
    const start = text.indexOf(span, pkg.index)
    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: start + span.length,
      text: span,
      proposedKey: 'package_name',
      confidence: 0.9,
      evidenceType: 'explicit_label',
      evidenceText: pkg[0],
      operation: 'replace',
      sourceHint: 'package',
      reason: 'Package name after „Pakiet(cie)”',
    })
  }

  // Money amounts classified globally via detectMoneyGlobally().

  // Bank account
  const iban = /\b((?:\d{2}\s*){10,13}\d{2})\b/.exec(text)
  if (iban && /rachunek|konta|bankow/i.test(lower) && iban.index != null) {
    const span = iban[1]!.replace(/\s+/g, ' ').trim()
    const start = text.indexOf(iban[1]!, iban.index)
    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: start + iban[1]!.length,
      text: span,
      proposedKey: 'company_bank_account',
      confidence: 0.95,
      evidenceType: 'format_pattern',
      evidenceText: 'bank account number',
      operation: 'replace',
      sourceHint: 'company',
      reason: 'Bank account number in payment clause',
    })
  }
}

/**
 * Global money inventory + scored classification (unique concept per amount).
 */
function detectMoneyGlobally(
  paragraphs: IndexedParagraph[],
  out: ContractCandidate[],
  claimed: Map<number, Array<{ start: number; end: number }>>,
) {
  const classified = inventoryAndClassifyMoney(paragraphs)
  for (const c of classified) {
    if (c.selectedConcept === 'excluded_penalty') continue
    if (
      !c.registryKey ||
      c.reviewState === 'needs_review' ||
      c.physicalSpanSafety !== 'safe'
    ) {
      continue
    }

    const key = c.registryKey
    const confidence = c.confidence
    let reason = `Money classified as ${c.selectedConcept}`
    if (c.selectedConcept === 'overtime') reason = 'Overtime hourly rate'
    if (c.selectedConcept === 'contract_value') {
      reason = 'Contract remuneration / package price'
    }
    if (c.selectedConcept === 'agreed_deposit') {
      reason = 'First installment / deposit (agreed_deposit_formatted)'
    }
    if (c.selectedConcept === 'remaining_after_deposit') {
      reason = 'Remaining / final installment after deposit'
    }

    pushCandidate(out, claimed, {
      paragraphIndex: c.paragraphIndex,
      paragraphText: c.paragraphText,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      text: c.sourceText,
      proposedKey: key,
      confidence,
      evidenceType: 'existing_value',
      evidenceText: c.localSentence.slice(0, 100),
      operation: 'replace',
      sourceHint: 'package',
      reason,
      leftAnchor:
        c.paragraphText
          .slice(Math.max(0, c.startOffset - 24), c.startOffset)
          .trimEnd() || undefined,
      rightAnchor:
        c.paragraphText
          .slice(
            c.endOffset,
            Math.min(c.paragraphText.length, c.endOffset + 16),
          )
          .trimStart() || undefined,
    })

    if (
      c.selectedConcept === 'contract_value' ||
      c.selectedConcept === 'agreed_deposit' ||
      c.selectedConcept === 'remaining_after_deposit'
    ) {
      const words = findSlownieWordsAfter(c.paragraphText, c.endOffset)
      if (words) {
        const wordsKey =
          c.selectedConcept === 'contract_value'
            ? 'contract_value_words'
            : c.selectedConcept === 'agreed_deposit'
              ? 'agreed_deposit_words'
              : 'remaining_after_deposit_words'
        pushCandidate(out, claimed, {
          paragraphIndex: c.paragraphIndex,
          paragraphText: c.paragraphText,
          startOffset: words.start,
          endOffset: words.end,
          text: words.text,
          proposedKey: wordsKey,
          confidence: Math.min(0.96, confidence + 0.02),
          evidenceType: 'legal_context',
          evidenceText: c.paragraphText.slice(words.wrapperStart, words.end + 1),
          operation: 'replace',
          sourceHint: 'package',
          reason: `Amount in words paired with ${conceptToNumericKey(c.selectedConcept)}`,
          leftAnchor: words.leftAnchor,
          rightAnchor: words.rightAnchor,
        })
      }
    }
  }
}


function detectLocations(
  para: IndexedParagraph,
  out: ContractCandidate[],
  claimed: Map<number, Array<{ start: number; end: number }>>,
) {
  const text = canonicalizeParagraphText(para.text)
  const lower = text.toLowerCase()

  // Venue candidates are classified globally in detectVenueAndCoverageTimeGlobally().

  // coverage end time — single “do godziny HH.MM” (no range). Persist SOURCE span.
  const time =
    /do godziny\s+(\d{1,2}[.:]\d{2})/i.exec(text) ??
    /maksymalnie do godziny\s+(\d{1,2}[.:]\d{2})/i.exec(text) ??
    /reporta[żz]\s+do\s+(?:godziny\s+)?(\d{1,2}[.:]\d{2})/i.exec(text)
  if (time && time.index != null) {
    const span = time[1]!
    const start = text.indexOf(span, time.index)
    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: start + span.length,
      text: span,
      proposedKey: 'coverage_end_time',
      confidence: 0.9,
      evidenceType: 'legal_context',
      evidenceText: time[0],
      operation: 'replace',
      sourceHint: 'package',
      reason: 'Coverage end time after „do godziny” / reportaż do',
    })
  }

  // coverage hours — “12 godzin”, “maksymalnie 12 godzin”, “nie przekracza 11 godzin”
  const hours =
    /nie\s+przekracza\s+(\d{1,2})\s+godzin/i.exec(text) ??
    /maksymalnie\s+(\d{1,2})\s+godzin/i.exec(text) ??
    /(\d{1,2})\s+godzin(?:y|ach)?/i.exec(text)
  if (
    hours &&
    hours.index != null &&
    /czas pracy|kamerzyst|filmowc|reporta|obejmuje|maksymalnie|nie\s+przekracza/i.test(
      lower,
    )
  ) {
    const span = hours[1]!
    const start = text.indexOf(span, hours.index)
    pushCandidate(out, claimed, {
      paragraphIndex: para.index,
      paragraphText: text,
      startOffset: start,
      endOffset: start + span.length,
      text: span,
      proposedKey: 'coverage_hours',
      confidence: 0.88,
      evidenceType: 'legal_context',
      evidenceText: hours[0],
      operation: 'replace',
      sourceHint: 'package',
      reason: 'Coverage hours in “N godzin” / czas pracy clause',
    })
  }

  // delivery term — “4 miesięcy”, “w terminie 4 miesięcy”
  const delivery =
    /(?:w terminie|termin oddania|czas realizacji)[^\d]{0,24}(\d{1,2})\s+(miesi[eę]c(?:e|y|a)?|dni)/i.exec(
      text,
    ) ?? /(\d{1,2})\s+(miesi[eę]c(?:e|y|a)?)\b/i.exec(text)
  if (
    delivery &&
    delivery.index != null &&
    /termin|oddania|realizacji|miesi/i.test(lower)
  ) {
    const span = `${delivery[1]} ${delivery[2]}`.replace(/\s+/g, ' ')
    const start = text.toLowerCase().indexOf(span.toLowerCase(), delivery.index)
    if (start >= 0) {
      pushCandidate(out, claimed, {
        paragraphIndex: para.index,
        paragraphText: text,
        startOffset: start,
        endOffset: start + span.length,
        text: span,
        proposedKey: 'delivery_term_text',
        confidence: 0.86,
        evidenceType: 'legal_context',
        evidenceText: delivery[0],
        operation: 'replace',
        sourceHint: 'package',
        reason: 'Delivery term months/days phrase',
      })
    }
  }
}

/**
 * Global venue + coverage clock-range classification.
 */
function detectVenueAndCoverageTimeGlobally(
  paragraphs: IndexedParagraph[],
  out: ContractCandidate[],
  claimed: Map<number, Array<{ start: number; end: number }>>,
) {
  const { venues, timeRanges } = inventoryAndClassifyVenueTime(paragraphs)

  for (const v of venues) {
    if (!v.selectedConcept || v.reviewState !== 'ok') continue
    if (v.physicalSpanSafety !== 'safe') continue
    pushCandidate(out, claimed, {
      paragraphIndex: v.paragraphIndex,
      paragraphText: v.paragraphText,
      startOffset: v.startOffset,
      endOffset: v.endOffset,
      text: v.sourceText,
      proposedKey: v.selectedConcept,
      confidence: v.confidence,
      evidenceType: 'legal_context',
      evidenceText: v.stageAnchors.join(', ') || 'venue context',
      operation: 'replace',
      sourceHint: 'wedding',
      reason:
        v.sharedVenueStages.length > 1
          ? `Combined wedding venue (${v.sharedVenueStages.join('+')}) → ${v.selectedConcept}`
          : `Wedding venue for ${v.selectedConcept}`,
    })
  }

  for (const t of timeRanges) {
    if (t.reviewState === 'excluded') continue
    if (t.physicalSpanSafety !== 'safe') continue
    if (t.selectedStartConcept) {
      pushCandidate(out, claimed, {
        paragraphIndex: t.paragraphIndex,
        paragraphText: t.paragraphText,
        startOffset: t.startOffset,
        endOffset: t.startEndOffset,
        text: t.startText,
        proposedKey: 'coverage_start_time',
        confidence: t.confidence,
        evidenceType: 'legal_context',
        evidenceText: t.rawRange,
        operation: 'replace',
        sourceHint: 'package',
        reason: 'Coverage start time from work-hours range',
      })
    }
    if (t.selectedEndConcept) {
      pushCandidate(out, claimed, {
        paragraphIndex: t.paragraphIndex,
        paragraphText: t.paragraphText,
        startOffset: t.endOffset,
        endOffset: t.endEndOffset,
        text: t.endText,
        proposedKey: 'coverage_end_time',
        confidence: t.confidence,
        evidenceType: 'legal_context',
        evidenceText: t.rawRange,
        operation: 'replace',
        sourceHint: 'package',
        reason: 'Coverage end time from work-hours range',
      })
    }
  }
}


/**
 * Run two-pass detection over indexed paragraphs.
 */
export function detectContractCandidates(
  paragraphs: IndexedParagraph[],
): ContractCandidate[] {
  const out: ContractCandidate[] = []
  const claimed = new Map<number, Array<{ start: number; end: number }>>()

  for (const para of paragraphs) {
    if (!para.text.trim()) continue
    const normalized = { index: para.index, text: canonicalizeParagraphText(para.text) }
    detectCoupleParty(normalized, out, claimed)
    detectCompanyParty(normalized, out, claimed)
    detectLocations(normalized, out, claimed)
    detectDates(normalized, out, claimed)
    detectMoneyAndPackage(normalized, out, claimed)
  }

  detectMoneyGlobally(paragraphs, out, claimed)

  // Labeled client-party forms (Panna Młoda: / Pan Młody: …) — after composite
  // couple detection so "Name i Name, zwaną dalej" still wins on the same span.
  for (const c of detectClientPartyLabelForms(paragraphs)) {
    const { meta: _meta, ...rest } = c as ContractCandidate & {
      meta?: unknown
    }
    void _meta
    if (!rest.text.trim()) {
      // Empty/obfuscated placeholders — surface for review without claiming a span.
      out.push({
        ...rest,
        decision: rest.decision ?? 'needs_confirmation',
      })
      continue
    }
    pushCandidate(out, claimed, {
      ...rest,
      reason: rest.reason,
    })
  }

  return out
}

export function candidatesToTemplateSlots(
  candidates: ContractCandidate[],
): TemplateSlot[] {
  return candidates
    .filter((c) => c.decision === 'accepted' || c.decision === 'needs_confirmation')
    .map((c) => {
      const spanCheck = validateMinimalSlotSpan({
        registryKey: c.proposedKey,
        text: c.text,
        paragraphText: c.paragraphText,
        leftAnchor: c.leftAnchor,
        operation: c.operation,
      })
      const unsafe = !spanCheck.ok
      const classification =
        c.variableClassification ??
        (c.sourceHint === 'company'
          ? unsafe
            ? 'ignored_non_variable'
            : 'template_constant'
          : 'dynamic_candidate')

      // Provider immutable — evidence only, not a generation replace slot
      if (
        classification === 'template_constant' ||
        classification === 'ignored_non_variable'
      ) {
        return {
          id: `slot-${c.proposedKey}-${c.paragraphIndex}-${c.startOffset}`,
          registryKey: c.proposedKey,
          label: c.proposedKey.replace(/_/g, ' '),
          sourceHint: c.sourceHint,
          occurrences: 1,
          exampleText: c.text,
          sampleContext: c.paragraphText.slice(0, 160),
          enabled: false,
          placeholderInserted: false,
          operation: c.operation,
          paragraphIndex: c.paragraphIndex,
          originalText: c.text,
          leftAnchor: c.leftAnchor ?? null,
          rightAnchor: c.rightAnchor ?? null,
          allowedRange: { start: c.startOffset, end: c.endOffset },
          startOffset: c.startOffset,
          endOffset: c.endOffset,
          prefix: '',
          suffix: '',
          omissionMode: 'keep_original' as const,
          paragraphFingerprint: paragraphFingerprint(c.paragraphText),
          physicallyBound: false,
          componentKeys: c.componentKeys,
          separator: c.separator ?? null,
          confidence: c.confidence,
          detectionReason:
            classification === 'ignored_non_variable'
              ? 'Zakres zbyt szeroki — dane usługodawcy pozostają tekstem szablonu (bez podmiany).'
              : 'Dane usługodawcy w szablonie — niezmienne domyślnie.',
          detectionStatus: 'optional_unbound' as const,
          requirement: 'optional' as const,
          evidenceType: c.evidenceType,
          evidenceText: c.evidenceText,
          needsConfirmation: false,
          physicalSpanSafety: spanCheck.physicalSpanSafety,
          detectedEntityTypes: spanCheck.detectedEntityTypes,
          legalWrapperTokensInside: spanCheck.legalWrapperTokensInside,
          spanSafetyReasons: spanCheck.blockingReasons,
          spanSafetyMessage: spanCheck.userMessage,
          variableClassification: classification,
          canLinkToCompany:
            classification === 'template_constant' &&
            !unsafe &&
            c.sourceHint === 'company',
        }
      }

      const needsConfirm =
        c.decision === 'needs_confirmation' || unsafe
      const isEmptyPlaceholder =
        !c.text.trim() &&
        (c.evidenceType === 'blank_between_anchors' ||
          /placeholder|obfuscat/i.test(c.reason))
      return {
        id: `slot-${c.proposedKey}-${c.paragraphIndex}-${c.startOffset}`,
        registryKey: c.proposedKey,
        label: c.proposedKey.replace(/_/g, ' '),
        sourceHint: c.sourceHint,
        occurrences: 1,
        exampleText: c.text || null,
        sampleContext: c.paragraphText.slice(0, 160),
        enabled: true,
        placeholderInserted: false,
        operation: c.operation,
        paragraphIndex: c.paragraphIndex,
        originalText: c.text,
        leftAnchor: c.leftAnchor ?? null,
        rightAnchor: c.rightAnchor ?? null,
        allowedRange: { start: c.startOffset, end: c.endOffset },
        startOffset: c.startOffset,
        endOffset: c.endOffset,
        prefix: '',
        suffix: '',
        omissionMode: 'keep_original' as const,
        paragraphFingerprint: paragraphFingerprint(c.paragraphText),
        physicallyBound: !unsafe && !isEmptyPlaceholder && c.decision === 'accepted',
        componentKeys: c.componentKeys,
        separator: c.separator ?? null,
        confidence: c.confidence,
        detectionReason: isEmptyPlaceholder
          ? c.reason
          : unsafe
            ? (spanCheck.userMessage ?? c.reason)
            : c.reason,
        detectionStatus: needsConfirm || isEmptyPlaceholder
          ? ('ambiguous' as const)
          : ('bound' as const),
        evidenceType: c.evidenceType,
        evidenceText: c.evidenceText,
        needsConfirmation: needsConfirm || isEmptyPlaceholder,
        physicalSpanSafety: isEmptyPlaceholder
          ? ('needs_review' as const)
          : spanCheck.physicalSpanSafety,
        detectedEntityTypes: spanCheck.detectedEntityTypes,
        legalWrapperTokensInside: spanCheck.legalWrapperTokensInside,
        spanSafetyReasons: isEmptyPlaceholder
          ? ['Empty/obfuscated contact placeholder']
          : spanCheck.blockingReasons,
        spanSafetyMessage: isEmptyPlaceholder
          ? 'Pole kontaktowe jest puste lub zamazane — wymaga uzupełnienia.'
          : spanCheck.userMessage,
        variableClassification: 'dynamic_candidate' as const,
        canLinkToCompany: false,
      }
    })
}

/** Visible party-identity phrases without a corresponding slot. */
export function hasVisiblePartyIdentityWithoutSlot(
  paragraphs: IndexedParagraph[],
  slots: TemplateSlot[],
): boolean {
  const joined = paragraphs.map((p) => canonicalizeParagraphText(p.text)).join('\n')
  const hasCue =
    /Parą Młodą|Parą Mlodą|zwaną dalej|zwanymi dalej|pomiędzy/i.test(joined)
  if (!hasCue) return false
  const hasPartySlot = slots.some(
    (s) =>
      s.physicallyBound &&
      (s.registryKey === 'couple_full_names' ||
        s.registryKey === 'partner1_full_name' ||
        s.registryKey === 'partner2_full_name' ||
        s.registryKey === 'bride_full_name' ||
        s.registryKey === 'groom_full_name'),
  )
  return !hasPartySlot
}

export function summarizeDetection(candidates: ContractCandidate[]): {
  detectedAutomatically: number
  needsConfirmation: number
  rejected: number
} {
  return {
    detectedAutomatically: candidates.filter((c) => c.decision === 'accepted')
      .length,
    needsConfirmation: candidates.filter(
      (c) => c.decision === 'needs_confirmation',
    ).length,
    rejected: candidates.filter((c) => c.decision === 'rejected').length,
  }
}
