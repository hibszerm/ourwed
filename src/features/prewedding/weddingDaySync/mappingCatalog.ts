/**
 * Pre-Wedding → Wedding Day sync — mapping labels, groups, and apply targets.
 */

export const WEDDING_DAY_MAPPING_LABELS: Record<string, string> = {
  weddingDate: 'Data ślubu',
  brideName: 'Imię i nazwisko Panny Młodej',
  bridePhone: 'Telefon do Panny Młodej',
  groomName: 'Imię i nazwisko Pana Młodego',
  groomPhone: 'Telefon do Pana Młodego',
  bridePreparationLocation: 'Adres przygotowań Panny Młodej',
  groomPreparationLocation: 'Adres przygotowań Pana Młodego',
  groomDepartureNote: 'Wyjazd Pana Młodego do Panny Młodej',
  blessingPlan: 'Plan błogosławieństwa',
  departureToCeremonyTime: 'Godzina wyjazdu na ceremonię',
  ceremonyLocation: 'Miejsce ceremonii',
  ceremonyTime: 'Godzina ceremonii',
  ceremonyNotes: 'Ważne informacje dotyczące ceremonii',
  groupPhotoPlan: 'Zdjęcie grupowe',
  guestWishesPlan: 'Plan składania życzeń',
  receptionVenue: 'Miejsce przyjęcia weselnego',
  receptionArrivalTime: 'Godzina przyjazdu na salę',
  guestCount: 'Liczba gości',
  smallGroupPhotosPlan: 'Zdjęcia w mniejszych grupach',
  photoVideoPriorities: 'Priorytety zdjęć i filmu',
  djBandProvider: 'DJ / zespół',
  sensitiveFamilyNotes: 'Ważne kwestie rodzinne',
}

export type WeddingDaySyncGroupId =
  | 'places'
  | 'schedule'
  | 'contacts'
  | 'organization'

export const WEDDING_DAY_SYNC_GROUP_LABELS: Record<WeddingDaySyncGroupId, string> =
  {
    places: 'Miejsca',
    schedule: 'Godziny i plan',
    contacts: 'Kontakty',
    organization: 'Organizacja',
  }

export const WEDDING_DAY_MAPPING_GROUP: Record<string, WeddingDaySyncGroupId> = {
  bridePreparationLocation: 'places',
  groomPreparationLocation: 'places',
  ceremonyLocation: 'places',
  receptionVenue: 'places',
  weddingDate: 'schedule',
  ceremonyTime: 'schedule',
  departureToCeremonyTime: 'schedule',
  receptionArrivalTime: 'schedule',
  blessingPlan: 'schedule',
  groupPhotoPlan: 'schedule',
  guestWishesPlan: 'schedule',
  groomDepartureNote: 'schedule',
  brideName: 'contacts',
  bridePhone: 'contacts',
  groomName: 'contacts',
  groomPhone: 'contacts',
  guestCount: 'organization',
  smallGroupPhotosPlan: 'organization',
  photoVideoPriorities: 'organization',
  djBandProvider: 'organization',
  ceremonyNotes: 'organization',
  sensitiveFamilyNotes: 'organization',
}

/** Targets with a real apply path (places, wedding row, or operational note). */
export const APPLIABLE_WEDDING_DAY_MAPPINGS = new Set([
  'weddingDate',
  'brideName',
  'bridePhone',
  'groomName',
  'groomPhone',
  'bridePreparationLocation',
  'groomPreparationLocation',
  'ceremonyLocation',
  'receptionVenue',
  'ceremonyTime',
  'departureToCeremonyTime',
  'receptionArrivalTime',
  'guestCount',
  'groomDepartureNote',
  'blessingPlan',
  'ceremonyNotes',
  'groupPhotoPlan',
  'guestWishesPlan',
  'smallGroupPhotosPlan',
  'photoVideoPriorities',
  'djBandProvider',
  'sensitiveFamilyNotes',
])

export const LOCATION_MAPPING_TO_ROLE = {
  bridePreparationLocation: 'bride_preparation',
  groomPreparationLocation: 'groom_preparation',
  ceremonyLocation: 'ceremony',
  receptionVenue: 'reception',
} as const

export type LocationMappingKey = keyof typeof LOCATION_MAPPING_TO_ROLE

export function isLocationMappingKey(key: string): key is LocationMappingKey {
  return key in LOCATION_MAPPING_TO_ROLE
}

export function resolveWeddingDayLabel(
  mapping: string,
  questionLabel?: string,
): string {
  const fromMap = WEDDING_DAY_MAPPING_LABELS[mapping]
  if (fromMap) return fromMap
  const trimmed = questionLabel?.trim()
  if (trimmed) return trimmed
  return mapping
}

const PLACEHOLDER_RE =
  /^(ustalone\s+później|jeszcze\s+nie\s+wiemy|do\s+ustalenia|brak|tbd|n\/?a|-|—|–)$/i

export function isPlaceholderValue(value: string | null | undefined): boolean {
  const t = value?.trim() ?? ''
  if (!t) return true
  return PLACEHOLDER_RE.test(t)
}

export function normalizeComparableText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl-PL')
}

export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D+/g, '')
}

export function normalizeTimeValue(value: string): string {
  const t = value.trim()
  const m = t.match(/^(\d{1,2})[:.](\d{2})$/)
  if (!m) return normalizeComparableText(t)
  return `${m[1]!.padStart(2, '0')}:${m[2]}`
}

export function normalizeDateValue(value: string): string {
  const t = value.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  return normalizeComparableText(t)
}
