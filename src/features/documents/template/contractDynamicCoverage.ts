/**
 * Dynamic field coverage audit — inventory vs detected slots.
 * Does NOT create bindings. Diagnostics only.
 */

import { canonicalizeParagraphText } from './canonicalParagraph'
import type { IndexedParagraph } from './extractDocxParagraphs'
import type { TemplateSlot, TemplateSlotMap } from './types'

export type CoverageClass =
  | 'immutable_provider'
  | 'immutable_legal_wording'
  | 'dynamic_client'
  | 'dynamic_wedding'
  | 'dynamic_commercial'
  | 'dynamic_execution'
  | 'uncertain_requires_review'

export type CoverageStatus =
  | 'detected'
  | 'missed'
  | 'immutable'
  | 'empty_placeholder'
  | 'unsupported_location'
  | 'review'
  | 'misclassified'

export type MissReason =
  | 'not_present'
  | 'extraction_failure'
  | 'text_split_across_blocks_runs'
  | 'table_or_text_box_not_analyzed'
  | 'unsupported_wording'
  | 'ambiguous_context'
  | 'confused_with_immutable_provider'
  | 'candidate_rejected_by_span_safety'
  | 'registry_concept_missing'
  | 'alias_missing'
  | 'duplicate_suppression'
  | 'pair_invariant_rejected'
  | 'pdf_analysis_only_limitation'
  | 'misclassified_as_other_key'
  | 'other'

export interface CoverageInventoryItem {
  id: string
  sourceText: string
  /** Redacted preview for production logs. */
  redactedPreview: string
  semanticConcept: string
  expectedKey: string | null
  coverageClass: CoverageClass
  paragraphIndex: number | null
  status: CoverageStatus
  detected: boolean
  safelyBound: boolean
  missReason: MissReason | null
  proposedFixGroup: string | null
  note?: string
}

export interface DynamicCoverageReport {
  sourceFormat: string
  filename?: string
  paragraphCount: number
  nonemptyParagraphCount: number
  characterCount: number
  totalInventoriedValues: number
  detectedDynamicValues: number
  missedDynamicValues: number
  immutableProviderValues: number
  emptyPlaceholders: number
  unsupportedStructures: number
  coveragePercent: number
  items: CoverageInventoryItem[]
  structureNotes: string[]
}

function redact(text: string): string {
  return text
    .replace(/\b\d{11}\b/g, '•••••••••••')
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/gi, '••@••')
    .replace(/\b(?:\+?48\s?)?\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g, '••• ••• •••')
    .slice(0, 80)
}

function findPara(
  paragraphs: IndexedParagraph[],
  re: RegExp,
): { index: number; text: string; match: string } | null {
  for (const p of paragraphs) {
    const text = canonicalizeParagraphText(p.text)
    const m = re.exec(text)
    if (m) return { index: p.index, text, match: m[1] ?? m[0]! }
  }
  return null
}

function slotForKey(slots: TemplateSlot[], key: string): TemplateSlot | undefined {
  return slots.find(
    (s) =>
      s.registryKey === key &&
      s.variableClassification !== 'template_constant' &&
      s.variableClassification !== 'ignored_non_variable' &&
      s.enabled !== false,
  )
}

function anySlotText(slots: TemplateSlot[], needle: string): TemplateSlot | undefined {
  const n = needle.trim().toLocaleLowerCase('pl-PL')
  return slots.find((s) =>
    (s.originalText ?? s.exampleText ?? '')
      .toLocaleLowerCase('pl-PL')
      .includes(n),
  )
}

function isDynamicSlot(s: TemplateSlot): boolean {
  return (
    s.enabled !== false &&
    Boolean(s.registryKey) &&
    s.variableClassification !== 'template_constant' &&
    s.variableClassification !== 'ignored_non_variable'
  )
}

/**
 * Build coverage inventory for a contract analysis result.
 * Heuristic inventory for audit — does not invent bindings.
 */
export function auditContractDynamicCoverage(input: {
  paragraphs: IndexedParagraph[]
  slotMap: TemplateSlotMap
  sourceFormat?: string
  filename?: string
  structureNotes?: string[]
}): DynamicCoverageReport {
  const paragraphs = input.paragraphs
  const slots = input.slotMap.slots
  const joined = paragraphs
    .map((p) => canonicalizeParagraphText(p.text))
    .join('\n')
  const items: CoverageInventoryItem[] = []

  const push = (
    item: Omit<CoverageInventoryItem, 'redactedPreview'> & {
      redactedPreview?: string
    },
  ) => {
    items.push({
      ...item,
      redactedPreview: item.redactedPreview ?? redact(item.sourceText),
    })
  }

  const providerHits: Array<{
    id: string
    re: RegExp
    concept: string
    key: string
  }> = [
    {
      id: 'prov-name',
      re: /pod\s+firm[aą]\s+([A-Za-zĄĆĘŁŃÓŚŹŻ0-9][A-Za-zĄĆĘŁŃÓŚŹŻ0-9 .&'"-]{1,48}?(?:\s+s\.c\.|\s+sp\.\s*z\s*o\.o\.)?)/iu,
      concept: 'company_name',
      key: 'company_name',
    },
    {
      id: 'prov-addr',
      re: /przy\s+(ul\.\s*[^,]{3,60})/iu,
      concept: 'company_address',
      key: 'company_address',
    },
    {
      id: 'prov-nip',
      re: /\bNIP:\s*(\d{10})/i,
      concept: 'company_nip',
      key: 'company_nip',
    },
    {
      id: 'prov-regon',
      re: /\bRegon:\s*(\d{9,14})/i,
      concept: 'company_regon',
      key: 'company_regon',
    },
  ]
  for (const h of providerHits) {
    const hit = findPara(paragraphs, h.re)
    if (!hit) continue
    push({
      id: h.id,
      sourceText: hit.match,
      semanticConcept: h.concept,
      expectedKey: h.key,
      coverageClass: 'immutable_provider',
      paragraphIndex: hit.index,
      status: 'immutable',
      detected: true,
      safelyBound: false,
      missReason: null,
      proposedFixGroup: null,
      note: 'Provider template text — correctly immutable by default',
    })
  }

  const bride = findPara(
    paragraphs,
    /Panna\s+Młoda:\s*([A-ZĄĆĘŁŃÓŚŹŻ][^\n,]{2,60})/u,
  )
  const groom = findPara(
    paragraphs,
    /(?:\d+\.)?\s*Pan\s+Młody:\s*([A-ZĄĆĘŁŃÓŚŹŻ][^\n,]{2,60})/u,
  )
  const brideAddr = findPara(
    paragraphs,
    /adres\s+zamieszkania:\s*((?:ul\.|al\.)[^,\n]+,\s*\d{2}-\d{3}\s+[A-ZĄĆĘŁŃÓŚŹŻ][^\n]*)/iu,
  )
  const groomAddr =
    groom != null
      ? findPara(
          paragraphs.filter((p) => p.index >= groom.index),
          /adres\s+zamieszkania:\s*((?:ul\.|al\.)[^,\n]+,\s*\d{2}-\d{3}\s+[A-ZĄĆĘŁŃÓŚŹŻ][^\n]*)/iu,
        )
      : null
  const bridePesel = bride
    ? findPara(
        paragraphs.filter((p) => p.index >= bride.index),
        /PESEL:\s*(\d{11})/,
      )
    : null
  const planner = findPara(
    paragraphs,
    /reprezentowana\s+jest\s+przez:\s*\n?([^\n]{5,120})/i,
  )

  const clientDefs: Array<{
    id: string
    hit: ReturnType<typeof findPara>
    concept: string
    key: string
    reason: MissReason
    fix: string
  }> = [
    {
      id: 'client-bride',
      hit: bride,
      concept: 'partner1_full_name / bride',
      key: 'partner1_full_name',
      reason: 'unsupported_wording',
      fix: 'client-party-aliases',
    },
    {
      id: 'client-groom',
      hit: groom,
      concept: 'partner2_full_name / groom',
      key: 'partner2_full_name',
      reason: 'unsupported_wording',
      fix: 'client-party-aliases',
    },
    {
      id: 'client-addr',
      hit: brideAddr,
      concept: 'client address',
      key: 'bride_address',
      reason: 'unsupported_wording',
      fix: 'client-party-aliases',
    },
    {
      id: 'client-addr-groom',
      hit: groomAddr,
      concept: 'partner2 address',
      key: 'groom_address',
      reason: 'unsupported_wording',
      fix: 'client-party-aliases',
    },
    {
      id: 'client-pesel',
      hit: bridePesel,
      concept: 'client PESEL',
      key: 'bride_pesel',
      reason: 'unsupported_wording',
      fix: 'client-party-aliases',
    },
  ]

  for (const d of clientDefs) {
    if (!d.hit) continue
    const slot = slotForKey(slots, d.key)
    const detected = Boolean(slot)
    push({
      id: d.id,
      sourceText: d.hit.match.trim(),
      semanticConcept: d.concept,
      expectedKey: d.key,
      coverageClass: 'dynamic_client',
      paragraphIndex: d.hit.index,
      status: detected ? 'detected' : 'missed',
      detected,
      safelyBound: Boolean(slot?.physicallyBound),
      missReason: detected ? null : d.reason,
      proposedFixGroup: detected ? null : d.fix,
      note: detected
        ? undefined
        : 'Labeled “Panna Młoda:” / “Pan Młody:” — detector only handles “Name i Name, zwaną dalej Parą Młodą”',
    })
  }

  const dottedContact = findPara(paragraphs, /telefon:\s*([^\n]{10,120})/i)
  if (dottedContact) {
    const phoneSlot = slotForKey(slots, 'bride_phone')
    const emailSlot = slotForKey(slots, 'bride_email')
    const placeholderSeen =
      (phoneSlot && !(phoneSlot.originalText ?? '').trim()) ||
      (emailSlot && !(emailSlot.originalText ?? '').trim()) ||
      /placeholder|obfuscat|puste|zamazane/i.test(
        `${phoneSlot?.detectionReason ?? ''} ${emailSlot?.detectionReason ?? ''}`,
      )
    push({
      id: 'client-contact-dotted',
      sourceText: dottedContact.match,
      semanticConcept: 'bride_phone / bride_email (obfuscated)',
      expectedKey: 'bride_phone',
      coverageClass: 'uncertain_requires_review',
      paragraphIndex: dottedContact.index,
      status: 'empty_placeholder',
      detected: placeholderSeen,
      safelyBound: false,
      missReason: placeholderSeen ? null : 'unsupported_wording',
      proposedFixGroup: placeholderSeen ? null : 'placeholder-detection',
      note: placeholderSeen
        ? 'Contact placeholder recognized — not safely bindable without a real value'
        : 'Contact written with spaced dots — not a plain phone/email value',
    })
  }

  if (planner) {
    push({
      id: 'client-planner',
      sourceText: planner.match.trim().slice(0, 100),
      semanticConcept: 'wedding planner / representative',
      expectedKey: null,
      coverageClass: 'uncertain_requires_review',
      paragraphIndex: planner.index,
      status: 'review',
      detected: false,
      safelyBound: false,
      missReason: 'registry_concept_missing',
      proposedFixGroup: 'registry-additions',
      note: 'Planner present; no canonical wedding_planner key',
    })
  }

  const wedDate = findPara(
    paragraphs,
    /odbęd[aą]\s+się\s+w\s+dniu\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  )
  const location = findPara(
    paragraphs,
    /przygotowania,\s*ceremonia,\s*przyjęcie:\s*([^\n]{5,80})/i,
  )
  const hours = findPara(paragraphs, /nie\s+przekracza\s+(\d+)\s+godzin/i)
  const clock = findPara(
    paragraphs,
    /\(od\s+(\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2})\)/i,
  )
  const operators = findPara(
    paragraphs,
    /Liczba\s+osób\s+wykonujących[^:]*:\s*(\d+\s+operator[oó]w[^\n]*)/i,
  )
  const filmMins = findPara(
    paragraphs,
    /czasie\s+trwania\s+do\s+(\d+\s+minut)/i,
  )

  const wedSlot = slotForKey(slots, 'wedding_date')
  if (wedDate) {
    push({
      id: 'wed-date',
      sourceText: wedDate.match,
      semanticConcept: 'wedding_date',
      expectedKey: 'wedding_date',
      coverageClass: 'dynamic_wedding',
      paragraphIndex: wedDate.index,
      status: wedSlot ? 'detected' : 'missed',
      detected: Boolean(wedSlot),
      safelyBound: Boolean(wedSlot?.physicallyBound),
      missReason: null,
      proposedFixGroup: null,
    })
  }
  if (location) {
    const locSlot =
      slotForKey(slots, 'reception_location') ||
      slotForKey(slots, 'ceremony_location') ||
      anySlotText(slots, location.match)
    push({
      id: 'wed-loc',
      sourceText: location.match.trim(),
      semanticConcept: 'prep/ceremony/reception location (combined)',
      expectedKey: 'reception_location',
      coverageClass: 'dynamic_wedding',
      paragraphIndex: location.index,
      status: locSlot ? 'detected' : 'missed',
      detected: Boolean(locSlot),
      safelyBound: Boolean(locSlot?.physicallyBound),
      missReason: locSlot ? null : 'unsupported_wording',
      proposedFixGroup: locSlot ? null : 'context-classification',
      note: 'Single line lists przygotowania, ceremonia, przyjęcie: VENUE',
    })
  }
  if (hours) {
    const hSlot = slotForKey(slots, 'coverage_hours')
    push({
      id: 'wed-hours',
      sourceText: hours.match,
      semanticConcept: 'coverage_hours',
      expectedKey: 'coverage_hours',
      coverageClass: 'dynamic_wedding',
      paragraphIndex: hours.index,
      status: hSlot ? 'detected' : 'missed',
      detected: Boolean(hSlot),
      safelyBound: Boolean(hSlot?.physicallyBound),
      missReason: null,
      proposedFixGroup: null,
    })
  }
  if (clock) {
    push({
      id: 'wed-clock',
      sourceText: clock.match,
      semanticConcept: 'coverage start–end time',
      expectedKey: 'coverage_end_time',
      coverageClass: 'dynamic_wedding',
      paragraphIndex: clock.index,
      status: 'missed',
      detected: false,
      safelyBound: false,
      missReason: 'unsupported_wording',
      proposedFixGroup: 'context-classification',
      note: 'Range “12:00 - 23:00” not split into start/end slots',
    })
  }
  if (operators) {
    push({
      id: 'wed-ops',
      sourceText: operators.match.trim(),
      semanticConcept: 'crew / operators count',
      expectedKey: 'videographers_count',
      coverageClass: 'dynamic_wedding',
      paragraphIndex: operators.index,
      status: 'missed',
      detected: false,
      safelyBound: false,
      missReason: 'unsupported_wording',
      proposedFixGroup: 'context-classification',
    })
  }
  if (filmMins) {
    push({
      id: 'wed-film-len',
      sourceText: filmMins.match,
      semanticConcept: 'film_duration',
      expectedKey: 'film_duration',
      coverageClass: 'dynamic_commercial',
      paragraphIndex: filmMins.index,
      status: 'missed',
      detected: false,
      safelyBound: false,
      missReason: 'unsupported_wording',
      proposedFixGroup: 'context-classification',
    })
  }

  const total = findPara(paragraphs, /wynosi:\s*([\d\s]+zł)/i)
  const rata1 = findPara(
    paragraphs,
    /pierwsza\s+rata\s+w\s+wysokości\s*([\d\s]+zł)/i,
  )
  const rata3 = findPara(
    paragraphs,
    /trzecia\s+rata\s+w\s+wysokości\s*([\d\s]+zł)/i,
  )
  const overtime = findPara(
    paragraphs,
    /dodatkow[aą]\s+rozpoczęt[aą]\s+godzin[eę].*?kwota\s+([\d\s]+zł)/i,
  )
  const penalty = findPara(
    paragraphs,
    /50%\s+ustalonego\s+wynagrodzenia,\s*tj\.\s*([\d\s]+zł)/i,
  )
  const delivery = findPara(
    paragraphs,
    /w\s+terminie\s+(do\s+\d+\s+dni\s+roboczych[^.]*)/i,
  )
  const iban = findPara(
    paragraphs,
    /\b(\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4})\b/,
  )

  const valueSlot = slotForKey(slots, 'contract_value_formatted')
  if (total) {
    const matched =
      valueSlot &&
      (valueSlot.originalText ?? '')
        .replace(/\s/g, '')
        .includes(total.match.replace(/\s/g, '').replace(/zł/i, ''))
    push({
      id: 'com-total',
      sourceText: total.match.trim(),
      semanticConcept: 'contract total remuneration',
      expectedKey: 'contract_value_formatted',
      coverageClass: 'dynamic_commercial',
      paragraphIndex: total.index,
      status: matched ? 'detected' : valueSlot ? 'misclassified' : 'missed',
      detected: Boolean(matched),
      safelyBound: Boolean(matched && valueSlot?.physicallyBound),
      missReason: matched
        ? null
        : valueSlot
          ? 'misclassified_as_other_key'
          : 'ambiguous_context',
      proposedFixGroup: 'context-classification',
      note: valueSlot
        ? `Detected money slot bound to “${valueSlot.originalText}” instead of total “${total.match.trim()}”`
        : undefined,
    })
  }
  if (overtime) {
    const otSlot =
      slotForKey(slots, 'overtime_rate') ||
      slotForKey(slots, 'overtime_rate_formatted')
    const otMatched =
      otSlot &&
      (otSlot.originalText ?? '')
        .replace(/\s/g, '')
        .includes(overtime.match.replace(/\s/g, '').replace(/zł/i, ''))
    const otIsValue =
      valueSlot &&
      (valueSlot.originalText ?? '').includes(
        overtime.match.replace(/\s+/g, ' ').trim(),
      )
    push({
      id: 'com-overtime',
      sourceText: overtime.match.trim(),
      semanticConcept: 'overtime_rate',
      expectedKey: 'overtime_rate',
      coverageClass: 'dynamic_commercial',
      paragraphIndex: overtime.index,
      status: otMatched
        ? 'detected'
        : otIsValue
          ? 'misclassified'
          : 'missed',
      detected: Boolean(otMatched),
      safelyBound: Boolean(otMatched && otSlot?.physicallyBound),
      missReason: otMatched
        ? null
        : otIsValue
          ? 'misclassified_as_other_key'
          : 'ambiguous_context',
      proposedFixGroup: otMatched ? null : 'context-classification',
      note: otIsValue
        ? 'Overtime amount was classified as contract_value_formatted'
        : undefined,
    })
  }
  for (const [id, hit, concept, key] of [
    ['com-rata1', rata1, 'first installment', 'agreed_deposit_formatted'],
    ['com-rata3', rata3, 'final installment', 'remaining_after_deposit_formatted'],
    ['com-penalty', penalty, 'cancellation penalty amount', null],
  ] as const) {
    if (!hit) continue
    const slot = key ? slotForKey(slots, key) : undefined
    push({
      id,
      sourceText: hit.match.trim(),
      semanticConcept: concept,
      expectedKey: key,
      coverageClass: 'dynamic_commercial',
      paragraphIndex: hit.index,
      status: slot ? 'detected' : 'missed',
      detected: Boolean(slot),
      safelyBound: Boolean(slot?.physicallyBound),
      missReason: slot
        ? null
        : key
          ? 'unsupported_wording'
          : 'registry_concept_missing',
      proposedFixGroup: key ? 'context-classification' : 'registry-additions',
      note: 'No słownie (words) side present for money pairs in this contract',
    })
  }
  if (delivery) {
    const dSlot = slotForKey(slots, 'delivery_term_text')
    push({
      id: 'com-delivery',
      sourceText: delivery.match.trim(),
      semanticConcept: 'delivery_term_text',
      expectedKey: 'delivery_term_text',
      coverageClass: 'dynamic_commercial',
      paragraphIndex: delivery.index,
      status: dSlot ? 'detected' : 'missed',
      detected: Boolean(dSlot),
      safelyBound: Boolean(dSlot?.physicallyBound),
      missReason: null,
      proposedFixGroup: null,
    })
  }
  if (iban) {
    push({
      id: 'com-iban',
      sourceText: iban.match,
      semanticConcept: 'company_bank_account',
      expectedKey: 'company_bank_account',
      coverageClass: 'immutable_provider',
      paragraphIndex: iban.index,
      status: 'immutable',
      detected: true,
      safelyBound: false,
      missReason: null,
      proposedFixGroup: null,
      note: 'Studio bank account — immutable unless user links',
    })
  }

  const execDate = findPara(
    paragraphs,
    /zawarta\s+w\s+dniu\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  )
  const execCity = findPara(
    paragraphs,
    /zawarta\s+w\s+dniu\s+\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*r\.?\s+w\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż\-]+)/u,
  )
  const edSlot = slotForKey(slots, 'contract_execution_date')
  if (execDate) {
    push({
      id: 'exec-date',
      sourceText: execDate.match,
      semanticConcept: 'contract_execution_date',
      expectedKey: 'contract_execution_date',
      coverageClass: 'dynamic_execution',
      paragraphIndex: execDate.index,
      status: edSlot ? 'detected' : 'missed',
      detected: Boolean(edSlot),
      safelyBound: Boolean(edSlot?.physicallyBound),
      missReason: null,
      proposedFixGroup: null,
    })
  }
  if (execCity) {
    const cityDyn = slotForKey(slots, 'company_city_locative')
    const cityImm = slots.find(
      (s) =>
        s.registryKey === 'company_city_locative' &&
        (s.variableClassification === 'template_constant' ||
          s.variableClassification === 'ignored_non_variable'),
    )
    push({
      id: 'exec-city',
      sourceText: execCity.match,
      semanticConcept: 'contract execution city (locative)',
      expectedKey: 'company_city_locative',
      coverageClass: 'dynamic_execution',
      paragraphIndex: execCity.index,
      status: cityDyn ? 'detected' : cityImm ? 'misclassified' : 'missed',
      detected: Boolean(cityDyn),
      safelyBound: Boolean(cityDyn?.physicallyBound),
      missReason: cityDyn
        ? null
        : cityImm
          ? 'confused_with_immutable_provider'
          : 'unsupported_wording',
      proposedFixGroup: 'context-classification',
      note: 'Opening “zawarta w dniu DATE r. w CITY” — city missed or folded into provider seat',
    })
  }

  const dots = findPara(paragraphs, /(…{3,}|\.{5,}|_{5,}|–{10,}|—{5,})/)
  if (dots) {
    push({
      id: 'ph-dots',
      sourceText: dots.match.slice(0, 40),
      semanticConcept: 'blank underline / dotted line',
      expectedKey: null,
      coverageClass: 'uncertain_requires_review',
      paragraphIndex: dots.index,
      status: 'empty_placeholder',
      detected: false,
      safelyBound: false,
      missReason: 'other',
      proposedFixGroup: 'placeholder-detection',
      note: 'Decorative/blank lines present; no DOCX content-control fields found',
    })
  }

  const dynamicLikely = items.filter((i) =>
    i.coverageClass.startsWith('dynamic_'),
  )
  const detectedDynamic = dynamicLikely.filter((i) => i.status === 'detected')
  const missedDynamic = dynamicLikely.filter(
    (i) => i.status === 'missed' || i.status === 'misclassified',
  )
  const immutableCount = items.filter((i) => i.status === 'immutable').length
  const emptyCount = items.filter((i) => i.status === 'empty_placeholder')
    .length
  const unsupported = items.filter(
    (i) => i.status === 'unsupported_location',
  ).length

  const coveragePercent =
    dynamicLikely.length === 0
      ? 100
      : Math.round((detectedDynamic.length / dynamicLikely.length) * 100)

  const report: DynamicCoverageReport = {
    sourceFormat: input.sourceFormat ?? input.slotMap.sourceKind ?? 'unknown',
    filename: input.filename,
    paragraphCount: paragraphs.length,
    nonemptyParagraphCount: paragraphs.filter((p) => p.text.trim()).length,
    characterCount: joined.length,
    totalInventoriedValues: items.length,
    detectedDynamicValues: detectedDynamic.length,
    missedDynamicValues: missedDynamic.length,
    immutableProviderValues: immutableCount,
    emptyPlaceholders: emptyCount,
    unsupportedStructures: unsupported,
    coveragePercent,
    items,
    structureNotes: input.structureNotes ?? [],
  }

  console.info('[contract-dynamic-coverage]', {
    sourceFormat: report.sourceFormat,
    filename: report.filename,
    totalInventoriedValues: report.totalInventoriedValues,
    detectedDynamicValues: report.detectedDynamicValues,
    missedDynamicValues: report.missedDynamicValues,
    immutableProviderValues: report.immutableProviderValues,
    emptyPlaceholders: report.emptyPlaceholders,
    unsupportedStructures: report.unsupportedStructures,
    coveragePercent: report.coveragePercent,
  })
  for (const m of missedDynamic) {
    console.info('[contract-dynamic-coverage] missed', {
      sourceText: m.redactedPreview,
      location: m.paragraphIndex,
      expectedKey: m.expectedKey,
      missReason: m.missReason,
      proposedFixGroup: m.proposedFixGroup,
    })
  }

  return report
}

export function countDynamicSlots(slots: TemplateSlot[]): number {
  return slots.filter(isDynamicSlot).length
}
