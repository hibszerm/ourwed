/**
 * Build actionable Pre-Wedding → Wedding Day update candidates.
 */

import {
  answerToGeoPlace,
} from '@/features/prewedding/preweddingLocation'
import {
  displayLocationValue,
  locationRichness,
  proposedDisplayFromAnswer,
  richnessRank,
  valuesAreSemanticallyEqual,
} from '@/features/prewedding/weddingDaySync/compareValues'
import {
  APPLIABLE_WEDDING_DAY_MAPPINGS,
  isLocationMappingKey,
  isPlaceholderValue,
  LOCATION_MAPPING_TO_ROLE,
  resolveWeddingDayLabel,
  WEDDING_DAY_MAPPING_GROUP,
  type WeddingDaySyncGroupId,
} from '@/features/prewedding/weddingDaySync/mappingCatalog'
import type {
  PreWeddingAnswerValue,
  WeddingQuestionnaire,
} from '@/types/preweddingQuestionnaire'
import type { GeoPlace, WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'

export type WeddingDaySyncCandidateKind =
  | 'location'
  | 'text'
  | 'phone'
  | 'date'
  | 'time'
  | 'note'

export type WeddingDaySyncCandidate = {
  id: string
  questionId: string
  questionLabel: string
  mapping: string
  label: string
  group: WeddingDaySyncGroupId
  kind: WeddingDaySyncCandidateKind
  currentDisplay: string
  proposedDisplay: string
  currentIsPlaceholder: boolean
  proposedGeo: GeoPlace | null
  currentGeo: GeoPlace | WeddingPlace | null
  /** Incoming location is poorer than current verified place. */
  incomingPoorer: boolean
  /** Safe to preselect (empty/placeholder current, not poorer). */
  defaultSelected: boolean
  rawAnswer: PreWeddingAnswerValue
}

export type BuildWeddingDaySyncCandidatesInput = {
  questionnaire: WeddingQuestionnaire
  answers: Record<string, PreWeddingAnswerValue>
  wedding: Wedding
  places: WeddingPlace[]
  /** Operational notes — used to hide already-applied note-only mappings. */
  notes?: Array<{ content: string }>
}

function kindForMapping(mapping: string): WeddingDaySyncCandidateKind {
  if (isLocationMappingKey(mapping)) return 'location'
  if (mapping === 'weddingDate') return 'date'
  if (mapping.endsWith('Time') || mapping === 'ceremonyTime') return 'time'
  if (mapping.endsWith('Phone')) return 'phone'
  if (
    mapping === 'ceremonyNotes' ||
    mapping === 'sensitiveFamilyNotes' ||
    mapping === 'photoVideoPriorities' ||
    mapping === 'blessingPlan' ||
    mapping === 'groupPhotoPlan' ||
    mapping === 'guestWishesPlan' ||
    mapping === 'groomDepartureNote' ||
    mapping === 'smallGroupPhotosPlan' ||
    mapping === 'djBandProvider' ||
    mapping === 'guestCount' ||
    mapping === 'departureToCeremonyTime' ||
    mapping === 'receptionArrivalTime'
  ) {
    return 'note'
  }
  return 'text'
}

function currentScalar(wedding: Wedding, mapping: string): string {
  switch (mapping) {
    case 'weddingDate':
      return wedding.date ?? ''
    case 'brideName':
      return wedding.couple.partner1 ?? ''
    case 'groomName':
      return wedding.couple.partner2 ?? ''
    case 'bridePhone':
      return wedding.couple.partner1Phone ?? wedding.couple.phone ?? ''
    case 'groomPhone':
      return wedding.couple.partner2Phone ?? ''
    case 'ceremonyTime':
      return wedding.ceremonyTime ?? ''
    case 'bridePreparationLocation':
      return (
        wedding.bridePreparationLocation ||
        wedding.preparationLocation ||
        ''
      )
    case 'groomPreparationLocation':
      return wedding.groomPreparationLocation ?? ''
    case 'ceremonyLocation':
      return wedding.ceremonyLocation ?? ''
    case 'receptionVenue':
      return wedding.receptionLocation ?? ''
    default:
      return ''
  }
}

function placeForMapping(
  places: WeddingPlace[],
  mapping: string,
): WeddingPlace | null {
  if (!isLocationMappingKey(mapping)) return null
  const role = LOCATION_MAPPING_TO_ROLE[mapping]
  return places.find((p) => p.role === role) ?? null
}

function isAnswerEmpty(value: PreWeddingAnswerValue | undefined): boolean {
  if (value == null) return true
  if (typeof value === 'string') return !value.trim()
  if (typeof value === 'boolean') return false
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    const geo = answerToGeoPlace(value)
    return !geo
  }
  return true
}

const NOTE_ONLY_MAPPINGS = new Set([
  'ceremonyNotes',
  'sensitiveFamilyNotes',
  'photoVideoPriorities',
  'blessingPlan',
  'groupPhotoPlan',
  'guestWishesPlan',
  'groomDepartureNote',
  'smallGroupPhotosPlan',
  'djBandProvider',
  'guestCount',
  'departureToCeremonyTime',
  'receptionArrivalTime',
])

function noteAlreadyApplied(
  notes: Array<{ content: string }> | undefined,
  label: string,
  proposedDisplay: string,
): boolean {
  if (!notes?.length) return false
  const title = `Ankieta: ${label}`
  return notes.some(
    (n) => n.content.includes(title) && n.content.includes(proposedDisplay),
  )
}

export function buildWeddingDaySyncCandidates(
  input: BuildWeddingDaySyncCandidatesInput,
): WeddingDaySyncCandidate[] {
  const { questionnaire, answers, wedding, places, notes } = input
  const out: WeddingDaySyncCandidate[] = []
  /** One candidate per mapping — duplicate system questions do not double-apply. */
  const seenMappings = new Set<string>()

  for (const section of questionnaire.schema.sections) {
    for (const q of section.questions) {
      const mapping = q.weddingDayMapping?.trim()
      if (!mapping) continue
      if (!APPLIABLE_WEDDING_DAY_MAPPINGS.has(mapping)) continue
      if (q.type === 'information') continue
      if (seenMappings.has(mapping)) continue

      const raw = answers[q.id]
      if (isAnswerEmpty(raw)) continue

      const proposedDisplay = proposedDisplayFromAnswer(raw)
      if (!proposedDisplay.trim()) continue

      const label = resolveWeddingDayLabel(mapping, q.label)

      if (
        NOTE_ONLY_MAPPINGS.has(mapping) &&
        noteAlreadyApplied(notes, label, proposedDisplay)
      ) {
        seenMappings.add(mapping)
        continue
      }

      const place = placeForMapping(places, mapping)
      const currentGeo = place
      const proposedGeo = isLocationMappingKey(mapping)
        ? answerToGeoPlace(raw)
        : null

      const currentDisplay = isLocationMappingKey(mapping)
        ? displayLocationValue(place, currentScalar(wedding, mapping))
        : currentScalar(wedding, mapping)

      if (
        valuesAreSemanticallyEqual(mapping, currentDisplay, proposedDisplay, {
          currentGeo,
          proposedGeo,
        })
      ) {
        continue
      }

      const currentIsPlaceholder = isPlaceholderValue(currentDisplay)
      const incomingPoorer =
        isLocationMappingKey(mapping) &&
        richnessRank(locationRichness(proposedGeo)) <
          richnessRank(locationRichness(currentGeo)) &&
        !currentIsPlaceholder

      const defaultSelected =
        (currentIsPlaceholder || !currentDisplay.trim()) && !incomingPoorer

      seenMappings.add(mapping)
      out.push({
        id: `${q.id}:${mapping}`,
        questionId: q.id,
        questionLabel: q.label,
        mapping,
        label,
        group: WEDDING_DAY_MAPPING_GROUP[mapping] ?? 'organization',
        kind: kindForMapping(mapping),
        currentDisplay: currentDisplay || '',
        proposedDisplay,
        currentIsPlaceholder,
        proposedGeo,
        currentGeo,
        incomingPoorer,
        defaultSelected,
        rawAnswer: raw as PreWeddingAnswerValue,
      })
    }
  }

  return out
}

export function groupWeddingDaySyncCandidates(
  candidates: WeddingDaySyncCandidate[],
): Array<{ group: WeddingDaySyncGroupId; items: WeddingDaySyncCandidate[] }> {
  const order: WeddingDaySyncGroupId[] = [
    'places',
    'schedule',
    'contacts',
    'organization',
  ]
  return order
    .map((group) => ({
      group,
      items: candidates.filter((c) => c.group === group),
    }))
    .filter((g) => g.items.length > 0)
}
