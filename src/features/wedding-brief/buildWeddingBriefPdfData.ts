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
  operationalStopsToBriefTimeline,
  vendorNamesEqual,
  type OperationalTimeMap,
} from '@/features/wedding-day/operationalDayPlan'
import {
  answerToGeoPlace,
  formatLocationAnswerDisplay,
} from '@/features/prewedding/preweddingLocation'
import {
  BRIEF_QUESTION_RULES,
  isAdminOnlyRule,
  OPERATIONAL_SECTION_TITLES,
  resolveBriefFieldRule,
  type BriefDestination,
  type BriefFieldRule,
} from '@/features/wedding-brief/briefFieldRegistry'
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
  BriefOperationalSection,
  BriefSession,
  BriefTimelineItem,
  BriefVendor,
  WeddingBriefPdfData,
} from '@/features/wedding-brief/types'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { formatTravelFeeDisplay } from '@/lib/utils/travelFeeCommercial'
import type { FormAnswerJson } from '@/types/formEngine'
import type { FormInstanceOptionsSnapshot } from '@/types/contractQuestionnaire'
import type {
  PreWeddingQuestion,
  PreWeddingTemplateSchema,
} from '@/types/preweddingQuestionnaire'
import type { Session } from '@/types/session'
import type { WeddingPlace } from '@/types/travel'
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
    })
    const items = operationalStopsToBriefTimeline(ops)
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

  // 1) Questionnaire answers first (couple authority when present).
  if (preWedding) {
    for (const hit of hits) {
      if (hit.rule.destination !== 'locations') continue
      const raw = preWedding.answers[hit.questionId]
      const geo = answerToGeoPlace(raw as never)
      const address =
        geo?.formattedAddress?.trim() ||
        (typeof raw === 'string' ? raw.trim() : '') ||
        hit.displayValue
      const qName = geo?.label?.trim() || undefined
      // Prefer raw address for matching; display string may be "Name — Address".
      upsert({
        role: hit.rule.briefLabel,
        name: qName,
        address: address || qName || '',
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
        placeId: geo?.placeId,
      })
    }
  }

  // 2) Structured wedding places — enrich names/GPS for same physical place,
  //    or fill roles the couple did not answer.
  for (const p of places) {
    const address = (p.formattedAddress || '').trim()
    const label = (p.label || '').trim()
    if (!address && !label) continue
    const role = PLACE_ROLE_LABELS[p.role] ?? p.role
    const candidate: LocDraft = {
      roles: [role],
      name: label || undefined,
      address: address || label,
      latitude: p.latitude,
      longitude: p.longitude,
      placeId: p.placeId,
    }
    const match = drafts.find((d) => placeDraftsMatch(d, candidate))
    if (match) {
      if (!match.roles.includes(role)) match.roles.push(role)
      if (!match.name && label) match.name = label
      if (!match.placeId && p.placeId) match.placeId = p.placeId
      if (match.latitude == null && p.latitude != null) match.latitude = p.latitude
      if (match.longitude == null && p.longitude != null) {
        match.longitude = p.longitude
      }
      continue
    }
    // Different physical place for a role already answered by couple → keep couple.
    if (roleAlreadyPresent(role)) continue
    upsert({
      role,
      name: label || undefined,
      address: address || label,
      latitude: p.latitude,
      longitude: p.longitude,
      placeId: p.placeId,
    })
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
  weddingContacts: WeddingContact[],
  hits: AnswerHit[],
): BriefContact[] {
  const byRole = new Map<string, BriefContact>()

  const brideName = hits.find((h) => h.question.weddingDayMapping === 'brideName')
  const bridePhone = hits.find((h) => h.question.weddingDayMapping === 'bridePhone')
  const groomName = hits.find((h) => h.question.weddingDayMapping === 'groomName')
  const groomPhone = hits.find((h) => h.question.weddingDayMapping === 'groomPhone')

  if (brideName || bridePhone) {
    byRole.set('Panna Młoda', {
      role: 'Panna Młoda',
      name: brideName?.displayValue || 'Panna Młoda',
      phone: bridePhone?.displayValue,
    })
  }
  if (groomName || groomPhone) {
    byRole.set('Pan Młody', {
      role: 'Pan Młody',
      name: groomName?.displayValue || 'Pan Młody',
      phone: groomPhone?.displayValue,
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
    // Skip duplicate of bride/groom by phone
    const dupPhone = [...byRole.values()].some(
      (x) => x.phone && phone && x.phone.replace(/\s/g, '') === phone.replace(/\s/g, ''),
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

function isMustHavePhotoPriority(value: string): boolean {
  const t = value.toLowerCase()
  if (!t || t.length < 8) return false
  return (
    /priorytet|koniecznie|musi|ważn|nie przegap|szczególnie|zależy|must|please|prosimy/i.test(
      t,
    ) || t.length >= 20
  )
}

function buildCriticalNotes(
  hits: AnswerHit[],
  weddingNotes: WeddingNote[],
): BriefNote[] {
  const notes: BriefNote[] = []
  const seen: string[] = []

  function push(label: string, content: string) {
    const c = normalizeBriefWhitespace(content)
    if (!c) return
    if (
      isPresentationNoValue({
        displayValue: c,
        questionType: 'long_text',
      })
    ) {
      return
    }
    if (seen.some((s) => textsSemanticallyEqual(s, c))) return
    // Skip non-actionable "Nie chcemy" group photo as critical
    if (/^nie chcemy$/i.test(c) && /grupowe/i.test(label)) return
    seen.push(c)
    notes.push({ label, content: c })
  }

  for (const hit of hits) {
    if (hit.rule.destination === 'omit') continue

    if (hit.rule.destination === 'nie_przegap') {
      if (
        hit.question.weddingDayMapping === 'groupPhotoPlan' &&
        /^nie chcemy$/i.test(hit.displayValue.trim())
      ) {
        continue
      }
      push(hit.rule.briefLabel, hit.displayValue)
      continue
    }

    if (!hit.rule.criticalEligible) continue

    if (hit.rule.classification === 'FAMILY_SENSITIVITY') {
      push(hit.rule.briefLabel, hit.displayValue)
      continue
    }

    if (hit.question.weddingDayMapping === 'blessingPlan') {
      if (isUnusualBlessing(hit.displayValue)) {
        push(hit.rule.briefLabel, hit.displayValue)
      }
      continue
    }

    if (hit.question.weddingDayMapping === 'photoVideoPriorities') {
      if (isMustHavePhotoPriority(hit.displayValue)) {
        push(hit.rule.briefLabel, hit.displayValue)
      }
      continue
    }

    if (
      hit.question.weddingDayMapping === 'groomDepartureNote' &&
      !/^\d{1,2}[.:]\d{2}$/.test(hit.displayValue) &&
      /nie dotyczy|razem|jednym adres/i.test(hit.displayValue)
    ) {
      push(hit.rule.briefLabel, hit.displayValue)
    }
  }

  for (const n of weddingNotes) {
    const c = n.content.trim()
    if (!c) continue
    if (c.includes('reference_data_key=')) continue
    if (c.includes('reference-wedding:')) continue
    if (!isCriticalStudioNote(c)) continue
    push('Uwaga studia', c.replace(/^ważne:\s*/i, ''))
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

function buildOperationalSections(
  hits: AnswerHit[],
  consumed: Set<string>,
  criticalNotes: BriefNote[],
): BriefOperationalSection[] {
  const buckets = new Map<string, BriefOperationalItem[]>()

  for (const hit of hits) {
    if (consumed.has(hit.questionId)) continue
    if (isAdminOnlyRule(hit.rule)) continue
    if (hit.rule.destination === 'omit') continue
    const dest = hit.rule.destination
    if (!dest.startsWith('section_')) continue
    if (criticalNotes.some((n) => textsSemanticallyEqual(n.content, hit.displayValue))) {
      consumed.add(hit.questionId)
      continue
    }
    const title =
      OPERATIONAL_SECTION_TITLES[dest as keyof typeof OPERATIONAL_SECTION_TITLES]
    if (!title) continue
    const list = buckets.get(dest) ?? []
    list.push({ label: hit.rule.briefLabel, value: hit.displayValue })
    buckets.set(dest, list)
    consumed.add(hit.questionId)
  }

  const order: BriefDestination[] = [
    'section_family',
    'section_ceremony',
    'section_photo',
    'section_group_photo',
    'section_blessing_logistics',
    'section_music',
    'section_other',
  ]
  const sections: BriefOperationalSection[] = []
  for (const id of order) {
    const items = buckets.get(id)
    if (!items?.length) continue
    sections.push({
      id,
      title: OPERATIONAL_SECTION_TITLES[id as keyof typeof OPERATIONAL_SECTION_TITLES],
      items,
    })
  }
  return sections
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

  const contacts = buildContacts(input.contacts ?? [], hits)
  const timeline = buildTimeline(
    input.preWedding,
    places,
    hits,
    input.operationalTimes ?? {},
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

  const operationalSections = buildOperationalSections(
    hits,
    consumed,
    criticalNotes,
  )

  const additionalOperational: BriefOperationalItem[] = []
  for (const hit of hits) {
    if (consumed.has(hit.questionId)) continue
    if (isAdminOnlyRule(hit.rule)) continue
    if (hit.rule.destination === 'omit') continue
    if (hit.rule.destination.startsWith('section_')) continue
    const isAdditionalBucket =
      hit.rule.destination === 'additional' ||
      (!hit.question.weddingDayMapping && !BRIEF_QUESTION_RULES[hit.questionId])
    if (!isAdditionalBucket) continue

    if (criticalNotes.some((n) => textsSemanticallyEqual(n.content, hit.displayValue))) {
      consumed.add(hit.questionId)
      continue
    }
    if (vendors.some((v) => textsSemanticallyEqual(v.name, hit.displayValue))) {
      consumed.add(hit.questionId)
      continue
    }
    additionalOperational.push({
      label: hit.rule.briefLabel,
      value: hit.displayValue,
    })
    additionalQuestionIds.push(hit.questionId)
    consumed.add(hit.questionId)
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
          dueLabel:
            commercial.remainingToPay > 0
              ? commercial.finalPaymentDueDate
                ? formatDate(commercial.finalPaymentDueDate)
                : 'dzień ślubu'
              : undefined,
          travelFeeLabel:
            (wedding.travelFeeStatus ?? 'unresolved') === 'unresolved'
              ? undefined
              : formatTravelFeeDisplay(wedding, formatCurrency),
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
