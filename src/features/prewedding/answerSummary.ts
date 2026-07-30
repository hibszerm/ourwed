/**
 * Photographer-facing questionnaire answers — presentation helpers only.
 * Visible labels always come from the questionnaire schema snapshot (question.label).
 */

import { formatDate } from '@/lib/utils/dates'
import {
  formatLocationAnswerDisplay,
  googleMapsUrlForLocationAnswer,
  isAnswerEmpty,
  isManualLocationAnswer,
  isStructuredLocationAnswer,
  answerToGeoPlace,
} from '@/features/prewedding/preweddingLocation'
import type {
  PreWeddingAnswerValue,
  PreWeddingQuestion,
  PreWeddingTemplateSchema,
} from '@/types/preweddingQuestionnaire'
import type { GeoPlace } from '@/types/travel'

export interface AnswerListItem {
  questionId: string
  /** Exact question.label from the schema snapshot. */
  label: string
  value: string
  kind: 'text' | 'location' | 'time' | 'date' | 'sensitive' | 'acknowledgement'
  mapsUrl: string | null
  manualLocation: boolean
}

export interface DayTimelineStop {
  id: string
  role:
    | 'studio'
    | 'bride_preparation'
    | 'groom_preparation'
    | 'ceremony'
    | 'reception'
  time: string | null
  label: string
  location: string | null
  mapsUrl: string | null
  place: GeoPlace | null
  sameAsPrevious?: boolean
}

/** Plan dnia stage labels — operational summary only, never for answer list. */
import { CANONICAL_ROUTE_ROLE_ORDER } from '@/features/travel/weddingDayRouteStops'

export const PLAN_DNIA_STAGE_LABELS: Record<string, string> = {
  studio: 'Start dnia',
  groom_preparation: 'Przygotowania Pana Młodego',
  bride_preparation: 'Przygotowania Panny Młodej',
  ceremony: 'Ceremonia',
  reception: 'Przyjęcie weselne',
}

/** Display order for Plan dnia — same as canonical route order. */
export const PLAN_DNIA_ROLE_ORDER = CANONICAL_ROUTE_ROLE_ORDER

function allQuestions(schema: PreWeddingTemplateSchema): PreWeddingQuestion[] {
  return schema.sections.flatMap((s) => s.questions)
}

function findAnswer(
  questions: PreWeddingQuestion[],
  answers: Record<string, unknown>,
  predicate: (q: PreWeddingQuestion) => boolean,
): { question: PreWeddingQuestion; value: unknown } | null {
  for (const q of questions) {
    if (!predicate(q) || q.hidden) continue
    const value = answers[q.id]
    if (isAnswerEmpty(value as PreWeddingAnswerValue)) continue
    return { question: q, value }
  }
  return null
}

function byMapping(
  questions: PreWeddingQuestion[],
  answers: Record<string, unknown>,
  mapping: string,
): { question: PreWeddingQuestion; value: unknown } | null {
  return findAnswer(questions, answers, (q) => q.weddingDayMapping === mapping)
}

/** Format answer for display only — does not mutate stored value. */
export function formatAnswerValueForDisplay(
  question: PreWeddingQuestion,
  value: unknown,
): string {
  if (question.type === 'acknowledgement') {
    return Boolean(value)
      ? 'Para potwierdziła zapoznanie się ze wskazówkami.'
      : ''
  }
  if (question.type === 'yes_no') {
    if (value === true || value === 'true' || value === 'Tak' || value === 'yes') {
      return 'Tak'
    }
    if (value === false || value === 'false' || value === 'Nie' || value === 'no') {
      return 'Nie'
    }
  }
  if (question.type === 'single_choice' && typeof value === 'string') {
    const opts = question.options ?? []
    if (opts.includes(value)) return value
    return value
  }
  if (question.type === 'multiple_choice' && Array.isArray(value)) {
    const opts = new Set(question.options ?? [])
    return value
      .map((v) => String(v))
      .filter((v) => opts.size === 0 || opts.has(v))
      .join(', ')
  }
  if (question.type === 'date' && typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      try {
        return formatDate(trimmed.slice(0, 10))
      } catch {
        return trimmed
      }
    }
  }
  if (question.type === 'time' && typeof value === 'string') {
    const trimmed = value.trim()
    const m = trimmed.match(/^(\d{1,2})[.:](\d{2})$/)
    if (m) return `${m[1]!.padStart(2, '0')}:${m[2]}`
  }
  if (question.type === 'address') {
    return formatLocationAnswerDisplay(value)
  }
  if (Array.isArray(value)) {
    return value.map(String).join(', ')
  }
  if (typeof value === 'boolean') {
    return value ? 'Tak' : 'Nie'
  }
  return formatLocationAnswerDisplay(value)
}

function itemFromQuestion(
  q: PreWeddingQuestion,
  value: unknown,
): AnswerListItem | null {
  if (q.type === 'information' || q.hidden) return null
  if (isAnswerEmpty(value as PreWeddingAnswerValue)) return null

  const isLocation = q.type === 'address'
  const mapping = q.weddingDayMapping ?? ''

  return {
    questionId: q.id,
    label: q.label,
    value: formatAnswerValueForDisplay(q, value),
    kind:
      q.type === 'acknowledgement'
        ? 'acknowledgement'
        : mapping === 'sensitiveFamilyNotes'
          ? 'sensitive'
          : isLocation
            ? 'location'
            : q.type === 'time'
              ? 'time'
              : q.type === 'date'
                ? 'date'
                : 'text',
    mapsUrl: isLocation ? googleMapsUrlForLocationAnswer(value) : null,
    manualLocation: isLocation ? isManualLocationAnswer(value) : false,
  }
}

/**
 * Flat answered-question list in schema snapshot order.
 * Labels are always question.label — never mapping-derived replacements.
 */
export function buildAnswerList(
  schema: PreWeddingTemplateSchema,
  answers: Record<string, unknown>,
): AnswerListItem[] {
  const items: AnswerListItem[] = []
  for (const q of allQuestions(schema)) {
    const item = itemFromQuestion(q, answers[q.id])
    if (item) items.push(item)
  }
  return items
}

export interface AnswerSectionGroup {
  sectionId: string
  sectionTitle: string
  items: AnswerListItem[]
}

/**
 * Answered questions grouped by snapshot sections (empty sections omitted).
 * Custom sections with custom questions appear when they have non-empty answers.
 */
export function buildAnswerSections(
  schema: PreWeddingTemplateSchema,
  answers: Record<string, unknown>,
): AnswerSectionGroup[] {
  const groups: AnswerSectionGroup[] = []
  for (const section of schema.sections ?? []) {
    const items: AnswerListItem[] = []
    for (const q of section.questions ?? []) {
      const item = itemFromQuestion(q, answers[q.id])
      if (item) items.push(item)
    }
    if (items.length === 0) continue
    groups.push({
      sectionId: section.id,
      sectionTitle: section.title?.trim() || '',
      items,
    })
  }
  return groups
}

/** @deprecated Prefer buildAnswerList — kept for transitional callers. */
export function buildAnswerSummaryCards(
  schema: PreWeddingTemplateSchema,
  answers: Record<string, unknown>,
) {
  const fields = buildAnswerList(schema, answers)
  if (!fields.length) return []
  return [
    {
      id: 'answers',
      title: 'Odpowiedzi pary',
      fields: fields.map((f) => ({
        questionId: f.questionId,
        label: f.label,
        displayLabel: f.label,
        value: f.value,
        kind: f.kind === 'date' ? ('text' as const) : f.kind,
        mapsUrl: f.mapsUrl,
        manualLocation: f.manualLocation,
      })),
    },
  ]
}

function placesEqual(a: GeoPlace | null, b: GeoPlace | null): boolean {
  if (!a || !b) return false
  const idA = a.placeId?.trim()
  const idB = b.placeId?.trim()
  if (idA && idB && idA === idB) return true
  const fa = (a.formattedAddress || '').trim().toLowerCase()
  const fb = (b.formattedAddress || '').trim().toLowerCase()
  return Boolean(fa && fb && fa === fb)
}

/**
 * Answer-derived day stops (fallback when travel plan has no wedding places yet).
 * Order: groom prep → bride prep → ceremony → reception.
 */
export function buildDayTimelineSummary(
  schema: PreWeddingTemplateSchema,
  answers: Record<string, unknown>,
): DayTimelineStop[] {
  const qs = allQuestions(schema)
  const stops: DayTimelineStop[] = []

  function pushStop(
    id: DayTimelineStop['id'],
    role: DayTimelineStop['role'],
    label: string,
    timeMapping: string | null,
    locationMapping: string,
  ) {
    const locHit = byMapping(qs, answers, locationMapping)
    const timeHit = timeMapping ? byMapping(qs, answers, timeMapping) : null
    if (!locHit && !timeHit) return
    const place = locHit ? answerToGeoPlace(locHit.value) : null
    stops.push({
      id,
      role,
      label,
      time: timeHit ? String(timeHit.value) : null,
      location: locHit ? formatLocationAnswerDisplay(locHit.value) : null,
      mapsUrl: locHit ? googleMapsUrlForLocationAnswer(locHit.value) : null,
      place,
    })
  }

  pushStop(
    'groom_prep',
    'groom_preparation',
    PLAN_DNIA_STAGE_LABELS.groom_preparation!,
    null,
    'groomPreparationLocation',
  )
  pushStop(
    'bride_prep',
    'bride_preparation',
    PLAN_DNIA_STAGE_LABELS.bride_preparation!,
    null,
    'bridePreparationLocation',
  )
  pushStop(
    'ceremony',
    'ceremony',
    PLAN_DNIA_STAGE_LABELS.ceremony!,
    'ceremonyTime',
    'ceremonyLocation',
  )
  pushStop(
    'reception',
    'reception',
    PLAN_DNIA_STAGE_LABELS.reception!,
    'receptionArrivalTime',
    'receptionVenue',
  )

  for (let i = 1; i < stops.length; i++) {
    if (placesEqual(stops[i - 1]!.place, stops[i]!.place)) {
      stops[i]!.sameAsPrevious = true
    }
  }

  return stops.filter((s) => s.location || s.time || s.place)
}

/** Times from answers keyed by travel role — overlay onto Plan dnia. */
export function timelineTimesByRole(
  schema: PreWeddingTemplateSchema,
  answers: Record<string, unknown>,
): Partial<Record<string, string>> {
  const qs = allQuestions(schema)
  const out: Partial<Record<string, string>> = {}
  const ceremony = byMapping(qs, answers, 'ceremonyTime')
  if (ceremony) out.ceremony = String(ceremony.value)
  const reception = byMapping(qs, answers, 'receptionArrivalTime')
  if (reception) out.reception = String(reception.value)
  const departure = byMapping(qs, answers, 'departureToCeremonyTime')
  if (departure) out.departureToCeremony = String(departure.value)
  return out
}

export function mapsUrlForAnswerField(
  question: PreWeddingQuestion,
  value: unknown,
): string | null {
  if (question.type !== 'address') return null
  if (!isStructuredLocationAnswer(value) && typeof value !== 'string') return null
  return googleMapsUrlForLocationAnswer(value)
}
