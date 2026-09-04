/**
 * Canonical Brief source — exactly the inputs that can change generated PDF
 * content. Wall-clock fields, tokens, unused dumps, and persistence IDs
 * that do not affect output are excluded.
 */

import {
  isAdminOnlyRule,
  resolveBriefFieldRule,
} from '@/features/wedding-brief/briefFieldRegistry'
import { isCriticalStudioNote } from '@/features/wedding-brief/briefNormalize'
import type { BuildWeddingBriefPdfDataInput } from '@/features/wedding-brief/buildWeddingBriefPdfData'
import type { PreWeddingQuestion, PreWeddingTemplateSchema } from '@/types/preweddingQuestionnaire'
import type { Session } from '@/types/session'
import type { TravelSegment, WeddingPlace } from '@/types/travel'
import type { Payment, Wedding, WeddingContact, WeddingNote } from '@/types/wedding'
import type { WeddingExtraService } from '@/types/package'

export type CanonicalBriefSource = {
  couple: {
    displayName: string | null
    partner1: string | null
    partner2: string | null
    partner1FirstName: string | null
    partner1LastName: string | null
    partner2FirstName: string | null
    partner2LastName: string | null
    partner1Phone: string | null
    partner2Phone: string | null
    phone: string | null
  }
  wedding: {
    date: string | null
    ceremonyTime: string | null
    packageName: string | null
    price: number
    currency: string | null
    coverageEndTime: string | null
    bridePreparationLocation: string | null
    groomPreparationLocation: string | null
    ceremonyLocation: string | null
    receptionLocation: string | null
  }
  payments: Array<{
    amount: number
    paid: boolean
  }>
  notes: Array<{ content: string }>
  places: Array<{
    id: string
    role: string
    label: string | null
    formattedAddress: string | null
    latitude: number | null
    longitude: number | null
    placeId: string | null
    sortOrder: number
  }>
  contacts: Array<{
    name: string
    role: string | null
    phone: string | null
    email: string | null
  }>
  extras: Array<{ name: string }>
  sessions: Array<{
    title: string | null
    sessionType: string
    customSessionType: string | null
    date: string
    startTime: string | null
    endTime: string | null
    locationName: string | null
    locationAddress: string | null
    notes: string | null
  }>
  operationalTimes: Array<{ stopKey: string; time: string }>
  travelSegments: Array<{
    originKind: string
    destinationKind: string
    originWeddingPlaceId: string | null
    destinationWeddingPlaceId: string | null
    status: string
    distanceMeters: number | null
    durationSeconds: number | null
  }>
  preWedding: {
    sections: Array<{
      id: string
      title: string
      questions: Array<{
        id: string
        label: string
        type: string
        hidden: boolean
        weddingDayMapping: string | null
        options: string[] | null
        answer: unknown
      }>
    }>
  } | null
}

function emptyToNull(value: string | null | undefined): string | null {
  const t = (value ?? '').trim()
  return t.length > 0 ? t : null
}

function sortBy<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => key(a).localeCompare(key(b), 'en'))
}

export function isBriefRelevantSession(session: Session, weddingDate: string): boolean {
  return session.date === weddingDate || Boolean(session.customSessionType?.includes('ślub'))
}

function isReferenceNote(content: string): boolean {
  return content.includes('reference_data_key=') || content.includes('reference-wedding:')
}

function relevantNoteContents(notes: WeddingNote[] | undefined): Array<{ content: string }> {
  return (notes ?? [])
    .map((n) => ({ content: n.content.trim() }))
    .filter((n) => n.content && !isReferenceNote(n.content) && isCriticalStudioNote(n.content))
}

function relevantPayments(payments: Payment[] | undefined): Array<{ amount: number; paid: boolean }> {
  return sortBy(
    (payments ?? []).map((p) => ({
      amount: Number.isFinite(p.amount) ? p.amount : 0,
      paid: Boolean(p.paid),
      id: p.id,
    })),
    (p) => p.id,
  ).map(({ amount, paid }) => ({ amount, paid }))
}

function canonicalPlaces(places: WeddingPlace[] | undefined) {
  return sortBy(places ?? [], (p) => `${String(p.sortOrder).padStart(6, '0')}:${p.id}`).map(
    (p) => ({
      id: p.id,
      role: p.role,
      label: emptyToNull(p.label),
      formattedAddress: emptyToNull(p.formattedAddress),
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      placeId: emptyToNull(p.placeId),
      sortOrder: p.sortOrder,
    }),
  )
}

function canonicalContacts(contacts: WeddingContact[] | undefined) {
  return sortBy(contacts ?? [], (c) => `${c.role ?? ''}:${c.name}:${c.id}`).map((c) => ({
    name: c.name.trim(),
    role: emptyToNull(c.role),
    phone: emptyToNull(c.phone),
    email: emptyToNull(c.email),
  })).filter((c) => c.name || c.phone || c.email)
}

function canonicalExtras(extras: WeddingExtraService[] | undefined) {
  return sortBy(extras ?? [], (e) => `${e.name ?? ''}:${e.id}`).map((e) => ({
    name: (e.name ?? '').trim(),
  })).filter((e) => e.name)
}

function sessionTitle(session: Session): string | null {
  return emptyToNull(
    session.customName ||
      session.customSessionType ||
      (session.sessionType === 'engagement'
        ? 'Sesja narzeczeńska'
        : session.sessionType === 'postWedding'
          ? 'Sesja after'
          : 'Sesja'),
  )
}

function canonicalSessions(sessions: Session[] | undefined, weddingDate: string) {
  const relevant = (sessions ?? []).filter((s) => isBriefRelevantSession(s, weddingDate))
  return sortBy(relevant, (s) => `${s.date}:${s.id}`).map((s) => ({
    title: sessionTitle(s),
    sessionType: s.sessionType,
    customSessionType: emptyToNull(s.customSessionType),
    date: s.date,
    startTime: emptyToNull(s.startTime),
    endTime: emptyToNull(s.endTime),
    locationName: emptyToNull(s.location?.name),
    locationAddress: emptyToNull(
      s.location?.formattedAddress || s.location?.address,
    ),
    notes: emptyToNull(s.notes),
  }))
}

function canonicalOperationalTimes(
  times: BuildWeddingBriefPdfDataInput['operationalTimes'],
) {
  return Object.entries(times ?? {})
    .map(([stopKey, time]) => ({ stopKey, time }))
    .filter((row) => row.time)
    .sort((a, b) => a.stopKey.localeCompare(b.stopKey, 'en'))
}

function canonicalTravelSegments(segments: TravelSegment[] | undefined) {
  const useful = (segments ?? []).filter(
    (s) =>
      s.originKind === 'wedding_place' &&
      s.destinationKind === 'wedding_place' &&
      s.status === 'ok',
  )
  return sortBy(
    useful,
    (s) =>
      `${s.originWeddingPlaceId ?? ''}:${s.destinationWeddingPlaceId ?? ''}`,
  ).map((s) => ({
    originKind: s.originKind,
    destinationKind: s.destinationKind,
    originWeddingPlaceId: s.originWeddingPlaceId,
    destinationWeddingPlaceId: s.destinationWeddingPlaceId,
    status: s.status,
    distanceMeters: s.distanceMeters ?? null,
    durationSeconds: s.durationSeconds ?? null,
  }))
}

function isAdminOnlyQuestion(question: PreWeddingQuestion): boolean {
  const rule = resolveBriefFieldRule({
    questionId: question.id,
    mapping: question.weddingDayMapping,
    questionType: question.type,
  })
  return isAdminOnlyRule(rule)
}

function canonicalizeAnswerValue(value: unknown): unknown {
  if (value == null) return null
  if (typeof value === 'string') return emptyToNull(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(canonicalizeAnswerValue)
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    const geoKeys = [
      'formattedAddress',
      'label',
      'address',
      'placeId',
      'latitude',
      'longitude',
    ]
    const looksGeo = geoKeys.some((k) => o[k] != null && o[k] !== '')
    if (looksGeo) {
      const picked: Record<string, unknown> = {}
      for (const key of geoKeys) {
        picked[key] = canonicalizeAnswerValue(o[key])
      }
      return picked
    }
    const picked: Record<string, unknown> = {}
    for (const key of Object.keys(o).sort()) {
      picked[key] = canonicalizeAnswerValue(o[key])
    }
    return picked
  }
  return null
}

function canonicalPreWedding(
  preWedding: BuildWeddingBriefPdfDataInput['preWedding'],
): CanonicalBriefSource['preWedding'] {
  if (!preWedding?.schema?.sections?.length && !preWedding?.answers) return null
  const schema: PreWeddingTemplateSchema = preWedding?.schema ?? { sections: [] }
  const answers = preWedding?.answers ?? {}
  const sections = schema.sections.map((section) => ({
    id: section.id,
    title: section.title,
    questions: section.questions
      .filter((q) => !isAdminOnlyQuestion(q))
      .map((q) => ({
        id: q.id,
        label: q.label,
        type: q.type,
        hidden: Boolean(q.hidden),
        weddingDayMapping: emptyToNull(q.weddingDayMapping),
        options: q.options && q.options.length > 0 ? [...q.options] : null,
        answer: canonicalizeAnswerValue(answers[q.id] ?? null),
      })),
  }))
  const hasAnything = sections.some(
    (s) => s.questions.some((q) => q.answer != null && q.answer !== ''),
  )
  if (!hasAnything && sections.every((s) => s.questions.length === 0)) return null
  return { sections }
}

function coupleFromWedding(wedding: Wedding): CanonicalBriefSource['couple'] {
  const c = wedding.couple
  return {
    displayName: emptyToNull(wedding.displayName),
    partner1: emptyToNull(c.partner1),
    partner2: emptyToNull(c.partner2),
    partner1FirstName: emptyToNull(c.partner1FirstName),
    partner1LastName: emptyToNull(c.partner1LastName),
    partner2FirstName: emptyToNull(c.partner2FirstName),
    partner2LastName: emptyToNull(c.partner2LastName),
    partner1Phone: emptyToNull(c.partner1Phone),
    partner2Phone: emptyToNull(c.partner2Phone),
    phone: emptyToNull(c.phone),
  }
}

export function buildCanonicalBriefSource(
  input: BuildWeddingBriefPdfDataInput,
): CanonicalBriefSource {
  const wedding = input.wedding
  return {
    couple: coupleFromWedding(wedding),
    wedding: {
      date: emptyToNull(wedding.date),
      ceremonyTime: emptyToNull(wedding.ceremonyTime),
      packageName: emptyToNull(wedding.packageName),
      price: Number.isFinite(wedding.price) ? wedding.price : 0,
      currency: emptyToNull(wedding.currency),
      coverageEndTime: emptyToNull(wedding.coverageEndTime),
      bridePreparationLocation: emptyToNull(wedding.bridePreparationLocation),
      groomPreparationLocation: emptyToNull(wedding.groomPreparationLocation),
      ceremonyLocation: emptyToNull(wedding.ceremonyLocation),
      receptionLocation: emptyToNull(wedding.receptionLocation),
    },
    payments: relevantPayments(wedding.payments),
    notes: relevantNoteContents(wedding.notes),
    places: canonicalPlaces(input.places),
    contacts: canonicalContacts(input.contacts),
    extras: canonicalExtras(input.extras),
    sessions: canonicalSessions(input.sessions, wedding.date),
    operationalTimes: canonicalOperationalTimes(input.operationalTimes),
    travelSegments: canonicalTravelSegments(input.travelSegments),
    preWedding: canonicalPreWedding(input.preWedding),
  }
}

function canonicalizeJson(value: unknown): unknown {
  if (value === undefined || value === '') return null
  if (value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean' || typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(canonicalizeJson)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as object).sort()) {
      out[key] = canonicalizeJson((value as Record<string, unknown>)[key])
    }
    return out
  }
  return null
}

/** Deterministic JSON for hashing. Key order is sorted; empty string ≡ null. */
export function serializeCanonicalBriefSource(source: CanonicalBriefSource): string {
  return JSON.stringify(canonicalizeJson(source))
}
