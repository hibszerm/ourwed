/**
 * Build WeddingBriefPdfData — derived operational field guide (not a questionnaire dump).
 */

import {
  buildDayTimelineSummary,
  formatAnswerValueForDisplay,
  timelineTimesByRole,
} from '@/features/prewedding/answerSummary'
import {
  buildOperationalDayStops,
  vendorNamesEqual,
  type OperationalTimeMap,
} from '@/features/wedding-day/operationalDayPlan'
import { buildBriefTimelineWithTravel } from '@/features/wedding-brief/attachBriefPlanDayTravel'
import {
  answerToGeoPlace,
  formatLocationAnswerDisplay,
} from '@/features/prewedding/preweddingLocation'
import {
  BRIEF_QUESTION_RULES,
  isAdminOnlyRule,
  resolveBriefFieldRule,
  type BriefFieldRule,
} from '@/features/wedding-brief/briefFieldRegistry'
import { buildQuestionnaireBriefSections } from '@/features/wedding-brief/buildQuestionnaireBriefSections'
import {
  distinctPlaceAndAddress,
  isPresentationNoValue,
  normalizeBriefTime,
  normalizeBriefTimeInText,
  normalizeBriefWhitespace,
  textsSemanticallyEqual,
} from '@/features/wedding-brief/briefNormalize'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import type {
  BriefContact,
  BriefLocation,
  BriefNote,
  BriefOperationalItem,
  BriefSession,
  BriefTimelineItem,
  BriefVendor,
  WeddingBriefPdfData,
} from '@/features/wedding-brief/types'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatDate } from '@/lib/utils/dates'
import type { FormAnswerJson } from '@/types/formEngine'
import type { FormInstanceOptionsSnapshot } from '@/types/contractQuestionnaire'
import type {
  PreWeddingQuestion,
  PreWeddingTemplateSchema,
} from '@/types/preweddingQuestionnaire'
import type { Session } from '@/types/session'
import type { TravelSegment, WeddingPlace } from '@/types/travel'
import type { Wedding, WeddingContact, WeddingNote } from '@/types/wedding'
import type { WeddingExtraService } from '@/types/package'

const PLACE_ROLE_LABELS: Record<string, string> = {
  bride_preparation: 'Przygotowania Panny Młodej',
  groom_preparation: 'Przygotowania Pana Młodego',
  ceremony: 'Ceremonia',
  reception: 'Przyjęcie',
  hotel: 'Nocleg',
  airport: 'Lotnisko',
  other: 'Inne miejsce',
  preparation: 'Przygotowania',
}

export type BuildWeddingBriefPdfDataInput = {
  wedding: Wedding
  places?: WeddingPlace[]
  contacts?: WeddingContact[]
  extras?: WeddingExtraService[]
  sessions?: Session[]
  preWedding?: {
    title?: string
    submittedAt?: string | null
    schema: PreWeddingTemplateSchema
    answers: Record<string, unknown>
  } | null
  /** Kept for API compatibility; contract dump is not shown in the field brief. */
  contractAnswers?: {
    answerJson: FormAnswerJson
    optionsSnapshot?: FormInstanceOptionsSnapshot | null
  } | null
  generatedAt?: Date
  timezone?: string
  /** Studio-persisted operational times (stop_key → HH:MM). */
  operationalTimes?: OperationalTimeMap
  /**
   * Cached travel_segments only (read-only). Never pass freshly calculated routes
   * that would require a provider call during Brief generation.
   */
  travelSegments?: TravelSegment[]
}

type AnswerHit = {
  questionId: string
  question: PreWeddingQuestion
  displayValue: string
  rule: BriefFieldRule
}

function daysUntil(dateStr: string, now: Date): number | undefined {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return undefined
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

function formatGeneratedAt(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      timeZone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return d.toISOString()
  }
}

function allQuestions(schema: PreWeddingTemplateSchema): PreWeddingQuestion[] {
  return schema.sections.flatMap((s) => s.questions)
}

function isAnswered(q: PreWeddingQuestion, value: unknown): boolean {
  if (q.type === 'information') return false
  if (value == null) return false
  if (typeof value === 'string') return normalizeBriefWhitespace(value).length > 0
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    return Boolean(
      (typeof o.formattedAddress === 'string' && o.formattedAddress.trim()) ||
        (typeof o.label === 'string' && o.label.trim()) ||
        (typeof o.address === 'string' && o.address.trim()),
    )
  }
  return false
}

function collectAnswerHits(
  preWedding: NonNullable<BuildWeddingBriefPdfDataInput['preWedding']>,
): AnswerHit[] {
  const hits: AnswerHit[] = []
  for (const q of allQuestions(preWedding.schema)) {
    const raw = preWedding.answers[q.id]
    if (!isAnswered(q, raw)) continue
    let displayValue = normalizeBriefWhitespace(
      formatAnswerValueForDisplay(q, raw),
    )
    if (!displayValue && q.type !== 'acknowledgement') continue
    if (q.type !== 'address') {
      displayValue = normalizeBriefTimeInText(displayValue)
    }
    let rule = resolveBriefFieldRule({
      questionId: q.id,
      mapping: q.weddingDayMapping,
      questionType: q.type,
    })
    if (
      isPresentationNoValue({
        displayValue,
        questionType: q.type,
        mapping: q.weddingDayMapping,
        questionId: q.id,
      })
    ) {
      rule = { ...rule, destination: 'omit', briefLabel: rule.briefLabel }
    }
    // Prefer concise registry label over verbose prompt.
    const briefLabel =
      rule.briefLabel && rule.briefLabel !== 'Dodatkowa informacja'
        ? rule.briefLabel
        : normalizeBriefWhitespace(q.label).slice(0, 80) || rule.briefLabel
    hits.push({
      questionId: q.id,
      question: q,
      displayValue,
      rule: { ...rule, briefLabel },
    })
  }
  return hits
}

function parseScheduleFromText(text: string): BriefTimelineItem[] {
  const items: BriefTimelineItem[] = []
  const parts = text.split(/[·•|]|\n/).map((p) => p.trim()).filter(Boolean)
  for (const part of parts) {
    const m = part.match(/^(\d{1,2}[.:]\d{2})\s+(.+)$/i)
    if (!m) continue
    items.push({
      time: normalizeBriefTime(m[1]!),
      title: normalizeBriefWhitespace(m[2]!),
    })
  }
  return items
}

function enrichTimelineWithPlaces(
  items: BriefTimelineItem[],
  places: WeddingPlace[],
): BriefTimelineItem[] {
  return items.map((item) => {
    const title = item.title.toLowerCase()
    const placeHint = places.find((p) => {
      if (title.includes('ceremon') && p.role === 'ceremony') return true
      if (
        (title.includes('sal') ||
          title.includes('przyję') ||
          title.includes('obiad') ||
          title.includes('taniec') ||
          title.includes('tort')) &&
        p.role === 'reception'
      )
        return true
      if (title.includes('pann') && p.role === 'bride_preparation') return true
      if (
        (title.includes('pana') || title.includes('pan m')) &&
        p.role === 'groom_preparation'
      )
        return true
      return false
    })
    const placeName = placeHint?.label || item.placeName
    const address = placeHint?.formattedAddress || item.shortAddress
    const distinct = distinctPlaceAndAddress(placeName, address)
    return {
      ...item,
      placeName: distinct.placeName,
      shortAddress: distinct.shortAddress,
    }
  })
}

function buildTimeline(
  preWedding: BuildWeddingBriefPdfDataInput['preWedding'],
  places: WeddingPlace[],
  hits: AnswerHit[],
  operationalTimes: OperationalTimeMap,
  travelSegments: TravelSegment[] = [],
  weddingCeremonyTime?: string | null,
): BriefTimelineItem[] {
  if (places.length > 0) {
    const qTimes = preWedding
      ? timelineTimesByRole(preWedding.schema, preWedding.answers)
      : {}
    const ops = buildOperationalDayStops({
      studio: null,
      places,
      operationalTimes,
      questionnaireTimes: qTimes,
      weddingCeremonyTime,
    })
    const items = buildBriefTimelineWithTravel({
      stops: ops,
      places,
      segments: travelSegments,
    })
    if (items.length > 0) {
      return enrichTimelineWithPlaces(items, places)
    }
  }

  const scheduleHit = hits.find((h) => h.questionId === 'q20')
  if (scheduleHit) {
    const parsed = parseScheduleFromText(scheduleHit.displayValue)
    if (parsed.length >= 3) {
      return enrichTimelineWithPlaces(parsed, places)
    }
  }

  if (!preWedding) return []

  const items: BriefTimelineItem[] = []

  const groomDep = hits.find(
    (h) => h.question.weddingDayMapping === 'groomDepartureNote',
  )
  if (groomDep) {
    const asTime = normalizeBriefTime(groomDep.displayValue)
    if (/^\d{2}:\d{2}$/.test(asTime)) {
      items.push({
        time: asTime,
        title: 'Wyjazd Pana Młodego',
      })
    }
  }

  const departure = hits.find(
    (h) => h.question.weddingDayMapping === 'departureToCeremonyTime',
  )
  if (departure) {
    items.push({
      time: normalizeBriefTime(departure.displayValue),
      title: 'Wyjazd do ceremonii',
    })
  }

  const stops = buildDayTimelineSummary(preWedding.schema, preWedding.answers)
  for (const s of stops) {
    const time = s.time ? normalizeBriefTime(String(s.time)) : ''
    const placeName = s.place?.label || undefined
    const address =
      s.place?.formattedAddress ||
      (s.location && !s.place ? s.location : undefined)
    const distinct = distinctPlaceAndAddress(
      placeName,
      address ||
        (s.location && s.location !== placeName ? s.location : undefined),
    )
    items.push({
      time,
      title: s.label,
      placeName: distinct.placeName,
      shortAddress: distinct.shortAddress,
      untimed: !time,
    })
  }

  const seen = new Set<string>()
  const unique = items.filter((i) => {
    const k = `${i.time}|${i.title}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return enrichTimelineWithPlaces(unique, places)
}

type LocDraft = BriefLocation & {
  placeId?: string | null
}

function placeDraftsMatch(a: LocDraft, b: LocDraft): boolean {
  const aId = (a.placeId || '').trim().toLowerCase()
  const bId = (b.placeId || '').trim().toLowerCase()
  if (aId && bId && aId === bId) return true
  if (
    typeof a.latitude === 'number' &&
    typeof a.longitude === 'number' &&
    typeof b.latitude === 'number' &&
    typeof b.longitude === 'number' &&
    Number.isFinite(a.latitude) &&
    Number.isFinite(a.longitude) &&
    Number.isFinite(b.latitude) &&
    Number.isFinite(b.longitude) &&
    Math.abs(a.latitude - b.latitude) < 0.00005 &&
    Math.abs(a.longitude - b.longitude) < 0.00005
  ) {
    return true
  }
  const addrA = normalizeBriefWhitespace(a.address || '').toLowerCase()
  const addrB = normalizeBriefWhitespace(b.address || '').toLowerCase()
  if (addrA && addrB && addrA === addrB) return true
  const nameA = normalizeBriefWhitespace(a.name || '').toLowerCase()
  const nameB = normalizeBriefWhitespace(b.name || '').toLowerCase()
  if (nameA && nameB && addrA && addrB && nameA === nameB && addrA === addrB) {
    return true
  }
  return false
}

function mergeLocations(
  places: WeddingPlace[],
  wedding: Wedding,
  hits: AnswerHit[],
  preWedding: BuildWeddingBriefPdfDataInput['preWedding'],
): BriefLocation[] {
  const drafts: LocDraft[] = []

  function upsert(input: {
    role: string
    name?: string
    address: string
    latitude?: number | null
    longitude?: number | null
    placeId?: string | null
  }) {
    const address = normalizeBriefWhitespace(input.address)
    const formatted = distinctPlaceAndAddress(
      input.name ? normalizeBriefWhitespace(input.name) : undefined,
      address || undefined,
    )
    const name = formatted.placeName
    const addr = formatted.shortAddress || address || name || ''
    if (!addr && !name) return

    const candidate: LocDraft = {
      roles: [input.role],
      name: name && name !== addr ? name : name,
      address: addr,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      placeId: input.placeId ?? null,
    }

    const existing = drafts.find((d) => placeDraftsMatch(d, candidate))
    if (existing) {
      if (!existing.roles.includes(input.role)) existing.roles.push(input.role)
      if (!existing.name && name && name !== existing.address) existing.name = name
      if (name && !existing.name) existing.name = name
      if (!existing.address && addr) existing.address = addr
      if (!existing.placeId && input.placeId) existing.placeId = input.placeId
      if (existing.latitude == null && input.latitude != null) {
        existing.latitude = input.latitude
      }
      if (existing.longitude == null && input.longitude != null) {
        existing.longitude = input.longitude
      }
      return
    }

    drafts.push(candidate)
  }

  function roleAlreadyPresent(role: string): boolean {
    return drafts.some((d) => d.roles.includes(role))
  }

  // 1) Current WeddingPlace rows win for canonical roles.
  for (const p of places) {
    const address = (p.formattedAddress || '').trim()
    const label = (p.label || '').trim()
    if (!address && !label) continue
    const role = PLACE_ROLE_LABELS[p.role] ?? p.role
    upsert({
      role,
      name: label || undefined,
      address: address || label,
      latitude: p.latitude,
      longitude: p.longitude,
      placeId: p.placeId,
    })
  }

  // 2) Questionnaire locations only when that role has no current WeddingPlace.
  if (preWedding) {
    for (const hit of hits) {
      if (hit.rule.destination !== 'locations') continue
      const role = hit.rule.briefLabel
      if (roleAlreadyPresent(role)) continue
      const raw = preWedding.answers[hit.questionId]
      const geo = answerToGeoPlace(raw as never)
      const address =
        geo?.formattedAddress?.trim() ||
        (typeof raw === 'string' ? raw.trim() : '') ||
        hit.displayValue
      const qName = geo?.label?.trim() || undefined
      upsert({
        role,
        name: qName,
        address: address || qName || '',
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
        placeId: geo?.placeId,
      })
    }
  }

  // 3) Legacy wedding string fields only when nothing else provided.
  if (drafts.length === 0) {
    const legacy: Array<[string, string | undefined]> = [
      ['Przygotowania Panny Młodej', wedding.bridePreparationLocation],
      ['Przygotowania Pana Młodego', wedding.groomPreparationLocation],
      ['Ceremonia', wedding.ceremonyLocation],
      ['Przyjęcie', wedding.receptionLocation],
    ]
    for (const [role, address] of legacy) {
      if (address?.trim()) upsert({ role, address: address.trim() })
    }
  }

  return drafts
    .map((d) => ({
      roles: d.roles,
      name: d.name,
      address: d.address,
      latitude: d.latitude,
      longitude: d.longitude,
      note: d.note,
    }))
    .filter((l) => l.address || l.name)
}

function buildContacts(
  wedding: Wedding,
  weddingContacts: WeddingContact[],
  hits: AnswerHit[],
): BriefContact[] {
  const byRole = new Map<string, BriefContact>()

  const brideNameHit = hits.find((h) => h.question.weddingDayMapping === 'brideName')
  const bridePhoneHit = hits.find(
    (h) => h.question.weddingDayMapping === 'bridePhone',
  )
  const groomNameHit = hits.find((h) => h.question.weddingDayMapping === 'groomName')
  const groomPhoneHit = hits.find(
    (h) => h.question.weddingDayMapping === 'groomPhone',
  )

  const couple = wedding.couple
  const brideName =
    [couple.partner1FirstName, couple.partner1LastName]
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(' ') ||
    couple.partner1?.trim() ||
    brideNameHit?.displayValue ||
    ''
  const bridePhone =
    couple.partner1Phone?.trim() ||
    couple.phone?.trim() ||
    bridePhoneHit?.displayValue ||
    undefined
  const groomName =
    [couple.partner2FirstName, couple.partner2LastName]
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(' ') ||
    couple.partner2?.trim() ||
    groomNameHit?.displayValue ||
    ''
  const groomPhone =
    couple.partner2Phone?.trim() || groomPhoneHit?.displayValue || undefined

  // Current canonical couple wins; questionnaire fills gaps only.
  if (brideName || bridePhone) {
    byRole.set('Panna Młoda', {
      role: 'Panna Młoda',
      name: brideName || 'Panna Młoda',
      phone: bridePhone,
    })
  }
  if (groomName || groomPhone) {
    byRole.set('Pan Młody', {
      role: 'Pan Młody',
      name: groomName || 'Pan Młody',
      phone: groomPhone,
    })
  }

  for (const c of weddingContacts) {
    const role = c.role?.trim() || 'Kontakt'
    const name = c.name.trim()
    if (!name) continue
    const phone = c.phone?.trim() || undefined
    const existing = byRole.get(role)
    if (existing) {
      if (!existing.phone && phone) existing.phone = phone
      if (!existing.email && c.email?.trim()) existing.email = c.email.trim()
      continue
    }
    const dupPhone = [...byRole.values()].some(
      (x) =>
        x.phone &&
        phone &&
        x.phone.replace(/\s/g, '') === phone.replace(/\s/g, ''),
    )
    if (dupPhone) continue
    byRole.set(role, {
      role,
      name,
      phone,
      email: c.email?.trim() || undefined,
    })
  }

  const preferredOrder = ['Panna Młoda', 'Pan Młody']
  const ordered: BriefContact[] = []
  for (const r of preferredOrder) {
    const c = byRole.get(r)
    if (c) ordered.push(c)
  }
  for (const [role, c] of byRole) {
    if (!preferredOrder.includes(role)) ordered.push(c)
  }
  return ordered.filter((c) => c.phone || c.email || c.name)
}

function isCriticalStudioNote(content: string): boolean {
  const t = content.trim().toLowerCase()
  return (
    t.startsWith('ważne') ||
    t.includes('nie organizować') ||
    t.includes('nie bierze udziału') ||
    t.includes('uwaga')
  )
}

function isUnusualBlessing(value: string): boolean {
  const t = value.toLowerCase()
  if (/^nie(\s|$)/i.test(t) && t.length < 12) return false
  if (/nie będzie|nie uwiecznia|nie nagryw|brak błogosław/i.test(t)) return false
  return (
    /osobn|osobno|tak|ważn|uwaga|nie razem|osobne błogosław/i.test(t) ||
    t.length > 24
  )
}

/** Shoot-day alert copy — never truncates FAMILY_SENSITIVITY. */
function conciseCriticalAlert(
  content: string,
  opts: { mapping?: string; classification?: string },
): string {
  const c = normalizeBriefWhitespace(content)
  if (
    opts.classification === 'FAMILY_SENSITIVITY' ||
    opts.mapping === 'sensitiveFamilyNotes'
  ) {
    return c
  }
  if (c.length <= 100) return c
  const sentence = c.match(/^(.{20,100}?[.!?])(\s|$)/)
  if (sentence?.[1]) return sentence[1]
  return `${c.slice(0, 97).trimEnd()}…`
}

/** Deterministic Nie przegap priority (lower = earlier). Mapping-based only. */
function criticalPriority(input: {
  mapping?: string
  classification?: string
  studio?: boolean
}): number {
  if (input.studio) return 10
  if (
    input.classification === 'FAMILY_SENSITIVITY' ||
    input.mapping === 'sensitiveFamilyNotes'
  ) {
    return 0
  }
  switch (input.mapping) {
    case 'ceremonyNotes':
      return 20
    case 'groupPhotoPlan':
      return 30
    case 'blessingPlan':
      return 40
    case 'groomDepartureNote':
      return 50
    default:
      return 80
  }
}

/** Short alert labels for Nie przegap (registry briefLabel may be longer). */
function criticalAlertLabel(mapping: string | undefined, fallback: string): string {
  switch (mapping) {
    case 'ceremonyNotes':
      return 'Ceremonia'
    case 'groupPhotoPlan':
      return 'Zdjęcie grupowe'
    case 'blessingPlan':
      return 'Błogosławieństwo'
    case 'sensitiveFamilyNotes':
      return 'Rodzina'
    case 'groomDepartureNote':
      return 'Wyjazd Pana Młodego'
    default:
      return fallback
  }
}

/** Max non-safety operational alerts in Nie przegap (sensitive/studio uncapped). */
const MAX_OPERATIONAL_CRITICAL_ALERTS = 4

function buildCriticalNotes(
  hits: AnswerHit[],
  weddingNotes: WeddingNote[],
): BriefNote[] {
  type Candidate = {
    label: string
    content: string
    priority: number
    safety: boolean
  }
  const candidates: Candidate[] = []
  const seen: string[] = []

  function consider(input: {
    label: string
    content: string
    mapping?: string
    classification?: string
    studio?: boolean
  }) {
    const raw = normalizeBriefWhitespace(input.content)
    if (!raw) return
    if (
      isPresentationNoValue({
        displayValue: raw,
        questionType: 'long_text',
      })
    ) {
      return
    }
    if (/^nie chcemy$/i.test(raw) && /grupowe/i.test(input.label)) return
    const content = conciseCriticalAlert(raw, {
      mapping: input.mapping,
      classification: input.classification,
    })
    if (seen.some((s) => textsSemanticallyEqual(s, content))) return
    seen.push(content)
    const safety =
      Boolean(input.studio) ||
      input.classification === 'FAMILY_SENSITIVITY' ||
      input.mapping === 'sensitiveFamilyNotes'
    candidates.push({
      label: input.label,
      content,
      priority: criticalPriority({
        mapping: input.mapping,
        classification: input.classification,
        studio: input.studio,
      }),
      safety,
    })
  }

  for (const hit of hits) {
    if (hit.rule.destination === 'omit') continue
    const mapping = hit.question.weddingDayMapping

    // Creative photo priorities stay in questionnaire detail only (not alerts).
    if (mapping === 'photoVideoPriorities') continue

    if (hit.rule.destination === 'nie_przegap') {
      if (
        mapping === 'groupPhotoPlan' &&
        /^nie chcemy$/i.test(hit.displayValue.trim())
      ) {
        continue
      }
      consider({
        label: criticalAlertLabel(mapping, hit.rule.briefLabel),
        content: hit.displayValue,
        mapping,
        classification: hit.rule.classification,
      })
      continue
    }

    if (!hit.rule.criticalEligible) continue

    if (hit.rule.classification === 'FAMILY_SENSITIVITY') {
      consider({
        label: criticalAlertLabel(mapping, hit.rule.briefLabel),
        content: hit.displayValue,
        mapping,
        classification: hit.rule.classification,
      })
      continue
    }

    if (mapping === 'blessingPlan') {
      if (isUnusualBlessing(hit.displayValue)) {
        consider({
          label: criticalAlertLabel(mapping, hit.rule.briefLabel),
          content: hit.displayValue,
          mapping,
          classification: hit.rule.classification,
        })
      }
      continue
    }

    if (
      mapping === 'groomDepartureNote' &&
      !/^\d{1,2}[.:]\d{2}$/.test(hit.displayValue) &&
      /nie dotyczy|razem|jednym adres/i.test(hit.displayValue)
    ) {
      consider({
        label: criticalAlertLabel(mapping, hit.rule.briefLabel),
        content: hit.displayValue,
        mapping,
        classification: hit.rule.classification,
      })
    }
  }

  for (const n of weddingNotes) {
    const c = n.content.trim()
    if (!c) continue
    if (c.includes('reference_data_key=')) continue
    if (c.includes('reference-wedding:')) continue
    if (!isCriticalStudioNote(c)) continue
    consider({
      label: 'Uwaga studia',
      content: c.replace(/^ważne:\s*/i, ''),
      studio: true,
    })
  }

  candidates.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label, 'pl'))

  const notes: BriefNote[] = []
  let operationalCount = 0
  for (const c of candidates) {
    if (!c.safety) {
      if (operationalCount >= MAX_OPERATIONAL_CRITICAL_ALERTS) continue
      operationalCount += 1
    }
    notes.push({ label: c.label, content: c.content })
  }
  return notes
}

function extractVendors(
  hits: AnswerHit[],
  preWedding: BuildWeddingBriefPdfDataInput['preWedding'],
): BriefVendor[] {
  const vendors: BriefVendor[] = []
  const q25 = hits.find((h) => h.questionId === 'q25' && h.rule.destination !== 'omit')
  const q26 = hits.find(
    (h) =>
      (h.questionId === 'q26' || h.question.weddingDayMapping === 'djBandProvider') &&
      h.rule.destination !== 'omit',
  )
  if (q25 && preWedding) {
    const raw = preWedding.answers.q25
    if (typeof raw === 'string' && raw.trim()) {
      for (const part of raw
        .split(/[·•|]|\n/)
        .map((p) => p.trim())
        .filter(Boolean)) {
        if (
          isPresentationNoValue({
            displayValue: part,
            questionType: 'long_text',
            questionId: 'q25',
          })
        ) {
          continue
        }
        const [role, ...rest] = part.split(':')
        if (rest.length) {
          const name = rest.join(':').trim()
          if (
            isPresentationNoValue({
              displayValue: name,
              questionType: 'long_text',
            })
          ) {
            continue
          }
          vendors.push({ role: role!.trim(), name })
        } else {
          vendors.push({ name: part })
        }
      }
    }
  }
  if (q26) {
    const alreadyListed = vendors.some((v) =>
      vendorNamesEqual(v.name, q26.displayValue),
    )
    if (alreadyListed) {
      const match = vendors.find((v) =>
        vendorNamesEqual(v.name, q26.displayValue),
      )
      if (match && !match.role) match.role = 'DJ / zespół'
    } else {
      vendors.push({ role: 'DJ / zespół', name: q26.displayValue })
    }
  }
  return vendors
}

function guestCountFromHits(hits: AnswerHit[]): number | undefined {
  const hit = hits.find((h) => h.question.weddingDayMapping === 'guestCount')
  if (!hit) return undefined
  const n = Number.parseInt(hit.displayValue.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? n : undefined
}

function weddingDaySessions(sessions: Session[], weddingDate: string): BriefSession[] {
  return sessions
    .filter((s) => s.date === weddingDate || s.customSessionType?.includes('ślub'))
    .map((s) => ({
      title:
        s.customName ||
        s.customSessionType ||
        (s.sessionType === 'engagement'
          ? 'Sesja narzeczeńska'
          : s.sessionType === 'postWedding'
            ? 'Sesja after'
            : 'Sesja'),
      date: formatDate(s.date),
      time: [s.startTime, s.endTime].filter(Boolean).join(' – ') || undefined,
      location:
        s.location?.name ||
        s.location?.formattedAddress ||
        s.location?.address ||
        undefined,
      notes: s.notes?.trim() || undefined,
    }))
}

/**
 * Pure builder — safe for tests and production PDF generation.
 */
export function buildWeddingBriefPdfData(
  input: BuildWeddingBriefPdfDataInput,
): WeddingBriefPdfData {
  const now = input.generatedAt ?? new Date()
  const timeZone = input.timezone ?? 'Europe/Warsaw'
  const wedding = input.wedding
  const places = input.places ?? []
  const extras = input.extras ?? []
  const commercial = getWeddingCommercialSummary(wedding)
  const coupleDisplayName = getWeddingDisplayName(wedding)
  const weddingDateLabel = wedding.date ? formatDate(wedding.date) : ''

  const hits = input.preWedding ? collectAnswerHits(input.preWedding) : []
  const mappedQuestionIds: string[] = []
  const adminOnlyQuestionIds: string[] = []
  const additionalQuestionIds: string[] = []
  const unmappedNonEmptyQuestionIds: string[] = []

  for (const hit of hits) {
    if (isAdminOnlyRule(hit.rule)) {
      adminOnlyQuestionIds.push(hit.questionId)
      continue
    }
    if (
      !hit.question.weddingDayMapping &&
      !BRIEF_QUESTION_RULES[hit.questionId] &&
      hit.rule.destination === 'additional'
    ) {
      unmappedNonEmptyQuestionIds.push(hit.questionId)
    }
    mappedQuestionIds.push(hit.questionId)
  }

  const consumed = new Set<string>()

  // Assignment / identity destinations consumed
  for (const hit of hits) {
    if (hit.rule.destination === 'assignment') consumed.add(hit.questionId)
    if (hit.rule.destination === 'contacts') consumed.add(hit.questionId)
    if (hit.rule.destination === 'timeline') consumed.add(hit.questionId)
    if (hit.rule.destination === 'locations') consumed.add(hit.questionId)
    if (hit.rule.destination === 'vendors') consumed.add(hit.questionId)
    if (hit.rule.destination === 'omit') consumed.add(hit.questionId)
  }
  // nie_przegap consumed only when actually rendered there
  for (const hit of hits) {
    if (hit.rule.destination !== 'nie_przegap') continue
    if (
      hit.question.weddingDayMapping === 'groupPhotoPlan' &&
      /^nie chcemy$/i.test(hit.displayValue.trim())
    ) {
      // falls through to section_group_photo via re-route below
      continue
    }
    consumed.add(hit.questionId)
  }
  // q20 schedule used for timeline only when no operational places exist
  const q20 = hits.find((h) => h.questionId === 'q20')
  if (
    places.length === 0 &&
    q20 &&
    parseScheduleFromText(q20.displayValue).length >= 3
  ) {
    consumed.add('q20')
  }

  const contacts = buildContacts(wedding, input.contacts ?? [], hits)
  const timeline = buildTimeline(
    input.preWedding,
    places,
    hits,
    input.operationalTimes ?? {},
    input.travelSegments ?? [],
    wedding.ceremonyTime,
  )
  const locations = mergeLocations(places, wedding, hits, input.preWedding)
  const criticalNotes = buildCriticalNotes(hits, wedding.notes ?? [])
  // Mark critical-elevated section items as consumed when also in nie_przegap
  for (const hit of hits) {
    if (
      hit.rule.criticalEligible &&
      criticalNotes.some((n) => textsSemanticallyEqual(n.content, hit.displayValue))
    ) {
      consumed.add(hit.questionId)
    }
  }

  // Re-route "Nie chcemy" group photo into section
  const groupSkip = hits.find(
    (h) =>
      h.question.weddingDayMapping === 'groupPhotoPlan' &&
      /^nie chcemy$/i.test(h.displayValue.trim()) &&
      !consumed.has(h.questionId),
  )
  if (groupSkip) {
    groupSkip.rule = {
      ...groupSkip.rule,
      destination: 'section_group_photo',
    }
  }

  const vendors = extractVendors(hits, input.preWedding)
  for (const hit of hits) {
    if (hit.rule.destination === 'vendors') consumed.add(hit.questionId)
  }

  // Dynamic Brief V1 — questionnaire detail from instance snapshot (Layer B).
  // Hardcoded operationalSections are no longer the primary detail structure.
  const operationalSections: WeddingBriefPdfData['operationalSections'] = []

  let questionnaireSections: WeddingBriefPdfData['questionnaireSections'] = []
  const additionalOperational: BriefOperationalItem[] = []
  const questionnaireDetailQuestionIds: string[] = []

  if (input.preWedding) {
    const schemaSections = input.preWedding.schema.sections ?? []
    const hasSnapshotStructure = schemaSections.length > 0

    if (hasSnapshotStructure) {
      const built = buildQuestionnaireBriefSections({
        schema: input.preWedding.schema,
        answers: input.preWedding.answers,
        criticalNotes,
      })
      questionnaireSections = built.sections
      questionnaireDetailQuestionIds.push(...built.includedQuestionIds)
      for (const id of built.includedQuestionIds) consumed.add(id)

      for (const orphan of built.orphanAnswers) {
        additionalOperational.push({
          label: 'Pozostała odpowiedź',
          value: orphan.displayValue,
        })
        additionalQuestionIds.push(orphan.questionId)
        unmappedNonEmptyQuestionIds.push(orphan.questionId)
        consumed.add(orphan.questionId)
      }
    } else {
      // Malformed / empty snapshot — flat orphan fallback from answers.
      const built = buildQuestionnaireBriefSections({
        schema: { sections: [] },
        answers: input.preWedding.answers,
        criticalNotes,
      })
      for (const orphan of built.orphanAnswers) {
        if (
          criticalNotes.some((n) =>
            textsSemanticallyEqual(n.content, orphan.displayValue),
          )
        ) {
          continue
        }
        if (
          vendors.some((v) => textsSemanticallyEqual(v.name, orphan.displayValue))
        ) {
          continue
        }
        additionalOperational.push({
          label: 'Pozostała odpowiedź',
          value: orphan.displayValue,
        })
        additionalQuestionIds.push(orphan.questionId)
        unmappedNonEmptyQuestionIds.push(orphan.questionId)
      }
    }

    // Track unmapped customs that landed in questionnaire sections (not Additional).
    for (const sec of questionnaireSections) {
      for (const item of sec.items) {
        if (
          !item.semanticMapping &&
          !BRIEF_QUESTION_RULES[item.questionId]
        ) {
          if (!unmappedNonEmptyQuestionIds.includes(item.questionId)) {
            unmappedNonEmptyQuestionIds.push(item.questionId)
          }
        }
      }
    }
  }

  const missingOperational: string[] = []
  if (timeline.length === 0) {
    missingOperational.push('Brak uzupełnionego planu dnia.')
  }

  const settlement =
    commercial.contractValue > 0
      ? {
          contractValue: commercial.contractValue,
          totalPaid: commercial.totalPaid,
          remainingToPay: commercial.remainingToPay,
          depositPaid: commercial.depositPaid,
          currency: commercial.currency || 'PLN',
          settled: commercial.remainingToPay <= 0,
        }
      : undefined

  const timed = timeline.filter((t) => t.time).map((t) => t.time)
  const coverageStart =
    timed.sort((a, b) => a.localeCompare(b))[0] || undefined
  const coverageEnd = wedding.coverageEndTime || undefined

  return {
    document: {
      title: 'Brief zlecenia',
      generatedAt: now.toISOString(),
      generatedAtLabel: formatGeneratedAt(now, timeZone),
      locale: 'pl-PL',
      timezone: timeZone,
    },
    wedding: {
      id: wedding.id,
      coupleDisplayName,
      weddingDate: wedding.date,
      weddingDateLabel,
      daysRemaining: wedding.date ? daysUntil(wedding.date, now) : undefined,
      packageName: commercial.packageName || wedding.packageName || undefined,
      additionalServices: extras
        .map((e) => e.name?.trim())
        .filter((n): n is string => Boolean(n)),
      coverageStart,
      coverageEnd,
      guestCount: guestCountFromHits(hits),
    },
    contacts,
    timeline,
    locations,
    criticalNotes,
    operationalSections,
    vendors,
    settlement,
    sessions: weddingDaySessions(input.sessions ?? [], wedding.date),
    additionalOperational,
    questionnaireSections,
    footer: {
      generatedBy: 'OurWed',
      coupleDisplayName,
      weddingDateLabel,
    },
    coverageAudit: {
      mappedQuestionIds,
      adminOnlyQuestionIds,
      additionalQuestionIds,
      unmappedNonEmptyQuestionIds,
      questionnaireDetailQuestionIds,
    },
    missingOperational:
      missingOperational.length > 0 ? missingOperational : undefined,
  }
}

/** Test helper — format a single answer without technical IDs. */
export function formatBriefAnswerForTest(
  schema: PreWeddingTemplateSchema,
  questionId: string,
  value: unknown,
): string {
  const q = schema.sections.flatMap((s) => s.questions).find((qq) => qq.id === questionId)
  if (!q) return ''
  return formatAnswerValueForDisplay(q, value)
}

export function formatBriefLocationDisplay(value: unknown): string {
  return formatLocationAnswerDisplay(value)
}

export function briefLocationGeo(value: unknown) {
  return answerToGeoPlace(value as never)
}
