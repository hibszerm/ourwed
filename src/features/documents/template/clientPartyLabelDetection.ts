/**
 * Client-party label-form detection (fix group #1).
 *
 * Detects “Panna Młoda: Name” / “Pan Młody: Name” and nearby follow-up fields
 * inside a bounded client section. Does not invent values for empty placeholders.
 */

import { canonicalizeParagraphText } from './canonicalParagraph'
import type { IndexedParagraph } from './extractDocxParagraphs'
import type { ContractCandidate } from './candidateDetection'
import { validateMinimalSlotSpan } from './contractSlotSafety'

const NAME_TOKEN =
  "[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżąćęłńóśźżĄĆĘŁŃÓŚŹŻ'\\-]{1,30}"
const FULL_NAME = `${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){1,3}`

/** Section open cues — establish client context only (never bound as slots). */
const SECTION_OPEN_RES = [
  /\ba\s+Par[aą]\s+Młod[aą]\s*:/iu,
  /\bPar[aą]\s+Młod[aą]\s*:/iu,
  /\bZamawiającymi\s*:/iu,
  /\bZamawiający\s*:/iu,
  /\bKlientami\s*:/iu,
  /\bKlient\s*:/iu,
  /\bzwanymi\s+dalej\s+[„"']?Zamawiającymi/iu,
  /\bzwani\s+dalej\s+[„"']?Zamawiającymi/iu,
]

/** Hard section end cues. */
const SECTION_END_RES = [
  /^§\s*\d*/u,
  /^Strony\s+postanowiły/iu,
  /^Przedmiot\s+umowy/iu,
  /^\d+\.\s*Zamawiający\s+powierza/iu,
]

/**
 * Role labels → partner slot.
 * Panna/Narzeczona/Klientka → partner1; Pan/Narzeczony/Klient → partner2.
 */
const ROLE_TO_PARTNER: Array<{
  re: RegExp
  partner: 1 | 2
  roleLabel: string
}> = [
  {
    re: /^(?:\d+\.\s*)?Panna\s+Młoda\s*:/iu,
    partner: 1,
    roleLabel: 'Panna Młoda',
  },
  {
    re: /^(?:\d+\.\s*)?Narzeczona\s*:/iu,
    partner: 1,
    roleLabel: 'Narzeczona',
  },
  {
    re: /^(?:\d+\.\s*)?Klientka\s*:/iu,
    partner: 1,
    roleLabel: 'Klientka',
  },
  {
    re: /^(?:\d+\.\s*)?Zamawiająca\s*:/iu,
    partner: 1,
    roleLabel: 'Zamawiająca',
  },
  {
    re: /^(?:\d+\.\s*)?Strona\s+Zamawiająca\s*:/iu,
    partner: 1,
    roleLabel: 'Strona Zamawiająca',
  },
  {
    re: /^(?:\d+\.\s*)?Zamawiający\s*1\s*:/iu,
    partner: 1,
    roleLabel: 'Zamawiający 1',
  },
  {
    re: /^(?:\d+\.\s*)?Pan\s+Młody\s*:/iu,
    partner: 2,
    roleLabel: 'Pan Młody',
  },
  {
    re: /^(?:\d+\.\s*)?Narzeczony\s*:/iu,
    partner: 2,
    roleLabel: 'Narzeczony',
  },
  {
    re: /^(?:\d+\.\s*)?Klient\s*:/iu,
    partner: 2,
    roleLabel: 'Klient',
  },
  {
    re: /^(?:\d+\.\s*)?Zamawiający\s*2\s*:/iu,
    partner: 2,
    roleLabel: 'Zamawiający 2',
  },
  // Bare neutral label — assigned by encounter order in the section.
  {
    re: /^(?:\d+\.\s*)?Zamawiający\s*:/iu,
    partner: 1,
    roleLabel: 'Zamawiający',
  },
]

type PartnerSide = 1 | 2

function partnerKeys(side: PartnerSide): {
  name: string
  address: string
  pesel: string
  phone: string
  email: string
} {
  // Reuse existing registry keys (bride_* / groom_*) via stable mapping.
  if (side === 1) {
    return {
      name: 'partner1_full_name',
      address: 'bride_address',
      pesel: 'bride_pesel',
      phone: 'bride_phone',
      email: 'bride_email',
    }
  }
  return {
    name: 'partner2_full_name',
    address: 'groom_address',
    pesel: 'groom_pesel',
    phone: 'groom_phone',
    email: 'groom_email',
  }
}

function isSectionOpen(text: string): boolean {
  return SECTION_OPEN_RES.some((re) => re.test(text))
}

function isSectionEnd(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return SECTION_END_RES.some((re) => re.test(t))
}

function isClosingZamawiajacymi(text: string): boolean {
  return /Zwanymi\s+dalej\s+[„"']?Zamawiającymi|Zwani\s+dalej\s+[„"']?Zamawiającymi/iu.test(
    text,
  )
}

function looksLikeAddress(text: string): boolean {
  return (
    /(?:ul\.|al\.|aleja|os\.|plac)\s+/i.test(text) ||
    /\d{2}-\d{3}\s+[A-ZĄĆĘŁŃÓŚŹŻ]/u.test(text)
  )
}

function isObfuscatedContactValue(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  const separatorCount = (v.match(/[.\u2026…·•]/g) ?? []).length
  // Spaced-dot / ellipsis redaction (e.g. "…6…0…0 …82…")
  if (separatorCount >= 3) return true
  const stripped = v.replace(/[.\u2026…·•\s_\-–—]/g, '')
  if (stripped.length < 3) return true
  if (/^[.\u2026…_\-\s]{4,}$/u.test(v)) return true
  return false
}

function extractNameAfterColon(rest: string): string | null {
  const trimmed = rest.trim()
  if (!trimmed) return null
  const m = new RegExp(`^(${FULL_NAME})`, 'u').exec(trimmed)
  if (!m) return null
  return m[1]!.trim()
}

function findNameInText(
  text: string,
): { text: string; start: number; end: number } | null {
  const m = new RegExp(`(${FULL_NAME})`, 'u').exec(text.trim())
  if (!m || m.index == null) return null
  const lead = text.length - text.trimStart().length
  const start = lead + m.index
  return { text: m[1]!.trim(), start, end: start + m[1]!.length }
}

export interface ClientLabelDetectionMeta {
  roleLabel?: string
  associationSource?: string
  reviewState?: 'ok' | 'needs_review' | 'empty_placeholder'
  physicalSpanSafety?: 'safe' | 'unsafe' | 'needs_review'
}

/**
 * Detect labeled client-party forms across paragraphs.
 */
export function detectClientPartyLabelForms(
  paragraphs: IndexedParagraph[],
): Array<ContractCandidate & { meta?: ClientLabelDetectionMeta }> {
  const out: Array<ContractCandidate & { meta?: ClientLabelDetectionMeta }> =
    []
  const normalized = paragraphs.map((p) => ({
    index: p.index,
    text: canonicalizeParagraphText(p.text),
  }))

  const sections: Array<{ startIdx: number; endIdx: number }> = []
  let openAt: number | null = null
  for (let i = 0; i < normalized.length; i++) {
    const text = normalized[i]!.text
    if (openAt == null && isSectionOpen(text)) {
      openAt = i
      continue
    }
    if (openAt != null) {
      if (isSectionEnd(text) || i - openAt > 40) {
        sections.push({ startIdx: openAt, endIdx: i })
        openAt = null
      } else if (isClosingZamawiajacymi(text)) {
        sections.push({ startIdx: openAt, endIdx: i + 1 })
        openAt = null
      }
    }
  }
  if (openAt != null) {
    sections.push({
      startIdx: openAt,
      endIdx: Math.min(normalized.length, openAt + 40),
    })
  }

  if (sections.length === 0) {
    const firstLabel = normalized.findIndex((p) =>
      ROLE_TO_PARTNER.some((r) => r.re.test(p.text.trim())),
    )
    if (firstLabel >= 0) {
      sections.push({
        startIdx: firstLabel,
        endIdx: Math.min(normalized.length, firstLabel + 25),
      })
    }
  }

  for (const section of sections) {
    detectInsideSection(normalized, section.startIdx, section.endIdx, out)
  }

  return out
}

function detectInsideSection(
  paras: Array<{ index: number; text: string }>,
  startIdx: number,
  endIdx: number,
  out: Array<ContractCandidate & { meta?: ClientLabelDetectionMeta }>,
) {
  let currentPartner: PartnerSide | null = null
  let paragraphsSincePerson = 0
  let seenPartner1Name = false

  for (let i = startIdx; i < endIdx; i++) {
    const para = paras[i]!
    const text = para.text
    const trimmed = text.trim()
    if (!trimmed) continue

    if (isClosingZamawiajacymi(trimmed)) {
      console.info('[contract-client-party-detection]', {
        paragraphIndex: para.index,
        roleLabel: null,
        canonicalKey: null,
        sourceText: trimmed.slice(0, 60),
        reviewState: 'ok',
        rejectionReason:
          'Section close phrase „Zwanymi dalej Zamawiającymi” — not a replace slot',
      })
      currentPartner = null
      continue
    }

    let matchedRole: (typeof ROLE_TO_PARTNER)[number] | null = null
    for (const role of ROLE_TO_PARTNER) {
      if (role.re.test(trimmed)) {
        matchedRole = role
        break
      }
    }

    if (matchedRole) {
      let partner = matchedRole.partner
      // Bare „Zamawiający:” — first occurrence → partner1, second → partner2
      if (
        matchedRole.roleLabel === 'Zamawiający' &&
        !/Zamawiający\s*[12]/i.test(trimmed)
      ) {
        partner = seenPartner1Name ? 2 : 1
      }
      currentPartner = partner
      paragraphsSincePerson = 0
      const keys = partnerKeys(partner)
      const colonIdx = trimmed.indexOf(':')
      const afterColon = colonIdx >= 0 ? trimmed.slice(colonIdx + 1) : ''
      let name = extractNameAfterColon(afterColon)
      let namePara = para
      let nameStart = -1
      let nameEnd = -1

      if (name) {
        const inText = text.indexOf(name)
        nameStart = inText
        nameEnd = inText + name.length
      } else {
        for (let j = i + 1; j < Math.min(endIdx, i + 3); j++) {
          const next = paras[j]!
          if (!next.text.trim()) continue
          if (ROLE_TO_PARTNER.some((r) => r.re.test(next.text.trim()))) break
          if (
            /^(adres|PESEL|telefon|tel\.|e-?mail)\b/i.test(next.text.trim())
          ) {
            break
          }
          const found = findNameInText(next.text)
          if (found) {
            name = found.text
            namePara = next
            nameStart = found.start
            nameEnd = found.end
            i = j
            break
          }
          break
        }
      }

      if (name && nameStart >= 0) {
        const spanCheck = validateMinimalSlotSpan({
          registryKey: keys.name,
          text: name,
          paragraphText: namePara.text,
          leftAnchor: matchedRole.roleLabel,
          operation: 'replace',
        })
        const safe = spanCheck.ok && name.length <= 60
        logClientDetection({
          paragraphIndex: namePara.index,
          roleLabel: matchedRole.roleLabel,
          canonicalKey: keys.name,
          sourceText: name,
          startOffset: nameStart,
          endOffset: nameEnd,
          localContext: namePara.text.slice(0, 120),
          associationSource: 'role_label',
          confidence: safe ? 0.94 : 0.5,
          physicalSpanSafety: safe ? 'safe' : 'unsafe',
          reviewState: safe ? 'ok' : 'needs_review',
          rejectionReason: safe
            ? null
            : (spanCheck.blockingReasons[0] ?? 'unsafe span'),
        })
        if (safe) {
          if (partner === 1) seenPartner1Name = true
          out.push({
            paragraphIndex: namePara.index,
            paragraphText: namePara.text,
            startOffset: nameStart,
            endOffset: nameEnd,
            text: name,
            proposedKey: keys.name,
            confidence: 0.94,
            evidenceType: 'explicit_label',
            evidenceText: matchedRole.roleLabel,
            operation: 'replace',
            sourceHint: 'couple',
            leftAnchor: `${matchedRole.roleLabel}:`,
            decision: 'accepted',
            reason: `Labeled client name after „${matchedRole.roleLabel}:”`,
            variableClassification: 'dynamic_candidate',
            meta: {
              roleLabel: matchedRole.roleLabel,
              associationSource: 'role_label',
              reviewState: 'ok',
              physicalSpanSafety: 'safe',
            },
          })
        }
      } else {
        logClientDetection({
          paragraphIndex: para.index,
          roleLabel: matchedRole.roleLabel,
          canonicalKey: keys.name,
          sourceText: '',
          startOffset: null,
          endOffset: null,
          localContext: trimmed.slice(0, 120),
          associationSource: 'role_label',
          confidence: 0,
          physicalSpanSafety: 'needs_review',
          reviewState: 'needs_review',
          rejectionReason: 'Role label without extractable name value',
        })
      }
      continue
    }

    if (currentPartner != null && paragraphsSincePerson < 6) {
      paragraphsSincePerson += 1
      const keys = partnerKeys(currentPartner)
      consumeFollowUp(para, text, keys, currentPartner, out)
    }
  }
}

function consumeFollowUp(
  para: { index: number; text: string },
  text: string,
  keys: ReturnType<typeof partnerKeys>,
  side: PartnerSide,
  out: Array<ContractCandidate & { meta?: ClientLabelDetectionMeta }>,
) {
  const addrLabel =
    /^(?:adres(?:\s+zamieszkania)?|zamieszkał[ay]\s+przy|zamieszkał[ay])\s*:\s*(.+)$/iu.exec(
      text.trim(),
    )
  if (addrLabel) {
    const value = addrLabel[1]!.trim()
    if (value && looksLikeAddress(value)) {
      const cut = value.split(/\bPESEL\b|\btel\.?\b|\be-?mail\b/i)[0]!.trim()
      pushField(out, para, text, cut, keys.address, 'address_label', side)
      return
    }
  }

  if (looksLikeAddress(text) && !/PESEL|telefon|e-?mail/i.test(text)) {
    pushField(
      out,
      para,
      text,
      text.trim(),
      keys.address,
      'address_follow_paragraph',
      side,
    )
    return
  }

  const pesel = /\bPESEL\s*:\s*(\d{11})\b/i.exec(text)
  if (pesel && pesel.index != null) {
    const value = pesel[1]!
    const start = text.indexOf(value, pesel.index)
    pushFieldAt(
      out,
      para,
      text,
      value,
      start,
      start + value.length,
      keys.pesel,
      'pesel_label',
      side,
      0.96,
    )
    return
  }

  const phone = /(?:telefon|tel\.)\s*:\s*(.+?)(?=\s*,\s*e-?mail|\s*$)/iu.exec(
    text,
  )
  const email = /e-?mail\s*:\s*(.+)$/iu.exec(text)
  if (phone) {
    const raw = phone[1]!.trim()
    if (isObfuscatedContactValue(raw)) {
      pushPlaceholder(out, para, text, raw, keys.phone, 'phone_placeholder', side)
    } else {
      const digits = raw.replace(/[^\d+]/g, '')
      if (digits.length >= 9) {
        pushField(out, para, text, raw, keys.phone, 'phone_label', side)
      } else {
        pushPlaceholder(out, para, text, raw, keys.phone, 'phone_placeholder', side)
      }
    }
  }
  if (email) {
    const raw = email[1]!.trim()
    if (isObfuscatedContactValue(raw) || !/@/.test(raw)) {
      pushPlaceholder(out, para, text, raw, keys.email, 'email_placeholder', side)
    } else {
      pushField(out, para, text, raw, keys.email, 'email_label', side)
    }
  }
}

function pushField(
  out: Array<ContractCandidate & { meta?: ClientLabelDetectionMeta }>,
  para: { index: number; text: string },
  fullText: string,
  value: string,
  key: string,
  association: string,
  side: PartnerSide,
) {
  const start = fullText.indexOf(value)
  if (start < 0) return
  pushFieldAt(
    out,
    para,
    fullText,
    value,
    start,
    start + value.length,
    key,
    association,
    side,
    0.9,
  )
}

function pushFieldAt(
  out: Array<ContractCandidate & { meta?: ClientLabelDetectionMeta }>,
  para: { index: number; text: string },
  fullText: string,
  value: string,
  start: number,
  end: number,
  key: string,
  association: string,
  side: PartnerSide,
  confidence: number,
) {
  const spanCheck = validateMinimalSlotSpan({
    registryKey: key,
    text: value,
    paragraphText: fullText,
    operation: 'replace',
  })
  const safe = spanCheck.ok
  logClientDetection({
    paragraphIndex: para.index,
    roleLabel: side === 1 ? 'partner1' : 'partner2',
    canonicalKey: key,
    sourceText: value,
    startOffset: start,
    endOffset: end,
    localContext: fullText.slice(0, 120),
    associationSource: association,
    confidence: safe ? confidence : 0.4,
    physicalSpanSafety: safe ? 'safe' : 'unsafe',
    reviewState: safe ? 'ok' : 'needs_review',
    rejectionReason: safe ? null : (spanCheck.blockingReasons[0] ?? null),
  })
  if (!safe) return
  out.push({
    paragraphIndex: para.index,
    paragraphText: fullText,
    startOffset: start,
    endOffset: end,
    text: value,
    proposedKey: key,
    confidence,
    evidenceType: 'explicit_label',
    evidenceText: association,
    operation: 'replace',
    sourceHint: 'couple',
    decision: 'accepted',
    reason: `Client follow-up field (${association}) for partner${side}`,
    variableClassification: 'dynamic_candidate',
    meta: {
      associationSource: association,
      reviewState: 'ok',
      physicalSpanSafety: 'safe',
    },
  })
}

function pushPlaceholder(
  out: Array<ContractCandidate & { meta?: ClientLabelDetectionMeta }>,
  para: { index: number; text: string },
  fullText: string,
  raw: string,
  key: string,
  association: string,
  side: PartnerSide,
) {
  logClientDetection({
    paragraphIndex: para.index,
    roleLabel: side === 1 ? 'partner1' : 'partner2',
    canonicalKey: key,
    sourceText: raw.slice(0, 40),
    startOffset: null,
    endOffset: null,
    localContext: fullText.slice(0, 120),
    associationSource: association,
    confidence: 0.7,
    physicalSpanSafety: 'needs_review',
    reviewState: 'empty_placeholder',
    rejectionReason:
      'Obfuscated or empty contact placeholder — not a bindable value',
  })
  out.push({
    paragraphIndex: para.index,
    paragraphText: fullText,
    startOffset: 0,
    endOffset: 0,
    text: '',
    proposedKey: key,
    confidence: 0.7,
    evidenceType: 'blank_between_anchors',
    evidenceText: raw.slice(0, 60),
    operation: 'replace',
    sourceHint: 'couple',
    decision: 'needs_confirmation',
    reason:
      'Empty/obfuscated contact placeholder — requires review (no fake originalText)',
    variableClassification: 'dynamic_candidate',
    meta: {
      associationSource: association,
      reviewState: 'empty_placeholder',
      physicalSpanSafety: 'needs_review',
    },
  })
}

function logClientDetection(input: {
  paragraphIndex: number
  roleLabel: string | null
  canonicalKey: string | null
  sourceText: string
  startOffset: number | null
  endOffset: number | null
  localContext: string
  associationSource: string
  confidence: number
  physicalSpanSafety: string
  reviewState: string
  rejectionReason: string | null
}) {
  console.info('[contract-client-party-detection]', {
    paragraphIndex: input.paragraphIndex,
    roleLabel: input.roleLabel,
    canonicalKey: input.canonicalKey,
    sourceText: input.sourceText.slice(0, 80),
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    localContext: input.localContext.slice(0, 100),
    associationSource: input.associationSource,
    confidence: input.confidence,
    physicalSpanSafety: input.physicalSpanSafety,
    reviewState: input.reviewState,
    rejectionReason: input.rejectionReason,
  })
}
