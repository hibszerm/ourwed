/**
 * Physical slot safety — minimal spans only.
 * High semantic confidence never overrides an unsafe physical span.
 */

import type { TemplateSlot } from './types'

export type PhysicalSpanSafety = 'safe' | 'unsafe' | 'needs_review'

export type DetectedEntityType =
  | 'company_name'
  | 'legal_form'
  | 'person_name'
  | 'address'
  | 'city'
  | 'tax_id'
  | 'phone'
  | 'legal_wrapper'
  | 'unknown'

export interface SlotSafetyReport {
  canonicalKey: string
  sourceText: string
  sourceLength: number
  paragraphIndex: number | null
  startOffset: number | null
  endOffset: number | null
  detectedEntityTypes: DetectedEntityType[]
  legalWrapperTokensInside: string[]
  physicalSpanSafety: PhysicalSpanSafety
  semanticUniqueness: 'unique' | 'ambiguous' | 'unknown'
  profileResolvable: boolean | null
  reviewState: 'ok' | 'needs_review' | 'blocked'
  blockingReasons: string[]
}

/** Immutable legal wrappers that must never sit inside a replace value span. */
export const LEGAL_WRAPPER_PHRASES = [
  'prowadzącymi działalność gospodarczą',
  'prowadzącym działalność gospodarczą',
  'działalność gospodarczą',
  'w formie spółki cywilnej',
  'w formie spółki',
  'pod firmą',
  'pod firma',
  'z siedzibą w',
  'z siedziba w',
  'przy ul.',
  'przy ulicy',
  'zwanym dalej',
  'zwaną dalej',
  'zwanego dalej',
  'zwanej dalej',
  'zwani dalej',
  'zwane dalej',
  'zwanych dalej',
  'zwany dalej',
  'zwanymi dalej',
  'określaną dalej',
  'określanego dalej',
  'określanym dalej',
  'reprezentowanym przez',
  'reprezentowaną przez',
] as const

const PERSON_NAME_RE =
  /[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż\-]+\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż\-]+/u

const LEGAL_FORM_IN_NAME =
  /\b(?:s\.c\.|sp\.\s*z\s*o\.o\.|spółka\s+cywilna|sp\.\s*j\.|sp\.\s*k\.)\b/iu

/** Expected max length by value class (characters). */
const MAX_LEN: Record<string, number> = {
  company_name: 60,
  company_representative: 50,
  company_city_locative: 40,
  company_city: 40,
  company_address: 120,
  company_nip: 14,
  company_regon: 14,
}

export function findLegalWrapperTokensInside(text: string): string[] {
  const lower = text.toLocaleLowerCase('pl-PL')
  const hits: string[] = []
  for (const phrase of LEGAL_WRAPPER_PHRASES) {
    if (lower.includes(phrase.toLocaleLowerCase('pl-PL'))) {
      hits.push(phrase)
    }
  }
  return hits
}

export function detectEntityTypesInSpan(text: string): DetectedEntityType[] {
  const types = new Set<DetectedEntityType>()
  if (findLegalWrapperTokensInside(text).length > 0) types.add('legal_wrapper')
  if (LEGAL_FORM_IN_NAME.test(text)) types.add('legal_form')
  const people = text.match(new RegExp(PERSON_NAME_RE.source, 'gu')) ?? []
  // Whole-span Title-Case brands (e.g. "Video Productions") look like names —
  // only treat as person_name when a person is a *subset* of a larger span.
  const wholeIsPersonLike =
    people.length === 1 && people[0]!.trim() === text.trim()
  if (people.length >= 1 && !wholeIsPersonLike) types.add('person_name')
  if (/\b(?:ul\.|al\.|aleja|os\.)\b/i.test(text)) types.add('address')
  if (/\bNIP\b|\bREGON\b|\b\d{10}\b/.test(text)) types.add('tax_id')
  if (/\btel\.?\b/i.test(text)) types.add('phone')
  if (
    types.size === 0 ||
    (types.size === 1 && types.has('legal_form')) ||
    !types.has('person_name')
  ) {
    if (
      !types.has('address') &&
      !types.has('legal_wrapper') &&
      !types.has('tax_id')
    ) {
      types.add('company_name')
    }
  }
  if (types.size === 0) types.add('unknown')
  return [...types]
}

export interface MinimalSpanValidationInput {
  registryKey: string
  text: string
  paragraphText?: string
  leftAnchor?: string | null
  operation?: string | null
}

export interface MinimalSpanValidationResult {
  ok: boolean
  physicalSpanSafety: PhysicalSpanSafety
  blockingReasons: string[]
  detectedEntityTypes: DetectedEntityType[]
  legalWrapperTokensInside: string[]
  /** Short UI message when unsafe. */
  userMessage: string | null
}

/**
 * Reject replace spans that absorb legal wording or multiple entities.
 */
export function validateMinimalSlotSpan(
  input: MinimalSpanValidationInput,
): MinimalSpanValidationResult {
  const text = input.text?.trim() ?? ''
  const reasons: string[] = []
  const wrappers = findLegalWrapperTokensInside(text)
  const entities = detectEntityTypesInSpan(text)
  const key = input.registryKey

  if (!text) {
    return {
      ok: false,
      physicalSpanSafety: 'unsafe',
      blockingReasons: ['Empty source span'],
      detectedEntityTypes: entities,
      legalWrapperTokensInside: wrappers,
      userMessage: 'Brak tekstu źródłowego dla slotu.',
    }
  }

  if (wrappers.length > 0) {
    reasons.push(
      `Span contains legal wrapper phrase(s): ${wrappers.slice(0, 3).join(', ')}`,
    )
  }

  if (key === 'company_name') {
    const people = text.match(new RegExp(PERSON_NAME_RE.source, 'gu')) ?? []
    if (people.length >= 1 && LEGAL_FORM_IN_NAME.test(text)) {
      reasons.push(
        'Company name span includes natural-person name(s) after legal form',
      )
    }
    if (people.length >= 2) {
      reasons.push('Company name span contains multiple person names')
    }
    if (/\bz\s+siedzib/i.test(text) || /\bprzy\s+ul/i.test(text)) {
      reasons.push('Company name span includes seat/address wording')
    }
    if (/,/.test(text) && people.length >= 1) {
      reasons.push('Company name span mixes trade name with comma-separated people')
    }
    if (entities.includes('address') && entities.includes('company_name')) {
      reasons.push('Span mixes company name and address')
    }
    const max = MAX_LEN.company_name ?? 60
    if (text.length > max && people.length >= 1) {
      reasons.push(`Span longer than ${max} chars with person data`)
    }
    if (text.length > 100) {
      reasons.push('Span is sentence/clause length — not a minimal value')
    }
  }

  if (key === 'company_representative' || key.startsWith('company_representative_')) {
    if (wrappers.length > 0 || /\bz\s+siedzib|pod\s+firm/i.test(text)) {
      reasons.push('Representative span includes company legal wrappers')
    }
  }

  if (input.operation === 'replace' || input.operation == null) {
    // Generic: multiple entity classes in one replace span
    const multi = entities.filter(
      (e) =>
        e === 'person_name' ||
        e === 'address' ||
        e === 'tax_id' ||
        e === 'legal_wrapper',
    )
    if (
      key === 'company_name' &&
      multi.length >= 1 &&
      (entities.includes('person_name') || entities.includes('legal_wrapper'))
    ) {
      // already covered
    }
  }

  const unsafe = reasons.length > 0
  return {
    ok: !unsafe,
    physicalSpanSafety: unsafe ? 'unsafe' : 'safe',
    blockingReasons: reasons,
    detectedEntityTypes: entities,
    legalWrapperTokensInside: wrappers,
    userMessage: unsafe
      ? 'Wykryty fragment zawiera nazwę firmy oraz dodatkowe dane lub treść prawną. Zawęź zakres przed potwierdzeniem.'
      : null,
  }
}

export function buildSlotSafetyReport(
  slot: TemplateSlot,
  extras?: {
    profileResolvable?: boolean | null
    semanticUniqueness?: SlotSafetyReport['semanticUniqueness']
  },
): SlotSafetyReport {
  const sourceText = (slot.originalText ?? slot.exampleText ?? '').trim()
  const validation = validateMinimalSlotSpan({
    registryKey: slot.registryKey ?? '',
    text: sourceText,
    leftAnchor: slot.leftAnchor,
    operation: slot.operation,
  })
  const reviewState: SlotSafetyReport['reviewState'] =
    validation.physicalSpanSafety === 'unsafe'
      ? 'blocked'
      : slot.needsConfirmation
        ? 'needs_review'
        : 'ok'

  const report: SlotSafetyReport = {
    canonicalKey: slot.registryKey ?? slot.id,
    sourceText,
    sourceLength: sourceText.length,
    paragraphIndex: slot.paragraphIndex ?? null,
    startOffset: slot.startOffset ?? null,
    endOffset: slot.endOffset ?? null,
    detectedEntityTypes: validation.detectedEntityTypes,
    legalWrapperTokensInside: validation.legalWrapperTokensInside,
    physicalSpanSafety: validation.physicalSpanSafety,
    semanticUniqueness: extras?.semanticUniqueness ?? 'unknown',
    profileResolvable: extras?.profileResolvable ?? null,
    reviewState,
    blockingReasons: validation.blockingReasons,
  }

  console.info('[contract-slot-safety]', {
    canonicalKey: report.canonicalKey,
    sourceLength: report.sourceLength,
    paragraphIndex: report.paragraphIndex,
    startOffset: report.startOffset,
    endOffset: report.endOffset,
    detectedEntityTypes: report.detectedEntityTypes,
    legalWrapperTokensInside: report.legalWrapperTokensInside,
    physicalSpanSafety: report.physicalSpanSafety,
    semanticUniqueness: report.semanticUniqueness,
    profileResolvable: report.profileResolvable,
    reviewState: report.reviewState,
    blockingReasons: report.blockingReasons,
    // omit full personal sourceText in prod logs — keep length only
  })

  return report
}

export function isSlotPhysicallyUnsafe(slot: TemplateSlot): boolean {
  if (slot.physicalSpanSafety === 'unsafe') return true
  if (!slot.registryKey || !slot.originalText) return false
  if (slot.operation === 'insert') return false
  return !validateMinimalSlotSpan({
    registryKey: slot.registryKey,
    text: slot.originalText,
    operation: slot.operation,
  }).ok
}

export function collectUnsafeBoundSlots(slots: TemplateSlot[]): TemplateSlot[] {
  return slots.filter(
    (s) =>
      s.enabled !== false &&
      s.physicallyBound &&
      s.registryKey &&
      isSlotPhysicallyUnsafe(s),
  )
}
