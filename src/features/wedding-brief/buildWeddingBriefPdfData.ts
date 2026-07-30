/**
 * Build WeddingBriefPdfData from canonical wedding aggregates + questionnaire snapshots.
 */

import {
  buildAnswerSections,
  buildDayTimelineSummary,
  formatAnswerValueForDisplay,
} from '@/features/prewedding/answerSummary'
import {
  answerToGeoPlace,
  formatLocationAnswerDisplay,
} from '@/features/prewedding/preweddingLocation'
import { buildContractAnswerSections } from '@/features/questionnaires/contractAnswerSummary'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import type {
  BriefContact,
  BriefLocation,
  BriefNote,
  BriefQuestionnaireSection,
  BriefSession,
  BriefTimelineItem,
  BriefVendor,
  WeddingBriefPdfData,
} from '@/features/wedding-brief/types'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatDate } from '@/lib/utils/dates'
import type { FormAnswerJson } from '@/types/formEngine'
import type { FormInstanceOptionsSnapshot } from '@/types/contractQuestionnaire'
import type { PreWeddingTemplateSchema } from '@/types/preweddingQuestionnaire'
import type { Session } from '@/types/session'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding, WeddingContact, WeddingNote } from '@/types/wedding'
import type { WeddingExtraService } from '@/types/package'

const PLACE_ROLE_LABELS: Record<string, string> = {
  bride_preparation: 'Przygotowania Panny Młodej',
  groom_preparation: 'Przygotowania Pana Młodego',
  ceremony: 'Ceremonia',
  reception: 'Miejsce przyjęcia weselnego',
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
  contractAnswers?: {
    answerJson: FormAnswerJson
    optionsSnapshot?: FormInstanceOptionsSnapshot | null
  } | null
  generatedAt?: Date
  timezone?: string
}

function daysUntil(dateStr: string, now: Date): number | undefined {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return undefined
  const target = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    12,
    0,
    0,
  )
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

function placeToBrief(place: WeddingPlace): BriefLocation {
  const name = place.label?.trim() || undefined
  const address = place.formattedAddress?.trim() || ''
  return {
    role: PLACE_ROLE_LABELS[place.role] ?? place.role,
    name: name && name !== address ? name : name,
    address,
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
  }
}

function contactToBrief(c: WeddingContact): BriefContact {
  return {
    role: c.role?.trim() || 'Kontakt',
    name: c.name.trim(),
    phone: c.phone?.trim() || undefined,
    email: c.email?.trim() || undefined,
  }
}

function isCriticalNote(content: string): boolean {
  const t = content.trim().toLowerCase()
  return (
    t.startsWith('ważne') ||
    t.includes('nie organizować') ||
    t.includes('nie bierze udziału') ||
    t.includes('uwaga')
  )
}

function notesToBrief(notes: WeddingNote[]): BriefNote[] {
  return notes
    .filter((n) => {
      const c = n.content.trim()
      if (!c) return false
      if (c.includes('reference_data_key=')) return false
      if (c.includes('reference-wedding:')) return false
      return true
    })
    .map((n) => ({
      content: n.content.trim(),
      critical: isCriticalNote(n.content),
      label: isCriticalNote(n.content) ? 'WAŻNE' : undefined,
    }))
}

function parseScheduleFromText(text: string): BriefTimelineItem[] {
  const items: BriefTimelineItem[] = []
  const parts = text.split(/[·•|]|\n/).map((p) => p.trim()).filter(Boolean)
  for (const part of parts) {
    const m = part.match(/^(\d{1,2}[.:]\d{2})\s+(.+)$/i)
    if (!m) continue
    const time = m[1]!.replace('.', ':')
    const padded = time.replace(/^(\d):/, '0$1:')
    items.push({ time: padded.length === 4 ? `0${padded}` : padded, title: m[2]!.trim() })
  }
  return items
}

function buildTimeline(
  preWedding: BuildWeddingBriefPdfDataInput['preWedding'],
  places: WeddingPlace[],
): BriefTimelineItem[] {
  const fromScheduleText: BriefTimelineItem[] = []
  if (preWedding) {
    const scheduleQ = preWedding.schema.sections
      .flatMap((s) => s.questions)
      .find((q) => q.id === 'q20')
    const raw = scheduleQ ? preWedding.answers[scheduleQ.id] : null
    if (typeof raw === 'string') {
      fromScheduleText.push(...parseScheduleFromText(raw))
    }
  }
  if (fromScheduleText.length >= 5) {
    return fromScheduleText.map((item) => {
      const placeHint = places.find((p) => {
        const label = (p.label || p.formattedAddress || '').toLowerCase()
        const title = item.title.toLowerCase()
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
        if (title.includes('plener') && p.role === 'other') return true
        return label && title.includes(label.slice(0, 8).toLowerCase())
      })
      return {
        ...item,
        location: placeHint?.label || undefined,
        address: placeHint?.formattedAddress || undefined,
      }
    })
  }

  if (!preWedding) return []
  const stops = buildDayTimelineSummary(
    preWedding.schema,
    preWedding.answers,
  )
  return stops
    .filter((s) => s.role !== 'studio' || s.time || s.location)
    .map((s) => ({
      time: s.time || '—',
      title: s.label,
      location: s.location || undefined,
      address: s.place?.formattedAddress || undefined,
    }))
}

function buildPreWeddingSections(
  preWedding: NonNullable<BuildWeddingBriefPdfDataInput['preWedding']>,
): BriefQuestionnaireSection[] {
  return buildAnswerSections(preWedding.schema, preWedding.answers).map(
    (section) => ({
      title: section.sectionTitle,
      answers: section.items.map((item) => {
        const q = preWedding.schema.sections
          .flatMap((s) => s.questions)
          .find((qq) => qq.id === item.questionId)
        const kind =
          q?.type === 'long_text'
            ? ('long_text' as const)
            : item.kind === 'location'
              ? ('location' as const)
              : item.kind === 'time'
                ? ('time' as const)
                : item.kind === 'date'
                  ? ('date' as const)
                  : ('text' as const)
        return {
          label: item.label,
          value: item.value,
          kind,
        }
      }),
    }),
  )
}

function buildContractSections(
  contractAnswers: NonNullable<
    BuildWeddingBriefPdfDataInput['contractAnswers']
  >,
): BriefQuestionnaireSection[] {
  const sections = buildContractAnswerSections(
    contractAnswers.answerJson,
    contractAnswers.optionsSnapshot ?? null,
  )
  const skipKeys = new Set([
    'partner1.firstName',
    'partner1.lastName',
    'partner2.firstName',
    'partner2.lastName',
    'weddingDate',
  ])
  return sections
    .map((section) => ({
      title: section.sectionTitle,
      answers: section.items
        .filter((item) => !skipKeys.has(item.fieldKey))
        .map((item) => ({
          label: item.label,
          value: item.value,
          kind:
            item.kind === 'location'
              ? ('location' as const)
              : item.kind === 'long_text'
                ? ('long_text' as const)
                : item.kind === 'date'
                  ? ('date' as const)
                  : ('text' as const),
        })),
    }))
    .filter((s) => s.answers.length > 0)
}

function extractVendors(
  preWedding: BuildWeddingBriefPdfDataInput['preWedding'],
): BriefVendor[] {
  if (!preWedding) return []
  const vendors: BriefVendor[] = []
  const q25 = preWedding.answers.q25
  const q26 = preWedding.answers.q26
  if (typeof q25 === 'string' && q25.trim()) {
    for (const part of q25.split(/[·•|]|\n/).map((p) => p.trim()).filter(Boolean)) {
      const [role, ...rest] = part.split(':')
      if (rest.length) {
        vendors.push({ role: role!.trim(), name: rest.join(':').trim() })
      } else {
        vendors.push({ name: part })
      }
    }
  }
  if (typeof q26 === 'string' && q26.trim()) {
    vendors.push({ role: 'DJ / zespół', name: q26.trim() })
  }
  return vendors
}

function guestCountFromAnswers(
  preWedding: BuildWeddingBriefPdfDataInput['preWedding'],
): number | undefined {
  if (!preWedding) return undefined
  const raw = preWedding.answers.q18
  if (typeof raw !== 'string') return undefined
  const n = Number.parseInt(raw.replace(/[^\d]/g, ''), 10)
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
  const contacts = (input.contacts ?? []).map(contactToBrief)
  const extras = input.extras ?? []
  const commercial = getWeddingCommercialSummary(wedding)
  const coupleDisplayName = getWeddingDisplayName(wedding)
  const weddingDateLabel = wedding.date ? formatDate(wedding.date) : '—'
  const notes = notesToBrief(wedding.notes ?? [])
  const critical = notes.find((n) => n.critical)
  const timeline = buildTimeline(input.preWedding, places)
  const locations = places
    .filter((p) => (p.formattedAddress || '').trim())
    .map(placeToBrief)

  // Legacy text locations if places empty
  if (locations.length === 0) {
    const legacy: Array<[string, string | undefined]> = [
      ['Przygotowania Panny Młodej', wedding.bridePreparationLocation],
      ['Przygotowania Pana Młodego', wedding.groomPreparationLocation],
      ['Ceremonia', wedding.ceremonyLocation],
      ['Miejsce przyjęcia weselnego', wedding.receptionLocation],
    ]
    for (const [role, address] of legacy) {
      if (address?.trim()) locations.push({ role, address: address.trim() })
    }
  }

  const keyContacts = contacts
    .filter((c: BriefContact) =>
      /panna|pan młody|planner|sala|dj|świadk/i.test(c.role),
    )
    .slice(0, 4)
  if (keyContacts.length === 0) {
    keyContacts.push(
      ...contacts.slice(0, 3),
    )
  }

  const firstLocation =
    locations.find((l) => /przygotowan/i.test(l.role)) || locations[0]

  const preSections = input.preWedding
    ? buildPreWeddingSections(input.preWedding)
    : []
  const contractSections = input.contractAnswers
    ? buildContractSections(input.contractAnswers)
    : []

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
          dueLabel:
            commercial.remainingToPay > 0
              ? commercial.finalPaymentDueDate
                ? formatDate(commercial.finalPaymentDueDate)
                : 'dzień ślubu'
              : undefined,
        }
      : undefined

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
      coverageStart: timeline[0]?.time,
      coverageEnd: wedding.coverageEndTime || undefined,
      guestCount: guestCountFromAnswers(input.preWedding),
    },
    quickSummary: {
      keyContacts,
      startTime: timeline[0]?.time || wedding.ceremonyTime || undefined,
      firstLocation,
      remainingPayment: settlement,
      criticalNote: critical?.content,
    },
    timeline,
    locations,
    contacts,
    importantNotes: notes,
    questionnaire:
      preSections.length > 0
        ? {
            title: input.preWedding?.title || 'Ankieta przedślubna',
            submittedAt: input.preWedding?.submittedAt
              ? formatGeneratedAt(new Date(input.preWedding.submittedAt), timeZone)
              : undefined,
            sections: preSections,
          }
        : null,
    contractQuestionnaire:
      contractSections.length > 0 ? { sections: contractSections } : null,
    vendors: extractVendors(input.preWedding),
    settlement,
    sessions: weddingDaySessions(input.sessions ?? [], wedding.date),
    footer: {
      generatedBy: 'OurWed',
      coupleDisplayName,
      weddingDateLabel,
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
